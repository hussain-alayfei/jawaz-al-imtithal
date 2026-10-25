import { Html } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { SERVICE_KEYS, SERVICE_META, type ServiceVisibility, type ServiceKey } from "./EngineeringNetworks3D";
import { getVenueEngineeringElements, VENUE_SERVICE_POSITIONS } from "./VenueEngineeringData";
import type { VenueKind } from "./VenueScene3D";

type Vec3=[number,number,number];
function Conduit({pts,color,radius=.048}:{pts:Vec3[];color:string;radius?:number}){
 const curve=useMemo(()=>new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p))),[pts]);
 return <mesh><tubeGeometry args={[curve,Math.max(20,pts.length*12),radius,8,false]}/>
   <meshStandardMaterial color={color} metalness={.38} roughness={.37} emissive={color} emissiveIntensity={.16}/></mesh>;
}
function Unit({p,s,color,metal=.3}:{p:Vec3;s:Vec3;color:string;metal?:number}){
 return <mesh position={p} castShadow><boxGeometry args={s}/><meshStandardMaterial color={color} metalness={metal} roughness={.45}/></mesh>;
}
const route=(system:ServiceKey):Vec3[]=>{
 const positions=VENUE_SERVICE_POSITIONS[system];
 const first=positions[0],last=positions[2];
 switch(system){
  case "electricity":return [[-6.7,3.42,4.5],[-6.7,3.42,-4.5],[6,3.42,-4.5],[6,3.42,3.5]];
  case "water":return [[-5.6,.42,-4.9],[-3.5,.42,-4.9],[-3.5,.85,.7],[3,.85,.7],[3,.85,-4.4],[5.2,.85,-4.4]];
  case "drainage":return [[-3.7,.21,.7],[-3.7,.21,-4.6],[5.25,.21,-4.6]];
  case "hvac":return [[-5.7,3.62,-.3],[5.65,3.62,-.3],[5.65,3.62,-3.3]];
  case "fire":return [[-6.15,3.72,1.65],[4.8,3.72,1.65],[4.8,3.72,-3.2]];
  case "grounding":return [[first[0],.14,first[2]],[-5.7,.14,-4.7],[last[0],.14,-4.7],[last[0],.14,last[2]]];
 }
};
export function VenueServiceNetwork3D({kind,visible,selected,onSelect}:{
 kind:VenueKind;visible:ServiceVisibility;selected:string|null;onSelect:(id:string)=>void;
}){
 const elements=getVenueEngineeringElements(kind);
 return <group name={"engineering-networks-"+kind}>
 {SERVICE_KEYS.filter(key=>visible[key]).map(system=>{
  const color=SERVICE_META[system].color;
  const nodes=elements.filter(x=>x.system===system);
  const diameter=system==="drainage"?.105:system==="hvac"?.13:system==="fire"?.07:.05;
  return <group key={system} name={"service-"+system}>
   <Conduit pts={route(system)} color={color} radius={diameter}/>
   {system==="electricity"&&<>
      <Unit p={[0,3.47,4.5]} s={[12,.075,.47]} color="#6e7773"/>
      {[-.15,0,.15].map((offset,i)=><Conduit key={i} pts={[[-5.8,3.54,4.5+offset],[4.8,3.54,4.5+offset]]}
        color={["#da9b42","#6088ac","#ae6c48"][i]} radius={.024}/>)}
   </>}
   {system==="hvac"&&<>
      <Unit p={[-.7,3.63,-.3]} s={[10.4,.37,.7]} color="#c7d1cd" metal={.7}/>
      <Unit p={[4,3.63,-2.3]} s={[.65,.38,3.3]} color="#bdc7c3" metal={.6}/>
   </>}
   {nodes.map(node=><group key={node.sceneId}>
    {system==="fire"&&<group>
      <Conduit pts={[[node.position[0],3.7,node.position[2]],[node.position[0],3.25,node.position[2]]]} color={color} radius={.04}/>
      <mesh position={[node.position[0],3.2,node.position[2]]}>
        <torusGeometry args={[.19,.028,8,16]}/><meshStandardMaterial color="#e8c9b8"/>
      </mesh>
    </group>}
    {system==="electricity"&&<Unit p={[node.position[0],1.25,node.position[2]]} s={[.42,.7,.19]} color="#e2e5de"/>}
    {system==="water"&&<Unit p={node.position} s={[.25,.24,.28]} color="#9fc4d3" metal={.5}/>}
    {system==="drainage"&&<Unit p={node.position} s={[.38,.09,.35]} color="#9998a6" metal={.45}/>}
    {system==="hvac"&&<Unit p={[node.position[0],3.25,node.position[2]]} s={[.83,.08,.58]} color="#cbd3d1" metal={.64}/>}
    <mesh position={node.position} onClick={e=>{e.stopPropagation();onSelect(node.sceneId);}}
      onPointerOver={e=>{e.stopPropagation();document.body.style.cursor="pointer";}}
      onPointerOut={()=>{document.body.style.cursor="default";}}>
      <sphereGeometry args={[selected===node.sceneId?.27:.17,12,12]}/>
      <meshStandardMaterial color={selected===node.sceneId?"#fff2bf":color}
        emissive={color} emissiveIntensity={selected===node.sceneId?.6:.2}/>
    </mesh>
    {selected===node.sceneId&&<Html center position={[node.position[0],node.position[1]+.64,node.position[2]]} distanceFactor={14}>
      <div className="venue-world-inspector" dir="rtl">
       <strong>{node.label}</strong><small>{node.review}</small>
      </div>
    </Html>}
   </group>)}
  </group>;
 })}
 {elements.filter(x=>x.discipline==="structural").map(node=>
    <mesh key={node.sceneId} position={node.position}
      onClick={e=>{e.stopPropagation();onSelect(node.sceneId);}}>
      <sphereGeometry args={[selected===node.sceneId?.34:.105,10,10]}/>
      <meshStandardMaterial transparent opacity={selected===node.sceneId?1:.11}
       color="#dcba68" emissive="#d1b676" emissiveIntensity={.3}/>
    </mesh>)}
 </group>;
}
