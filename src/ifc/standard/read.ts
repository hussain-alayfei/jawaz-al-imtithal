import * as WebIFC from "web-ifc";
import { classifySpace } from "./classify";
import type {
  Box3,
  GeometryCategory,
  GeometryChunk,
  LengthUnitInfo,
  StandardDoor,
  StandardFacts,
  StandardModel,
  StandardProduct,
  StandardSpace,
} from "./model";

/*
 * One pass over a standard IFC file with web-ifc: the facts the rules measure and the
 * triangles the viewer draws come from the same parsed model, so the 3D view is the
 * file that was checked. Pure apart from the IfcAPI instance it is given, so the same
 * code runs in the browser worker and in Node tests.
 */

const SI_PREFIX: Record<string, number> = {
  EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1,
  DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9,
};
const IMPERIAL_LENGTH: Record<string, number> = {
  INCH: 0.0254, FOOT: 0.3048, YARD: 0.9144, MILE: 1609.344,
};

export class StandardIfcError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Progress = (progress: number, detail: string) => void;

function val(attribute: unknown): unknown {
  if (attribute && typeof attribute === "object" && "value" in attribute) {
    return (attribute as { value: unknown }).value;
  }
  return attribute ?? undefined;
}

function str(attribute: unknown): string | undefined {
  const v = val(attribute);
  return typeof v === "string" && v.trim() ? v : undefined;
}

function num(attribute: unknown): number | undefined {
  const v = val(attribute);
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function ids(vector: { size(): number; get(i: number): number }): number[] {
  const out: number[] = [];
  for (let i = 0; i < vector.size(); i++) out.push(vector.get(i));
  return out;
}

function siFactor(unit: Record<string, unknown> | undefined): number {
  const prefix = str(unit?.Prefix);
  return prefix ? (SI_PREFIX[prefix] ?? 1) : 1;
}

function readUnits(api: WebIFC.IfcAPI, modelID: number): { length: LengthUnitInfo; area: number } {
  const length: LengthUnitInfo = { declared: "METRE (افتراضي)", toMetres: 1 };
  let area = 1;
  const projects = ids(api.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT));
  if (!projects.length) return { length, area };
  const project = api.GetLine(modelID, projects[0], true) as Record<string, unknown>;
  const assignment = project.UnitsInContext as { Units?: Record<string, unknown>[] } | undefined;
  for (const unit of assignment?.Units ?? []) {
    const unitType = str(unit.UnitType);
    const type = api.GetNameFromTypeCode(Number(unit.type)).toUpperCase();
    if (unitType === "LENGTHUNIT") {
      if (type === "IFCSIUNIT") {
        const prefix = str(unit.Prefix);
        length.declared = `${prefix ? `${prefix} ` : ""}${str(unit.Name) ?? "METRE"}`;
        length.toMetres = siFactor(unit);
      } else if (type === "IFCCONVERSIONBASEDUNIT") {
        const name = (str(unit.Name) ?? "").toUpperCase();
        const factor = unit.ConversionFactor as Record<string, unknown> | undefined;
        const component = num(factor?.ValueComponent);
        const base = factor?.UnitComponent as Record<string, unknown> | undefined;
        length.declared = name || "CONVERSION BASED";
        length.toMetres =
          component !== undefined ? component * siFactor(base) : (IMPERIAL_LENGTH[name] ?? NaN);
      }
    } else if (unitType === "AREAUNIT" && type === "IFCSIUNIT") {
      area = siFactor(unit) ** 2;
    }
  }
  if (!Number.isFinite(length.toMetres) || length.toMetres <= 0) {
    throw new StandardIfcError(
      "UNSUPPORTED_LENGTH_UNIT",
      `وحدة الطول في الملف (${length.declared}) غير مدعومة للتحويل إلى المتر.`,
    );
  }
  return { length, area };
}

function categoryFor(ifcType: string, predefined?: string): GeometryCategory {
  const t = ifcType.toUpperCase();
  if (t === "IFCWALL" || t === "IFCWALLSTANDARDCASE" || t === "IFCCURTAINWALL" || t === "IFCCOLUMN" || t === "IFCBEAM") return "wall";
  if (t === "IFCSLAB") return predefined === "ROOF" ? "roof" : "floor";
  if (t === "IFCCOVERING") return predefined === "FLOORING" ? "floor" : predefined === "CLADDING" ? "wall" : "roof";
  if (t === "IFCROOF") return "roof";
  if (t === "IFCDOOR") return "door";
  if (t === "IFCWINDOW" || t === "IFCPLATE") return "window";
  if (t === "IFCFURNITURE" || t === "IFCFURNISHINGELEMENT" || t === "IFCSYSTEMFURNITUREELEMENT") return "furniture";
  if (t === "IFCSANITARYTERMINAL") return "sanitary";
  if (t === "IFCSPACE") return "space";
  if (t.startsWith("IFCFLOW") || t.includes("APPLIANCE") || t === "IFCBUILDINGELEMENTPROXY" || t.includes("TERMINAL")) return "equipment";
  return "other";
}

