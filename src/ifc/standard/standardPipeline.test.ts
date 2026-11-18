import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { getDefaultFacility } from "../../data";
import { runIfcCompliance } from "../pipeline";
import type { ComplianceRun, IfcUpload } from "../types";
import { classifySpace } from "./classify";
import type { StandardFacts } from "./model";
import { hasMowaemContract } from "./pipeline";
import { systemKind } from "./read";
import { evaluateStandardRestaurant } from "./rules";

async function upload(relative: string): Promise<IfcUpload> {
  const bytes = new Uint8Array(await readFile(new URL(`../../../${relative}`, import.meta.url)));
  return { name: relative.split("/").pop()!, size: bytes.byteLength, bytes };
}

const runs = new Map<string, Promise<ComplianceRun>>();

/** Each sample is read once per test file; the runs are not mutated by the tests. */
function check(relative: string): Promise<ComplianceRun> {
  let run = runs.get(relative);
  if (!run) {
    run = upload(relative).then((file) =>
      runIfcCompliance({ upload: file, activityId: "restaurant", facility: getDefaultFacility("restaurant") }),
    );
    runs.set(relative, run);
  }
  return run;
}

const finding = (run: ComplianceRun, ruleId: string) => {
  const found = run.findings.find((item) => item.ruleId === ruleId);
  if (!found) throw new Error(`missing ${ruleId}`);
  return found;
};

const clauseStatuses = (run: ComplianceRun) =>
  Object.fromEntries(run.findings.filter((f) => !f.ruleId.startsWith("MOWAEM-DATA")).map((f) => [f.ruleId, f.status]));

const PASS = "public/samples/restaurant/restaurant-exit-0.95m.ifc";
const FAIL = "public/samples/restaurant/restaurant-exit-0.75m.ifc";
const TILES = "public/samples/restaurant/restaurant-kitchen-tiles-1.5m.ifc";
const NOT_DRAINED = "public/samples/restaurant/restaurant-sink-not-drained.ifc";
const FAIL_MM = "test-fixtures/ifc/standard/restaurant-exit-0.75m-mm.ifc";
const NO_FLAGS = "test-fixtures/ifc/standard/restaurant-no-fire-exit-flags.ifc";
const DUPLEX = "public/samples/external/Duplex_A_20110907.ifc";

const MEASURED = [
  "MOMAH-REST-3.1-AREA",
  "MOMAH-REST-4.2.2-SPACES",
  "MOMAH-REST-4.5.2-CLADDING",
  "MOMAH-REST-4.8.1-STORE",
  "MOMAH-REST-4.10.1-WC",
  "MOMAH-REST-4.10.1-DOOR",
  "MOMAH-REST-4.10.1-SEPARATION",
  "MOMAH-REST-4.10.1-HANDWASH",
  "MOMAH-REST-4.9.1-EXIT",
  "MOMAH-REST-4.9.1-WIDTH",
  "MOMAH-REST-4.1.3-DRAIN",
];

