import { Html, OrbitControls, ContactShadows } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { VenueServiceNetwork3D } from "./VenueServiceNetwork3D";
import { getVenueElement } from "./VenueEngineeringData";

import type { ServiceVisibility } from "./EngineeringNetworks3D";

export type VenueKind = "cafe" | "restaurant";
export type VenueArea = "all" | "entrance" | "seating" | "counter" | "back";
export type VenueCameraPreset = "iso" | "top" | "front" | "inside";
type Vec3=[number,number,number];
export interface VenueSpot { id:string;area:Exclude<VenueArea,"all">;title:string;description:string;position:Vec3 }
export const VENUE_META:Record<VenueKind,{title:string;tag:string;subtitle:string;areas:Record<Exclude<VenueArea,"all">,string>}> = {
  cafe:{
    title:"مقهى مِعيار",tag:"COFFEE HOUSE",subtitle:"مقهى مستقل بطابق أرضي، تحضير قهوة وجلسات داخلية وخارجية",
    areas:{entrance:"المدخل والاستقبال",seating:"الجلسات الداخلية",counter:"بار القهوة والطلبات",back:"الغسيل والمخزن"}
  },
  restaurant:{
    title:"مطعم مِعيار",tag:"RESTAURANT",subtitle:"مطعم مستقل بطابق أرضي، صالة ضيوف ومطبخ خلفي مجهز",
    areas:{entrance:"المدخل والانتظار",seating:"صالة الطعام",counter:"الاستقبال والدفع",back:"المطبخ والتجهيز"}
  }
};
export const VENUE_SPOTS:Record<VenueKind,VenueSpot[]>={
  cafe:[
    {id:"VENUE-cafe-entrance",area:"entrance",title:"مدخل المقهى",description:"بوابة زجاجية، ممر دخول خالٍ من العوائق ولوحة أوقات العمل (افتراضية).",position:[-4,1.4,6]},
    {id:"VENUE-cafe-seating",area:"seating",title:"جلسات المقهى",description:"طاولات قهوة وكراسٍ وممرات حركة مع جلسات خارجية مظللة.",position:[3.3,1.3,2.3]},
    {id:"VENUE-cafe-counter",area:"counter",title:"كاونتر القهوة",description:"كاونتر الطلبات وآلة الإسبريسو ومكان الاستلام، بمعدات تجريبية.",position:[-4.3,1.4,2.8]},
    {id:"VENUE-cafe-back",area:"back",title:"التحضير والغسيل",description:"مساحة تحضير خلفية، مغسلة وحوض وثلاجات ومخزن.",position:[3.3,1.3,-2.8]}
  ],
  restaurant:[
    {id:"VENUE-restaurant-entrance",area:"entrance",title:"الاستقبال",description:"مدخل مطعم واضح وجلسة انتظار وموقع المضيف.",position:[-4.3,1.3,5.7]},
    {id:"VENUE-restaurant-seating",area:"seating",title:"صالة الطعام",description:"طاولات طعام منظمة، ممرات خدمة وجلسات بجوار النوافذ.",position:[3.3,1.4,2.5]},
    {id:"VENUE-restaurant-counter",area:"counter",title:"الطلبات والدفع",description:"مكتب المضيف ونقطة الدفع والاستلام بجوار المدخل.",position:[-4.3,1.3,2.3]},
    {id:"VENUE-restaurant-back",area:"back",title:"المطبخ المفتوح للخدمة",description:"خط طبخ مهني مع شفاط، تحضير، تبريد، غسيل ومخرج خلفي.",position:[3.5,1.4,-2.9]}
  ]
};
export function getVenueSpot(id:string|null):VenueSpot|undefined {
 return (Object.keys(VENUE_SPOTS) as VenueKind[]).flatMap(k=>VENUE_SPOTS[k]).find(s=>s.id===id);
}
function B({p,s,c,metal=0,opacity=1}: {p:Vec3;s:Vec3;c:string;metal?:number;opacity?:number}){
 return <mesh position={p} castShadow={opacity>.7} receiveShadow>
   <boxGeometry args={s}/><meshStandardMaterial color={c} metalness={metal} roughness={metal?.35:.68}
    transparent={opacity<1} opacity={opacity} depthWrite={opacity>=1}/>
 </mesh>;
}
function Cylinder({p,h,r,c}: {p:Vec3;h:number;r:number;c:string}){
 return <mesh position={p} castShadow><cylinderGeometry args={[r,r*.9,h,14]}/><meshStandardMaterial color={c} roughness={.67}/></mesh>;
}
function Tree({x,z,s=1}: {x:number;z:number;s?:number}) {
 return <group position={[x,0,z]} scale={s}>
   <Cylinder p={[0,.95,0]} h={1.9} r={.13} c="#776c58"/>
   {[[0,2.12,0],[.47,1.94,.13],[-.38,1.92,-.14],[0,2.55,.2]].map(([x,y,z],i)=><mesh key={i} position={[x,y,z]} castShadow>
     <icosahedronGeometry args={[.8,i%2?1:2]}/><meshStandardMaterial color={["#4c795f","#598b66","#668f6a","#46715a"][i]} roughness={.87}/>
   </mesh>)}
   <Cylinder p={[0,.12,0]} h={.24} r={.71} c="#d4c5ae"/>
 </group>;
}
function PatioSet({x,z,color}: {x:number;z:number;color:string}){
 return <group position={[x,0,z]}>
   <Cylinder p={[0,.74,0]} h={.065} r={.56} c="#c3a88b"/>
   <Cylinder p={[0,.36,0]} h={.72} r={.055} c="#555a55"/>
   {[-.9,.9].map(dx=><group key={dx} position={[dx,0,0]}>
      <B p={[0,.47,0]} s={[.59,.14,.62]} c={color}/>
      <B p={[dx<0?-.22:.22,.89,0]} s={[.14,.74,.62]} c={color}/>
      <Cylinder p={[0,.22,0]} h={.43} r={.035} c="#505753"/>
   </group>)}
 </group>;
}
function Car({x,z,c,rotate=0}: {x:number;z:number;c:string;rotate?:number}){
 return <group position={[x,.21,z]} rotation={[0,rotate,0]}>
   <B p={[0,.38,0]} s={[1.92,.61,3.48]} c={c} metal={.4}/>
   <B p={[0,.87,-.16]} s={[1.64,.5,1.72]} c={c} metal={.35}/>
   <B p={[0,.9,.69]} s={[1.45,.34,.045]} c="#526e73" metal={.22} opacity={.93}/>
   <B p={[0,.88,-1.02]} s={[1.43,.35,.045]} c="#536e73" metal={.22}/>
   {[-.83,.83].flatMap(dx=>[-1.1,1.1].map(dz=><mesh key={dx+":"+dz} position={[dx,.21,dz]} rotation={[0,0,Math.PI/2]}>
    <cylinderGeometry args={[.32,.32,.15,12]}/><meshStandardMaterial color="#343b3c"/>
   </mesh>))}
   <B p={[0,.4,1.77]} s={[1.2,.14,.06]} c="#b5b7ae"/>
 </group>;
}
function Lamp({x,z}: {x:number;z:number}){
 return <group position={[x,0,z]}>
   <Cylinder p={[0,2.28,0]} h={4.56} r={.066} c="#505b57"/>
   <B p={[.38,4.49,0]} s={[.8,.075,.09]} c="#505b57"/>
   <B p={[.76,4.37,0]} s={[.65,.16,.5]} c="#f9e6b7"/>
 </group>;
}
function Outdoor({kind}:{kind:VenueKind}) {
 const cafe=kind==="cafe";
 return <group name="outdoor-surroundings">
   <B p={[0,-.32,0]} s={[68,.5,60]} c="#b4c1ac"/>
   <B p={[0,-.08,15.7]} s={[68,.08,11.2]} c="#646d71"/>
   <B p={[0,-.035,9.65]} s={[68,.18,1.85]} c="#d3d1c7"/>
   <B p={[0,-.023,8.63]} s={[68,.085,.24]} c="#959c91"/>
   {[-19,-9,1,11,21].map(x=><B key={x} p={[x,-.023,16.0]} s={[3.1,.012,.17]} c="#eae5d5"/>)}
   {[-13.6,-3.8,6.0,15.8].map((x,i)=><B key={i} p={[x,-.026,11.55]} s={[.09,.025,4.2]} c="#e1e2dd"/>)}
   <B p={[0,-.07,-13.25]} s={[36,.12,4.2]} c="#a5b1a3"/>
   <B p={[-16.5,1.15,-8.5]} s={[.28,2.3,15.5]} c="#e2e2d5"/>
   <B p={[16.5,1.15,-8.5]} s={[.28,2.3,15.5]} c="#e2e2d5"/>
   <B p={[0,1.15,-15.5]} s={[33,2.3,.25]} c="#c9d1c6"/>
   {[-13.2,13.2].flatMap(x=>[-10.8,7.4].map(z=><Tree key={x+":"+z} x={x} z={z} s={.84}/>))}
   <Tree x={-22} z={7.2} s={1.1}/><Tree x={22} z={7.2} s={1.12}/>
   <Lamp x={-14.4} z={9.7}/><Lamp x={14.4} z={9.7}/>
   <Car x={-10.2} z={14.2} c="#657f85" rotate={Math.PI*.02}/>
   <Car x={9.4} z={14.1} c="#d0d6d2" rotate={-.07}/>
   {cafe&&<>
     <B p={[-12.0,0,4.0]} s={[5.4,.16,6.9]} c="#bcae9d"/>
     <PatioSet x={-12.3} z={2.5} color="#63786d"/>
     <PatioSet x={-12.3} z={5.3} color="#63786d"/>
     <Cylinder p={[-12.3,1.65,4.0]} h={3.3} r={.11} c="#81705c"/>
     <mesh position={[-12.3,3.26,4.0]} rotation={[0,Math.PI/2,0]}>
       <coneGeometry args={[3.18,.8,6]}/><meshStandardMaterial color="#d3bb98" side={THREE.DoubleSide}/>
     </mesh>
   </>}
   {!cafe&&<><B p={[-11.8,0,3.7]} s={[4.8,.15,6.2]} c="#cfc0aa"/>
    <PatioSet x={-11.8} z={3.7} color="#a78c75"/>
   </>}
 </group>;
}
function VenueChair({x,z,angle=0,color="#6f8275"}:{x:number;z:number;angle?:number;color?:string}){
 return <group position={[x,0,z]} rotation={[0,angle,0]}>
   <B p={[0,.55,0]} s={[.58,.15,.56]} c={color}/>
   <B p={[0,1.0,-.24]} s={[.59,.88,.14]} c={color}/>
   {[-.22,.22].flatMap(x=>[-.19,.19].map(z=><Cylinder key={x+":"+z} p={[x,.29,z]} h={.53} r={.021} c="#454d48"/>))}
 </group>;
}
function VenueDiningTable({x,z,style="restaurant"}:{x:number;z:number;style?:"cafe"|"restaurant"}){
 const cafe=style==="cafe";
 return <group position={[x,0,z]}>
   {cafe?<Cylinder p={[0,.75,0]} h={.095} r={.57} c="#ad916c"/>:
    <B p={[0,.75,0]} s={[1.38,.1,.95]} c="#a47f5e"/>}
   <Cylinder p={[0,.37,0]} h={.72} r={.065} c="#565b54"/>
   <B p={[0,.045,0]} s={[.51,.07,.42]} c="#565b54"/>
   <VenueChair x={0} z={-1.0} color={cafe?"#859083":"#8e8170"}/>
   <VenueChair x={0} z={1.0} angle={Math.PI} color={cafe?"#859083":"#8e8170"}/>
   {!cafe&&<>
     <VenueChair x={-.98} z={0} angle={Math.PI/2} color="#8e8170"/>
     <VenueChair x={.98} z={0} angle={-Math.PI/2} color="#8e8170"/>
   </>}
   <Cylinder p={[0,.86,0]} h={.16} r={.055} c="#e5d4b9"/>
 </group>;
}
function EspressoMachine({x,z}: {x:number;z:number}){
 return <group position={[x,0,z]}>
   <B p={[0,1.27,0]} s={[1.08,.61,.55]} c="#9aacae" metal={.65}/>
   <B p={[0,1.53,.28]} s={[.94,.1,.08]} c="#354c4d"/>
   {[-.28,.28].map(xx=><group key={xx}>
      <Cylinder p={[xx,1.0,.27]} h={.22} r={.05} c="#323c38"/>
      <Cylinder p={[xx,.97,.38]} h={.17} r={.12} c="#f2f2e7"/>
   </group>)}
   <Cylinder p={[.79,1.25,0]} h={.58} r={.18} c="#424c4b"/>
   <B p={[.79,1.57,0]} s={[.36,.08,.38]} c="#c2c3b6"/>
 </group>;
}
function VenueCounter({kind,onSelect}:{kind:VenueKind;onSelect:(id:string)=>void}){
 const cafe=kind==="cafe";
 const id="VENUE-"+kind+"-counter";
 return <group onClick={e=>{e.stopPropagation();onSelect(id);}}>
  <B p={[-4.5,.62,1.4]} s={[4.9,1.18,1.25]} c={cafe?"#826d57":"#7a807d"}/>
  <B p={[-4.5,1.25,1.4]} s={[5.04,.12,1.38]} c={cafe?"#d3c1a8":"#d6d4ca"}/>
  <B p={[-4.5,.56,2.05]} s={[4.36,.77,.035]} c={cafe?"#9e826a":"#586963"}/>
  <B p={[-5.7,1.34,1.18]} s={[.48,.08,.34]} c="#283839"/>
  <B p={[-5.7,1.67,1.02]} s={[.54,.47,.06]} c="#273d43"/>
  {cafe&&<><EspressoMachine x={-3.45} z={1.0}/>
    {[1,2,3,4].map(i=><Cylinder key={i} p={[-2.58+i*.25,1.37,1.66]} h={.21} r={.085} c="#f4e9d8"/>)}
  </>}
  {!cafe&&<><B p={[-3.0,1.37,1.34]} s={[.9,.09,.5]} c="#b3a895"/>
    <Cylinder p={[-3.2,1.6,1.2]} h={.39} r={.13} c="#d8c5a9"/>
  </>}
 </group>;
}
function WashArea({x,z}:{x:number;z:number}){
 return <group position={[x,0,z]}>
   <B p={[0,.52,0]} s={[2.15,1.04,.7]} c="#a6b4b0" metal={.7}/>
   <B p={[0,1.07,0]} s={[2.26,.07,.78]} c="#d4dedc" metal={.58}/>
   {[-.55,.55].map(dx=><mesh key={dx} position={[dx,1.115,0]}>
      <cylinderGeometry args={[.26,.24,.038,18]}/>
      <meshStandardMaterial color="#79898a" metalness={.7} roughness={.26}/>
    </mesh>)}
   {[-.55,.55].map(dx=><group key={dx}>
     <Cylinder p={[dx,1.31,-.19]} h={.44} r={.033} c="#afb8b3"/>
     <B p={[dx,1.54,-.08]} s={[.21,.04,.2]} c="#afb8b3" metal={.7}/>
   </group>)}
 </group>;
}
function KitchenLine({kind,onSelect}:{kind:VenueKind;onSelect:(id:string)=>void}){
 const cafe=kind==="cafe";
 return <group onClick={e=>{e.stopPropagation();onSelect("VENUE-"+kind+"-back");}}>
   <B p={[3.55,.58,-4.5]} s={[5.4,1.12,1.1]} c="#acb8b6" metal={.8}/>
   <B p={[3.55,1.16,-4.5]} s={[5.5,.09,1.23]} c="#d0d9d7" metal={.7}/>
   {!cafe&&[-1.4,-.75,-.1,.55,1.2].map(dx=><group key={dx}>
     <Cylinder p={[3.55+dx,1.24,-4.5]} h={.045} r={.2} c="#303b3a"/>
     <mesh position={[3.55+dx,1.29,-4.5]} rotation={[-Math.PI/2,0,0]}>
       <torusGeometry args={[.16,.016,7,18]}/><meshStandardMaterial color="#a4afb0" metalness={.7}/>
     </mesh>
   </group>)}
   {!cafe&&<>
     <B p={[3.55,3.1,-4.5]} s={[5.5,.52,1.48]} c="#99a8a9" metal={.75}/>
     <B p={[3.55,3.45,-4.5]} s={[1.1,.5,1.14]} c="#879c9c" metal={.6}/>
   </>}
   <WashArea x={3.0} z={-1.65}/>
   <B p={[5.95,1.17,-2.86]} s={[1.16,2.33,.75]} c="#b5c2c1" metal={.55}/>
   <B p={[5.95,1.34,-2.47]} s={[.08,.16,.025]} c="#677672"/>
   <B p={[1.04,.95,-2.7]} s={[1.03,1.87,.65]} c="#b2a58f"/>
   <B p={[1.04,1.27,-2.34]} s={[.85,.06,.13]} c="#746753"/>
   {cafe&&<EspressoMachine x={4.0} z={-4.1}/>}
 </group>;
}
function VenueFurniture({kind,onSelect}:{kind:VenueKind;onSelect:(id:string)=>void}){
 const cafe=kind==="cafe";
 return <group name={kind+"-realistic-fitout"}>
   <VenueCounter kind={kind} onSelect={onSelect}/>
   <group onClick={e=>{e.stopPropagation();onSelect("VENUE-"+kind+"-seating");}}>
     {(cafe? [[1.65,3.55],[4.85,3.55],[1.65,.8],[4.85,.8]] :
       [[1.45,3.25],[4.95,3.25],[1.45,.65],[4.95,.65]]).map(([x,z],i)=>
       <VenueDiningTable key={i} x={x} z={z} style={cafe?"cafe":"restaurant"}/>)}
     <B p={[6.55,.52,-.15]} s={[.68,.48,2.5]} c={cafe?"#697d67":"#916f5f"}/>
     <B p={[6.9,.99,-.15]} s={[.17,.88,2.46]} c={cafe?"#697d67":"#916f5f"}/>
   </group>
   <group onClick={e=>{e.stopPropagation();onSelect("VENUE-"+kind+"-entrance");}}>
     <B p={[-5.6,.44,3.95]} s={[1.7,.82,.72]} c={cafe?"#8d9c85":"#918474"}/>
     <B p={[-5.6,.93,3.68]} s={[1.7,.79,.17]} c={cafe?"#8d9c85":"#918474"}/>
     <Cylinder p={[-6.9,.44,4.5]} h={.72} r={.28} c="#b8ae98"/>
     <mesh position={[-6.9,1.2,4.5]}><icosahedronGeometry args={[.66,2]}/><meshStandardMaterial color="#4f8762"/></mesh>
   </group>
   <KitchenLine kind={kind} onSelect={onSelect}/>
 </group>;
}

