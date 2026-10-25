import {
  Activity, ArrowLeft, Box, Building2, Check, ChevronDown, Compass,
  Eye, EyeOff, Focus, Layers3, Maximize2, Move3d,
  RotateCcw, ShieldAlert, ShieldCheck, Sofa, X,
} from "lucide-react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Grid, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import type { ActivityId } from "../data";
import { InteriorFitout3D, getActivityRooms, getInteriorItems, getFloorTitle, type RoomFilter } from "./InteriorFitout3D";
import { DemoBimPanel, type DemoFileElement } from "./DemoBimPanel";
import { DetailedServiceNetwork3D, getDetailPoint, getDetailPoints } from "./DetailedServiceNetwork3D";
import {
  EngineeringNetworks3D, SERVICE_KEYS, SERVICE_META, SERVICE_NETWORKS,
  findServiceNode, type ServiceKey, type ServiceVisibility,
} from "./EngineeringNetworks3D";
import "./EngineeringTwinStudio.css";

type Vec3 = [number, number, number];
type Floor = "all" | "ground" | "first" | "second" | "third" | "fourth" | "roof";
const LEVEL_KEYS = ["ground","first","second","third","fourth"] as const;
const levelOf = (floor: Floor) => LEVEL_KEYS.indexOf(floor as typeof LEVEL_KEYS[number]);
type Preset = "iso" | "top" | "front" | "inside";
type Utility = ServiceKey | "architecture" | "all";
type NodeInfo = { id: string; label: string; description: string; system: Utility; position: Vec3 };
const STOREY_HEIGHT = 3.4;
const FLOOR_LIST: { key: Floor; label: string; en: string }[] = [
  { key: "all", label: "كامل المبنى", en: "ALL" },
  { key: "ground", label: "الدور الأرضي", en: "G" },
  { key: "first", label: "الدور الأول", en: "01" },
  { key: "second", label: "الدور الثاني", en: "02" },
  { key: "third", label: "الدور الثالث", en: "03" },
  { key: "fourth", label: "الدور الرابع", en: "04" },
  { key: "roof", label: "السطح والخدمات", en: "RF" },
];
const SYSTEM_LIST: { key: Utility; label: string; color: string }[] = [
  { key: "architecture", label: "العمارة والإنشاء", color: "#a9b0af" },
  { key: "all", label: "كل شبكات التمديدات", color: "#80c9a6" },
  { key: "electricity", label: "الكهرباء", color: SERVICE_META.electricity.color },
  { key: "water", label: "المياه", color: SERVICE_META.water.color },
  { key: "drainage", label: "الصرف الصحي", color: SERVICE_META.drainage.color },
  { key: "hvac", label: "التكييف والتهوية", color: SERVICE_META.hvac.color },
  { key: "fire", label: "الحريق والسلامة", color: SERVICE_META.fire.color },
  { key: "grounding", label: "التأريض", color: SERVICE_META.grounding.color },
];
const ALL_VISIBLE: ServiceVisibility = {
  electricity: false, water: false, drainage: false, hvac: false, fire: false, grounding: false,
};
const CUSTOM_NODES: NodeInfo[] = [
  { id: "DEMO-HVAC-ROOF", system: "hvac", label: "معدات التكييف على السطح", description: "مجموعة معالجة هواء ووصلات تغذية توضيحية.", position: [5.7, 17.9, -3.5] },
  { id: "DEMO-F-VALVE", system: "fire", label: "صمام تغذية الحريق", description: "صمام تحكم افتراضي متصل بمسار مكافحة الحريق.", position: [-6.2, 0.8, -4.7] },
  { id: "DEMO-W-TANK", system: "water", label: "خزان المياه العلوي", description: "خزان مبني هندسيًا للتوضيح، وليس مستخرجًا من الملف المرفوع.", position: [5, 18, 3.3] },
  { id: "DEMO-GLTF-CABINET", system: "architecture", label: "خزانة أثاث من glTF", description: "مجسم أثاث ثلاثي الأبعاد من ملف glTF تجريبي حقيقي داخل مجلد المشروع، لا ينتمي إلى ملف IFC.", position: [5.85, 0.95, -4.85] },
];
const viewDefaults: Record<Preset, { position: Vec3; target: Vec3 }> = {
  iso: { position: [30, 25, 30], target: [0, 8.2, 0] },
  top: { position: [0.01, 38, 0], target: [0, 8.2, 0] },
  front: { position: [0, 13.5, 36], target: [0, 8.2, 0] },
  inside: { position: [6.5, 7.5, 10.5], target: [0, 5, -1] },
};
const sColor = (system: ServiceKey) => SERVICE_META[system].color;

