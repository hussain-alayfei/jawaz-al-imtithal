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
const FAIL_MM = "test-fixtures/ifc/standard/restaurant-exit-0.75m-mm.ifc";
const NO_FLAGS = "test-fixtures/ifc/standard/restaurant-no-fire-exit-flags.ifc";

describe("standard IFC restaurant plans", () => {
  it("routes files without the Mowaem contract to the standard reader", async () => {
    expect(hasMowaemContract((await upload(PASS)).bytes)).toBe(false);
    expect(hasMowaemContract((await upload("test-fixtures/ifc/restaurant/submission-v1.ifc")).bytes)).toBe(true);
  });

  it("passes the exit width when the drawn door is 0.95 m", async () => {
    const run = await check(PASS);
    expect(run.source).toBe("standard-ifc");
    const width = finding(run, "DOOR-WIDTH-001");
    expect(width.status).toBe("pass");
    expect(width.actual).toContain("0.95 م");
    expect(width.actual).toContain("OverallWidth");
    expect(run.standard?.measurements["DOOR-WIDTH-001"]?.value).toBeCloseTo(0.95, 6);
  });

  it("fails the exit width when only that door changes to 0.75 m, linked to the door's own GUID", async () => {
    const run = await check(FAIL);
    const width = finding(run, "DOOR-WIDTH-001");
    expect(width.status).toBe("fail");
    expect(width.actual).toContain("0.75 م");
    const door = run.standard!.facts.doors.find((d) => d.reference === "D-02")!;
    expect(width.elementGuid).toBe(door.globalId);
    expect(width.elementStepId).toBe(door.expressId);
    expect(door.width).toBeCloseTo(0.75, 6);
    expect(door.bbox).toBeDefined();
  });

  it("reads a millimetre file as the same plan in metres", async () => {
    const metres = await check(FAIL);
    const millimetres = await check(FAIL_MM);
    expect(millimetres.standard!.facts.lengthUnit.toMetres).toBeCloseTo(0.001, 12);
    expect(millimetres.findings.map((f) => [f.ruleId, f.status])).toEqual(
      metres.findings.map((f) => [f.ruleId, f.status]),
    );
    expect(millimetres.standard!.measurements["DOOR-WIDTH-001"]!.value).toBeCloseTo(0.75, 6);
    const a = metres.standard!.geometry.bbox;
    const b = millimetres.standard!.geometry.bbox;
    for (let i = 0; i < 3; i++) {
      expect(b.max[i] - b.min[i]).toBeCloseTo(a.max[i] - a.min[i], 3);
    }
  });

  it("reads rooms, areas and the 16 x 11 m footprint from the file", async () => {
    const run = await check(PASS);
    const { facts, geometry } = run.standard!;
    const roles = Object.fromEntries(facts.spaces.map((s) => [s.role, s]));
    expect(Object.keys(roles).sort()).toEqual(["DINING", "KITCHEN", "SERVICE", "STORAGE", "WC"]);
    expect(roles.DINING.netFloorArea).toBeCloseTo(101.588, 2);
    expect(roles.DINING.areaSource).toBe("Qto_SpaceBaseQuantities");
    expect(roles.DINING.longName).toBe("Dining hall / صالة الطعام");
    // Footprint from the walls' own geometry (window frames stand a few cm proud of the facade).
    const walls = facts.products.filter((p) => p.ifcType === "IfcWall" && p.bbox);
    const extent = (axis: 0 | 2) =>
      Math.max(...walls.map((w) => w.bbox!.max[axis])) - Math.min(...walls.map((w) => w.bbox!.min[axis]));
    expect(walls).toHaveLength(8);
    expect(extent(0)).toBeCloseTo(16, 3);
    expect(extent(2)).toBeCloseTo(11, 3);
    expect(geometry.triangles).toBeGreaterThan(1000);
    expect(finding(run, "REST-SPACE-001").status).toBe("pass");
    expect(finding(run, "EGRESS-001").status).toBe("pass");
  });

  it("never counts a rule without evidence in the file as a pass", async () => {
    const run = await check(PASS);
    for (const ruleId of ["FACADE-MEP-001", "ACCESS-ROUTE-001", "KITCHEN-VENT-001", "REST-SAN-001"]) {
      const item = finding(run, ruleId);
      expect(item.status).toBe("unknown");
      expect(item.actual).toContain("غير قابل للتحقق من الملف");
    }
    expect(run.coverage).toEqual({ verified: 6, total: 10 });
    expect(run.scenario).toBe("review");
  });

  it("reports the exit rules as unverifiable when no door is flagged FireExit", async () => {
    const run = await check(NO_FLAGS);
    expect(finding(run, "DOOR-WIDTH-001").status).toBe("unknown");
    expect(finding(run, "EGRESS-001").status).toBe("unknown");
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
    expect(finding(run, "DOOR-WIDTH-001").status).toBe("unknown");
    expect(finding(run, "EGRESS-001").status).toBe("unknown");
    // An apartment has no dining hall or storage: the space rules fail on evidence.
    expect(finding(run, "REST-SPACE-001").status).toBe("fail");
  }, 60000);
});
