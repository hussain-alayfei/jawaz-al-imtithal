import {
  activityExamples,
  activityIds,
  calculateSummary,
  getActivityIdFromLabel,
  getAnalysisStages,
  getDefaultFacility,
  getFindings,
  getModelMetadata,
} from "./data";
import { describe, expect, it } from "vitest";

describe("deterministic compliance fixtures", () => {
  it.each(activityIds)(
    "keeps the %s review fixture at 7 pass, 2 fail, and 1 unknown",
    (activityId) => {
      const findings = getFindings("review", activityId);
      expect(findings).toHaveLength(10);
      expect(calculateSummary(findings, "review")).toEqual({
        passed: 7,
        failed: 2,
        unknown: 1,
        score: 78,
      });
    },
  );

  it.each(activityIds)(
    "keeps the %s ready fixture at 10 pass and no unresolved findings",
    (activityId) => {
      const findings = getFindings("ready", activityId);
      expect(findings).toHaveLength(10);
      expect(calculateSummary(findings, "ready")).toEqual({
        passed: 10,
        failed: 0,
        unknown: 0,
        score: 100,
      });
    },
  );

  it.each(activityIds)(
    "links every unresolved %s review finding to a stable model element",
    (activityId) => {
      const unresolved = getFindings("review", activityId).filter(
        (finding) => finding.status !== "pass",
      );
      expect(unresolved).toHaveLength(3);
      expect(
        unresolved.every(
          (finding) =>
            Boolean(
              finding.elementId &&
                finding.elementGuid &&
                finding.elementName,
            ),
        ),
      ).toBe(true);
      expect(new Set(unresolved.map((finding) => finding.elementId)).size).toBe(
        3,
      );
    },
  );

  it.each(activityIds)(
    "resolves the same %s rule set in ready mode",
    (activityId) => {
      const reviewRules = getFindings("review", activityId)
        .map((finding) => finding.ruleId)
        .sort();
      const readyRules = getFindings("ready", activityId)
        .map((finding) => finding.ruleId)
        .sort();
      expect(readyRules).toEqual(reviewRules);
    },
  );

  it("exposes complete activity catalog metadata and sample URLs", () => {
    expect(activityExamples.map((example) => example.id)).toEqual(activityIds);
    for (const example of activityExamples) {
      expect(getActivityIdFromLabel(example.label)).toBe(example.id);
      expect(getActivityIdFromLabel(example.id)).toBe(example.id);
      expect(getDefaultFacility(example.id).activity).toBe(example.label);
      expect(getModelMetadata(example.id, "review")).toMatchObject({
        activityId: example.id,
        scenario: "review",
      });
      expect(getModelMetadata(example.id, "ready")).toMatchObject({
        activityId: example.id,
        scenario: "ready",
      });
      expect(example.sampleUrls.review).toBe(
        `/samples/${example.id === "restaurant" ? "restaurant" : example.id}-review.ifc`,
      );
      expect(example.sampleUrls.ready).toBe(
        `/samples/${example.id === "restaurant" ? "restaurant" : example.id}-ready.ifc`,
      );
      expect(getAnalysisStages(example.id)).toHaveLength(6);
    }
  });

  it("returns defensive copies of facility, metadata, and findings", () => {
    const facility = getDefaultFacility("cafe");
    facility.projectName = "changed";
    expect(getDefaultFacility("cafe").projectName).not.toBe("changed");

    const metadata = getModelMetadata("clinic", "review");
    metadata.elements = 0;
    expect(getModelMetadata("clinic", "review").elements).toBeGreaterThan(0);

    const findings = getFindings("review", "salon");
    findings[0].title = "changed";
    expect(getFindings("review", "salon")[0].title).not.toBe("changed");
  });

  it("keeps the restaurant default API backward compatible", () => {
    const findings = getFindings("review");
    expect(calculateSummary(findings, "review")).toEqual({
      passed: 7,
      failed: 2,
      unknown: 1,
      score: 78,
    });
  });
});
