import type { Finding, ResultStatus } from "../../data";
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

export function groupFindings(findings: Finding[]) {
  return STATUS_ORDER.map((status) => ({
    status,
    items: findings.filter((finding) => finding.status === status),
  })).filter((group) => group.items.length > 0);
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

/** Rules proven from the file (pass or fail) out of all rules. */
export function coverageOf(run: ComplianceRun): { verified: number; total: number } {
  return run.coverage ?? { verified: run.summary.passed + run.summary.failed, total: run.findings.length };
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
