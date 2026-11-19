import { describe, expect, it } from "vitest";
import type { Finding, ResultStatus } from "../../data";
import type { ComplianceRun } from "../../ifc/types";
import {
  citationOf,
  clauseOf,
  defaultFinding,
  groupFindings,
  isDataCheck,
  issueGroupsOf,
  scopeOf,
  splitValue,
  tallyOf,
} from "./findings";

/* Synthetic findings: only the fields the views read. */
function finding(ruleId: string, status: ResultStatus, extra: Partial<Finding> = {}): Finding {
  return {
    ruleId,
    status,
    severity: "info",
    title: ruleId,
    shortTitle: ruleId,
    category: "",
    actual: "",
    expected: "",
    explanation: "",
    recommendation: "",
    source: "",
    clause: "",
    version: "",
    effort: "",
    ...extra,
  };
}

const runOf = (findings: Finding[]) => ({ findings }) as unknown as ComplianceRun;

const FINDINGS = [
  finding("MOMAH-REST-3.1-AREA", "pass"),
  finding("MOMAH-REST-4.5.2-CLADDING", "fail"),
  finding("MOMAH-REST-4.1.3-DRAIN", "unknown"),
  finding("MOMAH-REST-4.9.1-WIDTH", "pass"),
  finding("MOWAEM-DATA-IFC", "pass"),
  finding("MOWAEM-DATA-SPACES", "fail"),
];

describe("results views over a run", () => {
  it("treats Mowaem's own data checks apart from the requirement clauses", () => {
    expect(isDataCheck(FINDINGS[4])).toBe(true);
    expect(isDataCheck(FINDINGS[1])).toBe(false);
  });

  it("groups clauses by status (fail, unknown, pass) and puts the data checks last, without a status", () => {
    const groups = groupFindings(FINDINGS);
    expect(groups.map((group) => group.key)).toEqual(["fail", "unknown", "pass", "data"]);
    expect(groups.at(-1)?.status).toBeUndefined();
    expect(groups.at(-1)?.items.map((item) => item.ruleId)).toEqual(["MOWAEM-DATA-IFC", "MOWAEM-DATA-SPACES"]);
    expect(groups[0].items.map((item) => item.ruleId)).toEqual(["MOMAH-REST-4.5.2-CLADDING"]);
  });

  it("keeps failures, unknowns and failing data checks for the violations tab, and drops every pass", () => {
    const issues = issueGroupsOf(groupFindings(FINDINGS));
    expect(issues.map((group) => group.key)).toEqual(["fail", "unknown", "data"]);
    expect(issues.at(-1)?.items.map((item) => item.ruleId)).toEqual(["MOWAEM-DATA-SPACES"]);
    expect(issueGroupsOf(groupFindings([FINDINGS[0], FINDINGS[3], FINDINGS[4]]))).toEqual([]);
  });

  it("counts requirement clauses only, so a failing data check never changes the scope", () => {
    expect(tallyOf(runOf(FINDINGS))).toEqual({ verified: 3, total: 4, passed: 2, failed: 1, unknown: 1 });
    expect(scopeOf(runOf(FINDINGS))).toBe("3 من 4 بنود");
  });

  it("selects the first proven failure, then the first finding the file cannot prove", () => {
    expect(defaultFinding(FINDINGS)?.ruleId).toBe("MOMAH-REST-4.5.2-CLADDING");
    expect(defaultFinding([FINDINGS[0], FINDINGS[2]])?.ruleId).toBe("MOMAH-REST-4.1.3-DRAIN");
    expect(defaultFinding([FINDINGS[0]])).toBeUndefined();
  });

  it("reads clause numbers from the registry, and falls back to the finding for contract rules", () => {
    expect(clauseOf(FINDINGS[1]).number).toBe("4.5.2");
    const contract = finding("DOOR-WIDTH-001", "fail", { shortTitle: "عرض مخرج الطوارئ", clause: "حد تجريبي" });
    expect(clauseOf(contract)).toEqual({ number: undefined, subject: "عرض مخرج الطوارئ" });
  });

  it("splits a measured value from the engine's sentence and keeps the bound of a requirement", () => {
    expect(splitValue("1.50 م: أدنى ارتفاع تكسية في المطبخ")).toEqual({
      value: "1.50 م",
      bound: undefined,
      rest: "أدنى ارتفاع تكسية في المطبخ",
    });
    expect(splitValue("≥ 1.80 م من منسوب الأرضية")).toMatchObject({ value: "1.80 م", bound: "min" });
    expect(splitValue("غير قابل للتحقق من الملف: لا توجد شبكة صرف").value).toBeUndefined();
  });

  it("formats a citation with the referred code in brackets", () => {
    const cited = finding("MOMAH-REST-4.9.1-WIDTH", "pass", { clause: "البند 4.9.1 → SBC-801 • صفحة 27 • إحالة" });
    expect(citationOf(cited)).toBe("البند 4.9.1 (SBC-801)، صفحة 27، إحالة");
  });
});
