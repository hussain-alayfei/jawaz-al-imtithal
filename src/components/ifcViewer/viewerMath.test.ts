import { describe, expect, it } from "vitest";
import { elementAtFace } from "./picking";
import { solarPosition, sunVector } from "./sun";

describe("solar position", () => {
  it("puts the equinox noon sun over Riyadh at about 90° minus the latitude, due south", () => {
    // Local solar noon in Riyadh on 20 March: 12:00 - 4 min/° x 46.68° - EoT (about -7.5 min) = about 09:01 UTC.
    const { elevation, azimuth } = solarPosition(24.7136, 46.6753, new Date(Date.UTC(2026, 2, 20, 9, 1)));
    expect(elevation).toBeGreaterThan(64.3);
    expect(elevation).toBeLessThan(66.3);
    expect(Math.abs(azimuth - 180)).toBeLessThan(4);
  });

  it("has the morning sun in the east", () => {
    const { azimuth, elevation } = solarPosition(24.7136, 46.6753, new Date(Date.UTC(2026, 2, 20, 4, 0)));
    expect(elevation).toBeGreaterThan(5);
    expect(azimuth).toBeGreaterThan(80);
    expect(azimuth).toBeLessThan(115);
  });

  it("maps north to -z and east to +x", () => {
    const north = sunVector(0, 0);
    const east = sunVector(0, 90);
    expect(north[2]).toBeCloseTo(-1, 6);
    expect(east[0]).toBeCloseTo(1, 6);
  });
});

describe("picking", () => {
  const ranges = [
    { expressId: 10, start: 0, count: 4 },
    { expressId: 20, start: 4, count: 2 },
    { expressId: 30, start: 6, count: 10 },
  ];
  it.each([
    [0, 10],
    [3, 10],
    [4, 20],
    [5, 20],
    [15, 30],
  ])("face %i belongs to %i", (face, id) => {
    expect(elementAtFace(ranges, face)).toBe(id);
  });
  it("returns undefined past the end", () => {
    expect(elementAtFace(ranges, 16)).toBeUndefined();
  });
});
