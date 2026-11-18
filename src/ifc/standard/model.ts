/**
 * Data read from a standard IFC file (no Mowaem-specific property sets).
 *
 * Lengths are metres after unit conversion. Geometry is in the scene frame web-ifc
 * produces: x = east, y = up, z = -north, metres, with the model moved near the origin.
 */

export type SpaceRole = "DINING" | "KITCHEN" | "WC" | "STORAGE" | "SERVICE";

export interface Box3 {
  min: [number, number, number];
  max: [number, number, number];
}

export interface LengthUnitInfo {
  /** Text as declared in the file, e.g. "MILLI METRE". */
  declared: string;
  /** Multiply a file length by this to get metres. */
  toMetres: number;
}

export interface StandardProduct {
  expressId: number;
  globalId: string;
  /** IFC class name as web-ifc reports it, e.g. "IfcDoor". */
  ifcType: string;
  name?: string;
  /** expressId of the spatial element that contains it (storey or space). */
  containerId?: number;
  bbox?: Box3;
}

export interface StandardSpace extends StandardProduct {
  longName?: string;
  objectType?: string;
  role?: SpaceRole;
  /** The text the role was matched on, quoted back to the user. */
  roleMatchedOn?: string;
  netFloorArea?: number;
  areaSource?: "Qto_SpaceBaseQuantities" | "geometry";
}

export interface StandardDoor extends StandardProduct {
  reference?: string;
  width?: number;
  widthSource?: "OverallWidth" | "geometry";
  height?: number;
  fireExit?: boolean;
  isExternal?: boolean;
}

export interface StandardFacts {
  schema: string;
  records: number;
  lengthUnit: LengthUnitInfo;
  project?: StandardProduct;
  storeys: StandardProduct[];
  spaces: StandardSpace[];
  doors: StandardDoor[];
  /** Every product with geometry or a spatial role, for linking and counts. */
  products: StandardProduct[];
  typeCounts: Record<string, number>;
  /** IfcDistributionPort count and whether any port is connected to another. */
  ports: { count: number; connected: number };
}

/** Merged triangles of one display category, with a face-range table for picking. */
export interface GeometryChunk {
  category: GeometryCategory;
  positions: Float32Array;
  normals: Float32Array;
  /** Per-vertex RGB from the file's surface styles (IfcSurfaceStyle), linear 0..1. */
  colors: Float32Array;
  /** Box-projected UVs in metres, for tiling PBR textures at real size. */
  uvs: Float32Array;
  indices: Uint32Array;
  /** Sorted by `start`: triangles [start, start + count) in `indices` belong to `expressId`. */
  ranges: { expressId: number; start: number; count: number }[];
}

export type GeometryCategory =
  | "wall"
  | "floor"
  | "roof"
  | "door"
  | "window"
  | "furniture"
  | "sanitary"
  | "equipment"
  | "space"
  | "other";

export interface StandardGeometry {
  chunks: GeometryChunk[];
  bbox: Box3;
  triangles: number;
}

export interface StandardModel {
  facts: StandardFacts;
  geometry: StandardGeometry;
}
