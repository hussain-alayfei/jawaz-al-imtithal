import { describe, expect, it } from "vitest";
import type { Box3, GeometryCategory, GeometryChunk, StandardFacts, StandardSystem } from "../../ifc/standard/model";
import { finishFor, hsv } from "./finishes";
import { isServiceElement, LAYER_COLORS, memberKinds, networkLayers, serviceTopic, systemsOf } from "./networks";
import { elementIndex, partsOfChunk, splitGlazing, type PartSpec } from "./parts";
import { elementAtFace } from "./picking";
import { FrameGovernor, pinnedTier } from "./quality";
import { siteLayout } from "./site";
import { daylight, HERO_TIME, RIYADH, solarPosition } from "./sun";
import { buildingBoxOf, facadePose, focusPose, frontSide, openingsOf, planPose, sectionPose, streetPose } from "./views";
import { streetBounds } from "../scene/SaudiStreet";

/* ---------- a tiny synthetic model: boxes merged into chunks, like the reader builds them ---------- */

interface Piece {
  id: number;
  min: [number, number, number];
  max: [number, number, number];
  color: [number, number, number];
}

/** 8 corners, 12 triangles per box (two per face), merged with a face-range table. */
function chunkOf(category: GeometryCategory, pieces: Piece[]): GeometryChunk {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const ranges: GeometryChunk["ranges"] = [];
  const faces = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
    [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [0, 4, 7], [0, 7, 3],
  ];
  for (const piece of pieces) {
    const base = positions.length / 3;
    const [x0, y0, z0] = piece.min;
    const [x1, y1, z1] = piece.max;
    for (const [x, y, z] of [
      [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
      [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
    ]) {
      positions.push(x, y, z);
      colors.push(...piece.color);
    }
    ranges.push({ expressId: piece.id, start: indices.length / 3, count: faces.length });
    for (const f of faces) indices.push(base + f[0], base + f[1], base + f[2]);
  }
  return {
    category,
    positions: new Float32Array(positions),
    normals: new Float32Array(positions.length),
    colors: new Float32Array(colors),
    uvs: new Float32Array((positions.length / 3) * 2),
    indices: new Uint32Array(indices),
    ranges,
  };
}

const PIPE: [number, number, number] = [0.6, 0.6, 0.6];
const services = chunkOf("mep", [
  { id: 501, min: [0, 2.8, 0], max: [6, 2.9, 0.1], color: PIPE }, // cold-water pipe
  { id: 502, min: [6, 2.8, 0], max: [6.1, 2.9, 3], color: PIPE }, // cold-water pipe
  { id: 503, min: [0, -0.4, 1], max: [8, -0.3, 1.1], color: PIPE }, // drain
  { id: 504, min: [2, 3.0, 2], max: [8, 3.3, 2.4], color: PIPE }, // supply-air duct
  { id: 505, min: [1, 3.1, 4], max: [5, 3.15, 4.2], color: PIPE }, // cable tray
  { id: 506, min: [9, 2.6, 4], max: [9.2, 2.8, 4.2], color: PIPE }, // sprinkler head
  { id: 507, min: [3, 2.0, 5], max: [3.2, 2.2, 5.2], color: PIPE }, // loose valve, in no system
]);

const systems: StandardSystem[] = [
  { expressId: 900, globalId: "S-CW", name: "Domestic cold water", kind: "water", predefinedType: "DOMESTICCOLDWATER", members: [501, 502, 601] },
  { expressId: 901, globalId: "S-DR", name: "Sanitary drainage", kind: "drainage", predefinedType: "DRAINAGE", members: [503, 601] },
  { expressId: 902, globalId: "S-SA", name: "Supply air", kind: "hvac", predefinedType: "SUPPLYAIR", members: [504] },
  { expressId: 903, globalId: "S-LV", name: "Lighting power", kind: "electrical", predefinedType: "ELECTRICAL", members: [505] },
  { expressId: 904, globalId: "S-SP", name: "Sprinklers", kind: "fire", predefinedType: "FIREPROTECTION", members: [506] },
];

describe("building-services layers from the file's systems", () => {
  const mepIds = services.ranges.map((r) => r.expressId);

  it("lists each kind present once, in the fixed order, with its fixed colour", () => {
    const layers = networkLayers({ systems }, mepIds);
    expect(layers.map((l) => l.kind)).toEqual(["water", "drainage", "electrical", "hvac", "fire", "unassigned"]);
    expect(layers[0]).toMatchObject({ label: "المياه", color: LAYER_COLORS.water, count: 3 });
    expect(layers.find((l) => l.kind === "drainage")?.color).toBe("#7a5230");
    expect(layers.find((l) => l.kind === "electrical")?.color).toBe("#d9930d");
    expect(layers.find((l) => l.kind === "fire")?.color).toBe("#c62828");
    // 507 is services geometry that no system lists.
    expect(layers.at(-1)).toMatchObject({ kind: "unassigned", count: 1 });
  });

  it("hides the control when the file has no systems", () => {
    expect(networkLayers({ systems: [] }, mepIds)).toEqual([]);
  });

  it("finds every system an element belongs to, and draws it on the first one's layer", () => {
    expect(systemsOf(systems, 601).map((s) => s.name)).toEqual(["Domestic cold water", "Sanitary drainage"]);
    expect(memberKinds(systems).get(601)).toBe("water");
    expect(memberKinds(systems).get(503)).toBe("drainage");
  });

  it("splits the services chunk by layer and keeps picking exact", () => {
    const parts = partsOfChunk(services, { products: new Map(), kinds: memberKinds(systems) });
    const byLayer: Record<string, PartSpec> = Object.fromEntries(parts.map((p) => [p.layer ?? "", p]));
    expect(Object.keys(byLayer).sort()).toEqual(["drainage", "electrical", "fire", "hvac", "unassigned", "water"]);
    expect(byLayer.water.ranges.map((r) => r.expressId)).toEqual([501, 502]);
    expect(byLayer.water.index.length).toBe(2 * 12 * 3);
    // Every triangle of every part maps back to the element that owns it in the source chunk.
    for (const part of parts) {
      for (let face = 0; face < part.index.length / 3; face++) {
        const id = elementAtFace(part.ranges, face)!;
        const source = services.ranges.find((r) => r.expressId === id)!;
        const own = services.indices.subarray(source.start * 3, (source.start + source.count) * 3);
        expect(Array.from(own)).toContain(part.index[face * 3]);
      }
    }
    expect(elementIndex(parts, 504)?.length).toBe(36);
    expect(elementIndex(parts, 999)).toBeUndefined();
  });

  it("reads a finding's services topic from its rule id", () => {
    expect(serviceTopic("MOMAH-REST-4.1.3-DRAIN")).toBe("drainage");
    expect(serviceTopic("MOMAH-REST-4.6.1-HOOD")).toBe("hvac");
    expect(serviceTopic("MOMAH-REST-4.5.2-CLADDING")).toBeUndefined();
    expect(serviceTopic("MOMAH-REST-4.9.1-WIDTH")).toBeUndefined();
    expect(serviceTopic("MOMAH-REST-4.3.2-FACADE")).toBeUndefined();
    expect(serviceTopic(undefined)).toBeUndefined();
  });

  it("opens services selections in the services view, fixtures stay in the cut", () => {
    const kinds = memberKinds(systems);
    const mep = new Set(mepIds);
    expect(isServiceElement({ expressId: 504, ifcType: "IfcDuctSegment" }, mep, kinds)).toBe(true);
    expect(isServiceElement({ expressId: 601, ifcType: "IfcSanitaryTerminal" }, mep, kinds)).toBe(false);
    expect(isServiceElement({ expressId: 700, ifcType: "IfcDoor" }, mep, kinds)).toBe(false);
    expect(isServiceElement(undefined, mep, kinds)).toBe(false);
  });
});

describe("finishes from the file's class, name and colour", () => {
  const f = (category: GeometryCategory, ifcType: string, color: [number, number, number], name?: string, predefinedType?: string) =>
    finishFor({ category, ifcType, color, name, predefinedType });

  it("reads the restaurant sample's materials", () => {
    expect(f("wall", "IfcWall", [0.93, 0.91, 0.87], "External wall south")).toBe("plaster");
    expect(f("wall", "IfcCovering", [0.97, 0.97, 0.96], "Kitchen wall tiles west", "CLADDING")).toBe("ceramicTile");
    expect(f("floor", "IfcSlab", [0.84, 0.82, 0.78], "Ground floor slab", "FLOOR")).toBe("terrazzo");
    expect(f("roof", "IfcSlab", [0.72, 0.71, 0.68], "Roof slab", "ROOF")).toBe("concrete");
    expect(f("furniture", "IfcFurniture", [0.66, 0.5, 0.33], "Table T-01", "TABLE")).toBe("wood");
    expect(f("furniture", "IfcFurniture", [0.16, 0.36, 0.3], "Chair T-01S", "CHAIR")).toBe("fabric");
    expect(f("furniture", "IfcFurniture", [0.78, 0.8, 0.82], "Kitchen counter west")).toBe("stainless");
    expect(f("furniture", "IfcFurniture", [0.27, 0.36, 0.33], "Shelving east", "SHELF")).toBe("paintedMetal");
    expect(f("sanitary", "IfcSanitaryTerminal", [0.78, 0.8, 0.82], "Kitchen sink", "SINK")).toBe("stainless");
    expect(f("sanitary", "IfcSanitaryTerminal", [0.97, 0.97, 0.96], "Wash hand basin", "WASHHANDBASIN")).toBe("ceramic");
    expect(f("equipment", "IfcBuildingElementProxy", [0.78, 0.8, 0.82], "Kitchen exhaust hood")).toBe("stainless");
    expect(f("door", "IfcDoor", [0.66, 0.5, 0.33], "Dining to WC")).toBe("wood");
    expect(f("door", "IfcDoor", [0.62, 0.66, 0.68], "Main entrance")).toBe("aluminium");
    expect(f("door", "IfcDoor", [0.27, 0.36, 0.33], "Emergency exit")).toBe("paintedMetal");
    expect(f("window", "IfcWindow", [0.7, 0.84, 0.9], "Shopfront window west")).toBe("glass");
  });

  it("reads the regenerated restaurant's finishes", () => {
    expect(f("wall", "IfcCovering", [0.16, 0.33, 0.3], "Signage band (ACP cladding)", "CLADDING")).toBe("panel");
    expect(f("floor", "IfcCovering", [0.58, 0.62, 0.6], "Epoxy floor coating (store)", "FLOORING")).toBe("epoxy");
    expect(f("floor", "IfcCovering", [0.66, 0.4, 0.31], "Anti-slip quarry tiles (kitchen)", "FLOORING")).toBe("porcelain");
    expect(f("floor", "IfcSlab", [0.72, 0.71, 0.68], "Ground floor slab", "FLOOR")).toBe("concrete");
    expect(f("roof", "IfcCovering", [0.82, 0.79, 0.74], "Roof waterproofing, insulation and tiles", "ROOFING")).toBe("roofTile");
    expect(f("roof", "IfcCovering", [0.96, 0.96, 0.95], "Gypsum board ceiling (dining)", "CEILING")).toBe("plaster");
    expect(f("roof", "IfcCovering", [0.98, 0.98, 0.97], "Washable PVC ceiling tiles (kitchen)", "CEILING")).toBe("ceilingTile");
    expect(f("furniture", "IfcFurniture", [0.67, 0.59, 0.53], "Cashier and serving counter")).toBe("stone");
    expect(f("furniture", "IfcFurniture", [0.44, 0.51, 0.49], "Prep table P-1", "TABLE")).toBe("stainless");
    expect(f("furniture", "IfcFurniture", [0.44, 0.24, 0.17], "Booth B-1 (4 seats)")).toBe("leather");
    expect(f("furniture", "IfcFurniture", [0.25, 0.2, 0.18], "Table T-1 (2 seats)", "TABLE")).toBe("wood");
    expect(f("other", "IfcMember", [0.6, 0.62, 0.64], "Shopfront mullion M-1", "MULLION")).toBe("aluminium");
  });

  it("lets names win over colours", () => {
    expect(f("floor", "IfcCovering", [0.6, 0.45, 0.3], "Oak parquet", "FLOORING")).toBe("woodFloor");
    expect(f("furniture", "IfcFurniture", [0.2, 0.15, 0.1], "Leather sofa")).toBe("leather");
    expect(f("wall", "IfcCovering", [0.9, 0.88, 0.84], "Limestone cladding", "CLADDING")).toBe("stone");
  });

  it("measures colour in HSV", () => {
    expect(hsv([1, 0, 0])).toEqual({ h: 0, s: 1, v: 1 });
    expect(hsv([0.5, 0.5, 0.5]).s).toBe(0);
  });
});

describe("window panes and frames", () => {
  // A 2.4 m x 1.8 m window in a wall along x: a 6 cm frame ring (four bars) and a 2 cm pane.
  const w = 2.4, h = 1.8, t = 0.06;
  const glass: [number, number, number] = [0.7, 0.84, 0.9];
  const chunk = chunkOf("window", [
    { id: 1, min: [0, 0.6, 0], max: [w, 0.6 + t, 0.25], color: glass },
    { id: 1, min: [0, 0.6 + h - t, 0], max: [w, 0.6 + h, 0.25], color: glass },
    { id: 1, min: [0, 0.6 + t, 0], max: [t, 0.6 + h - t, 0.25], color: glass },
    { id: 1, min: [w - t, 0.6 + t, 0], max: [w, 0.6 + h - t, 0.25], color: glass },
    { id: 1, min: [t, 0.6 + t, 0.115], max: [w - t, 0.6 + h - t, 0.135], color: glass },
  ]);
  // The test chunk lists the element five times; merge to one range like the reader does.
  const merged: GeometryChunk = { ...chunk, ranges: [{ expressId: 1, start: 0, count: chunk.indices.length / 3 }] };

  it("keeps the pane's two faces as glass and everything else as frame", () => {
    const { glass: pane, frame } = splitGlazing(merged, merged.ranges[0]);
    expect(pane.length).toBe(4);
    expect(pane.length + frame.length).toBe(60);
  });

  it("puts panes and frames in separate parts of the same element", () => {
    const parts = partsOfChunk(merged, {
      products: new Map([[1, { ifcType: "IfcWindow", name: "Shopfront window west" }]]),
      kinds: new Map(),
    });
    expect(parts.map((p) => p.key).sort()).toEqual(["window:frame", "window:glass"]);
    expect(elementIndex(parts, 1)?.length).toBe(60 * 3);
  });
});

describe("camera views", () => {
  const building: Box3 = { min: [-8, -0.2, -5.5], max: [8, 3.4, 5.5] };
  const lens = { fov: 36, aspect: 1.6 };
  const box = (x: number, z: number, w: number, d: number): Box3 => ({ min: [x - w / 2, 0, z - d / 2], max: [x + w / 2, 2.4, z + d / 2] });

  it("frames the building, not services that run outside it", () => {
    const products = [
      { ifcType: "IfcWall", bbox: { min: [0, 0, -12], max: [18, 3.4, 0] } as Box3 },
      { ifcType: "IfcSlab", bbox: { min: [0, -0.3, -12], max: [18, 0, 0] } as Box3 },
      { ifcType: "IfcInterceptor", bbox: { min: [13, -1.4, -13.5], max: [14.7, -0.1, -12.5] } as Box3 },
      { ifcType: "IfcFurniture" },
    ];
    const all: Box3 = { min: [-0.1, -1.4, -13.5], max: [18.1, 4.8, 1.5] };
    expect(buildingBoxOf(products, all)).toEqual({ min: [0, -0.3, -12], max: [18, 3.4, 0] });
    expect(buildingBoxOf([{ ifcType: "IfcPipeSegment", bbox: all }], all)).toBe(all);
    // Shopfront glazing panels count as openings.
    expect(openingsOf([{ ifcType: "IfcPlate", bbox: all }, { ifcType: "IfcPipeSegment", bbox: all }])).toHaveLength(1);
  });

  it("finds the front from the doors and windows", () => {
    // Entrance and two shopfront windows on the south side (+z), one window north.
    const south = [box(-3, 5.4, 1.8, 0.25), box(-6, 5.4, 2.4, 0.25), box(0, 5.4, 2.4, 0.25)];
    expect(frontSide(building, [...south, box(-3, -5.4, 3, 0.25)])).toBe("south");
    expect(frontSide(building, [box(7.9, 0, 0.25, 4)])).toBe("east");
    expect(frontSide(building, [])).toBe("south");
  });

  it("stands near eye level in front of the facade, with one face in sun and one in shade", () => {
    const morningSun: [number, number] = [0.7, 0.7]; // south-east: south and east faces equally lit
    const pose = facadePose(building, "south", morningSun, 0, lens);
    expect(pose.position[2]).toBeGreaterThan(building.max[2] + 8);
    expect(pose.position[0]).toBeLessThan(0); // the west face is in shade beside the lit front
    expect(pose.position[1]).toBeGreaterThan(1.5);
    expect(pose.position[1]).toBeLessThan(4);
    expect(pose.position[1]).toBeGreaterThan(pose.target[1]);
    // Sun over the camera's shoulder lights both faces; "shade" takes the face the sun misses.
    expect(facadePose(building, "south", [-0.9, 0.45], 0, lens, "lit").position[0]).toBeLessThan(0);
    expect(facadePose(building, "south", morningSun, 0, lens, "lit").position[0]).toBeGreaterThan(0);
    expect(facadePose(building, "south", [-0.9, 0.45], 0, lens, "shade").position[0]).toBeGreaterThan(0);
  });

  it("looks down on the plan and into the dollhouse from above the cut", () => {
    const plan = planPose(building, "south", 0, lens);
    expect(plan.position[1]).toBeGreaterThan(15);
    expect(Math.hypot(plan.position[0] - plan.target[0], plan.position[2] - plan.target[2])).toBeLessThan(0.05);
    const section = sectionPose(building, "south", 0, lens);
    const elevation = Math.atan2(section.position[1] - section.target[1], Math.hypot(section.position[0] - section.target[0], section.position[2] - section.target[2]));
    expect((elevation * 180) / Math.PI).toBeGreaterThan(30);
    expect((elevation * 180) / Math.PI).toBeLessThan(50);
  });

  it("faces a height finding from the room side", () => {
    // Tiles on the west face of the kitchen (room centre to the east, +x).
    const tiles: Box3 = { min: [2.07, 0, -1], max: [2.09, 1.5, 5.3] };
    const pose = focusPose(tiles, building, lens, { axis: "height", floorY: 0, room: [5, 2], value: 1.5 });
    expect(pose.position[0]).toBeGreaterThan(tiles.max[0] + 2);
    expect(pose.target[1]).toBeCloseTo(0.9, 6);
  });
});

describe("site context", () => {
  it("raises a paved plot one kerb above a street along the front", () => {
    const building: Box3 = { min: [-8, -0.2, -5.5], max: [8, 3.4, 5.5] };
    const site = siteLayout(building, 0, "south");
    // Paving at the storey's floor level, the street one kerb lower.
    expect(site.plazaY).toBeCloseTo(-0.02, 6);
    expect(site.streetY).toBeCloseTo(-0.17, 6);
    expect(site.plaza.x0).toBeLessThan(-8);
    expect(site.plaza.z1).toBeGreaterThan(5.5 + 6);
    expect(site.street.z0).toBeCloseTo(site.plaza.z1, 6);
    expect(site.street.z1 - site.street.z0).toBeCloseTo(7.5, 6);
    expect(site.kerbs).toHaveLength(4);
    const east = siteLayout(building, 0, "east");
    expect(east.street.x0).toBeCloseTo(east.plaza.x1, 6);
    expect(east.street.z1 - east.street.z0).toBeGreaterThan(100);
  });
});

describe("street context", () => {
  const footprint = { minX: -9, minZ: -6, maxX: 9, maxZ: 6 };

  it("lays the street out in front of the building's front, wider along the street than across it", () => {
    const south = streetBounds({ footprint, front: "south" });
    expect(south.maxZ).toBeGreaterThan(footprint.maxZ + 30); // forecourt, sidewalk, the street, the far side
    expect(south.minZ).toBeLessThan(footprint.minZ - 20); // rear lane and the block behind
    expect(south.maxZ - 6).toBeGreaterThan(-south.minZ - 6);
    expect(south.maxX - south.minX).toBeGreaterThan(south.maxZ - south.minZ);
    // An east front turns the whole street a quarter turn: the street runs north-south.
    const east = streetBounds({ footprint, front: "east" });
    expect(east.maxX).toBeGreaterThan(footprint.maxX + 30);
    expect(east.maxZ - east.minZ).toBeGreaterThan(east.maxX - east.minX);
  });

  it("looks at the street view from the open corner, above eye level", () => {
    const building: Box3 = { min: [-9, -0.3, -6], max: [9, 4.7, 6] };
    const pose = streetPose(building, "south", [1, 0], 0, { fov: 32, aspect: 16 / 9 });
    expect(pose.position[0]).toBeGreaterThan(building.max[0] + 10);
    expect(pose.position[2]).toBeGreaterThan(building.max[2] + 10);
    expect(pose.position[1]).toBeGreaterThan(4);
    expect(pose.position[1]).toBeLessThan(10);
  });
});

describe("light and quality", () => {
  it("lights the street views in the afternoon from the south-west, high enough to clear the neighbours", () => {
    const { elevation, azimuth } = solarPosition(RIYADH.lat, RIYADH.lon, HERO_TIME);
    expect(elevation).toBeGreaterThan(25);
    expect(elevation).toBeLessThan(36);
    expect(azimuth).toBeGreaterThan(212);
    expect(azimuth).toBeLessThan(240);
  });

  it("warms the colours, not the strength, of the street views' light", () => {
    const plain = daylight(31);
    const warm = daylight(31, 1);
    expect(warm.sun.intensity).toBeCloseTo(plain.sun.intensity, 6);
    expect(warm.exposure).toBeCloseTo(plain.exposure, 6);
    const blue = (hex: string) => parseInt(hex.slice(5, 7), 16);
    expect(blue(warm.sun.color)).toBeLessThan(blue(plain.sun.color));
  });

  it("warms and weakens the sun near the horizon", () => {
    const low = daylight(8);
    const high = daylight(57);
    expect(low.sun.intensity).toBeLessThan(high.sun.intensity);
    const blue = (hex: string) => parseInt(hex.slice(5, 7), 16);
    expect(blue(low.sun.color)).toBeLessThan(blue(high.sun.color));
  });

  it("keeps the midday sun about five times the shade on flat ground", () => {
    // Direct diffuse = I x N.L / pi (physical lights); shade = image light + hemisphere light,
    // measured from captures at about 0.6 and 0.27 of albedo per unit intensity.
    const { sun, envIntensity, hemisphere } = daylight(57);
    const direct = (sun.intensity * Math.sin((57 * Math.PI) / 180)) / Math.PI;
    const shade = envIntensity * 0.62 + hemisphere.intensity * 0.85;
    const ratio = (direct + shade) / shade;
    expect(ratio).toBeGreaterThan(4);
    expect(ratio).toBeLessThan(7);
  });

  it("steps down only on slow bursts, never on idle gaps, and never back up", () => {
    const governor = new FrameGovernor("high", { window: 4, downMs: 40, gapMs: 250 });
    for (const d of [5000, 16, 17, 16]) expect(governor.push(d)).toBeUndefined();
    expect(governor.push(18)).toBeUndefined();
    expect(governor.tier).toBe("high");
    for (const d of [60, 70, 65]) governor.push(d);
    expect(governor.push(80)).toBe("medium");
    for (const d of [10, 10, 10, 10]) governor.push(d);
    expect(governor.tier).toBe("medium");
    expect(pinnedTier("?quality=low")).toBe("low");
    expect(pinnedTier("?capture=hero")).toBeUndefined();
  });
});

// Keep the synthetic facts shape honest against the contract.
const facts: Pick<StandardFacts, "systems" | "connections"> = { systems, connections: [{ a: 501, b: 502 }] };
void facts;
