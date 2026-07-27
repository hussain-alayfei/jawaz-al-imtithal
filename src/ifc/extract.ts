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

export function extractIfcModel(
  document: ParsedStepDocument,
): ExtractedIfcModel {
  const rawById = new Map(
    document.entities.map((entity) => [entity.stepId, entity]),
  );
  const extractedById = new Map<number, ExtractedIfcEntity>();

  for (const entity of document.entities) {
    if (
      PRODUCT_TYPES.has(entity.type) ||
      entity.type === "IFCPROJECT" ||
      entity.type === "IFCBUILDINGSTOREY"
    ) {
      extractedById.set(entity.stepId, baseEntity(entity));
    }
  }

  const singleValues = new Map<
    number,
    { name: string; value: IfcPropertyValue }
  >();
  for (const entity of document.entities) {
    if (entity.type !== "IFCPROPERTYSINGLEVALUE") continue;
    const name = parseIfcValue(entity.args[0] ?? "$");
    if (typeof name !== "string" || !name.trim()) continue;
    singleValues.set(entity.stepId, {
      name,
      value: parseIfcValue(entity.args[2] ?? "$"),
    });
  }

  const propertySets = new Map<
    number,
    { name: string; properties: Record<string, IfcPropertyValue> }
  >();
  for (const entity of document.entities) {
    if (entity.type !== "IFCPROPERTYSET") continue;
    const name = parseIfcValue(entity.args[2] ?? "$");
    const properties: Record<string, IfcPropertyValue> = {};
    for (const propertyId of relationTargetIds(entity.args[4])) {
      const property = singleValues.get(propertyId);
      if (property) properties[property.name] = property.value;
    }
    propertySets.set(entity.stepId, {
      name: typeof name === "string" ? name : `Pset_${entity.stepId}`,
      properties,
    });
  }

  for (const relation of document.entities) {
    if (relation.type !== "IFCRELDEFINESBYPROPERTIES") continue;
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
      Object.assign(target.properties, propertySet.properties);
    }
  }

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
  for (const entity of [project, ...storeys, ...elements]) {
    if (!entity.globalId) {
      throw new IfcProcessingError(
        "extract",
        "MISSING_GLOBAL_ID",
        `الكيان #${entity.stepId} من النوع ${entity.type} لا يحمل GlobalId.`,
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
  }

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
      "يجب أن يصرح Pset_JawazProject بوحدة LengthUnit=METRE لهذه النسخة.",
    );
  }

  const typeCounts: Record<string, number> = {};
  for (const entity of document.entities) {
    typeCounts[entity.type] = (typeCounts[entity.type] ?? 0) + 1;
  }

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
