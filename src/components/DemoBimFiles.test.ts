import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { DETAIL_LEVELS, getDetailPoint, getDetailPoints } from "./DetailedServiceNetwork3D";
const root = join(process.cwd(),"public","demo-bim");
interface Row { id:string;sceneId:string;floor:number;position:number[];system?:string; }
interface FileSpec { name:string;count:number;id:string;elements:Row[]; }
const manifest=JSON.parse(readFileSync(join(root,"manifest.json"),"utf8")) as {version:string;files:FileSpec[]};

describe("BIM demonstration corpus",()=>{
 it("ships all four IFC4 files with individually mapped elements",()=>{
   expect(manifest.version).toBe("MIYAR-DEMO-BIM-2");
   expect(manifest.files.map(f=>f.name)).toEqual(["Architectural.ifc","Structural.ifc","MEP.ifc","FireSafety.ifc"]);
   for(const file of manifest.files){
     const content=readFileSync(join(root,file.name),"utf8");
     expect(content).toContain("ISO-10303-21;");
     expect(content).toContain("FILE_SCHEMA(('IFC4'))");
     expect(content).toContain("Pset_MiyarDigitalTwinDemo");
     expect(content).toContain("END-ISO-10303-21;");
     expect(file.elements).toHaveLength(file.count);
     expect(new Set(file.elements.map(e=>e.id)).size).toBe(file.count);
     expect(new Set(file.elements.map(e=>e.floor))).toEqual(new Set([0,1,2,3,4]));
     for(const entry of file.elements){
       expect(content).toContain("'"+entry.sceneId+"'");
       expect(entry.position).toHaveLength(3);
       expect(entry.position.every(Number.isFinite)).toBe(true);
       if(entry.id.startsWith("M-")||entry.id.startsWith("F-")) {
         const node=getDetailPoint(entry.sceneId);
         expect(node?.floor).toBe(entry.floor);
         expect(node?.system).toBe(entry.system);
       }
     }
   }
 });
 it("creates 18 inspectable service elements on each of five floors",()=>{
   expect(DETAIL_LEVELS).toHaveLength(5);
   for(const floor of DETAIL_LEVELS){
     const points=getDetailPoints(floor);
     expect(points).toHaveLength(18);
     expect(new Set(points.map(x=>x.id)).size).toBe(points.length);
     for(const point of points)expect(getDetailPoint(point.id)).toEqual(point);
   }
 });
 it("ships valid basic mesh data in a self-contained glTF demo asset",()=>{
   const gltf=JSON.parse(readFileSync(join(root,"FurnitureDemo.gltf"),"utf8"));
   expect(gltf.asset.version).toBe("2.0");
   expect(gltf.scenes).toHaveLength(1);
   expect(gltf.meshes[0].primitives[0].attributes.POSITION).toBe(0);
   expect(gltf.buffers[0].uri).toMatch(/^data:application\/octet-stream;base64,/);
   expect(Buffer.from(gltf.buffers[0].uri.split(",")[1],"base64").length).toBe(gltf.buffers[0].byteLength);
 });
});
