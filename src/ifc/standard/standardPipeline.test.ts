import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { getDefaultFacility } from "../../data";
import { runIfcCompliance } from "../pipeline";
import type { ComplianceRun, IfcUpload } from "../types";
import { classifySpace } from "./classify";
import { hasMowaemContract } from "./pipeline";

async function upload(relative: string): Promise<IfcUpload> {
  const bytes = new Uint8Array(await readFile(new URL(`../../../${relative}`, import.meta.url)));
  return { name: relative.split("/").pop()!, size: bytes.byteLength, bytes };
}

async function check(relative: string): Promise<ComplianceRun> {
  return runIfcCompliance({
    upload: await upload(relative),
    activityId: "restaurant",
    facility: getDefaultFacility("restaurant"),
  });
}

const finding = (run: ComplianceRun, ruleId: string) => {
  const found = run.findings.find((item) => item.ruleId === ruleId);
  if (!found) throw new Error(`missing ${ruleId}`);
  return found;
};

const PASS = "public/samples/restaurant/restaurant-exit-0.95m.ifc";
const FAIL = "public/samples/restaurant/restaurant-exit-0.75m.ifc";
const TILES = "public/samples/restaurant/restaurant-kitchen-tiles-1.5m.ifc";
const FAIL_MM = "test-fixtures/ifc/standard/restaurant-exit-0.75m-mm.ifc";
const NO_FLAGS = "test-fixtures/ifc/standard/restaurant-no-fire-exit-flags.ifc";

describe("standard IFC restaurant plans against the ministry's restaurant requirements", () => {
  it("routes files without the Mowaem contract to the standard reader", async () => {
    expect(hasMowaemContract((await upload(PASS)).bytes)).toBe(false);
    expect(hasMowaemContract((await upload("test-fixtures/ifc/restaurant/submission-v1.ifc")).bytes)).toBe(true);
  });

  it("passes the exit width when the drawn door is 0.95 m", async () => {
    const run = await check(PASS);
    expect(run.source).toBe("standard-ifc");
    const width = finding(run, "MOMAH-REST-4.9.1-WIDTH");
    expect(width.status).toBe("pass");
    expect(width.actual).toContain("0.95 م");
    expect(width.actual).toContain("OverallWidth");
    expect(width.expected).toContain("حد تجريبي");
    expect(run.standard?.measurements["MOMAH-REST-4.9.1-WIDTH"]?.value).toBeCloseTo(0.95, 6);
  });

  it("fails the exit width when only that door changes to 0.75 m, linked to the door's own GUID", async () => {
    const run = await check(FAIL);
    const width = finding(run, "MOMAH-REST-4.9.1-WIDTH");
    expect(width.status).toBe("fail");
    expect(width.actual).toContain("0.75 م");
    const door = run.standard!.facts.doors.find((d) => d.reference === "D-02")!;
    expect(width.elementGuid).toBe(door.globalId);
    expect(width.elementStepId).toBe(door.expressId);
    expect(door.width).toBeCloseTo(0.75, 6);
  });

  it("measures the kitchen wall tiles against clause 4.5.2 (1.80 m) from their geometry", async () => {
    const ok = finding(await check(PASS), "MOMAH-REST-4.5.2-CLADDING");
    expect(ok.status).toBe("pass");
    expect(ok.actual).toContain("2.00 م");
    const low = await check(TILES);
    const tiles = finding(low, "MOMAH-REST-4.5.2-CLADDING");
    expect(tiles.status).toBe("fail");
    expect(tiles.actual).toContain("1.50 م");
    expect(low.standard!.measurements["MOMAH-REST-4.5.2-CLADDING"]).toMatchObject({ axis: "height", limit: 1.8 });
    // only the tiles changed: the exit door still passes
    expect(finding(low, "MOMAH-REST-4.9.1-WIDTH").status).toBe("pass");
  });

  it("reads a millimetre file as the same plan in metres", async () => {
    const metres = await check(FAIL);
    const millimetres = await check(FAIL_MM);
    expect(millimetres.standard!.facts.lengthUnit.toMetres).toBeCloseTo(0.001, 12);
    expect(millimetres.findings.map((f) => [f.ruleId, f.status])).toEqual(
      metres.findings.map((f) => [f.ruleId, f.status]),
    );
    expect(millimetres.standard!.measurements["MOMAH-REST-4.9.1-WIDTH"]!.value).toBeCloseTo(0.75, 6);
    expect(millimetres.standard!.measurements["MOMAH-REST-4.5.2-CLADDING"]!.value).toBeCloseTo(2, 3);
  });

  it("checks rooms, areas, storage share and WC clauses from the file", async () => {
    const run = await check(PASS);
    const { facts } = run.standard!;
    const roles = Object.fromEntries(facts.spaces.map((s) => [s.role, s]));
    expect(Object.keys(roles).sort()).toEqual(["DINING", "KITCHEN", "SERVICE", "STORAGE", "WC"]);
    expect(roles.DINING.netFloorArea).toBeCloseTo(101.588, 2);
    expect(roles.DINING.areaSource).toBe("Qto_SpaceBaseQuantities");
    expect(roles.DINING.longName).toBe("Dining hall / صالة الطعام");
    const walls = facts.products.filter((p) => p.ifcType === "IfcWall" && p.bbox);
    const extent = (axis: 0 | 2) =>
      Math.max(...walls.map((w) => w.bbox!.max[axis])) - Math.min(...walls.map((w) => w.bbox!.min[axis]));
    expect(walls).toHaveLength(8);
    expect(extent(0)).toBeCloseTo(16, 3);
    expect(extent(2)).toBeCloseTo(11, 3);
    for (const ruleId of [
      "MOMAH-REST-3.1-AREA",
      "MOMAH-REST-4.2.2-SPACES",
      "MOMAH-REST-4.8.1-STORE",
      "MOMAH-REST-4.10.1-WC",
      "MOMAH-REST-4.10.1-DOOR",
      "MOMAH-REST-4.10.1-SEPARATION",
      "MOMAH-REST-4.10.1-HANDWASH",
      "MOMAH-REST-4.9.1-EXIT",
    ]) {
      expect(finding(run, ruleId).status, ruleId).toBe("pass");
    }
    expect(finding(run, "MOMAH-REST-4.8.1-STORE").actual).toContain("11.2 م²");
    expect(finding(run, "MOMAH-REST-4.10.1-DOOR").actual).toContain("D-04");
  });

  it("cites the clause text and the official PDF on every ministry finding", async () => {
    const run = await check(PASS);
    for (const item of run.findings) {
      if (item.requirementKind === "platform") {
        expect(item.sourceUrl).toBeUndefined();
        continue;
      }
      expect(item.clause).toMatch(/^البند /);
      expect(item.clauseText?.length).toBeGreaterThan(20);
      expect(item.sourceUrl).toContain("momah.gov.sa");
      expect(item.source).toContain("4600653138/1");
    }
  });

  it("never counts a clause without evidence in the file as a pass", async () => {
    const run = await check(PASS);
    for (const ruleId of ["MOMAH-REST-4.1.3-DRAIN", "MOMAH-REST-4.3.2-FACADE", "MOMAH-REST-4.7.1-VENT", "MOMAH-REST-4.4.1-ACCESS"]) {
      const item = finding(run, ruleId);
      expect(item.status).toBe("unknown");
      expect(item.actual).toContain("غير قابل للتحقق من الملف");
    }
    expect(run.coverage).toEqual({ verified: 10, total: 14 });
    expect(run.scenario).toBe("review");
  });

  it("reports the exit clauses as unverifiable when no door is flagged FireExit", async () => {
    const run = await check(NO_FLAGS);
    expect(finding(run, "MOMAH-REST-4.9.1-WIDTH").status).toBe("unknown");
    expect(finding(run, "MOMAH-REST-4.9.1-EXIT").status).toBe("unknown");
  });

  it("stops other activities with a clear message instead of guessing", async () => {
    await expect(
      runIfcCompliance({ upload: await upload(PASS), activityId: "cafe", facility: getDefaultFacility("cafe") }),
    ).rejects.toMatchObject({ code: "STANDARD_ACTIVITY_UNSUPPORTED", stageId: "completeness" });
  });
});

