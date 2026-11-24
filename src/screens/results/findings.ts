import { activityExamples, type Finding, type ResultStatus } from "../../data";
import { copy } from "../../content/copy";
import type { ComplianceRun } from "../../ifc/types";
import { RESTAURANT_REQUIREMENTS } from "../../ifc/standard/requirements";

/* Read-only views over a finished run, shared by the results and report screens.
   Nothing here invents a result: every value is taken from the run or the requirement it cites. */

const requirementById = new Map(RESTAURANT_REQUIREMENTS.map((requirement) => [requirement.id, requirement]));

/** Register order: proven failures first, then what the file cannot prove, then passes. */
export const STATUS_ORDER: readonly ResultStatus[] = ["fail", "unknown", "pass"];

/** Standard-IFC findings link elements as "STEP-<expressId>". */
export function stepIdOf(elementId?: string): number | undefined {
  const match = /^STEP-(\d+)$/.exec(elementId ?? "");
  return match ? Number(match[1]) : undefined;
}

/** Mowaem's own file and data checks: not clauses of the requirements, never counted in the clause scope. */
export function isDataCheck(finding: Finding): boolean {
  return requirementById.get(finding.ruleId)?.kind === "platform" || finding.ruleId.startsWith("MOWAEM-DATA");
}

export interface FindingGroup {
  key: ResultStatus | "data";
  /** Absent for the data-check group. */
  status?: ResultStatus;
  items: Finding[];
}

/** Numeric clause order (3.1 < 4.1.3 < 4.9.1 < 4.10.1), stable for equal numbers. */
function byClauseNumber(a: Finding, b: Finding): number {
  const left = (clauseOf(a).number?.match(/\d+/g) ?? []).map(Number);
  const right = (clauseOf(b).number?.match(/\d+/g) ?? []).map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/** Clause groups by status, then Mowaem's data checks as their own group. */
export function groupFindings(findings: Finding[]): FindingGroup[] {
  const clauses = findings.filter((finding) => !isDataCheck(finding));
  const groups: FindingGroup[] = STATUS_ORDER.map((status) => ({
    key: status,
    status,
    items: clauses.filter((finding) => finding.status === status).sort(byClauseNumber),
  })).filter((group) => group.items.length > 0);
  const data = findings.filter(isDataCheck);
  if (data.length > 0) groups.push({ key: "data", items: data });
  return groups;
}

/** The «المخالفات» view of the groups: failures only, the failing clauses and then any failing data check.
 *  What the file cannot prove is not a violation, so it stays in «كل البنود» with every pass. */
export function issueGroupsOf(groups: FindingGroup[]): FindingGroup[] {
  return groups.flatMap((group) => {
    if (group.key === "fail") return [group];
    if (group.key !== "data") return [];
    const items = group.items.filter((finding) => finding.status === "fail");
    return items.length > 0 ? [{ ...group, items }] : [];
  });
}

export interface ClauseTally {
  verified: number;
  total: number;
  passed: number;
  failed: number;
  unknown: number;
}

/** Counts over the requirement clauses only (data checks excluded). */
export function tallyOf(run: ComplianceRun): ClauseTally {
  const clauses = run.findings.filter((finding) => !isDataCheck(finding));
  const passed = clauses.filter((finding) => finding.status === "pass").length;
  const failed = clauses.filter((finding) => finding.status === "fail").length;
  const unknown = clauses.filter((finding) => finding.status === "unknown").length;
  return { verified: passed + failed, total: clauses.length, passed, failed, unknown };
}

/** Proven failure first, then the first rule the file cannot prove. */
export function defaultFinding(findings: Finding[]): Finding | undefined {
  return findings.find((finding) => finding.status === "fail") ?? findings.find((finding) => finding.status !== "pass");
}

export interface ClauseInfo {
  /** Clause number in the requirements document, e.g. "4.5.2" or "4.10.1 (2)". Absent for data checks. */
  number?: string;
  subject: string;
}

export function clauseOf(finding: Finding): ClauseInfo {
  const requirement = requirementById.get(finding.ruleId);
  if (requirement) {
    const number = /^\d+(?:\.\d+)*(?:\s*\(\d+\))?/.exec(requirement.clause)?.[0];
    return { number, subject: requirement.subject };
  }
  return { number: /\d+(?:\.\d+)+/.exec(finding.clause)?.[0], subject: finding.shortTitle };
}

/** "البند 4.9.1 → SBC-801 • صفحة 27 • إحالة" becomes "البند 4.9.1 (SBC-801)، صفحة 27، إحالة". */
export function citationOf(finding: Finding): string {
  return finding.clause
    .split(/\s*•\s*/)
    .map((part, index) => (index === 0 ? part.replace(/\s*→\s*(.+)$/, " ($1)") : part))
    .join("، ");
}

const UNKNOWN_PREFIX = /^غير قابل للتحقق من الملف:\s*/;
const LEADING_VALUE = /^(≥|≤)?\s*(\d+(?:\.\d+)?)\s*(م²|م|%)(?=$|[\s:،)])/;