describe("standard IFC restaurant plans against the ministry's restaurant requirements", () => {
  it("routes files without the Mowaem contract to the standard reader", async () => {
    expect(hasMowaemContract((await upload(PASS)).bytes)).toBe(false);
    expect(hasMowaemContract((await upload("test-fixtures/ifc/restaurant/submission-v1.ifc")).bytes)).toBe(true);
  });

  it("passes every measured clause when the drawn exit door is 0.95 m", async () => {
    const run = await check(PASS);
    expect(run.source).toBe("standard-ifc");
    for (const ruleId of MEASURED) expect(finding(run, ruleId).status, ruleId).toBe("pass");
    const width = finding(run, "MOMAH-REST-4.9.1-WIDTH");
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
    expect(clauseStatuses(run)).toEqual({ ...clauseStatuses(await check(PASS)), "MOMAH-REST-4.9.1-WIDTH": "fail" });
  });

  it("measures the kitchen wall tiles against clause 4.5.2 (1.80 m) from their geometry", async () => {
    const ok = finding(await check(PASS), "MOMAH-REST-4.5.2-CLADDING");
    expect(ok.status).toBe("pass");
    expect(ok.actual).toContain("2.00 م");
    const low = await check(TILES);
    const tiles = finding(low, "MOMAH-REST-4.5.2-CLADDING");
    expect(tiles.status).toBe("fail");
    expect(tiles.actual).toContain("1.50 م");
    expect(tiles.elementName).toMatch(/^Kitchen wall tiles/);
    expect(low.standard!.measurements["MOMAH-REST-4.5.2-CLADDING"]).toMatchObject({ axis: "height", limit: 1.8 });
    // only the tiles changed: every other clause keeps its result
    expect(clauseStatuses(low)).toEqual({ ...clauseStatuses(await check(PASS)), "MOMAH-REST-4.5.2-CLADDING": "fail" });
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
    expect(millimetres.standard!.facts.connections).toHaveLength(metres.standard!.facts.connections.length);
  });

  it("checks rooms, areas, storage share and WC clauses from the file", async () => {
    const run = await check(PASS);
    const { facts } = run.standard!;
    const roles = Object.fromEntries(facts.spaces.map((s) => [s.role, s]));
    expect(Object.keys(roles).sort()).toEqual(["DINING", "KITCHEN", "SERVICE", "STORAGE", "WC"]);
    expect(roles.DINING.netFloorArea).toBeCloseTo(120.5625, 2);
    expect(roles.KITCHEN.netFloorArea).toBeCloseTo(49.68, 2);
    expect(roles.DINING.areaSource).toBe("Qto_SpaceBaseQuantities");
    expect(roles.DINING.longName).toBe("Dining hall / صالة الطعام");
    const walls = facts.products.filter((p) => p.ifcType === "IfcWall" && p.bbox);
    const extent = (axis: 0 | 2) =>
      Math.max(...walls.map((w) => w.bbox!.max[axis])) - Math.min(...walls.map((w) => w.bbox!.min[axis]));
    expect(walls).toHaveLength(13); // 3 external walls, the shopfront head, 5 partitions, 4 parapets
    expect(extent(0)).toBeCloseTo(18, 3);
    expect(extent(2)).toBeCloseTo(12, 3);
    expect(finding(run, "MOMAH-REST-4.8.1-STORE").actual).toContain("13.2 م²");
    expect(finding(run, "MOMAH-REST-4.10.1-DOOR").actual).toContain("D-04");
    expect(finding(run, "MOMAH-REST-4.9.1-EXIT").elementName).toBe("Emergency exit");
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
    for (const ruleId of ["MOMAH-REST-4.3.2-FACADE", "MOMAH-REST-4.7.1-VENT", "MOMAH-REST-4.4.1-ACCESS"]) {
      const item = finding(run, ruleId);
      expect(item.status).toBe("unknown");
      expect(item.actual).toContain("غير قابل للتحقق من الملف");
    }
    // the services model is read, but SBC compliance of the ventilation needs airflow figures
    expect(finding(run, "MOMAH-REST-4.7.1-VENT").actual).toContain("للتهوية والتكييف");
    expect(finding(run, "MOMAH-REST-4.7.1-VENT").elementName).toMatch(/hood/i);
    expect(run.coverage).toEqual({ verified: 11, total: 14 });
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

describe("building services read from the file (systems, ports, connections)", () => {
  it("groups the networks into systems by their IFC4 PredefinedType", async () => {
    const { facts, geometry } = (await check(PASS)).standard!;
    const systems = facts.systems.map((s) => [s.predefinedType, s.kind]);
    expect(systems).toEqual([
      ["DOMESTICCOLDWATER", "water"],
      ["DOMESTICHOTWATER", "water"],
      ["DRAINAGE", "drainage"],
      ["VENT", "drainage"],
      ["EXHAUST", "hvac"],
      ["EXHAUST", "hvac"],
      ["AIRCONDITIONING", "hvac"],
      ["REFRIGERATION", "hvac"],
      ["ELECTRICAL", "electrical"],
      ["LIGHTING", "electrical"],
      ["FIREPROTECTION", "fire"],
      ["FIREPROTECTION", "fire"],
    ]);
    const byId = new Map(facts.products.map((p) => [p.expressId, p]));
    const classesOf = (predefined: string) =>
      new Set(
        facts.systems
          .filter((s) => s.predefinedType === predefined)
          .flatMap((s) => s.members.map((id) => byId.get(id)?.ifcType)),
      );
    expect(classesOf("DRAINAGE")).toEqual(
      new Set(["IfcPipeSegment", "IfcPipeFitting", "IfcSanitaryTerminal", "IfcWasteTerminal", "IfcElectricAppliance",
        "IfcInterceptor", "IfcDistributionChamberElement"]),
    );
    expect(facts.products.find((p) => p.ifcType === "IfcInterceptor")?.predefinedType).toBe("GREASE");
    expect(classesOf("FIREPROTECTION")).toContain("IfcFireSuppressionTerminal");
    expect(classesOf("FIREPROTECTION")).toContain("IfcAlarm");
    expect(classesOf("AIRCONDITIONING")).toContain("IfcUnitaryEquipment");
    expect(classesOf("ELECTRICAL")).toContain("IfcElectricDistributionBoard");
    expect(classesOf("LIGHTING")).toContain("IfcLightFixture");
    // every member and every connection points at an element the viewer can draw
    for (const system of facts.systems) {
      for (const id of system.members) expect(byId.get(id)?.bbox, `${system.name} ${id}`).toBeDefined();
    }
    expect(facts.connections.length).toBeGreaterThan(600);
    expect(facts.ports.count).toBeGreaterThan(2 * facts.connections.length);
    for (const { a, b } of facts.connections) {
      expect(byId.has(a) && byId.has(b) && a !== b).toBe(true);
    }
    // distribution elements are drawn as building services; fixtures and appliances keep their category
    const categories = Object.fromEntries(geometry.chunks.map((c) => [c.category, new Set(c.ranges.map((r) => r.expressId))]));
    const pipe = facts.products.find((p) => p.ifcType === "IfcPipeSegment")!;
    const sink = facts.products.find((p) => p.name === "Three-compartment sink")!;
    const range = facts.products.find((p) => p.predefinedType === "ELECTRICCOOKER")!;
    expect(categories.mep.has(pipe.expressId)).toBe(true);
    expect(categories.sanitary.has(sink.expressId)).toBe(true);
    expect(categories.equipment.has(range.expressId)).toBe(true);
    // runs sit in the ceiling zone or under the floor finish, not in the rooms
    const tray = facts.products.find((p) => p.name === "Power and lighting cable tray 200x50")!;
    const floorY = Math.min(...facts.spaces.map((s) => s.bbox!.min[1]));
    expect(tray.bbox!.min[1] - floorY).toBeGreaterThan(3.2);
    const drains = facts.products.filter((p) => p.name === "Drainage pipe DN100");
    expect(Math.min(...drains.map((d) => d.bbox!.max[1] - floorY))).toBeLessThan(-0.3);
  });

  it("passes clause 4.1.3 when every fixture that discharges water reaches the drainage network", async () => {
    const run = await check(PASS);
    const drain = finding(run, "MOMAH-REST-4.1.3-DRAIN");
    expect(drain.status).toBe("pass");
    expect(drain.actual).toContain("10 من 10 تجهيزات موصولة بشبكة الصرف");
    expect(drain.elementName).toMatch(/^Grease interceptor/);
    expect(drain.clauseText).toContain("يجب وجود اتصال مناسب بخطوط الصرف الصحي");
  });

  it("fails clause 4.1.3 on the sink whose drain port is left unconnected, and nothing else", async () => {
    const run = await check(NOT_DRAINED);
    const drain = finding(run, "MOMAH-REST-4.1.3-DRAIN");
    expect(drain.status).toBe("fail");
    expect(drain.actual).toContain("9 من 10 تجهيزات موصولة بشبكة الصرف");
    const { facts } = run.standard!;
    const sink = facts.products.find((p) => p.name === "Three-compartment sink")!;
    expect(drain.elementGuid).toBe(sink.globalId);
    expect(drain.elementStepId).toBe(sink.expressId);
    // the sink is still on the water supply: its taps do not count as a drain connection
    const sinkLinks = facts.connections.filter((c) => c.a === sink.expressId || c.b === sink.expressId);
    expect(sinkLinks).toHaveLength(2);
    const pass = (await check(PASS)).standard!.facts;
    expect(facts.connections).toHaveLength(pass.connections.length - 1);
    expect(facts.products.map((p) => p.globalId)).toEqual(pass.products.map((p) => p.globalId));
    expect(clauseStatuses(run)).toEqual({ ...clauseStatuses(await check(PASS)), "MOMAH-REST-4.1.3-DRAIN": "fail" });
  });

  it("does not judge clause 4.1.3 when the file has no drainage system or no port connections", async () => {
    const { facts } = (await check(PASS)).standard!;
    const facility = getDefaultFacility("restaurant");
    const status = (changed: StandardFacts) =>
      evaluateStandardRestaurant(changed, facility).find((e) => e.ruleId === "MOMAH-REST-4.1.3-DRAIN")!;
    const noSystems = status({ ...facts, systems: [] });
    expect(noSystems.status).toBe("unknown");
    expect(noSystems.actual).toContain("لا توجد شبكة صرف صحي");
    const noPorts = status({ ...facts, connections: [], ports: { count: 0, connected: 0 } });
    expect(noPorts.status).toBe("unknown");
    expect(noPorts.actual).toContain("بلا منافذ موصولة");
    // storm water and vents are not sewer lines
    const ventOnly = status({ ...facts, systems: facts.systems.filter((s) => s.predefinedType !== "DRAINAGE") });
    expect(ventOnly.status).toBe("unknown");
  });

  it.each([
    ["DRAINAGE", "Anything", "drainage"],
    ["DOMESTICCOLDWATER", undefined, "water"],
    ["FIREPROTECTION", undefined, "fire"],
    [undefined, "Sanitary 1", "drainage"],
    [undefined, "Domestic Cold Water 1", "water"],
    [undefined, "Domestic Hot Water", "water"],
    [undefined, "Supply Air 2", "hvac"],
    [undefined, "Ventilation", "hvac"],
    [undefined, "Vent 1", "drainage"],
    [undefined, "Chilled Water Supply", "hvac"],
    [undefined, "Fire Protection Wet", "fire"],
    [undefined, "Power", "electrical"],
    [undefined, "الصرف الصحي", "drainage"],
    [undefined, "Hydronic loop", "other"],
  ])("system %s / %s is %s", (predefined, name, kind) => {
    expect(systemKind(predefined, name)).toBe(kind);
  });
});

describe("space classification from names", () => {
  it.each([
    ["Kitchen / المطبخ", "KITCHEN"],
    ["صالة الطعام", "DINING"],
    ["Toilet 2", "WC"],
    ["دورة المياه", "WC"],
    ["Store Room", "STORAGE"],
    ["Dry store / المخزن", "STORAGE"],
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
    const run = await check(DUPLEX);
    const { facts, geometry } = run.standard!;
    expect(facts.schema).toBe("IFC2X3");
    expect(facts.spaces).toHaveLength(21);
    expect(facts.doors).toHaveLength(14);
    expect(facts.doors.every((door) => door.widthSource === "OverallWidth")).toBe(true);
    expect(facts.spaces.filter((space) => space.role === "KITCHEN")).toHaveLength(2);
    expect(facts.spaces.every((space) => space.areaSource === "geometry")).toBe(true);
    expect(geometry.triangles).toBeGreaterThan(10000);
    // an architectural export without building services: nothing to trace, nothing guessed
    expect(facts.systems).toEqual([]);
    expect(facts.connections).toEqual([]);
    expect(facts.ports).toEqual({ count: 0, connected: 0 });
    expect(geometry.chunks.some((c) => c.category === "mep")).toBe(false);
    expect(finding(run, "MOMAH-REST-4.1.3-DRAIN").status).toBe("unknown");
    // Revit 2011 wrote no Pset_DoorCommon.FireExit: exits cannot be identified, so not judged.
    expect(finding(run, "MOMAH-REST-4.9.1-WIDTH").status).toBe("unknown");
    expect(finding(run, "MOMAH-REST-4.9.1-EXIT").status).toBe("unknown");
    // An apartment has no dining hall or storage: clause 4.2.2 fails on evidence.
    expect(finding(run, "MOMAH-REST-4.2.2-SPACES").status).toBe("fail");
    expect(finding(run, "MOMAH-REST-3.1-AREA").status).toBe("pass");
    expect(finding(run, "MOMAH-REST-4.5.2-CLADDING").status).not.toBe("pass");
  }, 60000);
});
