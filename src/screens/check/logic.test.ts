import { describe, expect, it } from "vitest";
import { copy } from "../../content/copy";
import { getDefaultFacility } from "../../data";
import { IfcProcessingError } from "../../ifc/types";
import {
  MAX_FILE_BYTES,
  checkFileMeta,
  clausesWord,
  describeFailure,
  formatDuration,
  formatBytes,
  parseArea,
  sampleSetup,
  stagesDone,
  stepStatus,
  withFacilityDefaults, readFailureMessage, isAreaValid } from "./logic";

describe("check screen helpers", () => {
  it("accepts only .ifc files up to 50 MB", () => {
    expect(checkFileMeta("plan.IFC", 1000)).toBeUndefined();
    expect(checkFileMeta("plan.ifc.txt", 1000)).toBe(copy.check.errors.type);
    expect(checkFileMeta("plan.ifc", MAX_FILE_BYTES + 1)).toBe(copy.check.errors.size);
  });

  it("reads the licence area, including Arabic-Indic digits", () => {
    expect(parseArea("284")).toBe(284);
    expect(parseArea("٢٨٤٫٥")).toBe(284.5);
    expect(parseArea("")).toBe(0);
    expect(parseArea("abc")).toBe(0);
    expect(parseArea("1e3")).toBe(0);
    expect(isAreaValid(99999999)).toBe(false);
  });

  it("maps engine errors to the short copy and keeps the engine message", () => {
    const type = describeFailure(new IfcProcessingError("validate", "INVALID_EXTENSION", "الملف ليس بامتداد .ifc."));
    expect(type.headline).toBe(copy.check.errors.type);
    expect(type.detail).toBe("الملف ليس بامتداد .ifc.");

    const notStep = describeFailure(new IfcProcessingError("validate", "INVALID_ENVELOPE", "الملف لا يبدأ بغلاف STEP."));
    expect(notStep.headline).toBe(copy.check.errors.notStep);

    const cut = describeFailure(new IfcProcessingError("validate", "INCOMPLETE_FILE", "الملف غير مكتمل."));
    expect(cut.headline).toBe(copy.check.errors.incomplete);
    expect(readFailureMessage(new Error("EMPTY_FILE"))).toBe(copy.check.errors.empty);
    expect(readFailureMessage(new Error("NOT_STEP"))).toBe(copy.check.errors.notStep);
    expect(readFailureMessage(new Error("other"))).toBe(copy.check.errors.parse);

    const activity = describeFailure(
      new IfcProcessingError("completeness", "STANDARD_ACTIVITY_UNSUPPORTED", "متاح لنشاط المطعم فقط."),
    );
    expect(activity.headline).toBe(copy.check.errors.activity);

    const parse = describeFailure(new IfcProcessingError("extract", "OPEN_FAILED", "تعذر فتح الملف كنموذج IFC."));
    expect(parse.headline).toBe(copy.check.errors.parse);

    const own = describeFailure(new IfcProcessingError("extract", "NO_SPACES", "لا يحتوي الملف على مساحات."));
    expect(own.headline).toBe("لا يحتوي الملف على مساحات.");
    expect(own.detail).toBeUndefined();
  });

  it("fills facility fields the page does not ask for, and keeps the area", () => {
    const blank = { ...getDefaultFacility("restaurant"), projectName: " ", district: "", area: 120 };
    const filled = withFacilityDefaults(blank, "restaurant");
    expect(filled.projectName).toBe(getDefaultFacility("restaurant").projectName);
    expect(filled.district).toBe(getDefaultFacility("restaurant").district);
    expect(filled.area).toBe(120);
  });

  it("formats durations and counted clauses in Arabic", () => {
    expect(formatDuration(0.4)).toBe("أقل من 1 م.ث");
    expect(formatDuration(42.4)).toBe("42 م.ث");
    expect(formatDuration(1520)).toBe("1.52 ث");
    expect(clausesWord(17)).toBe("بندًا");
    expect(clausesWord(10)).toBe("بنود");
  });
});

describe("looksLikeStep", () => {
  it("accepts an IFC STEP header and rejects other bytes before the check starts", async () => {
    const { looksLikeStep } = await import("./logic");
    const enc = new TextEncoder();
    expect(looksLikeStep(enc.encode("ISO-10303-21;\nHEADER;"))).toBe(true);
    expect(looksLikeStep(enc.encode("﻿  ISO-10303-21;"))).toBe(true);
    expect(looksLikeStep(enc.encode("this is not an ifc file"))).toBe(false);
  });

  it("counts finished stages for the progress bar", () => {
    expect(stagesDone([])).toBe(0);
    expect(
      stagesDone([{ state: "completed" }, { state: "completed" }, { state: "running" }, { state: "pending" }]),
    ).toBe(2);
  });
});

describe("wizard steps", () => {
  it("marks earlier steps done, the current step current and later steps upcoming", () => {
    expect([1, 2, 3].map((step) => stepStatus(step as 1 | 2 | 3, 2))).toEqual(["done", "current", "upcoming"]);
    expect([1, 2, 3].map((step) => stepStatus(step as 1 | 2 | 3, 1))).toEqual(["current", "upcoming", "upcoming"]);
  });

  it("shows the last step as done once the check has finished", () => {
    expect([1, 2, 3].map((step) => stepStatus(step as 1 | 2 | 3, 3, true))).toEqual(["done", "done", "done"]);
    expect(stepStatus(3, 3, false)).toBe("current");
  });

  it("fills only what a sample link needs before the review", () => {
    expect(sampleSetup("cafe", 168)).toEqual({ activityId: "restaurant" });
    expect(sampleSetup("restaurant", 0)).toEqual({ area: getDefaultFacility("restaurant").area });
    expect(sampleSetup("restaurant", 120)).toBeUndefined();
  });

  it("formats the chosen file's size", () => {
    expect(formatBytes(882_390)).toBe("861.7 KB");
    expect(formatBytes(2_380_763)).toBe("2.3 MB");
  });
});
