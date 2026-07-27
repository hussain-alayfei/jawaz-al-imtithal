import type {
  ActivityId,
  FacilityDetails,
  Finding,
  ModelMetadata,
  Scenario,
  Summary,
} from "../data";

export type StageId =
  | "validate"
  | "extract"
  | "completeness"
  | "rules"
  | "link"
  | "report";

export type StageState = "pending" | "running" | "completed" | "failed";

export interface IfcUpload {
  name: string;
  size: number;
  text: string;
  lastModified?: number;
}

export type IfcPropertyValue = string | number | boolean | null;

export interface StepEntity {
  stepId: number;
  type: string;
  args: string[];
  raw: string;
  references: number[];
}

export interface ParsedStepDocument {
  schema: string;
  entities: StepEntity[];
  sha256: string;
  byteLength: number;
}

export interface ExtractedIfcEntity {
  stepId: number;
  type: string;
  globalId?: string;
  name?: string;
  properties: Record<string, IfcPropertyValue>;
}

export interface ExtractedIfcModel {
  schema: string;
  units: "متر";
  records: number;
  elements: ExtractedIfcEntity[];
  spaces: ExtractedIfcEntity[];
  doors: ExtractedIfcEntity[];
  storeys: ExtractedIfcEntity[];
  project?: ExtractedIfcEntity;
  activityId?: ActivityId;
  typeCounts: Record<string, number>;
}

export interface StageResult {
  id: StageId;
  label: string;
  state: Exclude<StageState, "pending" | "running">;
  detail: string;
  durationMs: number;
  evidence: Record<string, string | number | boolean>;
  errorCode?: string;
}

export interface PipelineEvent {
  id: StageId;
  label: string;
  state: StageState;
  detail?: string;
  durationMs?: number;
  evidence?: Record<string, string | number | boolean>;
  errorCode?: string;
}

export interface RuleEvaluation {
  ruleId: string;
  status: "pass" | "fail" | "unknown";
  actual: string;
  target?: ExtractedIfcEntity;
}

export interface ReadinessReport {
  generatedAt: string;
  fileSha256: string;
  rulePackVersion: string;
  modelEvidence: {
    schema: string;
    records: number;
    elements: number;
    spaces: number;
    doors: number;
    storeys: number;
  };
  resultCounts: Summary;
}

export interface ComplianceRun {
  activityId: ActivityId;
  facility: FacilityDetails;
  scenario: Scenario;
  file: {
    name: string;
    size: number;
    sha256: string;
  };
  model: ExtractedIfcModel;
  metadata: ModelMetadata;
  stages: StageResult[];
  findings: Finding[];
  summary: Summary;
  report: ReadinessReport;
  processedAt: string;
}

export class IfcProcessingError extends Error {
  readonly stageId: StageId;
  readonly code: string;

  constructor(stageId: StageId, code: string, message: string) {
    super(message);
    this.name = "IfcProcessingError";
    this.stageId = stageId;
    this.code = code;
  }
}