class ChunkBuilder {
  positions: Float32Array[] = [];
  normals: Float32Array[] = [];
  colors: Float32Array[] = [];
  uvs: Float32Array[] = [];
  indices: Uint32Array[] = [];
  ranges: GeometryChunk["ranges"] = [];
  vertexCount = 0;
  triangleCount = 0;

  add(expressId: number, p: Float32Array, n: Float32Array, c: Float32Array, uv: Float32Array, idx: Uint32Array) {
    const shifted = new Uint32Array(idx.length);
    for (let i = 0; i < idx.length; i++) shifted[i] = idx[i] + this.vertexCount;
    const last = this.ranges[this.ranges.length - 1];
    if (last && last.expressId === expressId && last.start + last.count === this.triangleCount) {
      last.count += idx.length / 3;
    } else {
      this.ranges.push({ expressId, start: this.triangleCount, count: idx.length / 3 });
    }
    this.positions.push(p);
    this.normals.push(n);
    this.colors.push(c);
    this.uvs.push(uv);
    this.indices.push(shifted);
    this.vertexCount += p.length / 3;
    this.triangleCount += idx.length / 3;
  }

  build(category: GeometryCategory): GeometryChunk {
    const join = <T extends Float32Array | Uint32Array>(parts: T[], make: (n: number) => T): T => {
      const out = make(parts.reduce((sum, part) => sum + part.length, 0));
      let offset = 0;
      for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
      }
      return out;
    };
    return {
      category,
      positions: join(this.positions, (n) => new Float32Array(n)),
      normals: join(this.normals, (n) => new Float32Array(n)),
      colors: join(this.colors, (n) => new Float32Array(n)),
      uvs: join(this.uvs, (n) => new Float32Array(n)),
      indices: join(this.indices, (n) => new Uint32Array(n)),
      ranges: this.ranges,
    };
  }
}

function emptyBox(): Box3 {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
}

function grow(box: Box3, x: number, y: number, z: number) {
  if (x < box.min[0]) box.min[0] = x;
  if (y < box.min[1]) box.min[1] = y;
  if (z < box.min[2]) box.min[2] = z;
  if (x > box.max[0]) box.max[0] = x;
  if (y > box.max[1]) box.max[1] = y;
  if (z > box.max[2]) box.max[2] = z;
}

async function propertySets(
  api: WebIFC.IfcAPI,
  modelID: number,
  expressId: number,
): Promise<Record<string, Record<string, unknown>>> {
  const out: Record<string, Record<string, unknown>> = {};
  const collect = (sets: Record<string, unknown>[]) => {
    for (const set of sets) {
      const name = str(set.Name);
      if (!name) continue;
      const target = (out[name] ??= {});
      const props = (set.HasProperties ?? set.Quantities ?? []) as Record<string, unknown>[];
      for (const prop of props) {
        const key = str(prop.Name);
        if (!key || key in target) continue;
        target[key] =
          val(prop.NominalValue) ??
          val(prop.AreaValue) ??
          val(prop.LengthValue) ??
          val(prop.VolumeValue) ??
          val(prop.CountValue);
      }
    }
  };
  collect((await api.properties.getPropertySets(modelID, expressId, true)) as Record<string, unknown>[]);
  // Type-level property sets fill in what the occurrence does not state.
  const types = (await api.properties.getTypeProperties(modelID, expressId, true)) as Record<string, unknown>[];
  for (const type of types) collect((type.HasPropertySets ?? []) as Record<string, unknown>[]);
  return out;
}

