import { activityIds, type ActivityId } from "../data";
import {
  IfcProcessingError,
  type ExtractedIfcEntity,
  type ExtractedIfcModel,
  type IfcPropertyValue,
  type ParsedStepDocument,
  type StepEntity,
} from "./types";

const PRODUCT_TYPES = new Set([
  "IFCSPACE",
  "IFCDOOR",
  "IFCBUILDINGELEMENTPROXY",
  "IFCFLOWTERMINAL",
  "IFCFURNISHINGELEMENT",
  "IFCWALL",
  "IFCWALLSTANDARDCASE",
  "IFCSLAB",
  "IFCWINDOW",
  "IFCCOLUMN",
  "IFCBEAM",
  "IFCSTAIR",
  "IFCRAILING",
]);
const ENTITY_CHUNK = 500;
const MIYAR_PROPERTY_SETS = new Set([
  "Pset_MiyarProject",
  "Pset_MiyarSpace",
  "Pset_MiyarDoor",
  "Pset_MiyarEquipment",
]);
const CONTRACT_PROPERTY_KEYS = new Set([
  "ActivityCode",
  "LengthUnit",
  "GrossArea",
  "DeclaredCapacity",
  "FixtureContractVersion",
  "ArchitecturalEquipmentComplete",
  "MEPModelComplete",
  "RoleCode",
  "ViewerElementId",
  "NetFloorArea",
  "IsEnclosed",
  "ServesSpaceGuid",
  "ServedSpaceGuid",
  "ConnectsToExterior",
  "HasServiceConnection",
  "ServicesConcealed",
  "MinimumClearWidth",
]);
const BASIC_IFC_GLOBAL_ID = /^[0-9A-Za-z_$]{22}$/;

type ExtractOptions = {
  signal?: AbortSignal;
  onProgress?: (
    progress: number,
    detail: string,
    evidence?: Record<string, string | number | boolean>,
  ) => void;
};

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

async function yieldToMainThread(signal?: AbortSignal) {
  await new Promise<void>((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(() => resolve());
      return;
    }
    globalThis.setTimeout(resolve, 0);
  });
  throwIfAborted(signal);
}

async function reportPhase(
  progress: number,
  detail: string,
  options: ExtractOptions,
  evidence: Record<string, string | number | boolean>,
) {
  options.onProgress?.(progress, detail, evidence);
  await yieldToMainThread(options.signal);
}

async function reportChunk(
  index: number,
  total: number,
  start: number,
  span: number,
  detail: string,
  options: ExtractOptions,
  evidence: Record<string, string | number | boolean>,
) {
  if ((index + 1) % ENTITY_CHUNK !== 0) return;
  options.onProgress?.(
    start + ((index + 1) / Math.max(total, 1)) * span,
    detail,
    evidence,
  );
  await yieldToMainThread(options.signal);
}

function decodeStepString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("'") || !trimmed.endsWith("'")) return trimmed;
  return trimmed.slice(1, -1).replaceAll("''", "'");
}

export function parseIfcValue(raw: string): IfcPropertyValue {
  const value = raw.trim();
  if (value === "$" || value === "*") return null;
  if (/^\.T\.$/i.test(value)) return true;
  if (/^\.F\.$/i.test(value)) return false;
  if (/^'.*'$/s.test(value)) return decodeStepString(value);

  const wrapped = value.match(/^IFC[A-Z0-9_]+\s*\(([\s\S]*)\)$/i);
  if (wrapped) return parseIfcValue(wrapped[1]);

  const number = Number(value);
  if (Number.isFinite(number)) return number;
  return value;
}

function baseEntity(entity: StepEntity): ExtractedIfcEntity {
  const extracted: ExtractedIfcEntity = {
    stepId: entity.stepId,
    type: entity.type,
    globalId:
      typeof parseIfcValue(entity.args[0] ?? "$") === "string"
        ? String(parseIfcValue(entity.args[0]))
        : undefined,
    name:
      typeof parseIfcValue(entity.args[2] ?? "$") === "string"
        ? String(parseIfcValue(entity.args[2]))
        : undefined,
    properties: {},
    propertySets: {},
  };
  if (entity.type === "IFCDOOR") {
    const height = parseIfcValue(entity.args[8] ?? "$");
    const width = parseIfcValue(entity.args[9] ?? "$");
    if (typeof height === "number") extracted.properties.OverallHeight = height;
    if (typeof width === "number") extracted.properties.OverallWidth = width;
  }
  return extracted;
}

