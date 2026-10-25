import { Html, RoundedBox } from "@react-three/drei";
import type { ActivityId } from "../data";

type Vec3 = [number, number, number];
export type RoomKey = "reception" | "hall" | "office" | "service";
export type RoomFilter = RoomKey | "all";
export interface RoomDefinition {
  key: RoomKey;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  purpose: string;
}
export interface InteriorItem {
  id: string;
  room: RoomKey;
  title: string;
  description: string;
  position: Vec3;
}
export const ROOM_CENTERS: Record<RoomKey, { x: number; z: number; w: number; d: number }> = {
  reception: { x: -4.5, z: 3.05, w: 6.4, d: 4.95 },
  hall: { x: 3.35, z: 3.05, w: 6.7, d: 4.95 },
  office: { x: -4.5, z: -2.85, w: 6.4, d: 5.35 },
  service: { x: 3.35, z: -2.85, w: 6.7, d: 5.35 },
};

const ROOM_NAMES: Record<ActivityId, Record<RoomKey, [string, string]>> = {
  restaurant: {
    reception: ["الاستقبال والانتظار", "مدخل الضيوف ونقطة الاستقبال"],
    hall: ["صالة الطعام", "طاولات الطعام وممرات الحركة"],
    office: ["الإدارة والتخزين", "مكتب المسؤول ورفوف المواد"],
    service: ["المطبخ والتحضير", "منطقة الطبخ والغسيل والتجهيز"],
  },
  cafe: {
    reception: ["الطلب والاستلام", "كاونتر الطلب والدفع والاستلام"],
    hall: ["جلسات المقهى", "جلسات فردية وجماعية"],
    office: ["تخزين القهوة", "مخزون المواد ومكتب العاملين"],
    service: ["تحضير المشروبات", "آلة الإسبريسو وحوض الغسيل والثلاجة"],
  },
  clinic: {
    reception: ["الاستقبال", "مكتب استقبال وملف المراجع"],
    hall: ["غرفة الانتظار", "مقاعد انتظار ومسار الدخول"],
    office: ["غرفة الفحص", "سرير فحص ومكتب الممارس"],
    service: ["غرفة الإجراءات", "حوض غسيل وخزائن المستلزمات"],
  },
  salon: {
    reception: ["الاستقبال", "كاونتر حجز ومقاعد انتظار"],
    hall: ["منطقة التصفيف", "مرايا وكراسي تصفيف ومحطات عمل"],
    office: ["منطقة العناية", "سرير العناية وخزائن المستلزمات"],
    service: ["منطقة الغسيل", "أحواض غسيل ومقاعد وخزائن"],
  },
};

export function getActivityRooms(activity: ActivityId): RoomDefinition[] {
  return (Object.keys(ROOM_CENTERS) as RoomKey[]).map(key => ({
    key, ...ROOM_CENTERS[key],
    name: ROOM_NAMES[activity][key][0], purpose: ROOM_NAMES[activity][key][1],
  }));
}

