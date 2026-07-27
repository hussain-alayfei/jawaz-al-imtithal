import {
  activityExamples,
  calculateSummary,
  getAnalysisStages,
  type ActivityId,
  type FacilityDetails,
  type ModelMetadata,
} from "../data";
import { extractIfcModel } from "./extract";
import {
  countAvailableEvidence,
  evaluateRules,
  materializeFindings,
} from "./rules";
import { parseStepDocument } from "./stepParser";
import {
  IfcProcessingError,
  type ComplianceRun,
  type IfcUpload,
  type PipelineEvent,
  type StageId,
  type StageResult,
} from "./types";

type PipelineInput = {
  upload: IfcUpload;
  facility: FacilityDetails;
  activityId: ActivityId;
  signal?: AbortSignal;
  onEvent?: (event: PipelineEvent) => void;
};

const stageIds: StageId[] = [
  "validate",
  "extract",
  "completeness",
  "rules",
  "link",
  "report",
];

function elapsed(start: number): number {
  return Math.max(0, Math.round(performance.now() - start));
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(bytes / 1024, 0.1).toFixed(1)} KB`;
}

function assertFacilityComplete(facility: FacilityDetails) {
  const complete = Boolean(
    facility.projectName.trim() &&
      facility.activity.trim() &&
      facility.city.trim() &&
      facility.district.trim() &&
      facility.buildingType.trim() &&
      facility.area > 0 &&
      facility.floors > 0 &&
      facility.capacity > 0,
  );
  if (!complete) {
    throw new IfcProcessingError(
      "completeness",
      "FACILITY_INCOMPLETE",
      "بيانات المشروع الأساسية غير مكتملة. ارجع إلى الخطوة الأولى وأكمل الحقول.",
    );
  }
}

async function yieldToInterface(signal?: AbortSignal) {
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

export async function runIfcCompliance({
  upload,
  facility,
  activityId,
  signal,
  onEvent,
}: PipelineInput): Promise<ComplianceRun> {
  const labels = getAnalysisStages(activityId);
  const stages: StageResult[] = [];

  const runStage = async <T>(
    id: StageId,
    operation: () => Promise<{
      value: T;
      detail: string;
      evidence: Record<string, string | number | boolean>;
    }>,
  ): Promise<T> => {
    const index = stageIds.indexOf(id);
    const label = labels[index];
    onEvent?.({ id, label, state: "running" });
    const startedAt = performance.now();

    try {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const output = await operation();
      const result: StageResult = {
        id,
        label,
        state: "completed",
        detail: output.detail,
        durationMs: elapsed(startedAt),
        evidence: output.evidence,
      };
      stages.push(result);
      onEvent?.({ ...result });
      await yieldToInterface(signal);
      return output.value;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      const processingError =
        error instanceof IfcProcessingError
          ? error
          : new IfcProcessingError(
              id,
              "STAGE_FAILED",
              error instanceof Error ? error.message : "تعذر إكمال المرحلة.",
            );
      onEvent?.({
        id,
        label,
        state: "failed",
        detail: processingError.message,
        durationMs: elapsed(startedAt),
        evidence: {},
        errorCode: processingError.code,
      });
      throw processingError;
    }
  };

  const document = await runStage("validate", async () => {
    const value = await parseStepDocument(upload);
    return {
      value,
      detail: `${value.schema} • ${value.entities.length} سجلًا • SHA-256 ${value.sha256.slice(0, 12)}…`,
      evidence: {
        schema: value.schema,
        records: value.entities.length,
        sha256: value.sha256,
        byteLength: value.byteLength,
      },
    };
  });

  const model = await runStage("extract", async () => {
    const value = extractIfcModel(document);
    return {
      value,
      detail: `${value.spaces.length} مساحات • ${value.doors.length} أبواب • ${value.elements.length} عنصرًا`,
      evidence: {
        spaces: value.spaces.length,
        doors: value.doors.length,
        storeys: value.storeys.length,
        elements: value.elements.length,
      },
    };
  });

  await runStage("completeness", async () => {
    assertFacilityComplete(facility);
    if (!model.activityId) {
      throw new IfcProcessingError(
        "completeness",
        "ACTIVITY_CODE_MISSING",
        "لم يتم العثور على ActivityCode صالح في Pset_JawazProject.",
      );
    }
    if (model.activityId !== activityId) {
      throw new IfcProcessingError(
        "completeness",
        "ACTIVITY_MISMATCH",
        `النشاط داخل الملف (${model.activityId}) لا يطابق الحزمة المختارة (${activityId}).`,
      );
    }
    const classifiedSpaces = model.spaces.filter(
      (space) =>
        Boolean(space.name?.trim()) &&
        typeof space.properties.RoleCode === "string",
    ).length;
    const contractVersion = model.project?.properties.FixtureContractVersion;
    if (typeof contractVersion !== "string") {
      throw new IfcProcessingError(
        "completeness",
        "SEMANTIC_CONTRACT_MISSING",
        "مجموعة Pset_JawazProject لا تحتوي FixtureContractVersion.",
      );
    }
    return {
      value: true,
      detail: `${classifiedSpaces}/${model.spaces.length} مساحات مصنفة • النشاط مطابق • عقد ${contractVersion}`,
      evidence: {
        classifiedSpaces,
        totalSpaces: model.spaces.length,
        activityMatch: true,
        contractVersion,
      },
    };
  });

  const evaluations = await runStage("rules", async () => {
    const value = evaluateRules({ activityId, facility, model });
    if (value.length !== 10) {
      throw new IfcProcessingError(
        "rules",
        "INVALID_RULE_COUNT",
        `أعادت الحزمة ${value.length} نتائج بدلًا من 10.`,
      );
    }
    const available = countAvailableEvidence(activityId, value);
    const activity = activityExamples.find((item) => item.id === activityId);
    return {
      value,
      detail: `${activity?.ruleVersion} • 10 قواعد • ${available}/10 أدلة حاسمة`,
      evidence: {
        rulePackVersion: activity?.ruleVersion ?? "UNKNOWN",
        rules: value.length,
        conclusiveEvidence: available,
      },
    };
  });

  const findings = await runStage("link", async () => {
    const value = materializeFindings(activityId, evaluations);
    const entityIds = new Set(model.elements.map((entity) => entity.stepId));
    const entityGuids = new Set(
      model.elements
        .map((entity) => entity.globalId)
        .filter((guid): guid is string => Boolean(guid)),
    );
    for (const finding of value) {
      if (finding.elementStepId === undefined) continue;
      if (
        !entityIds.has(finding.elementStepId) ||
        !finding.elementGuid ||
        !entityGuids.has(finding.elementGuid)
      ) {
        throw new IfcProcessingError(
          "link",
          "BROKEN_RESULT_LINK",
          `النتيجة ${finding.ruleId} لا ترتبط بعنصر موجود في الملف.`,
        );
      }
    }
    const linked = value.filter(
      (finding) => finding.elementStepId !== undefined,
    ).length;
    return {
      value,
      detail: `${linked} نتائج مرتبطة بعناصر • ${value.length - linked} على مستوى الملف`,
      evidence: {
        linkedResults: linked,
        fileLevelResults: value.length - linked,
        totalResults: value.length,
      },
    };
  });

  const completed = await runStage("report", async () => {
    const summary = calculateSummary(findings);
    const processedAt = new Date().toISOString();
    const scenario = summary.score === 100 ? "ready" : "review";
    const activity = activityExamples.find((item) => item.id === activityId);
    const metadata: ModelMetadata = {
      activityId,
      fileName: upload.name,
      size: formatSize(upload.size),
      schema: model.schema,
      units: model.units,
      storeys: model.storeys.length,
      spaces: model.spaces.length,
      doors: model.doors.length,
      elements: model.elements.length,
      scenario,
    };
    const value: Omit<ComplianceRun, "stages"> = {
      activityId,
      facility: { ...facility },
      scenario,
      file: {
        name: upload.name,
        size: upload.size,
        sha256: document.sha256,
      },
      model,
      metadata,
      findings,
      summary,
      processedAt,
      report: {
        generatedAt: processedAt,
        fileSha256: document.sha256,
        rulePackVersion: activity?.ruleVersion ?? "UNKNOWN",
        modelEvidence: {
          schema: model.schema,
          records: model.records,
          elements: model.elements.length,
          spaces: model.spaces.length,
          doors: model.doors.length,
          storeys: model.storeys.length,
        },
        resultCounts: summary,
      },
    };
    return {
      value,
      detail: `مؤشر الجاهزية ${summary.score}/100 • ${summary.passed} مطابق • ${summary.failed + summary.unknown} تتطلب إجراء`,
      evidence: {
        score: summary.score,
        passed: summary.passed,
        failed: summary.failed,
        unknown: summary.unknown,
      },
    };
  });

  return { ...completed, stages };
}
