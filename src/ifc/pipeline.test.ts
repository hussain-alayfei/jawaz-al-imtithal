import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  activityIds,
  getDefaultFacility,
  type ActivityId,
} from "../data";
import {
  IfcProcessingError,
  parseStepDocument,
  runIfcCompliance,
  type IfcUpload,
  type PipelineEvent,
} from ".";

const fixtureUrl = (relativePath: string) =>
  new URL(`../../test-fixtures/${relativePath}`, import.meta.url);

async function loadUpload(relativePath: string): Promise<IfcUpload> {
  const text = await readFile(fixtureUrl(relativePath), "utf8");
  return {
    name: relativePath.split("/").at(-1) ?? "fixture.ifc",
    size: Buffer.byteLength(text),
    text,
  };
}

async function loadExpected(activityId: ActivityId, caseName: string) {
  return JSON.parse(
    await readFile(
      fixtureUrl(`expected/${activityId}-${caseName}.json`),
      "utf8",
    ),
  );
}

describe("real IFC compliance pipeline", () => {
  it.each(activityIds)(
    "derives the %s needs-work result from IFC evidence",
    async (activityId) => {
      const upload = await loadUpload(
        `ifc/${activityId}/needs-work.ifc`,
      );
      const expected = await loadExpected(activityId, "needs-work");
      const events: PipelineEvent[] = [];
      const run = await runIfcCompliance({
        upload,
        activityId,
        facility: getDefaultFacility(activityId),
        onEvent: (event) => events.push(event),
      });

      expect(run.model.spaces).toHaveLength(expected.spaces);
      expect(run.model.doors).toHaveLength(expected.doors);
      expect(run.model.elements).toHaveLength(expected.elements);
      expect(run.summary).toEqual({
        passed: expected.passed,
        failed: expected.failed,
        unknown: expected.unknown,
        score: expected.score,
      });
      expect(
        run.findings
          .filter((finding) => finding.status !== "pass")
          .map((finding) => finding.ruleId),
      ).toEqual(expected.unresolvedRuleIds);
      expect(run.stages.map((stage) => stage.id)).toEqual([
        "validate",
        "extract",
        "completeness",
        "rules",
        "link",
        "report",
      ]);
      expect(
        events.filter((event) => event.state === "completed"),
      ).toHaveLength(6);
      expect(run.file.sha256).toMatch(/^[a-f0-9]{64}$/);

      const modelGuids = new Set(
        run.model.elements.map((element) => element.globalId),
      );
      for (const finding of run.findings.filter(
        (item) => item.elementStepId !== undefined,
      )) {
        expect(modelGuids.has(finding.elementGuid)).toBe(true);
      }
    },
  );

  it.each(activityIds)(
    "derives the %s ready result as ten passes",
    async (activityId) => {
      const upload = await loadUpload(`ifc/${activityId}/ready.ifc`);
      const expected = await loadExpected(activityId, "ready");
      const run = await runIfcCompliance({
        upload,
        activityId,
        facility: getDefaultFacility(activityId),
      });

      expect(run.model.elements).toHaveLength(expected.elements);
      expect(run.summary).toEqual({
        passed: 10,
        failed: 0,
        unknown: 0,
        score: 100,
      });
      expect(run.scenario).toBe("ready");
    },
  );

  it("uses the actual IfcDoor OverallWidth boundary", async () => {
    const original = await loadUpload("ifc/restaurant/ready.ifc");
    const makeWidth = (width: string): IfcUpload => {
      const text = original.text.replace(
        ",'TAG-EXIT',2.10,1,.DOOR.",
        `,'TAG-EXIT',2.10,${width},.DOOR.`,
      );
      return { ...original, text, size: Buffer.byteLength(text) };
    };

    const below = await runIfcCompliance({
      upload: makeWidth("0.899"),
      activityId: "restaurant",
      facility: getDefaultFacility("restaurant"),
    });
    const boundary = await runIfcCompliance({
      upload: makeWidth("0.900"),
      activityId: "restaurant",
      facility: getDefaultFacility("restaurant"),
    });

    expect(
      below.findings.find((item) => item.ruleId === "DOOR-WIDTH-001"),
    ).toMatchObject({ status: "fail", actual: "0.90 م من IfcDoor.OverallWidth" });
    expect(
      boundary.findings.find((item) => item.ruleId === "DOOR-WIDTH-001"),
    ).toMatchObject({ status: "pass", actual: "0.90 م من IfcDoor.OverallWidth" });
  });

  it("is deterministic for identical bytes apart from time and durations", async () => {
    const upload = await loadUpload("ifc/cafe/needs-work.ifc");
    const first = await runIfcCompliance({
      upload,
      activityId: "cafe",
      facility: getDefaultFacility("cafe"),
    });
    const second = await runIfcCompliance({
      upload,
      activityId: "cafe",
      facility: getDefaultFacility("cafe"),
    });
    const normalize = (run: typeof first) => ({
      hash: run.file.sha256,
      metadata: run.metadata,
      findings: run.findings,
      summary: run.summary,
      stageEvidence: run.stages.map((stage) => ({
        id: stage.id,
        detail: stage.detail,
        evidence: stage.evidence,
      })),
    });
    expect(normalize(second)).toEqual(normalize(first));
  });

  it.each([
    ["invalid-envelope.ifc", "INVALID_ENVELOPE", "validate"],
    ["unsupported-schema.ifc", "UNSUPPORTED_SCHEMA", "validate"],
    ["duplicate-express-id.ifc", "DUPLICATE_STEP_ID", "validate"],
    ["broken-reference.ifc", "BROKEN_REFERENCE", "validate"],
  ])("rejects %s with %s", async (fileName, code, stageId) => {
    const upload = await loadUpload(`ifc/invalid/${fileName}`);
    try {
      await parseStepDocument(upload);
      throw new Error("Expected parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(IfcProcessingError);
      expect(error).toMatchObject({ code, stageId });
    }
  });

  it.each([
    ["no-spaces.ifc", "restaurant", "NO_SPACES", "extract"],
    [
      "incomplete-properties.ifc",
      "restaurant",
      "SEMANTIC_CONTRACT_MISSING",
      "completeness",
    ],
    [
      "activity-mismatch.ifc",
      "clinic",
      "ACTIVITY_MISMATCH",
      "completeness",
    ],
  ] as const)(
    "stops %s at its real failing stage",
    async (fileName, activityId, code, stageId) => {
      const upload = await loadUpload(`ifc/invalid/${fileName}`);
      await expect(
        runIfcCompliance({
          upload,
          activityId,
          facility: getDefaultFacility(activityId),
        }),
      ).rejects.toMatchObject({ code, stageId });
    },
  );
});