function Block({
  p, s, color, opacity = 1, metal = 0, roughness = 0.75, onClick,
}: {
  p: Vec3; s: Vec3; color: string; opacity?: number; metal?: number;
  roughness?: number; onClick?: () => void;
}) {
  return (
    <mesh position={p} castShadow={opacity > 0.5} receiveShadow onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={color} metalness={metal} roughness={roughness}
        transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} />
    </mesh>
  );
}
function Cylinder({ p, radius, height, color }: { p: Vec3; radius: number; height: number; color: string }) {
  return <mesh position={p} castShadow>
    <cylinderGeometry args={[radius, radius, height, 18]} />
    <meshStandardMaterial color={color} metalness={0.3} roughness={0.38} />
  </mesh>;
}
function Pipe({ points, color, radius = 0.045, opacity = 1 }: {
  points: Vec3[]; color: string; radius?: number; opacity?: number;
}) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, "centripetal"), [points]);
  return <mesh>
    <tubeGeometry args={[curve, Math.max(16, points.length * 12), radius, 8, false]} />
    <meshStandardMaterial color={color} metalness={0.17} roughness={0.31} emissive={color} emissiveIntensity={0.27} transparent={opacity < 1} opacity={opacity} />
  </mesh>;
}
function FlowMarkers({ points, color }: { points: Vec3[]; color: string }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, "centripetal"), [points]);
  const refs = useRef<THREE.Group>(null);
  const point = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    if (!refs.current) return;
    for (let i = 0; i < refs.current.children.length; i++) {
      const item = refs.current.children[i];
      const t = ((clock.elapsedTime * 0.065) + i / 7) % 1;
      curve.getPointAt(t, point);
      item.position.copy(point);
    }
  });
  return <group ref={refs}>
    {Array.from({ length: 7 }, (_, i) => (
      <mesh key={i}>
        <sphereGeometry args={[0.072, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
    ))}
  </group>;
}
function Roof({ ghost, onSelectEquipment }: {
  ghost: boolean;
  onSelectEquipment: (id: string) => void;
}) {
  return <group>
    <Block p={[0, 10.27, 0]} s={[15.9, 0.24, 11.9]} color="#c2c5c0" opacity={ghost ? 0.14 : 1} />
    {[-7.8, 7.8].map(x => <Block key={x} p={[x, 10.72, 0]} s={[0.22, 0.75, 11.8]} color="#e0e1da" opacity={ghost ? 0.18 : 1} />)}
    {[-5.85, 5.85].map(z => <Block key={z} p={[0, 10.72, z]} s={[15.9, 0.75, 0.23]} color="#e0e1da" opacity={ghost ? 0.18 : 1} />)}
    <Block p={[5.6, 11.0, -3.2]} s={[2.1, 1.03, 1.35]} color="#8d9e9d" metal={0.5} roughness={0.33}
      onClick={() => onSelectEquipment("DEMO-HVAC-ROOF")} />
    <Block p={[5.6, 11.53, -3.2]} s={[2.2, 0.09, 1.47]} color="#576d6e" metal={0.6} />
    {Array.from({ length: 7 }, (_, i) => <Block key={i} p={[4.7 + i * 0.29, 11.02, -2.505]} s={[0.06, 0.73, 0.025]} color="#506669" />)}
    <Cylinder p={[5, 11.13, 3.6]} radius={0.76} height={1.48} color="#b0c8d1" />
    <Cylinder p={[5, 11.9, 3.6]} radius={0.77} height={0.08} color="#6088a1" />
    <Block p={[5, 10.35, 3.6]} s={[1.9, 0.16, 1.9]} color="#8a9697" metal={0.6}
      onClick={() => onSelectEquipment("DEMO-W-TANK")} />

  </group>;
}
function ExampleGltfFurniture({onSelect}:{onSelect:(id:string)=>void}){
  const {scene}=useGLTF("/demo-bim/FurnitureDemo.gltf");
  const cabinet=useMemo(()=>scene.clone(true),[scene]);
  return <group position={[5.85,.18,-4.85]} onClick={e=>{e.stopPropagation();onSelect("DEMO-GLTF-CABINET");}}>
    <primitive object={cabinet}/>
  </group>;
}
function Storey({ level, floor, ghost, explode, selectedSystem, onSelectRoom,
  activity, roomFilter, furniture, labels, selectedId }: {
  level: number; floor: Floor; ghost: boolean; explode: boolean; selectedSystem: Utility;
  onSelectRoom: (id: string) => void;
  activity: ActivityId; roomFilter: RoomFilter; furniture: boolean; labels: boolean; selectedId: string | null;
}) {
  const key = LEVEL_KEYS[level];
  if (floor !== "all" && floor !== key) return null;
  const base = level * STOREY_HEIGHT + (explode ? level * 0.8 : 0);
  const shellOpacity = ghost || selectedSystem !== "architecture" ? 0.1 : 1;
  const solidOpacity = ghost || selectedSystem !== "architecture" ? 0.17 : 1;
  const wallColor = level === 0 ? "#d2d3c9" : "#dbdad1";
  return <group position={[0, base, 0]} name={"storey-" + level}>
    <Block p={[0, 0.02, 0]} s={[15.9, 0.21, 11.9]} color="#c9c5bd" opacity={solidOpacity} />
    <Block p={[0, 0.15, 0]} s={[15.7, 0.04, 11.7]} color="#ddd7cc" opacity={solidOpacity} />
    {[-7.4, 7.4].flatMap(x => [-5.3, 5.3].map(z =>
      <Block key={x + ":" + z} p={[x, 1.69, z]} s={[0.4, 3.21, 0.4]} color="#b6b5ae" opacity={solidOpacity} />))}
    <Block p={[0, 1.66, -5.86]} s={[15.55, 3.05, 0.19]} color={wallColor} opacity={shellOpacity} />
    <Block p={[-7.85, 1.66, 0]} s={[0.19, 3.05, 11.7]} color={wallColor} opacity={shellOpacity} />
    <Block p={[7.85, 1.66, 0]} s={[0.19, 3.05, 11.7]} color={wallColor} opacity={shellOpacity} />
    {[-6.6, -4.3, -2, 0.3, 2.6, 4.9, 6.8].map(x =>
      <group key={x}>
        <Block p={[x, 0.92, 5.87]} s={[0.17, 1.55, 0.15]} color={wallColor} opacity={shellOpacity} />
        <Block p={[x, 2.98, 5.87]} s={[0.17, 0.28, 0.15]} color={wallColor} opacity={shellOpacity} />
        <Block p={[x + 1.0, 2.26, 5.87]} s={[1.9, 1.45, 0.045]} color="#7ba5b1" opacity={ghost || selectedSystem !== "architecture" ? 0.12 : 0.42} />
      </group>)}
    <InteriorFitout3D activity={activity} floor={level} roomFilter={roomFilter}
      showFurniture={furniture} showLabels={labels && floor !== "all"} showRoomWalls={!ghost && selectedSystem === "architecture"}
      selectedId={selectedId} onSelect={onSelectRoom}/>
    {floor === "all" && <Block p={[0, 3.27, 0]} s={[15.9, 0.19, 11.9]} color="#e0ded5" opacity={0.1} />}
    <Html position={[-8.3, 2, 0]} center distanceFactor={16}>
      <div className="twin-floor-number"><strong>{String(level).padStart(2, "0")}</strong><span>{getFloorTitle(activity,level)}</span></div>
    </Html>
  </group>;
}
function NetworkExtensions({ floor, system, flow, exploded, floorCount, onSelect }: {
  floor: Floor; system: ServiceVisibility; flow: boolean; exploded: boolean; floorCount: number;
  onSelect: (id: string) => void;
}) {
  return <group name="upper-storey-utilities">
    {[1,2,3,4].filter(level => level < floorCount).map(level => {
      const floorKey = LEVEL_KEYS[level];
      if (floor !== "all" && floor !== floorKey) return null;
      const base = STOREY_HEIGHT * level + (exploded ? level * 0.8 : 0);
      return <group key={level} position={[0, base, 0]}>
        {SERVICE_KEYS.filter(k => system[k]).map(k => {
          const c = sColor(k);
          const y = k === "drainage" || k === "grounding" ? 0.3 : 2.82;
          const line: Vec3[] = k === "water" || k === "drainage"
            ? [[-6.8, y, -4.8], [0, y, -4.8], [4.8, y, -4.8], [4.8, y, -2.2]]
            : [[-6.8, y, 4.5], [-6.8, y, -4.7], [5.4, y, -4.7], [5.4, y, 2.5]];
          return <group key={k}>
            <Pipe points={line} color={c} radius={k === "hvac" ? 0.19 : k === "drainage" ? 0.15 : 0.1} />
            {flow && (k === "water" || k === "fire" || k === "hvac") && <FlowMarkers points={line} color={c} />}
            <Block p={line[0]} s={[0.35, 0.35, 0.35]} color={c} metal={0.3}
              onClick={() => onSelect("UPPER-" + level + "-" + k)} />
            {k === "fire" && [-4.4, 1.1, 4.7].map(x => <group key={x}>
              <Pipe points={[[x, y, -4.7], [x, 2.62, 0.5]]} color={c} />
              <Cylinder p={[x, 2.58, 0.5]} radius={0.16} height={0.09} color={c} />
            </group>)}
          </group>;
        })}
      </group>;
    })}
    {SERVICE_KEYS.filter(k => system[k]).map((k, i) => (
      <Pipe key={k} points={[[7.05 - i * 0.38, 0.4, -4.55], [7.05 - i * 0.38, floorCount * STOREY_HEIGHT - 0.1, -4.55]]}
        radius={k === "hvac" ? 0.19 : 0.085} color={sColor(k)} opacity={floor === "all" ? 1 : 0.22} />
    ))}
  </group>;
}
function CameraRig({ preset, selected, floor, nonce, floorCount }: {
  preset: Preset; selected: Vec3 | null; floor: Floor; nonce: number; floorCount: number;
}) {
  const { camera, size } = useThree();
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = size.width < 661 ? 45 : size.width < 1000 ? 44 : 38;
      camera.updateProjectionMatrix();
    }
  }, [camera, size.width]);
  const controls = useRef<any>(null);
  const desired = useRef(new THREE.Vector3(...viewDefaults.iso.position));
  const focus = useRef(new THREE.Vector3(...viewDefaults.iso.target));
  const active = useRef(true);
  useEffect(() => {
    const view = viewDefaults[preset];
    desired.current.set(...view.position);
    focus.current.set(...view.target);
    if (floor !== "all" && floor !== "roof" && !selected) {
      const base = Math.max(0,levelOf(floor)) * STOREY_HEIGHT;
      focus.current.set(0,base + 1.6,0);
      if (preset==="iso") desired.current.set(17,base+11,18);
      else if (preset==="top") desired.current.set(.01,base+23,.01);
      else if (preset==="front") desired.current.set(0,base+8,22);
      else desired.current.set(5.3,base+5.1,9);
    }
    if (floor === "roof" && !selected) {
      focus.current.y = floorCount * STOREY_HEIGHT + 0.6; desired.current.y = floorCount * STOREY_HEIGHT + 12;
    }
    if (selected) {
      focus.current.set(...selected);
      desired.current.set(selected[0] + 7, selected[1] + 5.8, selected[2] + 8);
    }
    if (size.width < 661) {
      desired.current.sub(focus.current).multiplyScalar(floor === "all" ? 1.48 : 1.06).add(focus.current);
    }
    active.current = true;
  }, [preset, selected, floor, nonce, size.width, floorCount]);
  useFrame(() => {
    if (!active.current || !controls.current) return;
    camera.position.lerp(desired.current, 0.12);
    controls.current.target.lerp(focus.current, 0.12);
    controls.current.update();
    if (camera.position.distanceTo(desired.current) < 0.04
      && controls.current.target.distanceTo(focus.current) < 0.04) active.current = false;
  });
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08}
    minDistance={2} maxDistance={68} minPolarAngle={0.03} maxPolarAngle={Math.PI * 0.8}
    onStart={() => { active.current = false; }} />;
}
function Model({ floor, selectedSystem, visible, ghost, exploded, flow, selected, onSelect, preset, nonce,
  activity, floorCount, roomFilter, furniture, labels }: {
  floor: Floor; selectedSystem: Utility; visible: ServiceVisibility;
  ghost: boolean; exploded: boolean; flow: boolean;
  selected: string | null; onSelect: (id: string) => void; preset: Preset; nonce: number;
  activity: ActivityId; floorCount: number; roomFilter: RoomFilter; furniture: boolean; labels: boolean;
}) {
  const custom = CUSTOM_NODES.find(node => node.id === selected);
  const sourceNode = findServiceNode(selected);
  const upper = selected?.startsWith("UPPER-") ? selected.split("-") : null;
  const interiorNode = [0,1,2,3,4].filter(n=>n < floorCount).flatMap(n=>getInteriorItems(activity,n)).find(item=>item.id===selected);
  const detailNode = getDetailPoint(selected);
  const roomSelected = selected?.startsWith("ROOM-") ? selected.split("-") : null;
  const roomInfo = roomSelected ? getActivityRooms(activity, Number(roomSelected[1])).find(room=>room.key === roomSelected[2]) : null;
  const upperY = upper ? (Number(upper[1]) * STOREY_HEIGHT + (exploded ? Number(upper[1]) * 0.8 : 0) + 2) : 0;
  const selectedPos: Vec3 | null = custom?.position ?? sourceNode?.position ?? detailNode?.position ?? interiorNode?.position
    ?? (roomInfo ? [roomInfo.x, Number(roomSelected?.[1] ?? 0) * STOREY_HEIGHT + 1, roomInfo.z] : null)
    ?? (upper ? [-6.8, upperY, -4.7] : null);
  return <>
    <color attach="background" args={["#d2ddd9"]} />
    <fog attach="fog" args={["#d2ddd9", 42, 76]} />
    <ambientLight intensity={0.4} />
    <hemisphereLight args={["#f9fcf7", "#827c73", 1.2]} />
    <directionalLight castShadow position={[15, 21, 14]} intensity={2.25}
      shadow-mapSize-width={2048} shadow-mapSize-height={2048}
      shadow-camera-left={-19} shadow-camera-right={19}
      shadow-camera-top={19} shadow-camera-bottom={-19}
      shadow-camera-near={0.5} shadow-camera-far={65}
      shadow-bias={-0.00022} />
    <directionalLight position={[-9, 7, -12]} intensity={0.38} color="#a1c5cf" />
    <Block p={[0, -0.35, 0]} s={[40, 0.4, 31]} color="#aab8ae" />
    <Block p={[0, -0.14, 10.65]} s={[40, 0.05, 4.6]} color="#858f8d" />
    {[-15, -5, 5, 15].map(x => <Block key={x} p={[x, -0.105, 10.65]} s={[1.2, 0.01, 0.08]} color="#dde0d7" />)}
    {[0,1,2,3,4].filter(level => level < floorCount).map(level =>
      <Storey key={level} level={level} floor={floor} ghost={ghost} explode={exploded}
        activity={activity} roomFilter={roomFilter} furniture={furniture} labels={labels}
        selectedId={selected} selectedSystem={selectedSystem} onSelectRoom={onSelect} />)}
    {(floor === "all" || floor === "roof") && <group position={[0,(floorCount - 3)*STOREY_HEIGHT,0]}>
      <Roof ghost={ghost} onSelectEquipment={onSelect} />
    </group>}
    {(floor === "all" || floor === "ground") && <>
      <EngineeringNetworks3D visible={visible} selectedId={selected} onSelect={onSelect} />
      <Suspense fallback={null}><ExampleGltfFurniture onSelect={onSelect}/></Suspense>
    </>}
    <NetworkExtensions floor={floor} system={visible} flow={flow} exploded={exploded} floorCount={floorCount} onSelect={onSelect} />
    {[0,1,2,3,4].filter(level=>level<floorCount && (floor==="all" || LEVEL_KEYS[level]===floor))
      .map(level=><DetailedServiceNetwork3D key={level} floor={level} visible={visible} selected={selected}
        onSelect={onSelect} animate={flow}/>)}
    <Grid args={[50, 50]} position={[0, -0.12, 0]} cellSize={1} cellColor="#92a69e"
      cellThickness={0.35} sectionSize={5} sectionColor="#788f85"
      sectionThickness={0.5} fadeDistance={42} fadeStrength={1.8} />
    <ContactShadows position={[0, -0.16, 0]} opacity={0.32} blur={2.5} scale={34} far={18} frames={1} />
    <CameraRig preset={preset} selected={selectedPos} floor={floor} nonce={nonce} floorCount={floorCount} />
  </>;
}