const ITEMS: Record<ActivityId, Array<[RoomKey, string, string, number, number]>> = {
  restaurant: [
    ["reception","كاونتر الاستقبال","سطح استقبال مع منطقة انتظار أمامية",-4.8,3.4],
    ["reception","مقاعد الانتظار","جلسة ضيوف قرب المدخل",-2.3,2.2],
    ["hall","طاولات الطعام","أربع طاولات ومقاعد ومسارات حركة",3.2,2.5],
    ["office","مكتب المسؤول","مكتب وإدارة التشغيل",-4.4,-3],
    ["office","وحدات التخزين","رفوف لمستلزمات التشغيل",-6.4,-4.5],
    ["service","خط الطبخ","موقد وشفاط وفرن وطاولة من الستانلس",4,-4],
    ["service","حوض غسيل","حوض مهني وصنبور ونقطة تصريف",2,-1.6],
    ["service","ثلاجة الطعام","ثلاجة عمودية للخدمة",6,-4.4],
  ],
  cafe: [
    ["reception","كاونتر الطلب","كاونتر بار ودرج الدفع",-4.5,3.1],
    ["reception","منطقة الاستلام","رف استلام وحاجز الخدمة",-2.4,1.9],
    ["hall","جلسات المقهى","طاولات قهوة وكراسٍ منسقة",3,3],
    ["office","مخزون القهوة","رفوف حبوب وأكواب ومستلزمات",-6.5,-3.5],
    ["office","مكتب الإدارة","طاولة عمل ومقعد",-4,-2],
    ["service","آلة الإسبريسو","ماكينة تحضير بجوار طاحونة البن",2,-3.6],
    ["service","حوض البار","حوض غسيل ومنطقة تحضير",4.5,-2.4],
    ["service","ثلاجة المشروبات","ثلاجة رأسية للخدمة",6.2,-4.3],
  ],
  clinic: [
    ["reception","مكتب الاستقبال","مكتب مع شاشة ومقعد استقبال",-4.5,3.1],
    ["reception","أرشيف الاستقبال","وحدة ملفات ووثائق",-6.7,1.5],
    ["hall","مقاعد المراجعين","صفوف جلوس منظمة للانتظار",3,2.5],
    ["office","سرير الفحص","سرير فحص طبي مفصل مع وسادة",-4.3,-3],
    ["office","مكتب الطبيب","مكتب طبي ومقعد وخزانة",-6.5,-4.6],
    ["service","حوض التعقيم","حوض غسيل وموزع وصرف",2.1,-1.8],
    ["service","خزانة الأدوات","خزانة معدات وإمدادات طبية",6,-4.5],
    ["service","سرير الإجراءات","محطة علاج وأدوات",4,-3.4],
  ],
  salon: [
    ["reception","كاونتر الحجوزات","مكتب دخول وحجز المواعيد",-4.5,3],
    ["reception","جلسة الانتظار","مقاعد استقبال وزينة",-2.4,2.1],
    ["hall","محطات التصفيف","ثلاث مرايا وكراسٍ وأرفف أدوات",3.4,2],
    ["office","سرير العناية","محطة عناية خاصة",-4.3,-3.2],
    ["office","خزانة المستحضرات","أرفف مواد ومستحضرات",-6.6,-4],
    ["service","وحدات غسيل الشعر","أحواض غسل وكراسٍ للخدمة",3.8,-3],
    ["service","خزانة المناشف","خزانة أدوات ومناشف",6.1,-4.7],
  ],
};

export function getInteriorItems(activity: ActivityId, floor: number): InteriorItem[] {
  return ITEMS[activity].map(([room, title, description, x, z], i) => ({
    id: "FURN-" + activity.toUpperCase() + "-" + floor + "-" + (i + 1),
    room, title, description, position: [x, floor * 3.4 + 0.8, z],
  }));
}

