import { describe, expect, it } from "vitest";
import type { ActivityId } from "../data";
import { getActivityRooms, getInteriorItems } from "./InteriorFitout3D";

const activities: ActivityId[] = ["restaurant", "cafe", "clinic", "salon"];

describe("interior fitout is contextual to the business", () => {
  for (const activity of activities) {
    it("has four non-overlapping semantic room keys and inspectable items for " + activity, () => {
      const rooms = getActivityRooms(activity);
      const items = getInteriorItems(activity, 0);
      expect(rooms).toHaveLength(4);
      expect(new Set(rooms.map(r => r.key)).size).toBe(4);
      expect(new Set(rooms.map(r => r.name)).size).toBe(4);
      expect(rooms.every(r => r.w > 0 && r.d > 0)).toBe(true);
      expect(items.length).toBeGreaterThanOrEqual(7);
      expect(new Set(items.map(i => i.id)).size).toBe(items.length);
      expect(items.every(i => rooms.some(r => r.key === i.room))).toBe(true);
      expect(items.every(i => i.position.every(Number.isFinite))).toBe(true);
    });
    it("keeps floor specific item IDs distinct", () => {
      const ground = getInteriorItems(activity, 0);
      const first = getInteriorItems(activity, 1);
      expect(ground.map(x => x.id).some(id => first.some(x => x.id === id))).toBe(false);
    });
  }
  it("varies equipment by activity", () => {
    expect(getInteriorItems("restaurant",0).some(x=>x.title.includes("الطبخ"))).toBe(true);
    expect(getInteriorItems("cafe",0).some(x=>x.title.includes("الإسبريسو"))).toBe(true);
    expect(getInteriorItems("clinic",0).some(x=>x.title.includes("الفحص"))).toBe(true);
    expect(getInteriorItems("salon",0).some(x=>x.title.includes("التصفيف"))).toBe(true);
  });
});