interface Props {
  projectName: string;
  activityName: string;
  activityId: ActivityId;
  floors: number;
  findingsCount: number;
  onClose: () => void;
}
export function EngineeringTwinStudio({ projectName, activityName, activityId, floors, findingsCount, onClose }: Props) {
  // Five-storey showcase is explicitly synthetic and independent of actual IFC / facility metadata.
  const floorCount = 5;
  void floors;
  const availableFloors = FLOOR_LIST;
  const [system, setSystem] = useState<Utility>("architecture");
  const [floor, setFloor] = useState<Floor>("all");
  const rooms = getActivityRooms(activityId, Math.max(0, levelOf(floor)));
  const [sideSection, setSideSection] = useState<"floors"|"systems"|"rooms"|"view">("floors");
  const [roomFilter, setRoomFilter] = useState<RoomFilter>("all");
  const [furniture, setFurniture] = useState(true);
  const [labels, setLabels] = useState(false);
  const [visible, setVisible] = useState<ServiceVisibility>(ALL_VISIBLE);
  const [ghost, setGhost] = useState(true);
  const [exploded, setExploded] = useState(false);
  const [flow, setFlow] = useState(true);
  const [preset, setPreset] = useState<Preset>("iso");
  const [selected, setSelected] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<"files"|"items">("items");
  const [mobileInspectorOpen,setMobileInspectorOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const selectedCustom = CUSTOM_NODES.find(x => x.id === selected);
  const selectedNode = findServiceNode(selected);
  const detailedNode = getDetailPoint(selected);
  const selectedUpper = selected?.startsWith("UPPER-") ? selected.split("-") : null;
  const upperSystem = selectedUpper && SERVICE_KEYS.includes(selectedUpper[2] as ServiceKey)
    ? selectedUpper[2] as ServiceKey : null;
  const selectedRoom = selected?.startsWith("ROOM-")
    ? getActivityRooms(activityId, Number(selected.split("-")[1])).find(r => r.key === selected.split("-")[2])
    : null;
  const selectedFurniture = [0,1,2,3,4].filter(n=>n<floorCount).flatMap(n=>getInteriorItems(activityId,n)).find(item=>item.id===selected);
  const inspected = selectedFurniture
    ? {id:selectedFurniture.id,system:"architecture" as const,label:selectedFurniture.title,
      description:selectedFurniture.description,position:selectedFurniture.position}
    : detailedNode
    ? {id:detailedNode.id,system:detailedNode.system,label:detailedNode.label,
      description:detailedNode.description+" · "+detailedNode.specification,position:detailedNode.position}
    : selectedCustom ?? selectedNode ??
    (upperSystem ? {
      id: selected ?? "", system: upperSystem,
      label: SERVICE_META[upperSystem].label + " · توزيع الأدوار",
      description: "نقطة توزيع توضيحية للشبكة داخل الدور، مرتبطة بمسار ثلاثي الأبعاد قابل للتتبع.",
      position: [0, 0, 0] as Vec3,
    } : selectedRoom ? {
      id: selected ?? "", system: "architecture" as const,
      label: selectedRoom.name, description: "حيز معماري تجريبي ضمن النموذج الإجرائي، وليس مساحة مستخرجة من IFC.",
      position: [0, 0, 0] as Vec3,
    } : null);

  const setFocusSystem = useCallback((key: Utility) => {
    setSystem(key);
    setSelected(null);
    setVisible(key === "architecture"
      ? ALL_VISIBLE : Object.fromEntries(SERVICE_KEYS.map(k => [k, k === key || key === "all"])) as ServiceVisibility);
    if (floor === "roof") setFloor("ground");
    setGhost(true);
    if (key === "architecture") {setRoomFilter("all");setFurniture(true);}
    setNonce(n => n + 1);
  }, [floor]);

  const showDemoElement = (item:DemoFileElement) => {
    setMobileInspectorOpen(false);
    setFloor(LEVEL_KEYS[item.floor] ?? "ground");
    setSelected(item.sceneId);
    const discipline = item.system;
    const key:Utility = discipline && SERVICE_KEYS.includes(discipline as ServiceKey)
      ? discipline as Utility : "architecture";
    setSystem(key);
    setVisible(key==="architecture" ? ALL_VISIBLE
      : Object.fromEntries(SERVICE_KEYS.map(k=>[k,k===key])) as ServiceVisibility);
    setGhost(key!=="architecture");
    setFurniture(true);
    setRoomFilter("all");
    setNonce(n=>n+1);
  };
  const reset = () => {
    setSystem("architecture"); setFloor("all"); setSideSection("floors"); setRoomFilter("all"); setVisible(ALL_VISIBLE);
    setFurniture(true); setLabels(false); setGhost(true); setExploded(false); setFlow(true);
    setPreset("iso"); setSelected(null); setNonce(n => n + 1);
  };
  useEffect(() => {
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = bodyOverflow; window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  const totalVisible = SERVICE_KEYS.filter(key => visible[key]).length;
  const countEquipment = totalVisible
    ? SERVICE_KEYS.filter(key => visible[key]).reduce((count, key) => count + SERVICE_NETWORKS[key].nodes.length, 0)
    : 0;
  const fullScreen = async () => {
    if (!overlayRef.current) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await overlayRef.current.requestFullscreen();
    } catch { /* Fullscreen depends on the browser context. */ }
  };
  return (
    <div className="twin-studio" ref={overlayRef} role="dialog" aria-modal="true"
      aria-label="استوديو التوأم الرقمي الهندسي" dir="rtl">
      <header className="twin-studio__top">
        <div className="twin-studio__brand">
          <span className="twin-studio__brand-icon"><Building2 size={22}/></span>
          <div><strong>مِعيار <b>/</b> الاستوديو الهندسي</strong><small>ENGINEERING DIGITAL TWIN · LAB</small></div>
        </div>
        <div className="twin-studio__project">
          <span className="twin-studio__live" />
          <div><strong>{projectName}</strong><small>{activityName} · نموذج ثلاثي الأبعاد توضيحي</small></div>
        </div>
        <div className="twin-studio__top-actions">
          <button type="button" onClick={reset} title="إعادة الإعدادات"><RotateCcw size={17}/><span>إعادة ضبط</span></button>
          <button type="button" onClick={() => void fullScreen()} title="ملء الشاشة"><Maximize2 size={17}/></button>
          <button type="button" className="twin-studio__close" onClick={onClose} title="العودة إلى نتائج الفحص">
            <ArrowLeft size={17}/><span>العودة للفحص</span>
          </button>
        </div>
      </header>
      <div className="twin-studio__layout">
        <aside className="twin-studio__systems" aria-label="أنظمة المبنى">
          <div className="twin-studio__side-nav" role="tablist" aria-label="أقسام التحكم في التوأم الرقمي">
            {([
              ["floors","الأدوار"],
              ["systems","الأنظمة"],
              ["rooms","الغرف"],
              ["view","العرض"],
            ] as const).map(([key,label])=><button type="button" key={key}
              role="tab" aria-selected={sideSection===key}
              onClick={()=>setSideSection(key)}>{label}</button>)}
          </div>
          {sideSection==="systems" && <section className="twin-studio__side-panel" aria-label="الأنظمة الهندسية">
          <div className="twin-studio__section-heading"><Layers3 size={17}/> <span>اختر النظام الهندسي</span><small>08</small></div>
          <div className="twin-studio__system-list">
            {SYSTEM_LIST.map(item => (
              <button key={item.key} type="button" className={"twin-studio__system" + (system === item.key ? " is-active" : "")}
                style={{ "--system-color": item.color } as CSSProperties}
                onClick={() => setFocusSystem(item.key)} aria-pressed={system === item.key}>
                <span className="twin-studio__system-bullet" />
                <span>{item.label}</span>
                {system === item.key ? <Check size={15}/> : <span className="twin-studio__system-arrow">◂</span>}
              </button>
            ))}
          </div>
          </section>}
          {sideSection==="floors" && <section className="twin-studio__side-panel" aria-label="اختيار الدور">
          <div className="twin-studio__section-heading"><Box size={17}/> <span>اختر الدور أو المبنى كاملًا</span></div>
          <div className="twin-studio__floor-list">
            {availableFloors.map(item => (
              <button type="button" key={item.key} className={floor === item.key ? "is-active" : ""}
                onClick={() => { setFloor(item.key); setSelected(null); setNonce(n => n + 1); }}>
                <small>{item.en}</small><span>{item.label}</span>
                {item.key!=="all" && item.key!=="roof" && <em>{getFloorTitle(activityId,Math.max(0,levelOf(item.key)))}</em>}
              </button>
            ))}
          </div>
          </section>}
          {sideSection==="rooms" && <section className="twin-studio__side-panel" aria-label="الغرف والأثاث">
          <div className="twin-studio__section-heading"><Building2 size={17}/> <span>تصفية غرف الدور</span></div>
          <p className="twin-studio__section-note">{floor==="all"?"اختر دورًا أولًا لرؤية غرفه المختلفة":"غرف "+getFloorTitle(activityId,Math.max(0,levelOf(floor)))}</p>
          <div className="twin-studio__room-filter" data-testid="twin-room-filters">
            <button type="button" className={roomFilter === "all" ? "is-active" : ""}
              aria-pressed={roomFilter==="all"} onClick={() => {setRoomFilter("all");setSelected(null);setNonce(n=>n+1);}}>
              <span>جميع الغرف</span><small>04</small>
            </button>
            {rooms.map(room => (
              <button type="button" key={room.key} className={roomFilter === room.key ? "is-active" : ""}
                aria-pressed={roomFilter===room.key}
                onClick={() => {setRoomFilter(room.key);setSelected("ROOM-"+Math.max(0,levelOf(floor))+"-"+room.key);setNonce(n=>n+1);}}>
                <span>{room.name}</span><small>{room.key==="reception"?"01":room.key==="hall"?"02":room.key==="office"?"03":"04"}</small>
              </button>
            ))}
          </div>
          </section>}
          {sideSection==="view" && <section className="twin-studio__side-panel" aria-label="إعدادات المشهد">
          <div className="twin-studio__section-heading"><Eye size={17}/> <span>إعدادات المشهد</span></div>
          <div className="twin-studio__switches">
            {([
              ["شفافية الجدران", ghost, setGhost, EyeOff],
              ["تفكيك الطوابق", exploded, setExploded, Move3d],
              ["إظهار الأثاث والتجهيزات", furniture, setFurniture, Sofa],
              ["إظهار أسماء الغرف", labels, setLabels, Focus],
              ["تحريك تدفق الخدمات", flow, setFlow, Activity],
            ] as const).map(([label, value, setter, Icon]) => (
              <label key={label} className="twin-studio__switch">
                <span><Icon size={15}/>{label}</span>
                <input type="checkbox" checked={value} onChange={(e) => setter(e.target.checked)} />
              </label>
            ))}
          </div>
          </section>}
        </aside>
        <main className="twin-studio__viewport" aria-label="المشهد الهندسي ثلاثي الأبعاد">
          <div className="twin-studio__canvas">
            <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: "high-performance" }}
              camera={{ position: [23, 19, 23], fov: 38, near: 0.06, far: 140 }}
              onCreated={({gl}) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.05;
                gl.outputColorSpace = THREE.SRGBColorSpace;
              }}
              onPointerMissed={() => setSelected(null)}>
              <Model floor={floor} selectedSystem={system} visible={visible}
                ghost={ghost} exploded={exploded} flow={flow} activity={activityId}
                floorCount={floorCount} roomFilter={roomFilter} furniture={furniture} labels={labels}
                selected={selected} onSelect={setSelected} preset={preset} nonce={nonce} />
            </Canvas>
          </div>
          <div className="twin-studio__overlay-title">
            <small>نموذج توضيحي · 5 أدوار</small>
            <strong>{floor === "all" ? "المبنى كاملًا" : getFloorTitle(activityId,Math.max(0,levelOf(floor)))}</strong>
            <span>{SYSTEM_LIST.find(x => x.key === system)?.label}</span>
          </div>
          <div className="twin-studio__north"><Compass size={21}/><span>ش</span></div>
          <button type="button" className="twin-studio__mobile-bim" data-testid="mobile-bim-files"
            onClick={()=>{setInspectorTab("files");setMobileInspectorOpen(v=>!v);}}>
            <Layers3 size={15}/> ملفات IFC (٤)
          </button>
          <div className="twin-studio__view-controls">
            {([["iso","منظور"], ["top","علوي"], ["front","واجهة"], ["inside","داخلي"]] as [Preset, string][]).map(([key, label]) =>
              <button type="button" key={key} className={preset === key ? "is-active" : ""}
                onClick={() => {setPreset(key); setSelected(null); setNonce(n => n + 1);}}>{label}</button>)}
          </div>
          <div className="twin-studio__scene-hint"><span className="twin-studio__hint-dot"/> <span>دور بالكاميرا · قرّب · اختر شبكة ثم نقطة تمديد أو غرفة</span></div>
          <div className="twin-studio__viewport-stats">
            <span>5 STOREYS · DEMO DATA</span><span>◦</span><span>SCHEMATIC / NOT AS-BUILT</span>
          </div>
          <div className="twin-studio__mobile-floors" aria-label="اختيار الدور والغرفة">
            <select value={floor} aria-label="الدور" onChange={e => { setFloor(e.target.value as Floor); setSelected(null); }}>
              {availableFloors.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <select value={roomFilter} aria-label="الغرفة" onChange={e=>{setRoomFilter(e.target.value as RoomFilter);setSelected(null);}}>
              <option value="all">جميع الغرف</option>
              {rooms.map(r=><option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
            <button type="button" aria-pressed={ghost} onClick={() => setGhost(v => !v)} title="شفافية الجدران"><EyeOff size={17}/></button>
            <button type="button" aria-pressed={exploded} onClick={() => setExploded(v => !v)} title="فصل الطوابق"><Move3d size={17}/></button>
          </div>
          {inspected && <div className="twin-studio__mobile-selection" dir="rtl">
            <button type="button" aria-label="إغلاق تفاصيل العنصر" onClick={() => setSelected(null)}><X size={16}/></button>
            <strong>{inspected.label}</strong><span>{inspected.description}</span>
          </div>}
          {menuOpen && <div className="twin-studio__mobile-menu">
            {SYSTEM_LIST.map(item => <button key={item.key} type="button" onClick={() => {setFocusSystem(item.key); setMenuOpen(false);}}>{item.label}</button>)}
          </div>}
        </main>
        <aside className={"twin-studio__inspector"+(mobileInspectorOpen?" is-mobile-open":"")} aria-label="تفاصيل العناصر">
          {mobileInspectorOpen && <button type="button" className="twin-studio__mobile-inspector-close"
            onClick={()=>setMobileInspectorOpen(false)} aria-label="إغلاق ملفات BIM">✕ إغلاق الملفات</button>}
          <div className="twin-studio__section-heading"><Focus size={17}/><span>تفاصيل النموذج</span><span className="twin-studio__live"/></div>
          <div className="twin-studio__inspector-hero">
            <span>DIGITAL TWIN · DEMONSTRATION</span>
            <h2>{projectName}</h2>
            <p>{floor==="all"?"المبنى كاملًا":getFloorTitle(activityId,Math.max(0,levelOf(floor)))}
              {" · "}نموذج {activityName} تجريبي، مختلف التوزيع في كل دور.</p>
          </div>
          <div className="twin-studio__mini-stats">
            <div><strong>{String(floorCount).padStart(2,"0")}</strong><small>أدوار تمثيلية</small></div>
            <div><strong>08</strong><small>أنظمة عرض</small></div>
            <div><strong>{countEquipment.toString().padStart(2, "0")}</strong><small>عناصر خدمة ظاهرة</small></div>
          </div>
          <div className="twin-studio__inspector-tabs" role="group" aria-label="قسم تفاصيل التوأم الرقمي">
            <button type="button" onClick={()=>setInspectorTab("items")} aria-pressed={inspectorTab==="items"}>العناصر والتجهيزات</button>
            <button type="button" onClick={()=>setInspectorTab("files")} aria-pressed={inspectorTab==="files"}>ملفات BIM</button>
          </div>
          {inspectorTab==="files" ? <DemoBimPanel onPick={showDemoElement}/> : <>
          <div className="twin-studio__rail-divider" />
          <div className="twin-studio__section-heading"><Sofa size={17}/><span>أثاث وتجهيزات الغرف</span><small>{getInteriorItems(activityId,0).length}</small></div>
          <div className="twin-studio__inventory" data-testid="twin-inventory">
            {getInteriorItems(activityId, Math.max(0,levelOf(floor)))
              .filter(item=>roomFilter==="all"||roomFilter===item.room)
              .map(item=><button type="button" key={item.id} className={selected===item.id?"is-active":""}
                onClick={()=>{setSelected(item.id);setFurniture(true);if(floor==="roof")setFloor("ground");setNonce(n=>n+1);}}
                title={item.description}>
                <span>{item.title}</span><small>{rooms.find(r=>r.key===item.room)?.name}</small>
              </button>)}
          </div>
          <div className="twin-studio__rail-divider" />
          <div className="twin-studio__section-heading"><Box size={17}/><span>{inspected ? "العنصر المحدد" : "دليل الأنظمة"}</span></div>
          {inspected ? <div className="twin-studio__selection">
            <span className="twin-studio__selection-tag" style={{color: SYSTEM_LIST.find(x => x.key === inspected.system)?.color}}>
              {SYSTEM_LIST.find(x => x.key === inspected.system)?.label}</span>
            <h3>{inspected.label}</h3>
            <code dir="ltr">{inspected.id}</code>
            <p>{inspected.description}</p>
            <button type="button" onClick={() => setSelected(null)}><X size={15}/> مسح التحديد</button>
          </div> : <div className="twin-studio__guidance">
            <span className="twin-studio__guidance-symbol"><Focus size={23}/></span>
            <strong>اختر شبكة، ثم اضغط أحد عناصرها</strong>
            <p>يمكنك استكشاف الأنابيب واللوحات والمعدات ومسارات الخدمات داخل كل طابق.</p>
          </div>}
          <div className="twin-studio__rail-divider"/>
          <div className="twin-studio__section-heading"><Layers3 size={17}/><span>نقاط الخدمات التفصيلية</span></div>
          <div className="twin-studio__inventory">
            {getDetailPoints(Math.max(0,levelOf(floor))).filter(p=>system==="all"||system==="architecture"||p.system===system)
              .map(point=><button type="button" key={point.id} onClick={()=>{
                setSelected(point.id);setFloor(LEVEL_KEYS[point.floor]);setSystem(point.system);
                setVisible(Object.fromEntries(SERVICE_KEYS.map(k=>[k,k===point.system])) as ServiceVisibility);
                setGhost(true);setNonce(n=>n+1);
              }}>
                <span>{point.label}</span><small>{point.specification}</small>
              </button>)}
          </div>
          </>}
          <div className="twin-studio__rail-divider"/>
          <div className="twin-studio__section-heading"><ShieldCheck size={17}/><span>حالة الدليل</span></div>
          <div className="twin-studio__evidence">
            <div><span>نتائج الفحص الفعلية</span><strong>{findingsCount} قواعد</strong></div>
            <div><span>مصدر هندسة هذا المشهد</span><strong>إجرائي تجريبي</strong></div>
            <div><span>حالة الربط مع IFC</span><strong>غير مرتبط هندسيًا</strong></div>
          </div>
          <div className="twin-studio__disclaimer"><ShieldAlert size={18}/>
            <p>المبنى والأثاث ومسارات الخدمات أمثلة هندسية مرئية وليست مخططات تنفيذ أو نتائج مستخرجة من ملف IFC. نتائج الفحص الأصلية موجودة في شاشة التقرير ولا تتغير بهذا العرض.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