export interface SplitValue {
  /** Leading measured or required quantity with its unit, e.g. "1.50 م". */
  value?: string;
  bound?: "min" | "max";
  /** The rest of the engine's sentence: what was measured, where, and from which data. */
  rest: string;
}

/** Splits an engine sentence such as "1.50 م: أدنى ارتفاع ..." into the number and its explanation. */
export function splitValue(text: string): SplitValue {
  const clean = text.replace(UNKNOWN_PREFIX, "").trim();
  const match = LEADING_VALUE.exec(clean);
  if (!match) return { rest: clean };
  const value = match[3] === "%" ? `${match[2]}%` : `${match[2]} ${match[3]}`;
  const rest = clean
    .slice(match[0].length)
    .replace(/^[\s:،]+/, "")
    .trim();
  return { value, bound: match[1] === "≥" ? "min" : match[1] === "≤" ? "max" : undefined, rest };
}

export interface ElementInfo {
  stepId?: number;
  name?: string;
  ifcClass?: string;
  guid?: string;
}

const ARABIC = /[؀-ۿ]/;

/** The element a finding is linked to, as the file names it. */
export function elementOf(run: ComplianceRun, finding: Finding): ElementInfo | undefined {
  if (!finding.elementId && !finding.elementGuid && finding.elementStepId === undefined) return undefined;
  const stepId = finding.elementStepId ?? stepIdOf(finding.elementId);
  const facts = run.standard?.facts;
  const product = facts?.products.find((item) => item.expressId === stepId);
  const space = facts?.spaces.find((item) => item.expressId === stepId);
  const entity = [...run.model.elements, ...run.model.spaces, ...run.model.doors].find(
    (item) => item.stepId === stepId,
  );
  // Spaces are often numbered ("102"); their long name says what the room is.
  const longName = space?.longName
    ? (space.longName.split("/").map((part) => part.trim()).find((part) => ARABIC.test(part)) ?? space.longName)
    : undefined;
  return {
    stepId,
    name: longName ?? finding.elementName ?? product?.name ?? entity?.name,
    ifcClass: product?.ifcType ?? entity?.type,
    guid: finding.elementGuid ?? product?.globalId ?? entity?.globalId,
  };
}

/** Clauses proven from the file (pass or fail) out of all requirement clauses. */
export function coverageOf(run: ComplianceRun): { verified: number; total: number } {
  const { verified, total } = tallyOf(run);
  return { verified, total };
}

/** The scope as words, e.g. "13 من 17 بندًا" (clauses only, data checks excluded). */
export function scopeOf(run: ComplianceRun): string {
  const { verified, total } = tallyOf(run);
  return `${verified} من ${counted(total, CLAUSE_FORMS)}`;
}

/** The requirements a run was checked against: the ministry's document, or the contract file's rule pack. */
export function referenceOf(run: ComplianceRun): string {
  if (run.source === "standard-ifc") return copy.footer.basis;
  return activityExamples.find((item) => item.id === run.activityId)?.rulePack ?? copy.footer.basis;
}

/** The suggested action for a finding that is not a pass, as the engine wrote it. */
export function actionOf(finding: Finding): string | undefined {
  if (finding.status === "pass") return undefined;
  const text = finding.recommendation?.trim();
  if (text) return text;
  return finding.ruleId === "MOMAH-REST-4.5.2-CLADDING" ? copy.results.detail.action452 : undefined;
}

/** Arabic counted noun: 1 عنصر، 2 عنصران، 3 عناصر، 11 عنصرًا، 100 عنصر. */
export function counted(
  n: number,
  forms: { one: string; two: string; few: string; many: string; hundred: string },
): string {
  const formatted = n.toLocaleString("en-US");
  if (n === 1) return `${forms.one} واحد`;
  if (n === 2) return forms.two;
  const tail = n % 100;
  if (tail >= 3 && tail <= 10) return `${formatted} ${forms.few}`;
  if (tail >= 11) return `${formatted} ${forms.many}`;
  return `${formatted} ${forms.hundred}`;
}

export const ELEMENT_FORMS = { one: "عنصر", two: "عنصران", few: "عناصر", many: "عنصرًا", hundred: "عنصر" };
export const TRIANGLE_FORMS = { one: "مثلث", two: "مثلثان", few: "مثلثات", many: "مثلثًا", hundred: "مثلث" };
export const CLAUSE_FORMS = { one: "بند", two: "بندان", few: "بنود", many: "بندًا", hundred: "بند" };
