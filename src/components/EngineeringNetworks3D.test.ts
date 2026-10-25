import { describe, expect, it } from "vitest";
import {
  SERVICE_KEYS,
  SERVICE_META,
  SERVICE_NETWORKS,
  findServiceNode,
} from "./EngineeringNetworks3D";

describe("illustrative engineering networks", () => {
  it("exposes every building services discipline with clear Arabic labels", () => {
    expect(SERVICE_KEYS).toHaveLength(6);
    for (const system of SERVICE_KEYS) {
      expect(SERVICE_META[system].label.length).toBeGreaterThan(3);
      expect(SERVICE_META[system].description.length).toBeGreaterThan(10);
    }
  });

  it("keeps unique and inspectable equipment identifiers", () => {
    const ids = SERVICE_KEYS.flatMap(key => SERVICE_NETWORKS[key].nodes.map(node => node.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const key of SERVICE_KEYS) {
      expect(SERVICE_NETWORKS[key].nodes.length).toBeGreaterThan(1);
      for (const node of SERVICE_NETWORKS[key].nodes) {
        expect(node.id).toMatch(/^DEMO-/);
        expect(node.system).toBe(key);
        expect(findServiceNode(node.id)).toEqual(node);
        expect(node.position.every(Number.isFinite)).toBe(true);
        expect(node.size.every(value => Number.isFinite(value) && value > 0)).toBe(true);
      }
    }
    expect(findServiceNode("IFC-NOT-REAL")).toBeUndefined();
    expect(findServiceNode(null)).toBeUndefined();
  });

  it("has non-degenerate finite segments for every utility run", () => {
    for (const key of SERVICE_KEYS) {
      const paths = SERVICE_NETWORKS[key].paths;
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) {
        expect(path.radius).toBeGreaterThan(0);
        expect(path.points.length).toBeGreaterThanOrEqual(2);
        for (const point of path.points) {
          expect(point).toHaveLength(3);
          expect(point.every(Number.isFinite)).toBe(true);
        }
        const segmentLengths = path.points.slice(1).map((point, index) =>
          Math.hypot(...point.map((n, axis) => n - path.points[index][axis])),
        );
        expect(segmentLengths.some(length => length > 0.01)).toBe(true);
      }
    }
  });
});