function relationTargetIds(value: string | undefined): number[] {
  if (!value) return [];
  return [...value.matchAll(/#(\d+)/g)].map((match) => Number(match[1]));
}

function expectedPropertySet(type: string): string | undefined {
  if (type === "IFCPROJECT") return "Pset_MiyarProject";
  if (type === "IFCSPACE") return "Pset_MiyarSpace";
  if (type === "IFCDOOR") return "Pset_MiyarDoor";
  if (PRODUCT_TYPES.has(type)) return "Pset_MiyarEquipment";
  return undefined;
}

function propertyValuesEqual(
  left: IfcPropertyValue,
  right: IfcPropertyValue,
): boolean {
  return Object.is(left, right);
}

export async function extractIfcModel(
  document: ParsedStepDocument,
  options: ExtractOptions = {},
): Promise<ExtractedIfcModel> {
  throwIfAborted(options.signal);
  const rawById = new Map<number, StepEntity>();
  for (let index = 0; index < document.entities.length; index += 1) {
    const entity = document.entities[index];
    rawById.set(entity.stepId, entity);
    await reportChunk(
      index,
      document.entities.length,
      0,
      0.1,
      `فهرسة سجلات IFC: ${index + 1} من ${document.entities.length}`,
      options,
      { indexedRecords: index + 1 },
    );
  }
  await reportPhase(
    0.1,
    `اكتملت فهرسة ${rawById.size} سجل IFC`,
    options,
    { indexedRecords: rawById.size },
  );
  const extractedById = new Map<number, ExtractedIfcEntity>();

  for (let index = 0; index < document.entities.length; index += 1) {
    const entity = document.entities[index];
    if (
      PRODUCT_TYPES.has(entity.type) ||
      entity.type === "IFCPROJECT" ||
      entity.type === "IFCBUILDINGSTOREY"
    ) {
      extractedById.set(entity.stepId, baseEntity(entity));
    }
    await reportChunk(
      index,
      document.entities.length,
      0.1,
      0.15,
      `استخراج العناصر الدلالية: ${index + 1} من ${document.entities.length}`,
      options,
      { extractedEntities: extractedById.size },
    );
  }
  await reportPhase(
    0.25,
    `اكتمل استخراج ${extractedById.size} كيان دلالي`,
    options,
    { extractedEntities: extractedById.size },
  );

  const singleValues = new Map<
    number,
    { name: string; value: IfcPropertyValue }
  >();
  for (let index = 0; index < document.entities.length; index += 1) {
    const entity = document.entities[index];
    if (entity.type === "IFCPROPERTYSINGLEVALUE") {
      const name = parseIfcValue(entity.args[0] ?? "$");
      if (typeof name === "string" && name.trim()) {
        singleValues.set(entity.stepId, {
          name,
          value: parseIfcValue(entity.args[2] ?? "$"),
        });
      }
    }
    await reportChunk(
      index,
      document.entities.length,
      0.25,
      0.15,
      `استخراج قيم الخصائص: ${index + 1} من ${document.entities.length}`,
      options,
      { extractedPropertyValues: singleValues.size },
    );
  }
  await reportPhase(
    0.4,
    `اكتمل استخراج ${singleValues.size} قيمة خاصية`,
    options,
    { extractedPropertyValues: singleValues.size },
  );

  const propertySets = new Map<
    number,
    { name: string; properties: Record<string, IfcPropertyValue> }
  >();
  for (let index = 0; index < document.entities.length; index += 1) {
    const entity = document.entities[index];
    if (entity.type === "IFCPROPERTYSET") {
      const name = parseIfcValue(entity.args[2] ?? "$");
      const properties: Record<string, IfcPropertyValue> = {};
      for (const propertyId of relationTargetIds(entity.args[4])) {
        const property = singleValues.get(propertyId);
        if (!property) continue;
        if (
          Object.hasOwn(properties, property.name) &&
          !propertyValuesEqual(properties[property.name], property.value)
        ) {
          throw new IfcProcessingError(
            "extract",
            "CONFLICTING_PROPERTY_VALUE",
            `مجموعة الخصائص ${typeof name === "string" ? name : `#${entity.stepId}`} تعرف ${property.name} بقيمتين متعارضتين.`,
          );
        }
        properties[property.name] = property.value;
      }
      propertySets.set(entity.stepId, {
        name: typeof name === "string" ? name : `Pset_${entity.stepId}`,
        properties,
      });
    }
    await reportChunk(
      index,
      document.entities.length,
      0.4,
      0.15,
      `تجميع مجموعات الخصائص: ${index + 1} من ${document.entities.length}`,
      options,
      { propertySets: propertySets.size },
    );
  }
  await reportPhase(
    0.55,
    `اكتمل تجميع ${propertySets.size} مجموعة خصائص`,
    options,
    { propertySets: propertySets.size },
  );

  let appliedRelations = 0;
  for (let index = 0; index < document.entities.length; index += 1) {
    const relation = document.entities[index];
    if (relation.type === "IFCRELDEFINESBYPROPERTIES") {
      const relatedIds = relationTargetIds(relation.args[4]);
      const propertySetId = relationTargetIds(relation.args[5])[0];
      const propertySet = propertySets.get(propertySetId);
      if (!propertySet) {
        throw new IfcProcessingError(
          "extract",
          "INVALID_PROPERTY_RELATION",
          `العلاقة #${relation.stepId} لا تشير إلى IfcPropertySet صالح.`,
        );
      }
      for (const relatedId of relatedIds) {
        const target = extractedById.get(relatedId);
        if (!target) {
          const rawTarget = rawById.get(relatedId);
          throw new IfcProcessingError(
            "extract",
            "UNSUPPORTED_PROPERTY_TARGET",
            `مجموعة الخصائص ${propertySet.name} مرتبطة بكيان غير قابل للاستخراج ${rawTarget?.type ?? `#${relatedId}`}.`,
          );
        }
        const expectedNamespace = expectedPropertySet(target.type);
        const propertyNames = Object.keys(propertySet.properties);
        if (
          MIYAR_PROPERTY_SETS.has(propertySet.name) &&
          propertySet.name !== expectedNamespace
        ) {
          throw new IfcProcessingError(
            "extract",
            "INVALID_PROPERTY_NAMESPACE",
            `مجموعة ${propertySet.name} لا تصلح للكيان #${target.stepId} من النوع ${target.type}. النطاق المتوقع هو ${expectedNamespace ?? "لا يوجد نطاق MIYAR لهذا النوع"}.`,
          );
        }
        if (
          !MIYAR_PROPERTY_SETS.has(propertySet.name) &&
          propertyNames.some((name) => CONTRACT_PROPERTY_KEYS.has(name))
        ) {
          throw new IfcProcessingError(
            "extract",
            "MISPLACED_CONTRACT_PROPERTY",
            `مجموعة ${propertySet.name} تحتوي خاصية من عقد MIYAR خارج نطاقها المعتمد.`,
          );
        }

        const namespacedProperties =
          target.propertySets[propertySet.name] ?? {};
        for (const [name, value] of Object.entries(propertySet.properties)) {
          if (
            Object.hasOwn(namespacedProperties, name) &&
            !propertyValuesEqual(namespacedProperties[name], value)
          ) {
            throw new IfcProcessingError(
              "extract",
              "CONFLICTING_PROPERTY_VALUE",
              `الكيان #${target.stepId} يحمل قيمتين متعارضتين للخاصية ${name} في ${propertySet.name}.`,
            );
          }
          namespacedProperties[name] = value;
        }
        target.propertySets[propertySet.name] = namespacedProperties;

        if (propertySet.name === expectedNamespace) {
          for (const [name, value] of Object.entries(propertySet.properties)) {
            if (
              Object.hasOwn(target.properties, name) &&
              !propertyValuesEqual(target.properties[name], value)
            ) {
              throw new IfcProcessingError(
                "extract",
                "CONFLICTING_PROPERTY_VALUE",
                `الكيان #${target.stepId} يحمل قيمتين متعارضتين للخاصية ${name}.`,
              );
            }
            target.properties[name] = value;
          }
        }
      }
      appliedRelations += 1;
    }
    await reportChunk(
      index,
      document.entities.length,
      0.55,
      0.2,
      `ربط الخصائص بالعناصر: ${index + 1} من ${document.entities.length}`,
      options,
      { appliedPropertyRelations: appliedRelations },
    );
  }
  await reportPhase(
    0.75,
    `اكتمل ربط ${appliedRelations} علاقة خصائص مع الحفاظ على نطاقاتها`,
    options,
    { appliedPropertyRelations: appliedRelations },
  );

  const elements = [...extractedById.values()].filter((entity) =>
    PRODUCT_TYPES.has(entity.type),
  );
  const spaces = elements.filter((entity) => entity.type === "IFCSPACE");
  const doors = elements.filter((entity) => entity.type === "IFCDOOR");
  const storeys = [...extractedById.values()].filter(
    (entity) => entity.type === "IFCBUILDINGSTOREY",
  );
  const project = [...extractedById.values()].find(
    (entity) => entity.type === "IFCPROJECT",
  );
  await reportPhase(
    0.78,
    `صُنفت ${spaces.length} مساحات و${doors.length} أبواب و${elements.length} عنصرًا`,
    options,
    {
      spaces: spaces.length,
      doors: doors.length,
      storeys: storeys.length,
      elements: elements.length,
    },
  );

  if (!project) {
    throw new IfcProcessingError(
      "extract",
      "MISSING_PROJECT",
      "لم يتم العثور على كيان IfcProject.",
    );
  }
  if (!storeys.length) {
    throw new IfcProcessingError(
      "extract",
      "MISSING_STOREY",
      "لم يتم العثور على أي IfcBuildingStorey.",
    );
  }
  if (!spaces.length) {
    throw new IfcProcessingError(
      "extract",
      "NO_SPACES",
      "لا يحتوي النموذج على مساحات IfcSpace قابلة للفحص.",
    );
  }

  const guidOwners = new Map<string, number>();
  const rootedEntities = [project, ...storeys, ...elements];
  for (let index = 0; index < rootedEntities.length; index += 1) {
    const entity = rootedEntities[index];
    if (!entity.globalId) {
      throw new IfcProcessingError(
        "extract",
        "MISSING_GLOBAL_ID",
        `الكيان #${entity.stepId} من النوع ${entity.type} لا يحمل GlobalId.`,
      );
    }
    if (!BASIC_IFC_GLOBAL_ID.test(entity.globalId)) {
      throw new IfcProcessingError(
        "extract",
        "INVALID_GLOBAL_ID",
        `المعرف الدائم للكيان #${entity.stepId} يجب أن يتكون من 22 محرفًا من أبجدية IFC المسموحة.`,
      );
    }
    const owner = guidOwners.get(entity.globalId);
    if (owner !== undefined) {
      throw new IfcProcessingError(
        "extract",
        "DUPLICATE_GLOBAL_ID",
        `المعرف الدائم ${entity.globalId} مستخدم في #${owner} و#${entity.stepId}.`,
      );
    }
    guidOwners.set(entity.globalId, entity.stepId);
    await reportChunk(
      index,
      rootedEntities.length,
      0.75,
      0.15,
      `فحص المعرفات الدائمة: ${index + 1} من ${rootedEntities.length}`,
      options,
      { uniqueGlobalIds: guidOwners.size },
    );
  }
  await reportPhase(
    0.9,
    `اكتمل فحص ${guidOwners.size} معرفًا دائمًا`,
    options,
    { uniqueGlobalIds: guidOwners.size },
  );

  const activityValue = project.properties.ActivityCode;
  const activityId =
    typeof activityValue === "string" &&
    activityIds.includes(activityValue as ActivityId)
      ? (activityValue as ActivityId)
      : undefined;

  const lengthUnit = project.properties.LengthUnit;
  if (lengthUnit !== "METRE") {
    throw new IfcProcessingError(
      "extract",
      "UNSUPPORTED_LENGTH_UNIT",
      "يجب أن يصرح Pset_MiyarProject بوحدة LengthUnit=METRE لهذه النسخة.",
    );
  }
  await reportPhase(
    0.93,
    "تم التحقق من النشاط ووحدة الطول",
    options,
    {
      activityCodePresent: Boolean(activityId),
      lengthUnit: String(lengthUnit),
    },
  );

  const typeCounts: Record<string, number> = {};
  for (let index = 0; index < document.entities.length; index += 1) {
    const entity = document.entities[index];
    typeCounts[entity.type] = (typeCounts[entity.type] ?? 0) + 1;
    await reportChunk(
      index,
      document.entities.length,
      0.9,
      0.1,
      `حساب أنواع العناصر: ${index + 1} من ${document.entities.length}`,
      options,
      { discoveredTypes: Object.keys(typeCounts).length },
    );
  }

  await reportPhase(
    1,
    `اكتمل استخراج ${spaces.length} مساحات و${doors.length} أبواب و${elements.length} عنصرًا`,
    options,
    {
      spaces: spaces.length,
      doors: doors.length,
      storeys: storeys.length,
      elements: elements.length,
      propertySets: propertySets.size,
    },
  );
  return {
    schema: document.schema,
    units: "متر",
    records: document.entities.length,
    elements,
    spaces,
    doors,
    storeys,
    project,
    activityId,
    typeCounts,
  };
}

export function findByRole(
  model: ExtractedIfcModel,
  role: string,
  type?: string,
): ExtractedIfcEntity | undefined {
  return model.elements.find(
    (entity) =>
      (!type || entity.type === type) && entity.properties.RoleCode === role,
  );
}

export function findAllByRole(
  model: ExtractedIfcModel,
  role: string,
): ExtractedIfcEntity[] {
  return model.elements.filter(
    (entity) => entity.properties.RoleCode === role,
  );
}

export function doorWidth(entity?: ExtractedIfcEntity): number | undefined {
  if (!entity || entity.type !== "IFCDOOR") return undefined;
  const width = entity.properties.OverallWidth;
  return typeof width === "number" ? width : undefined;
}
