import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { getDefaultFacility } from "../data";
import {
  runIfcCompliance,
  type IfcUpload,
  type PipelineEvent,
} from ".";

const fixtureUrl = (relativePath: string) =>
  new URL(`../../test-fixtures/${relativePath}`, import.meta.url);

async function loadBytes(relativePath: string): Promise<Uint8Array> {
  return Uint8Array.from(await readFile(fixtureUrl(relativePath)));
}

function upload(name: string, bytes: Uint8Array): IfcUpload {
  return {
    name,
    size: bytes.byteLength,
    bytes,
  };
}

async function restaurantCorrectedMutation(
  transform: (source: string) => string,
): Promise<IfcUpload> {
  const sourceBytes = await loadBytes(
    "ifc/restaurant/submission-v2-corrected.ifc",
  );
  const source = new TextDecoder().decode(sourceBytes);
  const transformed = transform(source);
  expect(transformed).not.toBe(source);
  return upload("namespace-contract-test.ifc", new TextEncoder().encode(transformed));
}

describe("uploaded-byte processing proof", () => {
  it("keeps the hash and compliance result identical when only the filename changes", async () => {
    const bytes = await loadBytes("ifc/restaurant/submission-v1.ifc");
    const first = await runIfcCompliance({
      upload: upload("first-name.ifc", bytes),
      activityId: "restaurant",
      facility: getDefaultFacility("restaurant"),
    });
    const renamed = await runIfcCompliance({
      upload: upload("totally-different-name.ifc", bytes),
      activityId: "restaurant",
      facility: getDefaultFacility("restaurant"),
    });

    expect(renamed.file.sha256).toBe(first.file.sha256);
    expect(renamed.summary).toEqual(first.summary);
    expect(renamed.findings).toEqual(first.findings);
    expect(first.file.sha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
  });

  it("changes the hash and derived rule result when bytes change under the same filename", async () => {
    const readyBytes = await loadBytes(
      "ifc/restaurant/submission-v2-corrected.ifc",
    );
    const readyText = new TextDecoder().decode(readyBytes);
    const changedText = readyText.replace(
      ",'TAG-EXIT',2.10,1,.DOOR.",
      ",'TAG-EXIT',2.10,0.82,.DOOR.",
    );
    expect(changedText).not.toBe(readyText);
    const changedBytes = new TextEncoder().encode(changedText);
    const name = "same-submission.ifc";

    const ready = await runIfcCompliance({
      upload: upload(name, readyBytes),
      activityId: "restaurant",
      facility: getDefaultFacility("restaurant"),
    });
    const changed = await runIfcCompliance({
      upload: upload(name, changedBytes),
      activityId: "restaurant",
      facility: getDefaultFacility("restaurant"),
    });

    expect(changed.file.sha256).not.toBe(ready.file.sha256);
    expect(
      ready.findings.find((finding) => finding.ruleId === "DOOR-WIDTH-001")
        ?.status,
    ).toBe("pass");
    expect(
      changed.findings.find((finding) => finding.ruleId === "DOOR-WIDTH-001")
        ?.status,
    ).toBe("fail");
    expect(changed.summary).not.toEqual(ready.summary);
  });

  it("emits measured stage work, duration, and evidence without display-driven progress", async () => {
    const bytes = await loadBytes("ifc/cafe/submission-v1.ifc");
    const events: PipelineEvent[] = [];
    let eventLoopYielded = false;
    globalThis.setTimeout(() => {
      eventLoopYielded = true;
    }, 0);

    const run = await runIfcCompliance({
      upload: upload("submission.ifc", bytes),
      activityId: "cafe",
      facility: getDefaultFacility("cafe"),
      onEvent: (event) => events.push(event),
    });

    expect(eventLoopYielded).toBe(true);
    expect(run.stages).toHaveLength(6);
    expect(
      run.stages.every(
        (stage) =>
          stage.progress === 1 &&
          stage.durationMs >= 0 &&
          Object.keys(stage.evidence).length > 0,
      ),
    ).toBe(true);

    for (const stage of run.stages) {
      const stageEvents = events.filter((event) => event.id === stage.id);
      expect(stageEvents[0]).toMatchObject({
        state: "running",
        progress: 0,
      });
      expect(stageEvents.at(-1)).toMatchObject({
        state: "completed",
        progress: 1,
      });
      const progressValues = stageEvents
        .map((event) => event.progress)
        .filter((value): value is number => value !== undefined);
      expect(progressValues).toEqual(
        [...progressValues].sort((left, right) => left - right),
      );
    }

    expect(run.stages[0].evidence).toMatchObject({
      byteLength: bytes.byteLength,
      records: run.model.records,
      sha256: run.file.sha256,
    });
    expect(run.report.scoreMethod).toBe("passed_over_total");

    for (const stageId of ["validate", "extract", "rules", "link", "report"]) {
      const runningProgress = events
        .filter(
          (event) => event.id === stageId && event.state === "running",
        )
        .map((event) => event.progress);
      expect(runningProgress.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("preserves approved property-set namespaces instead of flattening their provenance", async () => {
    const bytes = await loadBytes(
      "ifc/restaurant/submission-v2-corrected.ifc",
    );
    const run = await runIfcCompliance({
      upload: upload("submission.ifc", bytes),
      activityId: "restaurant",
      facility: getDefaultFacility("restaurant"),
    });

    expect(
      run.model.project?.propertySets.Pset_MiyarProject.ActivityCode,
    ).toBe("restaurant");
    expect(
      run.model.spaces[0].propertySets.Pset_MiyarSpace.RoleCode,
    ).toBe(run.model.spaces[0].properties.RoleCode);
    expect(
      run.model.doors[0].propertySets.Pset_MiyarDoor.RoleCode,
    ).toBe(run.model.doors[0].properties.RoleCode);
  });

  it.each([
    {
      label: "a Miyar property set attached to the wrong IFC type",
      code: "INVALID_PROPERTY_NAMESPACE",
      transform: (source: string) =>
        source.replace("Pset_MiyarSpace", "Pset_MiyarDoor"),
    },
    {
      label: "contract keys placed under an unapproved property set",
      code: "MISPLACED_CONTRACT_PROPERTY",
      transform: (source: string) =>
        source.replace("Pset_MiyarProject", "Pset_CustomProject"),
    },
    {
      label: "conflicting duplicate contract property values",
      code: "CONFLICTING_PROPERTY_VALUE",
      transform: (source: string) =>
        source.replace(
          "IFCPROPERTYSINGLEVALUE('FixtureContractVersion',$,IFCLABEL('MIYAR-IFC-1.0'),$)",
          "IFCPROPERTYSINGLEVALUE('ActivityCode',$,IFCLABEL('clinic'),$)",
        ),
    },
  ])("rejects $label", async ({ code, transform }) => {
    const mutatedUpload = await restaurantCorrectedMutation(transform);
    await expect(
      runIfcCompliance({
        upload: mutatedUpload,
        activityId: "restaurant",
        facility: getDefaultFacility("restaurant"),
      }),
    ).rejects.toMatchObject({
      stageId: "extract",
      code,
    });
  });

  it("rejects an IFC root with a malformed 22-character GlobalId", async () => {
    const mutatedUpload = await restaurantCorrectedMutation((source) =>
      source.replace("R10000000000000000APSX", "NOT_A_VALID_GUID"),
    );
    await expect(
      runIfcCompliance({
        upload: mutatedUpload,
        activityId: "restaurant",
        facility: getDefaultFacility("restaurant"),
      }),
    ).rejects.toMatchObject({
      stageId: "extract",
      code: "INVALID_GLOBAL_ID",
    });
  });

  it("rejects a semantic contract version other than MIYAR-IFC-1.0", async () => {
    const mutatedUpload = await restaurantCorrectedMutation((source) =>
      source.replace("MIYAR-IFC-1.0", "MIYAR-IFC-9.9"),
    );
    await expect(
      runIfcCompliance({
        upload: mutatedUpload,
        activityId: "restaurant",
        facility: getDefaultFacility("restaurant"),
      }),
    ).rejects.toMatchObject({
      stageId: "completeness",
      code: "UNSUPPORTED_CONTRACT_VERSION",
      message:
        "إصدار عقد البيانات داخل الملف (MIYAR-IFC-9.9) غير مدعوم. الإصدار المتوقع هو MIYAR-IFC-1.0.",
    });
  });

  it("reports actionable and passing model links separately", async () => {
    const bytes = await loadBytes("ifc/restaurant/submission-v1.ifc");
    const run = await runIfcCompliance({
      upload: upload("submission.ifc", bytes),
      activityId: "restaurant",
      facility: getDefaultFacility("restaurant"),
    });
    const linkStage = run.stages.find((stage) => stage.id === "link");
    const actionable = run.summary.failed + run.summary.unknown;

    expect(linkStage?.detail.startsWith(`${actionable} نتائج تتطلب إجراء`)).toBe(
      true,
    );
    expect(linkStage?.evidence).toMatchObject({
      actionableResults: actionable,
      passingResults: run.summary.passed,
    });
  });
});
