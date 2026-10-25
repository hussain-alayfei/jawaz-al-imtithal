import { describe, it, expect } from "vitest";
import { VENUE_META, VENUE_SPOTS, getVenueSpot } from "./VenueScene3D";
describe("standalone premises",()=>{
  it("offers separate, one-storey cafe and restaurant with inspectable areas",()=>{
    expect(VENUE_META.cafe.title).toContain("مقهى");
    expect(VENUE_META.restaurant.title).toContain("مطعم");
    expect(VENUE_META.cafe.subtitle).toContain("أرضي");
    for(const kind of ["cafe","restaurant"] as const){
      const spots=VENUE_SPOTS[kind];
      expect(spots).toHaveLength(4);
      expect(new Set(spots.map(s=>s.id)).size).toBe(4);
      expect(new Set(spots.map(s=>s.area))).toEqual(new Set(["entrance","seating","counter","back"]));
      for(const spot of spots){
        expect(spot.id).toContain(kind);
        expect(getVenueSpot(spot.id)).toEqual(spot);
        expect(spot.position.every(Number.isFinite)).toBe(true);
      }
    }
    expect(getVenueSpot("VENUE-no-such-asset")).toBeUndefined();
  });
});