function RoomShell({kind,ghost}: {kind:VenueKind;ghost:boolean}){
 const cafe=kind==="cafe";
 const plaster=cafe?"#e6dccb":"#d8d6d0";
 const trim=cafe?"#3e594d":"#4a5155";
 return <group name="single-storey-premises">
    <B p={[0,-.01,0]} s={[16,.22,12]} c={cafe?"#cbb99e":"#c3c1b7"}/>
    <B p={[0,.09,0]} s={[15.8,.08,11.8]} c={cafe?"#e1d6c4":"#ddd7cd"}/>
    {/* Structural column locations match the synthetic IFC structure reference. */}
    {[-7.55,7.55].flatMap(x=>[-5.6,5.6].map(z=>
      <B key={x+":"+z} p={[x,2.05,z]} s={[.39,4.1,.39]}
        c={cafe?"#b9b7ab":"#b1b5b5"}/>))}
    <B p={[0,4.3,-5.8]} s={[15.55,.34,.33]} c={cafe?"#adb5a9":"#adb5b5"}/>
    <B p={[0,4.3,5.8]} s={[15.55,.34,.33]} c={cafe?"#adb5a9":"#adb5b5"}/>
    <B p={[0,2.18,-5.85]} s={[16,4.28,.26]} c={plaster}/>
    <B p={[-7.85,2.14,0]} s={[.3,4.28,11.9]} c={plaster}/>
    <B p={[7.85,2.14,0]} s={[.3,4.28,11.9]} c={plaster}/>
    {/* Storefront glazing, split into full-height windows and a centered main door. */}
    <B p={[0,3.9,5.88]} s={[16,.66,.3]} c={trim}/>
    {[-7.7,-4.0,0,4.0,7.7].map(x=><B key={x} p={[x,2.0,5.87]} s={[.13,3.1,.15]} c={trim} metal={.25}/>)}
    {[-5.8,5.8].map(x=><B key={x} p={[x,2.0,5.88]} s={[3.65,3.23,.05]} c="#8fb8b8" opacity={.25}/>)}
    <B p={[0,2.06,5.91]} s={[1.75,3.2,.06]} c="#9fc5c3" opacity={.2}/>
    <B p={[0,.9,5.98]} s={[.11,.55,.12]} c="#c9c2ab" metal={.6}/>
    {[-7.9,7.9].map(x=><B key={x} p={[x,4.32,0]} s={[.28,.25,12]} c={trim}/>)}
    <B p={[0,4.32,-5.8]} s={[16,.25,.25]} c={trim}/>
    <B p={[0,4.36,5.86]} s={[16,.27,.4]} c={trim}/>
    {/* The cutaway roof reveals real furniture; restore partial roof in facade view. */}
    <B p={[0,4.45,-4.85]} s={[16,.18,2.1]} c="#d9ded6" opacity={ghost?.15:.92}/>
    <B p={[0,4.52,4.1]} s={[16,.18,3.3]} c="#c5c4b9" opacity={ghost?.12:.72}/>
    <B p={[0,4.85,5.95]} s={[16,.48,.65]} c={trim}/>
    <B p={[0,4.62,6.36]} s={[11,.12,1.7]} c={cafe?"#bda17a":"#ae9d87"}/>
    {[-4,-2,0,2,4].map(x=><B key={x} p={[x,4.48,6.46]} s={[.09,.08,1.55]} c={trim}/>)}
    {/* Internal walls separate public and back of house without hiding the cutaway. */}
    <B p={[0,1.43,-.3]} s={[15.5,2.65,.12]} c={plaster} opacity={ghost?.14:.5}/>
    <B p={[-.92,1.43,-3.25]} s={[.13,2.65,4.5]} c={plaster} opacity={ghost?.14:.5}/>
    {[-4.5,4.5].map(x=><group key={x}>
       <B p={[x,4.17,0]} s={[.85,.06,.85]} c="#fff3d5"/>
       <Cylinder p={[x,3.77,0]} h={.65} r={.025} c="#b0afa3"/>
       <Cylinder p={[x,3.4,0]} h={.24} r={.28} c={cafe?"#cfb998":"#e0d7c7"}/>
     </group>)}
    {/* Brand sign is 3D-positioned, not a screenshot decoration. */}
    <Html position={[0,4.88,6.33]} center transform distanceFactor={13} occlude={false}>
     <div className={"venue-sign "+(cafe?"is-cafe":"is-restaurant")} dir="rtl">
       <strong>{VENUE_META[kind].title}</strong><span>{VENUE_META[kind].tag}</span>
     </div>
    </Html>
 </group>;
}
function VenueNetworks({kind,visible,onSelect,selected}: {kind:VenueKind;visible:ServiceVisibility;onSelect:(id:string)=>void;selected:string|null}){
 return <VenueServiceNetwork3D kind={kind} visible={visible} selected={selected} onSelect={onSelect}/>;
}
export function VenueCameraRig({kind,preset,nonce,selected}:{
 kind:VenueKind;preset:VenueCameraPreset;nonce:number;selected:Vec3|null;
}){
 const {camera,size}=useThree();
 const controls=useRef<any>(null);
 const desired=useRef(new THREE.Vector3(21,14,24));
 const target=useRef(new THREE.Vector3(0,2,0));
 const moving=useRef(true);
 useEffect(()=>{
  if(camera instanceof THREE.PerspectiveCamera){
    camera.fov=size.width<661?51:size.width<1000?47:39;
    camera.updateProjectionMatrix();
  }
 },[camera,size.width]);
 useEffect(()=>{
  const v=({
    iso:[[21,13.7,24],[0,1.9,0]],
    top:[[.01,29,.01],[0,1,0]],
    front:[[0,7.2,31],[0,2,1]],
    inside:[[7,5.5,10.7],[0,1.3,0]]
  } as Record<VenueCameraPreset,[Vec3,Vec3]>)[preset];
  desired.current.set(...v[0]);target.current.set(...v[1]);
  if(selected){target.current.set(...selected);desired.current.set(selected[0]+7,selected[1]+5.2,selected[2]+9.5);}
  if(size.width<661)desired.current.sub(target.current).multiplyScalar(1.4).add(target.current);
  moving.current=true;
 },[kind,preset,nonce,selected,size.width]);
 useFrame(()=>{
  if(!moving.current||!controls.current)return;
  camera.position.lerp(desired.current,.13);controls.current.target.lerp(target.current,.13);controls.current.update();
  if(camera.position.distanceTo(desired.current)<.05&&controls.current.target.distanceTo(target.current)<.05)moving.current=false;
 });
 return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={.085} minDistance={3}
  maxDistance={64} maxPolarAngle={Math.PI*.82} onStart={()=>moving.current=false}/>;
}
export function VenueScene3D({kind,visible,ghost,furniture,selected,onSelect,preset,nonce}:{
 kind:VenueKind;visible:ServiceVisibility;ghost:boolean;furniture:boolean;
 selected:string|null;onSelect:(id:string)=>void;preset:VenueCameraPreset;nonce:number;
}){
 const spot=getVenueSpot(selected);
 const selectedPoint=spot?.position ?? getVenueElement(kind,selected)?.position ?? null;
 const isCafe=kind==="cafe";
 return <>
    <color attach="background" args={["#c7d8d8"]}/>
    <fog attach="fog" args={["#c7d8d8",42,92]}/>
    <group name={"standalone-"+kind}>
    <ambientLight intensity={.8}/>
    <hemisphereLight args={["#f4faf1","#687e71",1.1]}/>
    <directionalLight castShadow position={[13,21,16]} intensity={2.6}
       shadow-mapSize-width={2048} shadow-mapSize-height={2048}
       shadow-camera-left={-27} shadow-camera-right={27}
       shadow-camera-top={27} shadow-camera-bottom={-27}/>
    <directionalLight position={[-12,8,-8]} intensity={.54}/>
    <Outdoor kind={kind}/>
    <RoomShell kind={kind} ghost={ghost}/>
    {furniture&&<VenueFurniture kind={kind} onSelect={onSelect}/>}

    {furniture&&<group>
       <B p={[0,.12,8.1]} s={[7.8,.05,1.85]} c={isCafe?"#ccb99e":"#cfc1ae"}/>
       <Tree x={-6.6} z={-8.5} s={.68}/>
       <Tree x={6.4} z={-8.6} s={.7}/>
       <B p={[-6.6,1.1,-3.8]} s={[1,.08,.63]} c={isCafe?"#877058":"#97999a"}/>
    </group>}
    {VENUE_SPOTS[kind].map(s=><group key={s.id}>
       <mesh position={[s.position[0],.085,s.position[2]]}
         onClick={e=>{e.stopPropagation();onSelect(s.id);}}>
          <cylinderGeometry args={[.39,.39,.025,22]}/>
          <meshStandardMaterial color={selected===s.id?"#f0bd65":"#3b7b62"} transparent opacity={.75}/>
       </mesh>
       {selected===s.id && <Html center distanceFactor={14} position={[s.position[0],2.9,s.position[2]]}>
        <div className="venue-world-inspector" dir="rtl"><strong>{s.title}</strong><small>{s.description}</small></div>
       </Html>}
    </group>)}
    <VenueNetworks kind={kind} visible={visible} selected={selected} onSelect={onSelect}/>
    <ContactShadows opacity={.26} scale={38} far={20} blur={2.6} position={[0,-.15,0]} frames={1}/>
    <VenueCameraRig kind={kind} preset={preset} selected={selectedPoint} nonce={nonce}/>
    </group>
 </>;
}
