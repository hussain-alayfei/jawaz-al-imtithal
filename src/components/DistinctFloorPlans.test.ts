import { describe, expect, it } from "vitest";
import type { ActivityId } from "../data";
import {getActivityRooms,getInteriorItems,getFloorTitle} from "./InteriorFitout3D";
const types:ActivityId[]=["restaurant","cafe","clinic","salon"];
describe("different operational purposes per floor",()=>{
 for(const activity of types){
  it(activity+" has five distinct functional floors with well defined rooms and furniture",()=>{
   const titles=[0,1,2,3,4].map(level=>getFloorTitle(activity,level));
   expect(new Set(titles).size).toBe(5);
   const rooms=[0,1,2,3,4].map(level=>getActivityRooms(activity,level));
   expect(new Set(rooms.flatMap(items=>items.map(x=>x.name))).size).toBeGreaterThanOrEqual(14);
   for(let f=0;f<5;f++){
    expect(rooms[f]).toHaveLength(4);
    expect(getInteriorItems(activity,f).length).toBeGreaterThanOrEqual(4);
    for(const item of getInteriorItems(activity,f)){
     expect(rooms[f].some(room=>room.key===item.room)).toBe(true);
     expect(item.position[1]).toBeCloseTo(f*3.4+.8);
     expect(item.title).toBeTruthy();
    }
   }
  });
 }
 it("puts restaurant entrance, dining, kitchen, private hospitality and operations on separate storeys",()=>{
  expect(getFloorTitle("restaurant",0)).toContain("استقبال");
  expect(getFloorTitle("restaurant",1)).toContain("صالة");
  expect(getFloorTitle("restaurant",2)).toContain("المطبخ");
  expect(getFloorTitle("restaurant",3)).toContain("ضيافة");
  expect(getFloorTitle("restaurant",4)).toContain("إدارة");
  expect(getInteriorItems("restaurant",2).some(item=>item.title==="خط الطبخ")).toBe(true);
  expect(getInteriorItems("restaurant",0).some(item=>item.title==="خط الطبخ")).toBe(false);
 });
});
