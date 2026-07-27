import { calculateSummary, getFindings } from "./data";
import { describe, expect, it } from "vitest";

describe("deterministic compliance fixtures", () => {
  it("keeps the review fixture at 7 pass, 2 fail, and 1 unknown", () => {
    const findings = getFindings("review");
    expect(findings).toHaveLength(10);
    expect(calculateSummary(findings, "review")).toEqual({
      passed: 7,
      failed: 2,
      unknown: 1,
      score: 78,
    });
  });

  it("keeps the ready fixture at 10 pass and no unresolved findings", () => {
    const findings = getFindings("ready");
    expect(findings).toHaveLength(10);
    expect(calculateSummary(findings, "ready")).toEqual({
      passed: 10,
      failed: 0,
      unknown: 0,
      score: 100,
    });
  });

  it("links every unresolved review finding to a model element", () => {
    const unresolved = getFindings("review").filter(
      (finding) => finding.status !== "pass",
    );
    expect(unresolved.every((finding) => finding.elementId)).toBe(true);
  });
});
