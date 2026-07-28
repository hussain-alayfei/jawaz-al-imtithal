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
  const fileBytes = await readFile(fixtureUrl(relativePath));
  const bytes = Uint8Array.from(fileBytes);
  return {
    name: relativePath.split("/").at(-1) ?? "fixture.ifc",
    size: bytes.byteLength,
    bytes,
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

function mutateUpload(
  upload: IfcUpload,
  pattern: string | RegExp,
  replacement: string,
  name: string,
): IfcUpload {
  const source = new TextDecoder().decode(upload.bytes);
  const modified = source.replace(pattern, replacement);
  expect(modified).not.toBe(source);
  const bytes = new TextEncoder().encode(modified);
  return { ...upload, name, bytes, size: bytes.byteLength };
}

describe("real IFC compliance pipeline", () => {
  it.each(activityIds)(
    "derives the %s needs-work result from IFC evidence",
    async (activityId) => {
      const upload = await loadUpload(
        `ifc/${activityId}/submission-v1.ifc`,
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
      expect(
        run.findings
          .filter((finding) => finding.status === "fail")
          .map((finding) => finding.ruleId),
      ).toEqual(expected.failedRuleIds);
      expect(
        run.findings
          .filter((finding) => finding.status === "unknown")
          .map((finding) => finding.ruleId),
      ).toEqual(expected.unknownRuleIds);
      expect(expected.unresolvedRuleIds.length).toBeGreaterThan(4);
      expect(run.report.scoreMethod).toBe(expected.scoreMethod);
      expect(run.report.rulePackVersion).toBe(expected.rulePackVersion);
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
      const upload = await loadUpload(
        `ifc/${activityId}/submission-v2-corrected.ifc`,
      );
      const expected = await loadExpected(activityId, "ready");
      const run = await runIfcCompliance({
        upload,
        activityId,
        facility: getDefaultFacility(activityId),
      });

      expect(run.model.elements).toHaveLength(expected.elements);
      expect(run.summary).toEqual({
        passed: expected.passed,
        failed: expected.failed,
        unknown: expected.unknown,
        score: expected.score,
      });
      expect(run.report.scoreMethod).toBe("passed_over_total");
      expect(run.report.rulePackVersion).toBe(expected.rulePackVersion);
      expect(run.findings.every((finding) => finding.status === "pass")).toBe(
        true,
      );
      expect(run.scenario).toBe("ready");
    },
  );

  it.each(activityIds)(
    "uses a varied, named semantic QA catalog for %s instead of anonymous fillers",
    async (activityId) => {
      const upload = await loadUpload(
        `ifc/${activityId}/submission-v2-corrected.ifc`,
      );
      const expected = await loadExpected(activityId, "ready");
      const run = await runIfcCompliance({
        upload,
        activityId,
        facility: getDefaultFacility(activityId),
      });
      const syntheticElements = run.model.elements.filter(
        (element) =>
          element.propertySets.Pset_MiyarSyntheticQA?.SyntheticQA === true,
      );
      const types = new Set(syntheticElements.map((element) => element.type));

      expect(expected).toMatchObject({
        fixtureKind: "synthetic_semantic_qa",
        productionGeometry: false,
      });
      expect(expected.syntheticCatalogCategories).toEqual([
        "ARCHITECTURAL_WALL",
        "FLOOR_SLAB",
        "EXTERIOR_WINDOW",
        "STRUCTURAL_COLUMN",
        "STRUCTURAL_BEAM",
        "FIXED_FURNITURE",
        "SAFETY_RAILING",
        "VERTICAL_CIRCULATION",
      ]);
      expect(syntheticElements.length).toBeGreaterThan(0);
      expect([...types]).toEqual(
        expect.arrayContaining([
          "IFCWALL",
          "IFCSLAB",
          "IFCWINDOW",
          "IFCCOLUMN",
          "IFCBEAM",
          "IFCFURNISHINGELEMENT",
          "IFCRAILING",
          "IFCSTAIR",
        ]),
      );
      for (const element of syntheticElements) {
        const properties = element.propertySets.Pset_MiyarSyntheticQA;
        expect(element.name).toMatch(/اصطناعي QA \d{3}$/);
        expect(properties.SemanticCategory).toEqual(expect.any(String));
        expect(properties.ZoneCode).toEqual(expect.any(String));
        expect(properties.CatalogIndex).toEqual(expect.any(Number));
        expect(properties.ProductionGeometry).toBe(false);
        expect(properties.GeometryStatus).toBe(
          "SEMANTIC_ONLY_NO_PRODUCTION_GEOMETRY",
        );
      }
      expect(
        run.model.elements.some(
          (element) =>
            element.properties.RoleCode === "MODEL_ELEMENT" ||
            element.name === "عنصر نموذجي",
        ),
      ).toBe(false);
      expect(run.model.project?.properties).toMatchObject({
        FixturePurpose: "SYNTHETIC_QA_ONLY",
        ProductionGeometry: false,
        GeometryStatus: "SEMANTIC_ONLY_NO_PRODUCTION_GEOMETRY",
      });
    },
  );

  it("uses the actual IfcDoor OverallWidth boundary", async () => {
    const original = await loadUpload(
      "ifc/restaurant/submission-v2-corrected.ifc",
    );
    const makeWidth = (width: string): IfcUpload => {
      const text = new TextDecoder().decode(original.bytes).replace(
        ",'TAG-EXIT',2.10,1,.DOOR.",
        `,'TAG-EXIT',2.10,${width},.DOOR.`,
      );
      const bytes = new TextEncoder().encode(text);
      return { ...original, bytes, size: bytes.byteLength };
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
    ).toMatchObject({
      status: "fail",
      actual: "0.90 م (عرض الباب المقاس من النموذج)",
    });
    expect(
      boundary.findings.find((item) => item.ruleId === "DOOR-WIDTH-001"),
    ).toMatchObject({
      status: "pass",
      actual: "0.90 م (عرض الباب المقاس من النموذج)",
    });
  });

  it("reports a missing exit width as unknown without claiming a measured failure", async () => {
    const original = await loadUpload(
      "ifc/restaurant/submission-v2-corrected.ifc",
    );
    const run = await runIfcCompliance({
      upload: mutateUpload(
        original,
        ",'TAG-EXIT',2.10,1,.DOOR.",
        ",'TAG-EXIT',2.10,$,.DOOR.",
        "missing-exit-width.ifc",
      ),
      activityId: "restaurant",
      facility: getDefaultFacility("restaurant"),
    });
    const finding = run.findings.find(
      (item) => item.ruleId === "DOOR-WIDTH-001",
    );

    expect(finding).toMatchObject({
      status: "unknown",
      actual: "عرض باب الطوارئ غير مسجل في النموذج",
    });
    expect(finding?.title).toContain("تعذر التحقق");
    expect(finding?.title).not.toContain("أقل");
    expect(finding?.explanation).toContain("عرض باب الطوارئ غير مسجل");
  });

  it("reports a missing route width as unknown without claiming a narrow route", async () => {
    const original = await loadUpload(
      "ifc/restaurant/submission-v2-corrected.ifc",
    );
    const run = await runIfcCompliance({
      upload: mutateUpload(
        original,
        "IFCPROPERTYSINGLEVALUE('MinimumClearWidth',$,IFCREAL(1.1),$)",
        "IFCPROPERTYSINGLEVALUE('MinimumClearWidth',$,$,$)",
        "missing-route-width.ifc",
      ),
      activityId: "restaurant",
      facility: getDefaultFacility("restaurant"),
    });
    const finding = run.findings.find(
      (item) => item.ruleId === "ACCESS-ROUTE-001",
    );

    expect(finding).toMatchObject({
      status: "unknown",
      actual: "عرض مسار الوصول غير مسجل في النموذج",
    });
    expect(finding?.title).toContain("تعذر التحقق");
    expect(finding?.title).not.toContain("تضيق");
    expect(finding?.explanation).toContain("عرض مسار الوصول غير مسجل");
  });

  it("does not retain pass prose when a required space role is missing", async () => {
    const original = await loadUpload(
      "ifc/restaurant/submission-v2-corrected.ifc",
    );
    const run = await runIfcCompliance({
      upload: mutateUpload(
        original,
        "IFCPROPERTYSINGLEVALUE('RoleCode',$,IFCLABEL('KITCHEN'),$)",
        "IFCPROPERTYSINGLEVALUE('RoleCode',$,IFCLABEL('KITCHEN_UNCLASSIFIED'),$)",
        "missing-kitchen-role.ifc",
      ),
      activityId: "restaurant",
      facility: getDefaultFacility("restaurant"),
    });
    const finding = run.findings.find(
      (item) => item.ruleId === "REST-SPACE-001",
    );

    expect(finding).toMatchObject({
      status: "fail",
      actual: "مساحات مطلوبة غير موجودة في النموذج: المطبخ",
    });
    expect(finding?.title).toContain("لم يتحقق");
    expect(finding?.title).not.toContain("موجودة");
    expect(finding?.explanation).toContain(
      "مساحات مطلوبة غير موجودة في النموذج: المطبخ",
    );
  });

  it("rejects restaurant equipment linked to the wrong room", async () => {
    const original = await loadUpload(
      "ifc/restaurant/submission-v2-corrected.ifc",
    );
    const source = new TextDecoder().decode(original.bytes);
    const kitchenGuid = source.match(
      /IFCSPACE\('([^']+)',\$,'المطبخ'/,
    )?.[1];
    const diningGuid = source.match(
      /IFCSPACE\('([^']+)',\$,'منطقة الطعام'/,
    )?.[1];
    expect(kitchenGuid).toEqual(expect.any(String));
    expect(diningGuid).toEqual(expect.any(String));
    const run = await runIfcCompliance({
      upload: mutateUpload(
        original,
        `IFCPROPERTYSINGLEVALUE('ServedSpaceGuid',$,IFCLABEL('${kitchenGuid}'),$)`,
        `IFCPROPERTYSINGLEVALUE('ServedSpaceGuid',$,IFCLABEL('${diningGuid}'),$)`,
        "ventilation-linked-to-dining.ifc",
      ),
      activityId: "restaurant",
      facility: getDefaultFacility("restaurant"),
    });
    const finding = run.findings.find(
      (item) => item.ruleId === "KITCHEN-VENT-001",
    );

    expect(finding?.status).toBe("fail");
    expect(finding?.actual).toContain("لا يطابق");
    expect(finding?.explanation).toContain("لا يطابق");
  });

  it("rejects clinic doors linked to the wrong room", async () => {
    const original = await loadUpload(
      "ifc/clinic/submission-v2-corrected.ifc",
    );
    const source = new TextDecoder().decode(original.bytes);
    const examGuid = source.match(
      /IFCSPACE\('([^']+)',\$,'غرفة الفحص 2'/,
    )?.[1];
    const receptionGuid = source.match(
      /IFCSPACE\('([^']+)',\$,'الاستقبال'/,
    )?.[1];
    expect(examGuid).toEqual(expect.any(String));
    expect(receptionGuid).toEqual(expect.any(String));
    const run = await runIfcCompliance({
      upload: mutateUpload(
        original,
        `IFCPROPERTYSINGLEVALUE('ServesSpaceGuid',$,IFCLABEL('${examGuid}'),$)`,
        `IFCPROPERTYSINGLEVALUE('ServesSpaceGuid',$,IFCLABEL('${receptionGuid}'),$)`,
        "exam-door-linked-to-reception.ifc",
      ),
      activityId: "clinic",
      facility: getDefaultFacility("clinic"),
    });
    const privacy = run.findings.find(
      (item) => item.ruleId === "CLINIC-PRIVACY-001",
    );
    const width = run.findings.find(
      (item) => item.ruleId === "CLINIC-DOOR-001",
    );

    expect(privacy?.status).toBe("fail");
    expect(privacy?.actual).toContain("لا يطابق");
    expect(width?.status).toBe("unknown");
    expect(width?.actual).toContain("لا يطابق");
    expect(width?.title).toContain("تعذر التحقق");
  });

  it("is deterministic for identical bytes apart from time and durations", async () => {
    const upload = await loadUpload("ifc/cafe/submission-v1.ifc");
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

  it("derives outcomes from IFC bytes rather than the upload filename", async () => {
    const needsWork = await loadUpload(
      "ifc/restaurant/submission-v1.ifc",
    );
    const corrected = await loadUpload(
      "ifc/restaurant/submission-v2-corrected.ifc",
    );

    const renamedNeedsWork = await runIfcCompliance({
      upload: { ...needsWork, name: "looks-ready.ifc" },
      activityId: "restaurant",
      facility: getDefaultFacility("restaurant"),
    });
    const renamedCorrected = await runIfcCompliance({
      upload: { ...corrected, name: "looks-needs-work.ifc" },
      activityId: "restaurant",
      facility: getDefaultFacility("restaurant"),
    });

    expect(renamedNeedsWork.summary).toEqual({
      passed: 4,
      failed: 5,
      unknown: 1,
      score: 40,
    });
    expect(renamedCorrected.summary).toEqual({
      passed: 10,
      failed: 0,
      unknown: 0,
      score: 100,
    });
  });

  it("changes a verdict when parsed IFC evidence changes", async () => {
    const original = await loadUpload(
      "ifc/restaurant/submission-v2-corrected.ifc",
    );
    const source = new TextDecoder().decode(original.bytes);
    const modified = source.replace(
      "IFCPROPERTYSINGLEVALUE('ServicesConcealed',$,IFCBOOLEAN(.T.),$)",
      "IFCPROPERTYSINGLEVALUE('ServicesConcealed',$,IFCBOOLEAN(.F.),$)",
    );
    expect(modified).not.toBe(source);
    const bytes = new TextEncoder().encode(modified);
    const run = await runIfcCompliance({
      upload: {
        ...original,
        name: "facade-evidence-change.ifc",
        bytes,
        size: bytes.byteLength,
      },
      activityId: "restaurant",
      facility: getDefaultFacility("restaurant"),
    });

    expect(
      run.findings.find((finding) => finding.ruleId === "FACADE-MEP-001"),
    ).toMatchObject({
      status: "fail",
      actual: "بيانات إخفاء خدمات الواجهة الرئيسية غير مكتملة",
    });
    expect(run.summary).toEqual({
      passed: 9,
      failed: 1,
      unknown: 0,
      score: 90,
    });
  });

  it.each(activityIds)(
    "keeps %s fixture bytes free of result-selection hints",
    async (activityId) => {
      for (const fileName of [
        "submission-v1.ifc",
        "submission-v2-corrected.ifc",
      ]) {
        const upload = await loadUpload(`ifc/${activityId}/${fileName}`);
        const text = new TextDecoder().decode(upload.bytes);
        expect(text).not.toMatch(
          /(?:JAWAZ|MIYAR)_(?:SCENARIO|RESULT)|needs-work|ready|review/i,
        );
      }
    },
  );

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
    [
      "unsupported-contract-version.ifc",
      "restaurant",
      "UNSUPPORTED_CONTRACT_VERSION",
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
