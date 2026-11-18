import {
  activityExamples,
  calculateSummary,
  type ActivityId,
  type FacilityDetails,
  type ModelMetadata,
} from "../../data";
import type { Finding, ResultStatus } from "../../data";
import { hasCompleteFacility } from "../rules";
import {
  IfcProcessingError,
  type ComplianceRun,
  type ExtractedIfcEntity,
  type ExtractedIfcModel,
  type IfcUpload,
  type StageId,
  type StageResult,
} from "../types";
import { loadStandardModel, StandardLoadError } from "./load";
import type { StandardFacts, StandardModel } from "./model";
import {
  MOMAH_SOURCE_LABEL,
  MOMAH_VERSION,
  RESTAURANT_REQUIREMENTS_SOURCE,
  requirementById,
  type Requirement,
} from "./requirements";
import { evaluateStandardRestaurant, toEntity, type StandardEvaluation } from "./rules";

const KIND_LABEL: Record<Requirement["kind"], string> = {
  mandatory: "بند إلزامي",
  recommendation: "توصية",
  reference: "إحالة إلى كود البناء السعودي",
  platform: "فحص بيانات من موائم",
};

/** A finding built from the requirement it checks: clause, verbatim text and source link. */
export function findingFor(evaluation: StandardEvaluation): Finding {
  const req = requirementById.get(evaluation.ruleId);
  if (!req) throw new Error(`Missing requirement ${evaluation.ruleId}`);
  const status: ResultStatus = evaluation.status;
  const official = req.kind !== "platform";
  const clause = official
    ? `البند ${req.clause}${req.page ? ` • صفحة ${req.page}` : ""} • ${KIND_LABEL[req.kind]}`
    : KIND_LABEL.platform;
  const title =
    status === "pass"
      ? `${req.subject}: مطابق`
      : status === "fail"
        ? req.kind === "recommendation"
          ? `${req.subject}: التوصية غير محققة`
          : `${req.subject}: غير مطابق`
        : `${req.subject}: غير قابل للتحقق من الملف`;
  const explanation =
    status === "unknown"
      ? `لا يحمل الملف الدليل اللازم لهذا البند، فلا يُحتسب مطابقًا. طريقة القياس: ${req.method}`
      : `قيس هذا البند من الملف نفسه. طريقة القياس: ${req.method}`;
  return {
    ruleId: req.id,
    status,
    severity: status === "fail" ? (req.kind === "recommendation" ? "medium" : "high") : status === "unknown" ? "medium" : "info",
    title,
    shortTitle: title,
    category: req.category,
    elementId: evaluation.target ? `STEP-${evaluation.target.stepId}` : undefined,
    elementStepId: evaluation.target?.stepId,
    elementGuid: evaluation.target?.globalId,
    elementName: evaluation.target?.name,
    actual: evaluation.actual,
    expected: req.expected,
    explanation,
    recommendation: status === "pass" ? "لا يلزم إجراء في نطاق هذا البند." : req.recommendation,
    source: official ? MOMAH_SOURCE_LABEL : "فحص جودة بيانات من موائم (ليس بندًا من الاشتراطات)",
    clause,
    version: official ? MOMAH_VERSION : "MOWAEM-DATA-1",
    effort: status === "pass" ? "لا يوجد" : req.effort,
    clauseText: req.text,
    sourceUrl: official ? RESTAURANT_REQUIREMENTS_SOURCE.pdfUrl : undefined,
    requirementKind: req.kind,
  };
}

/*
 * The six analysis stages for a standard IFC file. Same stage ids and events as the
 * contract pipeline, so the analysis screen and report work unchanged.
 */

type StageOutput<T> = {
  value: T;
  detail: string;
  evidence: Record<string, string | number | boolean>;
};
export type RunStage = <T>(
  id: StageId,
  operation: (
    progress: (progress: number, detail?: string, evidence?: Record<string, string | number | boolean>) => void,
  ) => Promise<StageOutput<T>>,
) => Promise<T>;

