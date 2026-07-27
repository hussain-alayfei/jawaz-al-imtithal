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
const SUPPORTED_CONTRACT_VERSION = "MIYAR-IFC-1.0";

function elapsed(start: number): number {
  return Math.max(0, Number((performance.now() - start).toFixed(1)));
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
  await new Promise<void>((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(() => resolve());
      return;
    }
    globalThis.setTimeout(resolve, 0);
  });
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
    operation: (
      updateProgress: (
        progress: number,
        detail?: string,
        evidence?: Record<string, string | number | boolean>,
      ) => void,
    ) => Promise<{
      value: T;
      detail: string;
      evidence: Record<string, string | number | boolean>;
    }>,
  ): Promise<T> => {
    const index = stageIds.indexOf(id);
    const label = labels[index];
    let currentProgress = 0;
    const updateProgress = (
      progress: number,
      detail?: string,
      evidence?: Record<string, string | number | boolean>,
    ) => {
      currentProgress = Math.max(
        currentProgress,
        Math.min(1, Math.max(0, progress)),
      );
      onEvent?.({
        id,
        label,
        state: "running",
        progress: currentProgress,
        detail,
        evidence,
      });
    };
    updateProgress(0, "بدأت المعالجة من بايتات الملف المرفوع");
    const startedAt = performance.now();

    try {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      // Give React a paint opportunity before CPU work starts. This is a
      // cooperative yield, not a timer that advances the displayed progress.
      await yieldToInterface(signal);
      const output = await operation(updateProgress);
      const result: StageResult = {
        id,
        label,
        state: "completed",
        detail: output.detail,
        durationMs: elapsed(startedAt),
        evidence: output.evidence,
        progress: 1,
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
        progress: currentProgress,
        errorCode: processingError.code,
      });
      throw processingError;
    }
  };

  const document = await runStage("validate", async (progress) => {
    const value = await parseStepDocument(upload, {
      signal,
      onProgress: progress,
    });
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

  const model = await runStage("extract", async (progress) => {
    const value = await extractIfcModel(document, {
      signal,
      onProgress: progress,
    });
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

  await runStage("completeness", async (progress) => {
    assertFacilityComplete(facility);
    progress(0.25, "اكتملت حقول المنشأة المطلوبة", {
      facilityFieldsComplete: true,
    });
    await yieldToInterface(signal);
    if (!model.activityId) {
      throw new IfcProcessingError(
        "completeness",
        "ACTIVITY_CODE_MISSING",
        "لم يتم العثور على ActivityCode صالح في Pset_MiyarProject.",
      );
    }
    if (model.activityId !== activityId) {
      throw new IfcProcessingError(
        "completeness",
        "ACTIVITY_MISMATCH",
        `النشاط داخل الملف (${model.activityId}) لا يطابق الحزمة المختارة (${activityId}).`,
      );
    }
    progress(0.5, "تطابق نشاط الملف مع الحزمة المختارة", {
      activityMatch: true,
      activityId,
    });
    await yieldToInterface(signal);
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
        "مجموعة Pset_MiyarProject لا تحتوي FixtureContractVersion.",
      );
    }
    if (contractVersion !== SUPPORTED_CONTRACT_VERSION) {
      throw new IfcProcessingError(
        "completeness",
        "UNSUPPORTED_CONTRACT_VERSION",
        `إصدار عقد البيانات داخل الملف (${contractVersion}) غير مدعوم. الإصدار المتوقع هو ${SUPPORTED_CONTRACT_VERSION}.`,
      );
    }
    progress(1, "اكتمل عقد البيانات الدلالي", {
      classifiedSpaces,
      totalSpaces: model.spaces.length,
      contractVersion,
    });
    await yieldToInterface(signal);
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

  const evaluations = await runStage("rules", async (progress) => {
    const activity = activityExamples.find((item) => item.id === activityId);
    progress(0.15, `تحميل حزمة ${activity?.ruleVersion ?? "UNKNOWN"}`, {
      rulePackVersion: activity?.ruleVersion ?? "UNKNOWN",
    });
    await yieldToInterface(signal);
    const value = evaluateRules({ activityId, facility, model });
    if (value.length !== 10) {
      throw new IfcProcessingError(
        "rules",
        "INVALID_RULE_COUNT",
        `أعادت الحزمة ${value.length} نتائج بدلًا من 10.`,
      );
    }
    const available = countAvailableEvidence(activityId, value);
    progress(1, `تم تقييم ${value.length} قواعد من أدلة النموذج`, {
      evaluatedRules: value.length,
      conclusiveEvidence: available,
    });
    await yieldToInterface(signal);
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

  const findings = await runStage("link", async (progress) => {
    const value = materializeFindings(activityId, evaluations);
    progress(0.35, `تم إنشاء ${value.length} نتائج قابلة للتتبع`, {
      materializedResults: value.length,
    });
    await yieldToInterface(signal);
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
    const actionable = value.filter((finding) => finding.status !== "pass");
    const passing = value.filter((finding) => finding.status === "pass");
    const actionableLinked = actionable.filter(
      (finding) => finding.elementStepId !== undefined,
    ).length;
    const passingLinked = passing.filter(
      (finding) => finding.elementStepId !== undefined,
    ).length;
    const actionableFileLevel = actionable.length - actionableLinked;
    const passingFileLevel = passing.length - passingLinked;
    progress(1, "اكتمل التحقق من GUID ومراجع STEP", {
      actionableResults: actionable.length,
      actionableLinkedResults: actionableLinked,
      passingResults: passing.length,
      passingLinkedResults: passingLinked,
      linkedResults: linked,
      fileLevelResults: value.length - linked,
    });
    await yieldToInterface(signal);
    return {
      value,
      detail: `${actionable.length} نتائج تتطلب إجراء: ${actionableLinked} مرتبطة بعناصر و${actionableFileLevel} على مستوى الملف • ${passingLinked} نتائج مطابقة مرتبطة`,
      evidence: {
        actionableResults: actionable.length,
        actionableLinkedResults: actionableLinked,
        actionableFileLevelResults: actionableFileLevel,
        passingResults: passing.length,
        passingLinkedResults: passingLinked,
        passingFileLevelResults: passingFileLevel,
        linkedResults: linked,
        fileLevelResults: value.length - linked,
        totalResults: value.length,
      },
    };
  });

  const completed = await runStage("report", async (progress) => {
    const summary = calculateSummary(findings);
    progress(0.4, "تم حساب الدرجة من القواعد المطابقة إلى إجمالي القواعد", {
      score: summary.score,
      passed: summary.passed,
      totalRules: findings.length,
      scoreMethod: "passed_over_total",
    });
    await yieldToInterface(signal);
    const processedAt = new Date().toISOString();
    const scenario = summary.score === 100 ? "ready" : "review";
    const activity = activityExamples.find((item) => item.id === activityId);
    const metadata: ModelMetadata = {
      activityId,
      fileName: upload.name,
      size: formatSize(upload.bytes.byteLength),
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
        size: upload.bytes.byteLength,
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
        scoreMethod: "passed_over_total",
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
    progress(1, "اكتمل سجل الجاهزية والأدلة", {
      score: summary.score,
      totalRules: findings.length,
      scoreMethod: "passed_over_total",
    });
    await yieldToInterface(signal);
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