export async function readStandardModel(
  api: WebIFC.IfcAPI,
  bytes: Uint8Array,
  onProgress?: Progress,
): Promise<StandardModel> {
  const modelID = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true, CIRCLE_SEGMENTS: 16 });
  if (modelID < 0) {
    throw new StandardIfcError("OPEN_FAILED", "تعذر فتح الملف كنموذج IFC.");
  }
  try {
    const schema = api.GetModelSchema(modelID);
    const records = api.GetAllLines(modelID).size();
    onProgress?.(0.15, `${schema} • ${records} سجلًا`);
    const units = readUnits(api, modelID);

    // ---- geometry: every product with a body, plus spaces ----
    const builders = new Map<GeometryCategory, ChunkBuilder>();
    const boxes = new Map<number, Box3>();
    const floorArea = new Map<number, number>();
    const footprints = new Map<number, number[]>();
    const productType = new Map<number, string>();
    const sceneBox = emptyBox();
    let triangles = 0;

    const typeName = (expressId: number) => {
      let name = productType.get(expressId);
      if (!name) {
        name = api.GetNameFromTypeCode(api.GetLineType(modelID, expressId));
        productType.set(expressId, name);
      }
      return name;
    };

    const onMesh = (mesh: WebIFC.FlatMesh) => {
      const expressId = mesh.expressID;
      const ifcType = typeName(expressId);
      const line = api.GetLine(modelID, expressId) as Record<string, unknown>;
      const category = categoryFor(ifcType, str(line.PredefinedType));
      const builder = builders.get(category) ?? new ChunkBuilder();
      builders.set(category, builder);
      const box = boxes.get(expressId) ?? emptyBox();
      let downArea = 0;
      for (let g = 0; g < mesh.geometries.size(); g++) {
        const placed = mesh.geometries.get(g);
        const geometry = api.GetGeometry(modelID, placed.geometryExpressID);
        const raw = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
        const idx = api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());
        const m = placed.flatTransformation;
        const count = raw.length / 6;
        const p = new Float32Array(count * 3);
        const n = new Float32Array(count * 3);
        const uv = new Float32Array(count * 2);
        const c = new Float32Array(count * 3);
        const { x: cr, y: cg, z: cb } = placed.color;
        for (let v = 0; v < count; v++) {
          c[v * 3] = cr; c[v * 3 + 1] = cg; c[v * 3 + 2] = cb;
        }
        for (let v = 0; v < count; v++) {
          const x = raw[v * 6], y = raw[v * 6 + 1], z = raw[v * 6 + 2];
          const nx = raw[v * 6 + 3], ny = raw[v * 6 + 4], nz = raw[v * 6 + 5];
          const px = m[0] * x + m[4] * y + m[8] * z + m[12];
          const py = m[1] * x + m[5] * y + m[9] * z + m[13];
          const pz = m[2] * x + m[6] * y + m[10] * z + m[14];
          let tx = m[0] * nx + m[4] * ny + m[8] * nz;
          let ty = m[1] * nx + m[5] * ny + m[9] * nz;
          let tz = m[2] * nx + m[6] * ny + m[10] * nz;
          const len = Math.hypot(tx, ty, tz) || 1;
          tx /= len; ty /= len; tz /= len;
          p[v * 3] = px; p[v * 3 + 1] = py; p[v * 3 + 2] = pz;
          n[v * 3] = tx; n[v * 3 + 1] = ty; n[v * 3 + 2] = tz;
          const ax = Math.abs(tx), ay = Math.abs(ty), az = Math.abs(tz);
          if (ay >= ax && ay >= az) { uv[v * 2] = px; uv[v * 2 + 1] = pz; }
          else if (ax >= az) { uv[v * 2] = pz; uv[v * 2 + 1] = py; }
          else { uv[v * 2] = px; uv[v * 2 + 1] = py; }
          grow(box, px, py, pz);
        }
        if (category === "space") {
          for (let t = 0; t < idx.length; t += 3) {
            const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
            const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
            const wx = p[c] - p[a], wy = p[c + 1] - p[a + 1], wz = p[c + 2] - p[a + 2];
            const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
            const area2 = Math.hypot(cx, cy, cz);
            if (area2 > 0 && cy / area2 < -0.9) {
              downArea += area2 / 2;
              const fp = footprints.get(expressId) ?? [];
              fp.push(p[a], p[a + 2], p[b], p[b + 2], p[c], p[c + 2]);
              footprints.set(expressId, fp);
            }
          }
        }
        builder.add(expressId, p, n, c, uv, new Uint32Array(idx));
        triangles += idx.length / 3;
        geometry.delete();
      }
      boxes.set(expressId, box);
      if (category !== "space") {
        grow(sceneBox, box.min[0], box.min[1], box.min[2]);
        grow(sceneBox, box.max[0], box.max[1], box.max[2]);
      }
      if (downArea > 0) floorArea.set(expressId, downArea);
    };

    api.StreamAllMeshes(modelID, onMesh);
    onProgress?.(0.55, `${triangles} مثلثًا من هندسة الملف`);
    api.StreamAllMeshesWithTypes(modelID, [WebIFC.IFCSPACE], onMesh);
    onProgress?.(0.7, `هندسة ${boxes.size} عنصرًا`);

    // ---- relationships ----
    const container = new Map<number, number>();
    for (const rel of ids(api.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE))) {
      const line = api.GetLine(modelID, rel) as Record<string, unknown>;
      const structure = num(line.RelatingStructure);
      for (const element of (line.RelatedElements ?? []) as unknown[]) {
        const id = num(element);
        if (id !== undefined && structure !== undefined) container.set(id, structure);
      }
    }
    for (const rel of ids(api.GetLineIDsWithType(modelID, WebIFC.IFCRELAGGREGATES))) {
      const line = api.GetLine(modelID, rel) as Record<string, unknown>;
      const parent = num(line.RelatingObject);
      for (const part of (line.RelatedObjects ?? []) as unknown[]) {
        const id = num(part);
        if (id !== undefined && parent !== undefined && !container.has(id)) container.set(id, parent);
      }
    }

    const product = (expressId: number): StandardProduct => {
      const line = api.GetLine(modelID, expressId) as Record<string, unknown>;
      return {
        expressId,
        globalId: str(line.GlobalId) ?? "",
        ifcType: typeName(expressId),
        name: str(line.Name),
        predefinedType: str(line.PredefinedType),
        containerId: container.get(expressId),
        bbox: boxes.get(expressId),
      };
    };

    const projectId = ids(api.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT))[0];
    const storeys = ids(api.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY)).map(product);

    const spaces: StandardSpace[] = [];
    for (const expressId of ids(api.GetLineIDsWithType(modelID, WebIFC.IFCSPACE))) {
      const line = api.GetLine(modelID, expressId) as Record<string, unknown>;
      const base = product(expressId);
      const longName = str(line.LongName);
      const objectType = str(line.ObjectType);
      const role = classifySpace(longName, base.name, objectType);
      const sets = await propertySets(api, modelID, expressId);
      const qtoArea = num(sets.Qto_SpaceBaseQuantities?.NetFloorArea);
      const geometryArea = floorArea.get(expressId);
      spaces.push({
        ...base,
        longName,
        objectType,
        role: role?.role,
        roleMatchedOn: role?.matchedOn,
        footprint: footprints.get(expressId),
        netFloorArea:
          qtoArea !== undefined ? qtoArea * units.area : geometryArea,
        areaSource:
          qtoArea !== undefined ? "Qto_SpaceBaseQuantities" : geometryArea !== undefined ? "geometry" : undefined,
      });
    }

    const doors: StandardDoor[] = [];
    for (const expressId of ids(api.GetLineIDsWithType(modelID, WebIFC.IFCDOOR, true))) {
      const line = api.GetLine(modelID, expressId) as Record<string, unknown>;
      const base = product(expressId);
      const sets = await propertySets(api, modelID, expressId);
      const common = sets.Pset_DoorCommon ?? {};
      const attrWidth = num(line.OverallWidth);
      const box = base.bbox;
      const geomWidth = box ? Math.max(box.max[0] - box.min[0], box.max[2] - box.min[2]) : undefined;
      doors.push({
        ...base,
        reference: typeof common.Reference === "string" ? common.Reference : undefined,
        width: attrWidth !== undefined ? attrWidth * units.length.toMetres : geomWidth,
        widthSource: attrWidth !== undefined ? "OverallWidth" : geomWidth !== undefined ? "geometry" : undefined,
        height: num(line.OverallHeight) !== undefined ? num(line.OverallHeight)! * units.length.toMetres : undefined,
        fireExit: typeof common.FireExit === "boolean" ? common.FireExit : undefined,
        isExternal: typeof common.IsExternal === "boolean" ? common.IsExternal : undefined,
      });
    }
    onProgress?.(0.9, `${spaces.length} مساحات و${doors.length} أبواب`);

    const products: StandardProduct[] = [];
    const typeCounts: Record<string, number> = {};
    const seen = new Set<number>();
    for (const expressId of [...boxes.keys(), ...storeys.map((s) => s.expressId)]) {
      if (seen.has(expressId)) continue;
      seen.add(expressId);
      const p = product(expressId);
      products.push(p);
      typeCounts[p.ifcType] = (typeCounts[p.ifcType] ?? 0) + 1;
    }

    const facts: StandardFacts = {
      schema,
      records,
      lengthUnit: units.length,
      project: projectId !== undefined ? product(projectId) : undefined,
      storeys,
      spaces,
      doors,
      products,
      typeCounts,
      ports: {
        count: api.GetLineIDsWithType(modelID, WebIFC.IFCDISTRIBUTIONPORT).size(),
        connected: api.GetLineIDsWithType(modelID, WebIFC.IFCRELCONNECTSPORTS).size(),
      },
    };
    const chunks = [...builders.entries()].map(([category, builder]) => builder.build(category));
    onProgress?.(1, `${products.length} عنصرًا بمعرّف دائم`);
    return { facts, geometry: { chunks, bbox: sceneBox, triangles } };
  } finally {
    api.CloseModel(modelID);
  }
}
