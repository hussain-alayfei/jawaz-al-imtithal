import { Html, OrbitControls, ContactShadows } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { VenueServiceNetwork3D } from "./VenueServiceNetwork3D";
import { getVenueElement } from "./VenueEngineeringData";
import { SaudiStreet, type StreetDetail } from "./scene/SaudiStreet";
import { useMediaQuery } from "../screens/landing/useMediaQuery";

import type { ServiceVisibility } from "./EngineeringNetworks3D";

export type VenueKind = "cafe" | "restaurant";
export type VenueArea = "all" | "entrance" | "seating" | "counter" | "back";
export type VenueCameraPreset = "iso" | "top" | "front" | "inside";
type Vec3=[number,number,number];
export interface VenueSpot { id:string;area:Exclude<VenueArea,"all">;title:string;description:string;position:Vec3 }
export const VENUE_META:Record<VenueKind,{title:string;tag:string;subtitle:string;areas:Record<Exclude<VenueArea,"all">,string>}> = {
  cafe:{
    title:"مقهى موائم",tag:"COFFEE HOUSE",subtitle:"مقهى مستقل بطابق أرضي، تحضير قهوة وجلسات داخلية وخارجية",
    areas:{entrance:"المدخل والاستقبال",seating:"الجلسات الداخلية",counter:"بار القهوة والطلبات",back:"الغسيل والمخزن"}
  },
  restaurant:{
    title:"مطعم موائم",tag:"RESTAURANT",subtitle:"مطعم مستقل بطابق أرضي، صالة ضيوف ومطبخ خلفي مجهز",
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
/** The plan box of the cafe and the restaurant (the twin's five-storey building shares it). */
export const TWIN_FOOTPRINT = { minX: -8, minZ: -6, maxX: 8, maxZ: 6 };
/** The haze matches the shared street's sky, so the far city fades into its horizon. */
const HAZE = "#ebe4d7";

/** Background and haze for the twin's scenes; `haze` scales its distance (phones stand further back). */
export function TwinHaze({haze=1}:{haze?:number}){
 return <>
   <color attach="background" args={[HAZE]}/>
   <fog attach="fog" args={[HAZE,90*haze,560*haze]}/>
 </>;
}

/** The strip in front of the plot that the twin's cameras look across (forecourt and near sidewalk). */
const SIGHTLINE={x0:-13,x1:15,z0:6.5,z1:19};

/**
 * The shared street frames a frontage with palms in its forecourt and on the near sidewalk; in the twin
 * those stand on the default line of sight and hide the model. Fold those palms (and their planters)
 * away; every other palm on the street stays.
 */
function clearSightline(root:THREE.Object3D){
 const m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
 const zero=new THREE.Matrix4().makeScale(0,0,0);
 const inside=(v:THREE.Vector3)=>v.x>SIGHTLINE.x0&&v.x<SIGHTLINE.x1&&v.z>SIGHTLINE.z0&&v.z<SIGHTLINE.z1;
 const cleared:THREE.Vector3[]=[];
 const fold=(mesh:THREE.InstancedMesh,test:(i:number)=>boolean)=>{
  let changed=false;
  for(let i=0;i<mesh.count;i++){
   mesh.getMatrixAt(i,m);m.decompose(p,q,s);
   if(test(i)){mesh.setMatrixAt(i,zero);changed=true;}
  }
  if(changed){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
 };
 root.traverse(o=>{
  if(!(o instanceof THREE.InstancedMesh)||!/palm/.test(o.name))return;
  fold(o,()=>{
   if(!inside(p))return false;
   if(/trunk/.test(o.name))cleared.push(p.clone());
   return true;
  });
 });
 if(!cleared.length)return;
 root.traverse(o=>{
  if(!(o instanceof THREE.InstancedMesh)||o.name!=="details")return;
  fold(o,()=>s.y<.6&&cleared.some(c=>Math.abs(c.x-p.x)<.05&&Math.abs(c.z-p.z)<.05));
 });
}

/** The Riyadh street around a twin scene (shared with the results viewer): fewer details on touch screens. */
export function TwinStreet(){
 const coarse=useMediaQuery("(pointer: coarse)");
 const detail:StreetDetail=coarse?"medium":"high";
 const wrap=useRef<THREE.Group>(null);
 const done=useRef<THREE.Object3D|null>(null);
 useFrame(()=>{
  const street=wrap.current?.children[0];
  if(!street||street===done.current)return;
  done.current=street;
  clearSightline(street);
 });
 return <group ref={wrap} name="twin-street">
   <SaudiStreet footprint={TWIN_FOOTPRINT} groundY={0} front="south" corner="right" detail={detail} intensity={.62}/>
 </group>;
}

function Parasol({x,z,color}:{x:number;z:number;color:string}){
 return <group position={[x,0,z]}>
   <Cylinder p={[0,1.25,0]} h={2.5} r={.04} c="#d9d6cf"/>
   <mesh position={[0,2.5,0]} castShadow>
     <coneGeometry args={[1.35,.46,10]}/><meshStandardMaterial color={color} roughness={.8}/>
   </mesh>
 </group>;
}

/** The venue's terrace in its forecourt (beside the entrance), inside the shared street. */
function Outdoor({kind}:{kind:VenueKind}) {
 const cafe=kind==="cafe";
 return <group name="outdoor-seating">
   <TwinStreet/>
   {cafe&&<>
     <B p={[-6.0,.03,9.7]} s={[5.4,.06,5.0]} c="#cdbda5"/>
     <PatioSet x={-6.0} z={8.5} color="#63786d"/>
     <PatioSet x={-6.0} z={11.0} color="#63786d"/>
     <Parasol x={-6.0} z={8.5} color="#ece5d6"/>
     <Parasol x={-6.0} z={11.0} color="#e1d5bf"/>
   </>}
   {!cafe&&<>
     <B p={[-6.0,.03,9.7]} s={[4.8,.06,4.4]} c="#d3c6b2"/>
     <PatioSet x={-6.0} z={9.7} color="#a78c75"/>
     <Parasol x={-6.0} z={9.7} color="#e7e1d6"/>
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
    <B p={[0,2.18,-5.85]} s={[16,4.28,.26]} c={plaster} opacity={ghost?.1:1}/>
    <B p={[-7.85,2.14,0]} s={[.3,4.28,11.9]} c={plaster} opacity={ghost?.09:1}/>
    <B p={[7.85,2.14,0]} s={[.3,4.28,11.9]} c={plaster} opacity={ghost?.09:1}/>
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
    <B p={[0,4.45,-4.85]} s={[16,.18,2.1]} c="#d9ded6" opacity={ghost?.055:.92}/>
    <B p={[0,4.52,4.1]} s={[16,.18,3.3]} c="#c5c4b9" opacity={ghost?.045:.72}/>
    <B p={[0,4.85,5.95]} s={[16,.48,.65]} c={trim}/>
    <B p={[0,4.62,6.36]} s={[11,.12,1.7]} c={cafe?"#bda17a":"#ae9d87"}/>
    {[-4,-2,0,2,4].map(x=><B key={x} p={[x,4.48,6.46]} s={[.09,.08,1.55]} c={trim}/>)}
    {/* Internal walls separate public and back of house without hiding the cutaway. */}
    <B p={[0,1.43,-.3]} s={[15.5,2.65,.12]} c={plaster} opacity={ghost?.065:.5}/>
    <B p={[-.92,1.43,-3.25]} s={[.13,2.65,4.5]} c={plaster} opacity={ghost?.065:.5}/>
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
export function VenueCameraRig({kind,preset,nonce,selected,freeWidth}:{
 kind:VenueKind;preset:VenueCameraPreset;nonce:number;selected:Vec3|null;
 /** Width of the canvas the studio's panel leaves free (the whole canvas when omitted). */
 freeWidth?:number;
}){
 const {camera,size}=useThree();
 const free=Math.min(size.width,freeWidth||size.width);
 const controls=useRef<any>(null);
 const desired=useRef(new THREE.Vector3(21,14,24));
 const target=useRef(new THREE.Vector3(0,2,0));
 const moving=useRef(true);
 useEffect(()=>{
  if(camera instanceof THREE.PerspectiveCamera){
    camera.fov=free<661?51:free<1000?47:44;
    camera.updateProjectionMatrix();
  }
 },[camera,free]);
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
  maxDistance={64} maxPolarAngle={Math.PI*.47} onStart={()=>moving.current=false}/>;
}
export function VenueScene3D({kind,visible,ghost,furniture,selected,onSelect,preset,nonce,freeWidth}:{
 kind:VenueKind;visible:ServiceVisibility;ghost:boolean;furniture:boolean;
 selected:string|null;onSelect:(id:string)=>void;preset:VenueCameraPreset;nonce:number;
 /** Width of the canvas the studio's panel leaves free. */
 freeWidth?:number;
}){
 const size=useThree(state=>state.size);
 const spot=getVenueSpot(selected);
 const selectedPoint=spot?.position ?? getVenueElement(kind,selected)?.position ?? null;
 const isCafe=kind==="cafe";
 return <>
    <TwinHaze haze={size.width<661?1.3:1}/>
    <group name={"standalone-"+kind}>
    <ambientLight intensity={.8}/>
    <hemisphereLight args={["#f3f7fb","#8c877e",1.05]}/>
    <directionalLight castShadow position={[13,21,16]} intensity={2.6} color="#fff7ec"
       shadow-mapSize-width={2048} shadow-mapSize-height={2048}
       shadow-camera-left={-30} shadow-camera-right={30}
       shadow-camera-top={30} shadow-camera-bottom={-30} shadow-camera-far={80}/>
    <directionalLight position={[-12,8,-8]} intensity={.54} color="#d6e3ec"/>
    <Outdoor kind={kind}/>
    <RoomShell kind={kind} ghost={ghost}/>
    {furniture&&<VenueFurniture kind={kind} onSelect={onSelect}/>}

    {furniture&&<group>
       <B p={[0,.02,7.5]} s={[4.4,.03,2.4]} c={isCafe?"#d2c8b7":"#cdc8bf"}/>
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
    <ContactShadows opacity={.3} scale={30} far={20} blur={2.6} position={[0,.012,0]} frames={1}/>
    <VenueCameraRig kind={kind} preset={preset} selected={selectedPoint} nonce={nonce} freeWidth={freeWidth}/>
    </group>
 </>;
}