describe("space classification from names", () => {
  it.each([
    ["Kitchen / المطبخ", "KITCHEN"],
    ["صالة الطعام", "DINING"],
    ["Toilet 2", "WC"],
    ["دورة المياه", "WC"],
    ["Store Room", "STORAGE"],
    ["Cashier", "SERVICE"],
  ])("%s -> %s", (label, role) => {
    expect(classifySpace(label)?.role).toBe(role);
  });

  it("leaves unknown names unclassified", () => {
    expect(classifySpace("Room 12", "R-12")).toBeUndefined();
    expect(classifySpace("Restoration lab")).toBeUndefined();
  });
});

describe("an independent BIM export (Revit 2011 Duplex, buildingSMART, CC BY 4.0)", () => {
  it("opens, measures doors and rooms, and refuses to guess what the file does not state", async () => {
    const run = await check("public/samples/external/Duplex_A_20110907.ifc");
    const { facts, geometry } = run.standard!;
    expect(facts.schema).toBe("IFC2X3");
    expect(facts.spaces).toHaveLength(21);
    expect(facts.doors).toHaveLength(14);
    expect(facts.doors.every((door) => door.widthSource === "OverallWidth")).toBe(true);
    expect(facts.spaces.filter((space) => space.role === "KITCHEN")).toHaveLength(2);
    expect(facts.spaces.every((space) => space.areaSource === "geometry")).toBe(true);
    expect(geometry.triangles).toBeGreaterThan(10000);
    // Revit 2011 wrote no Pset_DoorCommon.FireExit: exits cannot be identified, so not judged.
    expect(finding(run, "MOMAH-REST-4.9.1-WIDTH").status).toBe("unknown");
    expect(finding(run, "MOMAH-REST-4.9.1-EXIT").status).toBe("unknown");
    // An apartment has no dining hall or storage: clause 4.2.2 fails on evidence.
    expect(finding(run, "MOMAH-REST-4.2.2-SPACES").status).toBe("fail");
    expect(finding(run, "MOMAH-REST-3.1-AREA").status).toBe("pass");
    expect(finding(run, "MOMAH-REST-4.5.2-CLADDING").status).not.toBe("pass");
  }, 60000);
});