const SUPPORTED_SCHEMAS = new Set(["IFC2X3", "IFC4", "IFC4X3", "IFC4X3_ADD2"]);
const MAX_BYTES = 50 * 1024 * 1024;

/** Files that use any Mowaem contract property set keep the contract checks (and its
    precise errors); every other IFC file takes the standard path. */
export function hasMowaemContract(bytes: Uint8Array): boolean {
  const needle = [..."Pset_Mowaem"].map((c) => c.charCodeAt(0));
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function headerSchema(bytes: Uint8Array): { envelope: boolean; schema?: string } {
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 4096));
  const envelope = head.trimStart().startsWith("ISO-10303-21;");
  const match = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(head);
  return { envelope, schema: match?.[1]?.toUpperCase() };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(bytes / 1024, 0.1).toFixed(1)} KB`;
}

/** Shape the standard facts as the model the rest of the app already understands. */
export function toExtractedModel(facts: StandardFacts): ExtractedIfcModel {
  const asEntity = (expressId: number) => toEntity(facts, expressId)!;
  const elements: ExtractedIfcEntity[] = facts.products
    .filter((p) => !p.ifcType.toUpperCase().includes("STOREY"))
    .map((p) => asEntity(p.expressId));
  for (const space of facts.spaces) {
    const entity = elements.find((e) => e.stepId === space.expressId);
    if (entity) {
      if (space.role) entity.properties.RoleCode = space.role;
      if (space.netFloorArea !== undefined) entity.properties.NetFloorArea = Number(space.netFloorArea.toFixed(3));
      if (space.longName) entity.properties.LongName = space.longName;
    }
  }
  for (const door of facts.doors) {
    const entity = elements.find((e) => e.stepId === door.expressId);
    if (entity) {
      if (door.width !== undefined) entity.properties.OverallWidth = Number(door.width.toFixed(3));
      if (door.fireExit !== undefined) entity.properties.FireExit = door.fireExit;
      if (door.isExternal !== undefined) entity.properties.IsExternal = door.isExternal;
      if (door.reference) entity.properties.Reference = door.reference;
    }
  }
  const spaces = elements.filter((e) => e.type === "IFCSPACE");
  const doors = elements.filter((e) => e.type === "IFCDOOR");
  return {
    schema: facts.schema,
    units: "متر",
    records: facts.records,
    elements,
    spaces,
    doors,
    storeys: facts.storeys.map((s) => ({
      stepId: s.expressId,
      type: "IFCBUILDINGSTOREY",
      globalId: s.globalId,
      name: s.name,
      properties: {},
      propertySets: {},
    })),
    project: facts.project
      ? { stepId: facts.project.expressId, type: "IFCPROJECT", globalId: facts.project.globalId, name: facts.project.name, properties: {}, propertySets: {} }
      : undefined,
    activityId: "restaurant",
    typeCounts: Object.fromEntries(Object.entries(facts.typeCounts).map(([k, v]) => [k.toUpperCase(), v])),
  };
}

export async function runStandardStages({
  upload,
  facility,
  activityId,
  signal,
  runStage,
  stages,
  yieldToInterface,
}: {
  upload: IfcUpload;
  facility: FacilityDetails;
  activityId: ActivityId;
  signal?: AbortSignal;
  runStage: RunStage;
  stages: StageResult[];
  yieldToInterface: () => Promise<void>;
}): Promise<ComplianceRun> {
  const hash = await runStage("validate", async (progress) => {
    if (!upload.name.toLowerCase().endsWith(".ifc")) {
      throw new IfcProcessingError("validate", "INVALID_EXTENSION", "الملف ليس بامتداد ‎.ifc.");
    }
    if (upload.bytes.byteLength > MAX_BYTES) {
      throw new IfcProcessingError("validate", "FILE_TOO_LARGE", "حجم الملف يتجاوز الحد الحالي البالغ 50 MB.");
    }
    const { envelope, schema } = headerSchema(upload.bytes);
    if (!envelope) {
      throw new IfcProcessingError("validate", "INVALID_ENVELOPE", "الملف لا يبدأ بغلاف STEP ‏(ISO-10303-21).");
    }
    if (!schema || !SUPPORTED_SCHEMAS.has(schema)) {
      throw new IfcProcessingError("validate", "UNSUPPORTED_SCHEMA", `إصدار IFC في الملف (${schema ?? "غير معروف"}) غير مدعوم.`);
    }
    progress(0.5, `غلاف STEP سليم • ${schema}`, { schema });
    const value = await sha256(upload.bytes);
    return {
      value: { sha256: value, schema },
      detail: `${schema} • ملف IFC قياسي • SHA-256 ${value.slice(0, 12)}…`,
      evidence: { schema, sha256: value, byteLength: upload.bytes.byteLength, source: "standard-ifc" },
    };
  });

  const model = await runStage<StandardModel>("extract", async (progress) => {
    try {
      const value = await loadStandardModel(upload.bytes, {
        signal,
        onProgress: (p, detail) => progress(p, detail),
      });
      const { facts, geometry } = value;
      if (!facts.spaces.length) {
        throw new IfcProcessingError("extract", "NO_SPACES", "لا يحتوي الملف على مساحات IfcSpace يمكن فحصها.");
      }
      const services = facts.systems.length
        ? ` • ${facts.systems.length} أنظمة خدمات بـ ${facts.connections.length} وصلة منافذ`
        : "";
      return {
        value,
        detail: `${facts.spaces.length} مساحات • ${facts.doors.length} أبواب • ${facts.products.length} عنصرًا${services} • ${geometry.triangles} مثلثًا • الوحدة ${facts.lengthUnit.declared}`,
        evidence: {
          spaces: facts.spaces.length,
          doors: facts.doors.length,
          storeys: facts.storeys.length,
          elements: facts.products.length,
          triangles: geometry.triangles,
          lengthUnit: facts.lengthUnit.declared,
          systems: facts.systems.length,
          portConnections: facts.connections.length,
        },
      };
    } catch (error) {
      if (error instanceof StandardLoadError) {
        throw new IfcProcessingError("extract", error.code, error.message);
      }
      throw error;
    }
  });
  const { facts } = model;

  await runStage("completeness", async (progress) => {
    if (!hasCompleteFacility(facility)) {
      throw new IfcProcessingError(
        "completeness",
        "FACILITY_INCOMPLETE",
        "بيانات المشروع الأساسية غير مكتملة. ارجع إلى الخطوة الأولى وأكمل الحقول.",
      );
    }
    if (activityId !== "restaurant") {
      throw new IfcProcessingError(
        "completeness",
        "STANDARD_ACTIVITY_UNSUPPORTED",
        "فحص ملفات IFC القياسية متاح حاليًا لنشاط المطعم فقط. اختر نشاط المطعم أو ارفع ملفًا بعقد بيانات موائم.",
      );
    }
    const classified = facts.spaces.filter((s) => s.role).length;
    const measuredDoors = facts.doors.filter((d) => d.width !== undefined).length;
    progress(1, "اكتملت بيانات المنشأة وقُرئت تصنيفات المساحات", { classified, measuredDoors });
    await yieldToInterface();
    return {
      value: true,
      detail: `${classified}/${facts.spaces.length} مساحات مصنفة من أسمائها • ${measuredDoors}/${facts.doors.length} أبواب بعرض مقاس`,
      evidence: {
        classifiedSpaces: classified,
        totalSpaces: facts.spaces.length,
        measuredDoors,
        totalDoors: facts.doors.length,
      },
    };
  });

  const activity = activityExamples.find((item) => item.id === activityId);
  const evaluations = await runStage<StandardEvaluation[]>("rules", async (progress) => {
    const value = evaluateStandardRestaurant(facts, facility);
    const verified = value.filter((v) => v.status !== "unknown").length;
    progress(1, `تم تقييم ${value.length} قواعد من بيانات الملف`, { verified });
    await yieldToInterface();
    return {
      value,
      detail: `${RESTAURANT_REQUIREMENTS_SOURCE.title} (${RESTAURANT_REQUIREMENTS_SOURCE.edition}) • ${value.length} بندًا • ${verified} قابلة للتحقق من الملف`,
      evidence: {
        requirements: `${RESTAURANT_REQUIREMENTS_SOURCE.title} • ${RESTAURANT_REQUIREMENTS_SOURCE.decision}`,
        rules: value.length,
        verified,
      },
    };
  });

  const extracted = toExtractedModel(facts);
  const findings = await runStage("link", async (progress) => {
    const value = evaluations.map(findingFor);
    const ids = new Set(extracted.elements.map((e) => e.stepId));
    const guids = new Set(extracted.elements.map((e) => e.globalId));
    for (const finding of value) {
      if (finding.elementStepId === undefined) continue;
      if (!ids.has(finding.elementStepId) || !finding.elementGuid || !guids.has(finding.elementGuid)) {
        throw new IfcProcessingError("link", "BROKEN_RESULT_LINK", `النتيجة ${finding.ruleId} لا ترتبط بعنصر موجود في الملف.`);
      }
    }
    const linked = value.filter((f) => f.elementStepId !== undefined).length;
    progress(1, "اكتمل التحقق من GUID لكل نتيجة مرتبطة", { linked });
    await yieldToInterface();
    return {
      value,
      detail: `${linked} نتائج مرتبطة بعناصر الملف بمعرّف GUID • ${value.length - linked} على مستوى الملف`,
      evidence: { linkedResults: linked, fileLevelResults: value.length - linked, totalResults: value.length },
    };
  });

  return await runStage<ComplianceRun>("report", async (progress) => {
    const summary = calculateSummary(findings);
    // The scope counts requirement clauses only; Mowaem's own data checks (MOWAEM-DATA-*) are not clauses.
    const clauseFindings = findings.filter((finding) => !finding.ruleId.startsWith("MOWAEM-DATA"));
    const verified = clauseFindings.filter((finding) => finding.status !== "unknown").length;
    const scenario = summary.failed === 0 && summary.unknown === 0 ? "ready" : "review";
    const processedAt = new Date().toISOString();
    const metadata: ModelMetadata = {
      activityId,
      fileName: upload.name,
      size: formatSize(upload.bytes.byteLength),
      schema: facts.schema,
      units: `متر (من ${facts.lengthUnit.declared})`,
      storeys: facts.storeys.length,
      spaces: facts.spaces.length,
      doors: facts.doors.length,
      elements: facts.products.length,
      scenario,
    };
    const measurements: NonNullable<ComplianceRun["standard"]>["measurements"] = {};
    for (const evaluation of evaluations) {
      if (evaluation.measurement) measurements[evaluation.ruleId] = evaluation.measurement;
    }
    const value: ComplianceRun = {
      activityId,
      facility: { ...facility },
      scenario,
      file: { name: upload.name, size: upload.bytes.byteLength, sha256: hash.sha256 },
      model: extracted,
      metadata,
      stages,
      findings,
      summary,
      processedAt,
      source: "standard-ifc",
      coverage: { verified, total: clauseFindings.length },
      standard: { facts, geometry: model.geometry, measurements },
      report: {
        generatedAt: processedAt,
        fileSha256: hash.sha256,
        rulePackVersion: `${RESTAURANT_REQUIREMENTS_SOURCE.title} ${RESTAURANT_REQUIREMENTS_SOURCE.edition}`,
        scoreMethod: "passed_over_total",
        modelEvidence: {
          schema: facts.schema,
          records: facts.records,
          elements: facts.products.length,
          spaces: facts.spaces.length,
          doors: facts.doors.length,
          storeys: facts.storeys.length,
        },
        resultCounts: summary,
      },
    };
    progress(1, "اكتمل سجل الفحص والأدلة", { verified, total: findings.length });
    await yieldToInterface();
    return {
      value,
      detail: `تم التحقق من ${verified} من ${findings.length} قواعد من بيانات الملف • ${summary.passed} مطابق • ${summary.failed} غير مطابق • ${summary.unknown} غير قابلة للتحقق`,
      evidence: { verified, total: findings.length, passed: summary.passed, failed: summary.failed, unknown: summary.unknown },
    };
  });
}