function Cube({ p, s, c, metal = 0, opacity = 1, rough = 0.68 }: {
  p: Vec3; s: Vec3; c: string; metal?: number; opacity?: number; rough?: number;
}) {
  return <mesh position={p} castShadow={opacity > .6} receiveShadow>
    <boxGeometry args={s} />
    <meshStandardMaterial color={c} metalness={metal} roughness={rough}
      transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} />
  </mesh>;
}
function Round({ p, s, c, radius = 0.09, metal = 0 }: {
  p: Vec3; s: Vec3; c: string; radius?: number; metal?: number;
}) {
  return <RoundedBox position={p} args={s} radius={radius} smoothness={2} castShadow>
    <meshStandardMaterial color={c} metalness={metal} roughness={0.52} />
  </RoundedBox>;
}
function Rod({ p, radius, h, c }: { p: Vec3; radius: number; h: number; c: string }) {
  return <mesh position={p} castShadow>
    <cylinderGeometry args={[radius, radius, h, 12]} />
    <meshStandardMaterial color={c} metalness={0.55} roughness={0.31} />
  </mesh>;
}
function Plant({ x, z }: { x: number; z: number }) {
  return <group position={[x,0,z]}>
    <mesh position={[0,.26,0]} castShadow>
      <cylinderGeometry args={[.24,.16,.48,12]} />
      <meshStandardMaterial color="#c2b6a0" roughness={.72}/>
    </mesh>
    <Rod p={[0,.83,0]} h={.85} radius={.038} c="#466449"/>
    {[[.16,1.06,.04],[-.16,1.18,0],[0,1.35,.12],[.08,.87,-.14]].map(([x,y,z],i)=>
      <mesh key={i} position={[x,y,z]} rotation={[0,i*0.6,-0.6]}>
        <sphereGeometry args={[.29,9,8]}/><meshStandardMaterial color={i%2?"#688c61":"#456c53"}/>
      </mesh>)}
  </group>;
}
function Chair({ x, z, rotate = 0, color = "#526d6b" }: {
  x:number; z:number; rotate?:number; color?:string;
}) {
  return <group position={[x,0,z]} rotation={[0,rotate,0]}>
    <Round p={[0,.52,0]} s={[.68,.14,.65]} c={color}/>
    <Round p={[0,.93,-.27]} s={[.68,.75,.15]} c={color}/>
    {[-.25,.25].flatMap(px=>[-.22,.22].map(pz=>
      <Rod key={px+":"+pz} p={[px,.27,pz]} h={.48} radius={.024} c="#404a48"/>))}
  </group>;
}
function Table({ x,z,w=1.25,d=.9, round=false, top="#9f7854" }: {
  x:number;z:number;w?:number;d?:number;round?:boolean;top?:string;
}) {
  return <group position={[x,0,z]}>
    {round?<mesh position={[0,.73,0]} castShadow><cylinderGeometry args={[w/2,w/2,.11,24]}/><meshStandardMaterial color={top} roughness={.46}/></mesh>
      :<Round p={[0,.72,0]} s={[w,.12,d]} c={top} radius={.055}/>}
    {[-w*.34,w*.34].flatMap(px=>[-d*.3,d*.3].map(pz=>
      <Rod key={px+":"+pz} p={[px,.35,pz]} h={.65} radius={.03} c="#555d57"/>))}
  </group>;
}
function DiningSet({ x,z,coffee=false }: { x:number;z:number;coffee?:boolean }) {
  return <group position={[x,0,z]}>
    <Table x={0} z={0} w={coffee?.88:1.15} d={coffee?.88:.95} round={coffee} top={coffee?"#b49a75":"#947a58"}/>
    <Chair x={0} z={-.85} rotate={0} color="#7f9a91"/>
    <Chair x={0} z={.85} rotate={Math.PI} color="#7f9a91"/>
    {!coffee && <><Chair x={-.85} z={0} rotate={Math.PI/2} color="#7f9a91"/><Chair x={.85} z={0} rotate={-Math.PI/2} color="#7f9a91"/></>}
  </group>;
}
function Sofa({x,z,rotate=0,color="#8ca19a"}:{x:number;z:number;rotate?:number;color?:string}) {
  return <group position={[x,0,z]} rotation={[0,rotate,0]}>
    <Round p={[0,.43,0]} s={[1.85,.36,.76]} c={color}/>
    <Round p={[0,.85,-.33]} s={[1.83,.68,.17]} c={color}/>
    {[-.83,.83].map(dx=><Round key={dx} p={[dx,.67,0]} s={[.19,.47,.78]} c={color}/>)}
    {[-.67,.67].map(dx=><Cube key={dx} p={[dx,.2,0]} s={[.11,.27,.11]} c="#514d46"/>)}
    <Round p={[-.45,.66,-.19]} s={[.46,.27,.18]} c="#d9c5ab" radius={.06}/>
  </group>;
}
function Cabinet({x,z,w=1.45,h=1.8,colour="#c4b39e"}:{x:number;z:number;w?:number;h?:number;colour?:string}) {
  return <group position={[x,0,z]}>
    <Round p={[0,h/2,0]} s={[w,h,.52]} c={colour} radius={.025}/>
    {[-w/4,w/4].map(dx=><Cube key={dx} p={[dx,h/2,.266]} s={[.025,h-.12,.025]} c="#6c5e4e"/>)}
    {[.52,1,1.5].filter(v=>v<h-.1).map(y=><Cube key={y} p={[0,y,.28]} s={[w-.08,.035,.05]} c="#877762"/>)}
  </group>;
}
function Counter({x,z,w=3.5,colour="#aa9275"}:{x:number;z:number;w?:number;colour?:string}) {
  return <group position={[x,0,z]}>
    <Round p={[0,.53,0]} s={[w,1,.76]} c={colour} radius={.065}/>
    <Round p={[0,1.055,0]} s={[w+.16,.09,.91]} c="#e2ded3" radius={.04}/>
    <Cube p={[0,.48,.395]} s={[w*.9,.46,.018]} c="#816b57"/>
    <Cube p={[-w*.28,1.13,-.11]} s={[.56,.08,.32]} c="#384f4c"/>
    <Cube p={[-w*.28,1.38,-.26]} s={[.52,.35,.05]} c="#283e44"/>
  </group>;
}
function Monitor({x,z}:{x:number;z:number}) {
  return <group position={[x,0,z]}>
    <Cube p={[0,1.24,0]} s={[.78,.49,.07]} c="#2d3840" />
    <Cube p={[0,1.24,.045]} s={[.68,.38,.014]} c="#7da7af" rough={.14}/>
    <Rod p={[0,.93,0]} h={.23} radius={.04} c="#67727a"/>
    <Cube p={[0,.8,0]} s={[.39,.025,.21]} c="#676b6e"/>
  </group>;
}
function ExaminationBed({x,z,colour="#cbd9d7"}:{x:number;z:number;colour?:string}) {
  return <group position={[x,0,z]}>
    <Round p={[0,.65,0]} s={[1.12,.18,2.25]} c={colour} radius={.065}/>
    <Round p={[0,.78,-.83]} s={[.75,.13,.41]} c="#f2f1e9"/>
    <Cube p={[0,.31,0]} s={[.62,.53,1.4]} c="#aeb8b6" metal={.25}/>
    {[-.34,.34].map(dx=><Rod key={dx} p={[dx,.31, .7]} h={.45} radius={.035} c="#707c79"/>)}
  </group>;
}
function WashStation({x,z,shampoo=false}:{x:number;z:number;shampoo?:boolean}) {
  return <group position={[x,0,z]}>
    <Cube p={[0,.52,0]} s={[1.18,1.01,.58]} c="#b5c1bd" rough={.33}/>
    <Round p={[0,1.03,0]} s={[1.28,.15,.7]} c="#e8e9e4" radius={.08}/>
    <mesh position={[0,1.09,0]}><cylinderGeometry args={[.29,.2,.055,20]}/><meshStandardMaterial color="#819aa0" metalness={.15} roughness={.22}/></mesh>
    <Rod p={[0,1.27,-.22]} radius={.045} h={.28} c="#a6adab"/>
    <Cube p={[0,1.42,-.23]} s={[.26,.045,.1]} c="#a6adab" metal={.6}/>
    {shampoo && <Chair x={0} z={1.0} rotate={0} color="#4e6165"/>}
  </group>;
}
function CookingLine({x,z}:{x:number;z:number}) {
  return <group position={[x,0,z]}>
    <Cube p={[0,.5,0]} s={[3.4,1,.86]} c="#aab6b4" metal={.72} rough={.22}/>
    <Cube p={[0,1.02,0]} s={[3.5,.08,.98]} c="#d6dedc" metal={.7} rough={.21}/>
    {[-1.03,-.35,.35,1.03].map(dx=><group key={dx}>
      <mesh position={[dx,1.077,0]}><cylinderGeometry args={[.18,.18,.02,18]}/><meshStandardMaterial color="#3d4748" metalness={.36}/></mesh>
      <mesh position={[dx,1.092,0]}><torusGeometry args={[.17,.015,8,18]}/><meshStandardMaterial color="#a2a6a3"/></mesh>
    </group>)}
    <Cube p={[0,2.58,-.15]} s={[3.6,.43,1.12]} c="#929f9f" metal={.74} rough={.25}/>
    <Cube p={[0,2.95,-.2]} s={[.78,.6,.78]} c="#7b8e8c" metal={.62}/>
  </group>;
}
function Espresso({x,z}:{x:number;z:number}) {
  return <group position={[x,0,z]}>
    <Cube p={[0,.51,0]} s={[3.6,1.01,.8]} c="#98816b"/>
    <Cube p={[0,1.05,0]} s={[3.68,.08,.9]} c="#ddd2bc"/>
    <Round p={[-.55,1.39,-.09]} s={[1.02,.59,.52]} c="#b5c0c0" metal={.6}/>
    {[-.85,-.25].map(dx=><Rod key={dx} p={[dx,1.16,.17]} h={.27} radius={.032} c="#515b58"/>)}
    <CylinderPot x={.65} z={-.11}/>
    <Cube p={[1.23,1.17,.07]} s={[.38,.23,.38]} c="#483e39"/>
    {[-1.45,-1.22,-.98].map(dx=><CylinderPot key={dx} x={dx} z={.22}/>)}
  </group>;
}
function CylinderPot({x,z}:{x:number;z:number}) {
  return <mesh position={[x,1.16,z]}><cylinderGeometry args={[.12,.1,.25,12]}/><meshStandardMaterial color="#ecede8" roughness={.35}/></mesh>;
}
function SalonStation({x,z}:{x:number;z:number}) {
  return <group position={[x,0,z]}>
    <Cube p={[0,1.34,-.55]} s={[1.05,1.67,.06]} c="#967f68"/>
    <Cube p={[0,1.34,-.505]} s={[.87,1.48,.016]} c="#c1d4d5" metal={.42} rough={.13}/>
    <Round p={[0,.55,.25]} s={[.82,.23,.82]} c="#46595d"/>
    <Round p={[0,1.07,.55]} s={[.8,.96,.17]} c="#46595d"/>
    <Rod p={[0,.25,.25]} h={.48} radius={.09} c="#737f7d"/>
    <Cube p={[.7,.52,-.25]} s={[.39,1.03,.55]} c="#c5b69e"/>
  </group>;
}
function Light({x,z}:{x:number;z:number}) {
  return <group position={[x,2.96,z]}>
    <Cube p={[0,0,0]} s={[.9,.07,.52]} c="#d6d6cb" />
    <mesh position={[0,-.075,0]}><planeGeometry args={[.8,.44]}/><meshBasicMaterial color="#ffedd0" side={2}/></mesh>
  </group>;
}

