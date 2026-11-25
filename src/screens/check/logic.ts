import { copy } from "../../content/copy";
import { getDefaultFacility, type ActivityId, type FacilityDetails } from "../../data";
import { IfcProcessingError, type IfcUpload, type StageId } from "../../ifc/types";

/* Pure helpers for the check screen: validation, error wording, number formatting and the wizard's steps. */

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

/** True when the bytes start like an IFC STEP file (ISO-10303-21), ignoring a BOM or leading space. */
export function looksLikeStep(bytes: Uint8Array): boolean {
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const head = new TextDecoder("latin1").decode(bytes.subarray(start, start + 512)).trimStart();
  return head.startsWith("ISO-10303-21");
}

export async function readUpload(file: File): Promise<IfcUpload> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.byteLength) throw new Error("EMPTY_FILE");
  if (!looksLikeStep(bytes)) throw new Error("NOT_STEP");
  return { name: file.name, size: bytes.byteLength, bytes, lastModified: file.lastModified };
}

/** Arabic-Indic and Persian digits as Western digits («١٢٣» and «۱۲۳» become "123"). */
export function normalizeDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

/** Licence area typed in the field; anything that is not a positive number is 0. */
export function parseArea(text: string): number {
  const normalized = normalizeDigits(text.trim()).replace("٫", ".");
  // Plain decimals only: no exponents ("1e3"), signs or separators.
  if (!/^\d+(\.\d*)?$/.test(normalized)) return 0;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

/** The largest licensed area the field accepts (m²): well above any single shop, below typos. */
export const MAX_AREA_M2 = 100000;

export function isAreaValid(area: number): boolean {
  return Number.isFinite(area) && area > 0 && area <= MAX_AREA_M2;
}

export function formatArea(area: number): string {
  return isAreaValid(area) ? String(area) : "";
}

/**
 * The engine needs every facility field; any left blank (a sample link skips the data steps) falls back
 * to the activity's defaults.
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
  INVALID_ENVELOPE: "notStep",
  INCOMPLETE_FILE: "incomplete",
  MISSING_SCHEMA: "type",
  NON_IFC_RECORD: "type",
  FILE_TOO_LARGE: "size",
  STANDARD_ACTIVITY_UNSUPPORTED: "activity",
  ACTIVITY_MISMATCH: "activity",
  ACTIVITY_CODE_MISSING: "activity",
};

/* Data the file does carry but cannot be checked against; their engine message is clearer. */
const OWN_MESSAGE_CODES = new Set([
  "NO_SPACES",
  "UNSUPPORTED_LENGTH_UNIT",
  "FACILITY_INCOMPLETE",
  "LEGACY_CONTRACT",
  // The engine names the exact IFC version and what to export instead.
  "UNSUPPORTED_SCHEMA",
]);

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

/** The error a file read fails with (readUpload), as the sentence to show under the picker. */
export function readFailureMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "EMPTY_FILE") return copy.check.errors.empty;
  if (code === "NOT_STEP") return copy.check.errors.notStep;
  return copy.check.errors.parse;
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

/** «بند» counted after a number: 10 من 14 بندًا، 10 بنود. */
export function clausesWord(total: number): string {
  const rest = total % 100;
  if (rest >= 3 && rest <= 10) return "بنود";
  if (rest >= 11) return "بندًا";
  return "بند";
}

/** How many of the run's stages have finished, for the determinate progress bar. */
export function stagesDone(stages: readonly { state: string }[]): number {
  return stages.filter((stage) => stage.state === "completed").length;
}

/** The trade name is required; anything but spaces will do. */
export function isProjectNameValid(name: string): boolean {
  return name.trim().length > 0;
}

/** The commercial registration number as stored: Western digits, spaces removed. */
export function normalizeRegistration(text: string): string {
  return normalizeDigits(text).replace(/\s+/g, "");
}

/** Optional: a blank field is valid; anything typed must be exactly 10 digits. */
export function isRegistrationValid(text: string): boolean {
  const value = normalizeRegistration(text);
  return value === "" || /^\d{10}$/.test(value);
}

/** The most floors the field accepts: the floors the activity occupies, not the whole tower. */
export const MAX_FLOORS = 20;

/** Number of floors typed in the field; anything that is not a whole number is 0. */
export function parseFloors(text: string): number {
  const value = normalizeDigits(text.trim());
  return /^\d{1,3}$/.test(value) ? Number(value) : 0;
}

export function isFloorsValid(floors: number): boolean {
  return Number.isInteger(floors) && floors >= 1 && floors <= MAX_FLOORS;
}

export function formatFloors(floors: number): string {
  return isFloorsValid(floors) ? String(floors) : "";
}

/** Date of a run as the report shows it, with Western digits. */
export function formatRunDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "long" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * The check is a seven-step wizard: activity, location and area, related bodies, files, facility
 * requirements, the digital copy (review and run) and the passport (after a finished run).
 */
export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const WIZARD_STEPS: readonly WizardStep[] = [1, 2, 3, 4, 5, 6, 7];

/**
 * The seven steps in three phases, named in copy.web.wizard.phases: the facility's data (1 to 3), the file and
 * the requirements (4 and 5), the check and the passport (6 and 7).
 */
export const PHASES: readonly { steps: readonly WizardStep[] }[] = [
  { steps: [1, 2, 3] },
  { steps: [4, 5] },
  { steps: [6, 7] },
];

/** Index in PHASES of the phase a step belongs to. */
export function phaseOf(step: WizardStep): number {
  return PHASES.findIndex((phase) => phase.steps.includes(step));
}

export type StepStatus = "done" | "current" | "upcoming";

/**
 * How the step indicator draws a step. Steps before the current one are done (and lead back); the current step
 * also shows as done once its work is finished (the run on step 6).
 */
export function stepStatus(step: WizardStep, current: WizardStep, finished = false): StepStatus {
  if (step < current) return "done";
  if (step === current) return finished ? "done" : "current";
  return "upcoming";
}

/** How many steps the progress bar shows as done (all seven once the passport is open). */
export function stepsDone(current: WizardStep, finished = false): number {
  return WIZARD_STEPS.filter((step) => stepStatus(step, current, finished) === "done").length;
}

/**
 * What a sample link (landing page, #/check?sample=id) fills in before the review: the samples are restaurant
 * plans, so another activity switches to the restaurant (whose defaults include an area), and a blank area takes
 * the restaurant default. Nothing when the project data already fits.
 */
export function sampleSetup(
  activityId: ActivityId,
  area: number,
): { activityId: ActivityId } | { area: number } | undefined {
  if (activityId !== "restaurant") return { activityId: "restaurant" };
  if (!isAreaValid(area)) return { area: getDefaultFacility("restaurant").area };
  return undefined;
}
