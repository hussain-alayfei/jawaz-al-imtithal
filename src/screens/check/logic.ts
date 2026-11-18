import { copy } from "../../content/copy";
import { getDefaultFacility, type ActivityId, type FacilityDetails } from "../../data";
import { IfcProcessingError, type IfcUpload, type StageId } from "../../ifc/types";

/* Pure helpers for the check screen: validation, error wording and number formatting. */

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export const STAGE_IDS: readonly StageId[] = [
  "validate",
  "extract",
  "completeness",
  "rules",
  "link",
  "report",
];

/** Client-side checks before the bytes are read, as the old upload step did. */
export function checkFileMeta(name: string, size: number): string | undefined {
  if (!name.toLowerCase().endsWith(".ifc")) return copy.check.errors.type;
  if (size > MAX_FILE_BYTES) return copy.check.errors.size;
  return undefined;
}

export async function readUpload(file: File): Promise<IfcUpload> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.byteLength) throw new Error("EMPTY_FILE");
  return { name: file.name, size: bytes.byteLength, bytes, lastModified: file.lastModified };
}

/** Licence area typed in the field; anything that is not a positive number is 0. */
export function parseArea(text: string): number {
  const normalized = text
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace("٫", ".");
  if (!normalized) return 0;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

export function isAreaValid(area: number): boolean {
  return Number.isFinite(area) && area > 0;
}

export function formatArea(area: number): string {
  return isAreaValid(area) ? String(area) : "";
}

/**
 * The check page asks only for the activity and the licence area. The engine also needs the
 * other facility fields, so any that are blank fall back to the activity's defaults.
 */
export function withFacilityDefaults(facility: FacilityDetails, activityId: ActivityId): FacilityDetails {
  const defaults = getDefaultFacility(activityId);
  const text = (value: string, fallback: string) => (value.trim() ? value : fallback);
  const count = (value: number, fallback: number) => (Number.isFinite(value) && value > 0 ? value : fallback);
  return {
    ...facility,
    projectName: text(facility.projectName, defaults.projectName),
    activity: text(facility.activity, defaults.activity),
    city: text(facility.city, defaults.city),
    district: text(facility.district, defaults.district),
    buildingType: text(facility.buildingType, defaults.buildingType),
    floors: count(facility.floors, defaults.floors),
    capacity: count(facility.capacity, defaults.capacity),
  };
}

type ErrorKey = keyof typeof copy.check.errors;

const CODE_TO_KEY: Record<string, ErrorKey> = {
  INVALID_EXTENSION: "type",
  UNSUPPORTED_EXTENSION: "type",
  INVALID_ENVELOPE: "type",
  MISSING_SCHEMA: "type",
  UNSUPPORTED_SCHEMA: "type",
  NON_IFC_RECORD: "type",
  FILE_TOO_LARGE: "size",
  STANDARD_ACTIVITY_UNSUPPORTED: "activity",
  ACTIVITY_MISMATCH: "activity",
  ACTIVITY_CODE_MISSING: "activity",
};

/* Data the file does carry but cannot be checked against; their engine message is clearer. */
const OWN_MESSAGE_CODES = new Set(["NO_SPACES", "UNSUPPORTED_LENGTH_UNIT", "FACILITY_INCOMPLETE"]);

export interface CheckFailure {
  /** Short sentence from copy.check.errors, or the engine message when none fits. */
  headline: string;
  /** The engine's own message, when it adds to the headline. */
  detail?: string;
  /** Which copy.check.errors sentence the headline is, if any. */
  kind?: ErrorKey;
  stageId?: StageId;
  code?: string;
}

export function describeFailure(error: unknown): CheckFailure {
  const message = error instanceof Error && error.message ? error.message : copy.check.errors.parse;
  if (!(error instanceof IfcProcessingError)) {
    return {
      headline: copy.check.errors.parse,
      detail: message !== copy.check.errors.parse ? message : undefined,
      kind: "parse",
    };
  }
  const { code, stageId } = error;
  let key: ErrorKey | undefined = CODE_TO_KEY[code];
  if (!key && !OWN_MESSAGE_CODES.has(code) && (stageId === "validate" || stageId === "extract")) {
    key = "parse";
  }
  const headline = key ? copy.check.errors[key] : message;
  return { headline, detail: headline !== message ? message : undefined, kind: key, stageId, code };
}

/** Stage duration in Arabic units, as on the identity board («900 م.ث»). */
export function formatDuration(ms: number): string {
  if (ms < 1) return "أقل من 1 م.ث";
  if (ms < 1000) return `${Math.round(ms)} م.ث`;
  return `${(ms / 1000).toFixed(2)} ث`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(bytes / 1024, 0.1).toFixed(1)} KB`;
}

/** «بند» counted after a number: 13 من 17 بندًا، 10 بنود. */
export function clausesWord(total: number): string {
  const rest = total % 100;
  if (rest >= 3 && rest <= 10) return "بنود";
  if (rest >= 11) return "بندًا";
  return "بند";
}