function FurnitureModel({activity, item, visible}:{
  activity:ActivityId;item:InteriorItem;visible:boolean;
}) {
  if (!visible) return null;
  const [x, ,z] = item.position;
  const title=item.title;
  if (/سرير/.test(title)) return <ExaminationBed x={x} z={z}/>;
  if (/طاولات الطعام/.test(title)) return <group>
    {[-1.35,1.35].flatMap(dx=>[-1,1].map(dz=><DiningSet key={dx+":"+dz} x={x+dx} z={z+dz}/>))}
  </group>;
  if (/جلسات المقهى/.test(title)) return <group>
    {[-1.45,1.15].flatMap(dx=>[-.9,1].map(dz=><DiningSet key={dx+":"+dz} x={x+dx} z={z+dz} coffee/>))}
  </group>;
  if (/محطات التصفيف/.test(title)) return <group>
    {[-2.05,0,2.05].map(dx=><SalonStation key={dx} x={x+dx} z={z}/>)}
  </group>;
  if (/مقاعد المراجعين/.test(title)) return <group>
    {[-1.5,0,1.5].flatMap(dx=>[-.55,.68].map(dz=><Chair key={dx+":"+dz} x={x+dx} z={z+dz} color="#72918b"/>))}
  </group>;
  if (/غسيل الشعر/.test(title)) return <group><WashStation x={x-1} z={z} shampoo/><WashStation x={x+1} z={z} shampoo/></group>;
  if (/حوض|التعقيم/.test(title)) return <WashStation x={x} z={z}/>;
  if (/طبخ/.test(title)) return <CookingLine x={x} z={z}/>;
  if (/إسبريسو/.test(title)) return <Espresso x={x} z={z}/>;
  if (/مكتب/.test(title)) return <group><Table x={x} z={z} w={1.85} d={.9} top="#a38a70"/><Monitor x={x-.32} z={z-.12}/><Chair x={x} z={z+1.0} rotate={Math.PI}/></group>;
  if (/كاونتر/.test(title)) return <Counter x={x} z={z} w={3.2}/>;
  if (/خزانة|ثلاجة|رفوف|أرشيف|تخزين|مخزون/.test(title)) return <Cabinet x={x} z={z} w={1.4} colour={/ثلاجة/.test(title)?"#abbfc2":"#b4a48a"}/>;
  if (/انتظار|جلسة/.test(title)) return <group><Sofa x={x} z={z}/><Table x={x+1.2} z={z+.8} w={.75} d={.65} top="#bda685"/></group>;
  if (/استلام/.test(title)) return <Counter x={x} z={z} w={1.55}/>;
  return <Table x={x} z={z}/>;
}

