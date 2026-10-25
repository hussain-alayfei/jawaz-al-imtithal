import { Html } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { SERVICE_KEYS, SERVICE_META, type ServiceKey, type ServiceVisibility } from "./EngineeringNetworks3D";

type Vec3 = [number,number,number];
export interface DetailPoint {
  id: string; floor: number; system: ServiceKey; label: string; description: string;
  position: Vec3; specification: string;
}
const SPECS: Record<ServiceKey,{name:string;spec:string;desc:string;z:number;y:number}> = {
  electricity: {name:"لوحة فرعية ومسار كابلات",spec:"تمثيل: مواسير كهربائية منفصلة + علبة توزيع، مقاطع غير مصممة",desc:"مسار كابلات تغذية سقفي، ولوحات ومخارج لا تمثل حسابات أحمال",z:4.7,y:2.89},
  water: {name:"توزيع المياه ومحابس العزل",spec:"تمثيل: مواسير تغذية ومحابس، أقطار لا تعتمد للتنفيذ",desc:"خط تغذية بارد يمتد لغرف الخدمات ونقاط الاستخدام",z:-3.6,y:2.65},
  drainage: {name:"ماسورة صرف وفرع أرضي",spec:"تمثيل: خط صرف رئيسي وفرع، الميل غير محسوب",desc:"صعود/نزول المواسير وتجميع التصريف من وحدات الخدمة",z:-4.1,y:0.45},
  hvac: {name:"مجاري الهواء وناشرات السقف",spec:"تمثيل: دكت معدني مع مخرج هواء، لم تحسب الكمية أو الضغط",desc:"مجرى توزيع تكييف رئيسي مع مخارج ومقطع مستطيل",z:0.1,y:2.8},
  fire: {name:"شبكة الحريق والرشاشات",spec:"تمثيل: خط تغذية ورؤوس رش، ليس تصميم NFPA معتمد",desc:"خط مكافحة الحريق ممتد مع محابس ورؤوس رش لكل دور",z:-1.9,y:2.98},
  grounding: {name:"موصلات التأريض والربط",spec:"تمثيل: كابل ربط وتأريض، المقاومة غير مقاسة",desc:"ربط المعدات الكهربائية والتأريض الوقائي",z:5.1,y:0.32},
};
export const DETAIL_LEVELS=[0,1,2,3,4] as const;
export function getDetailPoints(floor:number):DetailPoint[] {
 return SERVICE_KEYS.flatMap(system=>{
   const item=SPECS[system];
   return [-4.8,0,4.8].map((x,index)=>({
     id:"DETAIL-"+floor+"-"+system+"-"+index,
     floor,system,label:item.name+" · "+(index+1),
     description:item.desc,
     position:[x, floor*3.4+item.y, item.z] as Vec3,
     specification:item.spec,
   }));
 });
}
export function getDetailPoint(id:string|null|undefined):DetailPoint|undefined{
 if(!id||!/^DETAIL-[0-4]-(electricity|water|drainage|hvac|fire|grounding)-[0-2]$/.test(id))return;
 return getDetailPoints(Number(id.split("-")[1])).find(point=>point.id===id);
}
function Cable({from,to,color,radius=.035}:{from:Vec3;to:Vec3;color:string;radius?:number}){
 const shape=useMemo(()=>{
  const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),delta=b.clone().sub(a);
  return {mid:a.clone().add(b).multiplyScalar(.5),rotation:new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize()),length:delta.length()};
 },[from,to]);
 return <mesh position={shape.mid} quaternion={shape.rotation}>
  <cylinderGeometry args={[radius,radius,shape.length,8]}/>
  <meshStandardMaterial color={color} metalness={.31} roughness={.38} emissive={color} emissiveIntensity={.12}/>
 </mesh>;
}
function Equip({p,s,color}:{p:Vec3;s:Vec3;color:string}){
 return <mesh position={p} castShadow>
  <boxGeometry args={s}/>
  <meshStandardMaterial color={color} metalness={.42} roughness={.4}/>
 </mesh>;
}
function Head({p,color}:{p:Vec3;color:string}){
 return <group position={p}>
  <mesh><cylinderGeometry args={[.11,.16,.11,16]}/><meshStandardMaterial color={color} metalness={.5}/></mesh>
  <mesh position={[0,-.13,0]}><torusGeometry args={[.23,.025,8,24]}/><meshStandardMaterial color="#c7cfc7" metalness={.6}/></mesh>
 </group>;
}
export function DetailedServiceNetwork3D({ floor, visible, selected, onSelect, animate }: {
 floor:number;visible:ServiceVisibility;selected:string|null;
 onSelect:(id:string)=>void;animate:boolean;
}){
 const nodes=getDetailPoints(floor);
 const yOffset=floor*3.4;
 const selectedNode=nodes.find(n=>n.id===selected);
 return <group name={"detailed-utility-floor-"+floor} position={[0,yOffset,0]}>
  {SERVICE_KEYS.filter(k=>visible[k]).map(system=>{
   const spec=SPECS[system],color=SERVICE_META[system].color, y=spec.y,z=spec.z;
   const nodesForSystem=nodes.filter(n=>n.system===system);
   return <group key={system} name={"visible-"+system}>
    <Cable from={[-7.5,y,z]} to={[7.35,y,z]} color={color} radius={system==="hvac"?.09:system==="drainage"?.095:.065}/>
    {system==="electricity"&&<>
      <Equip p={[0,y-.09,z]} s={[14.8,.045,.65]} color="#7c8e90"/>
      {[-.22,0,.22].map((zOffset,i)=><Cable key={i} from={[-7.2,y+.05,z+zOffset]}
        to={[7.1,y+.05,z+zOffset]} color={["#dba138","#547e98","#8c6751"][i]} radius={.027}/>)}
      {[-4.8,0,4.8].map((x,i)=><group key={i}>
        <Cable from={[x,y,z]} to={[x,.68,4.7]} color="#e5a52d" radius={.035}/>
        <Equip p={[x,.7,4.68]} s={[.46,.48,.13]} color="#b9c1b6"/>
      </group>)}
    </>}
    {system==="water"&&[-4.8,0,4.8].map((x,i)=><group key={i}>
      <Cable from={[x,y,z]} to={[x,.72,-3.5]} color={color} radius={.048}/>
      <Equip p={[x,y,z]} s={[.28,.26,.3]} color="#6aa6bd"/>
      <Head p={[x,.78,-3.5]} color="#96b4bd"/>
    </group>)}
    {system==="drainage"&&[-4.8,0,4.8].map((x,i)=><group key={i}>
      <Cable from={[x,.32,-1.6]} to={[x,y,z]} color={color} radius={.065}/>
      <Equip p={[x,.22,-1.6]} s={[.38,.05,.38]} color="#8d9699"/>
    </group>)}
    {system==="hvac"&&<>
      <Equip p={[0,y,z]} s={[14.55,.47,.69]} color="#a8bab8"/>
      {[-4.8,0,4.8].map((x,i)=><group key={i}>
        <Equip p={[x,y-.34,z]} s={[.88,.14,.8]} color="#738b8b"/>
        <Equip p={[x,y-.42,z]} s={[.7,.035,.57]} color="#ccd4d2"/>
      </group>)}
    </>}
    {system==="fire"&&[-4.8,0,4.8].map((x,i)=><group key={i}>
      <Cable from={[x,y,z]} to={[x,y-.38,z]} color={color} radius={.044}/>
      <Head p={[x,y-.48,z]} color={color}/>
      <Equip p={[x,y,z]} s={[.28,.22,.26]} color="#d16a54"/>
    </group>)}
    {system==="grounding"&&<>
      <Cable from={[-7.1,y,z+.15]} to={[7.1,y,z+.15]} color="#92b765" radius={.03}/>
      {[-4.8,0,4.8].map((x,i)=><Cable key={i} from={[x,y,z]} to={[x,1.05,4.65]}
         color="#b1c751" radius={.028}/>)}
    </>}
    {nodesForSystem.map(n=><group key={n.id}>
      <mesh position={[n.position[0],spec.y,spec.z]}
       onClick={e=>{e.stopPropagation();onSelect(n.id);}}
       onPointerOver={e=>{e.stopPropagation();document.body.style.cursor="pointer";}}
       onPointerOut={()=>{document.body.style.cursor="default";}}>
       <sphereGeometry args={[.18,12,10]}/>
       <meshStandardMaterial color={selected===n.id?"#fff9e5":color}
         emissive={color} emissiveIntensity={selected===n.id?.65:.23}/>
      </mesh>
      {selectedNode?.id===n.id && <Html center distanceFactor={13} position={[n.position[0],spec.y+.7,spec.z]}>
       <div className="twin-world-label" dir="rtl"><strong>{n.label}</strong><small>{n.specification}</small></div>
      </Html>}
    </group>)}
   </group>;
  })}
  {animate && false && <group/>}
 </group>;
}
