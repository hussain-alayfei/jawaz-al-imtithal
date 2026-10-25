import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SERVICE_KEYS } from "./EngineeringNetworks3D";
import { VENUE_DISCIPLINES, getVenueElement, getVenueEngineeringElements, getVenueMetrics } from "./VenueEngineeringData";
import type { VenueKind } from "./VenueScene3D";

describe("venue-specific BIM engineering packs",()=>{
 for(const kind of ["cafe","restaurant"] as VenueKind[]){
  it(kind+" ships separate IFC4 and glTF files with fully mapped semantic elements",()=>{
   const dir=join(process.cwd(),"public","demo-bim","venues",kind);
   const manifest=JSON.parse(readFileSync(join(dir,"manifest.json"),"utf8"));
   const expected=getVenueEngineeringElements(kind);
   expect(manifest.version).toBe("MIYAR-VENUES-1");
   expect(manifest.kind).toBe(kind);
   expect(manifest.files).toHaveLength(4);
   expect(manifest.files.map((f:{name:string})=>f.name))
    .toEqual(["Architectural.ifc","Structural.ifc","MEP.ifc","FireSafety.ifc"]);
   expect(manifest.files.map((f:{count:number})=>f.count)).toEqual([4,6,15,3]);
   expect(expected).toHaveLength(28);
   expect(new Set(expected.map(x=>x.sceneId)).size).toBe(28);
   for(const file of manifest.files){
    const discipline=VENUE_DISCIPLINES.find(d=>d.id===file.id);
    expect(discipline).toBeDefined();
    const contents=readFileSync(join(dir,file.name),"utf8");
    expect(contents).toContain("ISO-10303-21;");
    expect(contents).toContain("FILE_SCHEMA(('IFC4'))");
    expect(contents).toContain("Pset_MiyarDigitalTwinDemo");
    expect(contents).toContain("END-ISO-10303-21;");
    expect(file.elements).toHaveLength(file.count);
    for(const item of file.elements){
      const mapped=getVenueElement(kind,item.sceneId);
      expect(mapped).toBeDefined();
      expect(mapped?.position).toEqual(item.position);
      expect(mapped?.system).toEqual(item.system);
      expect(mapped?.discipline).toEqual(item.discipline);
      expect(contents).toContain("'"+item.sceneId+"'");
    }
   }
   const asset=JSON.parse(readFileSync(join(dir,"FurnitureDemo.gltf"),"utf8"));
   expect(asset.asset.version).toBe("2.0");
   expect(asset.meshes.length).toBeGreaterThan(0);
   expect(asset.buffers[0].uri).toMatch(/^data:application\/octet-stream;base64,/);
  });
  it(kind+" publishes transparent engineering caveats, no invented compliance",()=>{
    const metrics=getVenueMetrics(kind);
    expect(metrics.total).toBe(28);
    expect(metrics.structural).toBe(6);
    expect(metrics.networkPoints).toBe(18);
    expect(metrics.bySystem.map(x=>x.system)).toEqual(SERVICE_KEYS);
    for(const x of metrics.bySystem){
      expect(x.count).toBe(3);
      expect(x.risk.length).toBeGreaterThan(15);
      expect(x.spec.length).toBeGreaterThan(12);
    }
  });
 }
});