export function InteriorFitout3D({
  activity, floor, roomFilter, showFurniture, showLabels, showRoomWalls,
  selectedId, onSelect,
}:{
  activity:ActivityId; floor:number;roomFilter:RoomFilter;
  showFurniture:boolean;showLabels:boolean;showRoomWalls:boolean;
  selectedId:string|null;onSelect:(id:string)=>void;
}) {
  const rooms = getActivityRooms(activity);
  const items = getInteriorItems(activity,floor);
  return <group name={"fitout-"+activity+"-"+floor}>
    {rooms.map(room => {
      const focused = roomFilter === "all" || roomFilter === room.key;
      const alpha = focused?1:.13;
      return <group key={room.key}>
        <Cube p={[room.x,.17,room.z]} s={[room.w,.025,room.d]}
          c={room.key==="service"?"#aab8b0":room.key==="office"?"#c9bdaf":"#d5c5ad"}
          opacity={focused?.9:.06} />
        {showLabels && focused && <Html position={[room.x,2.75,room.z]} center distanceFactor={11}>
          <button className={"twin-room-label"+(selectedId==="ROOM-"+floor+"-"+room.key?" is-selected":"")}
            onClick={(event)=>{event.stopPropagation();onSelect("ROOM-"+floor+"-"+room.key);}}
            type="button">{room.name}</button>
        </Html>}
        {showFurniture && items.filter(item=>item.room===room.key).map(item=>{
          const y = floor * 3.4;
          const itemPosition:[number,number,number]=[item.position[0],0,item.position[2]];
          return <group key={item.id} position={itemPosition}
            onClick={e=>{e.stopPropagation();onSelect(item.id);}}
            onPointerOver={e=>{e.stopPropagation();document.body.style.cursor="pointer";}}
            onPointerOut={()=>{document.body.style.cursor="default";}}
            visible={focused}>
            <group position={[-itemPosition[0],0,-itemPosition[2]]}><FurnitureModel activity={activity} item={item} visible/></group>
            {selectedId===item.id && <Html center position={[0,1.9,0]} distanceFactor={10}>
              <div className="twin-world-label" dir="rtl"><strong>{item.title}</strong><small>{item.description}</small></div>
            </Html>}
          </group>;
        })}
        {room.key==="reception" && focused && showFurniture && <Plant x={room.x-2.5} z={room.z-1.6}/>}
        {room.key==="hall" && focused && showFurniture && <Plant x={room.x+2.5} z={room.z+1.7}/>}
        {focused && showFurniture && <><Light x={room.x} z={room.z}/><Light x={room.x+1.55} z={room.z-1}/></>}
      </group>;
    })}
    {showRoomWalls && <group name="partitions">
      {/* Short paired segments leave doorways visible from above and in cutaway. */}
      <Cube p={[-.8,1.44,-3.4]} s={[.16,2.72,3.9]} c="#ddd6c8" opacity={.78}/>
      <Cube p={[-.8,1.44,2.3]} s={[.16,2.72,5.3]} c="#ddd6c8" opacity={.78}/>
      <Cube p={[-4.8,1.44,-.2]} s={[5.2,2.72,.15]} c="#d6cfc2" opacity={.75}/>
      <Cube p={[3.8,1.44,-.2]} s={[7.2,2.72,.15]} c="#d6cfc2" opacity={.75}/>
    </group>}
  </group>;
}
