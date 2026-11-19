import {
  Building2, Check, Layers3, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, RotateCcw, X,
} from "lucide-react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls, useGLTF } from "@react-three/drei";
import {
  Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent,
} from "react";
import * as THREE from "three";
import { IconButton, Wordmark } from "../brand/ui";
import { activityExamples, getDefaultFacility, type ActivityId } from "../data";
import { useMediaQuery } from "../screens/landing/useMediaQuery";
import { InteriorFitout3D, getActivityRooms, getInteriorItems, getFloorTitle, type RoomFilter } from "./InteriorFitout3D";
import { DemoBimPanel, type DemoFileElement } from "./DemoBimPanel";
import { DetailedServiceNetwork3D, getDetailPoint, getDetailPoints } from "./DetailedServiceNetwork3D";
import {
  EngineeringNetworks3D, SERVICE_KEYS, SERVICE_META,
  findServiceNode, type ServiceKey, type ServiceVisibility,
} from "./EngineeringNetworks3D";
import { TwinHaze, TwinStreet, VenueScene3D, VENUE_META, VENUE_SPOTS, getVenueSpot, type VenueKind } from "./VenueScene3D";
import { VenueAnalysisPanel, VenueBimPanel } from "./VenueEngineeringPanel";
import { getVenueElement, type VenueBimElement } from "./VenueEngineeringData";
import "./EngineeringTwinStudio.css";

type Vec3 = [number, number, number];
type Floor = "all" | "ground" | "first" | "second" | "third" | "fourth" | "roof";
const LEVEL_KEYS = ["ground","first","second","third","fourth"] as const;
const levelOf = (floor: Floor) => LEVEL_KEYS.indexOf(floor as typeof LEVEL_KEYS[number]);
type Preset = "iso" | "top" | "front" | "inside";
type Utility = ServiceKey | "architecture" | "all";
type NodeInfo = { id: string; label: string; description: string; system: Utility; position: Vec3 };
const STOREY_HEIGHT = 3.4;
const FLOOR_LIST: { key: Floor; label: string }[] = [
  { key: "all", label: "كامل المبنى" },
  { key: "ground", label: "الدور الأرضي" },
  { key: "first", label: "الدور الأول" },
  { key: "second", label: "الدور الثاني" },
  { key: "third", label: "الدور الثالث" },
  { key: "fourth", label: "الدور الرابع" },
  { key: "roof", label: "السطح والخدمات" },
];
const SYSTEM_LIST: { key: Utility; label: string; color: string }[] = [
  { key: "all", label: "جميع الأنظمة", color: "var(--brand)" },
  { key: "electricity", label: "الكهرباء", color: SERVICE_META.electricity.color },
  { key: "water", label: "المياه", color: SERVICE_META.water.color },
  { key: "drainage", label: "الصرف الصحي", color: SERVICE_META.drainage.color },
  { key: "hvac", label: "التكييف والتهوية", color: SERVICE_META.hvac.color },
  { key: "fire", label: "الحريق والسلامة", color: SERVICE_META.fire.color },
  { key: "grounding", label: "التأريض", color: SERVICE_META.grounding.color },
  { key: "architecture", label: "العمارة فقط", color: "var(--muted)" },
];

/* Studio wording that copy.ts does not carry (the studio is the only place it appears). */
const TWIN_TITLE = "استوديو التوأم الرقمي";
const TWIN_NOTE = "مشاهد توضيحية، وليست نتيجة فحص المطابقة.";
const TWIN_CLOSE = "العودة";
type SceneKey = "building" | VenueKind;
const SCENES: { key: SceneKey; label: string }[] = [
  { key: "cafe", label: "المقهى" },
  { key: "restaurant", label: "المطعم" },
  { key: "building", label: "العمارة" },
];
/** The panel's four sections, the same for every scene. */
type PanelTab = "systems" | "spaces" | "files" | "analysis";
const TABS: { key: PanelTab; label: string }[] = [
  { key: "systems", label: "الأنظمة" },
  { key: "spaces", label: "المساحات" },
  { key: "files", label: "الملفات" },
  { key: "analysis", label: "التحليلات" },
];
const VIEW_PRESETS: [Preset, string][] = [["iso", "منظور"], ["top", "علوي"], ["front", "واجهة"], ["inside", "داخلي"]];
/** Line icons share one weight across the studio (lucide, strokeWidth 1.6). */
const ICON = { size: 18, strokeWidth: 1.6, "aria-hidden": true } as const;
const ICON_SM = { size: 16, strokeWidth: 1.8, "aria-hidden": true } as const;
/** Below this width the panel is a bottom sheet (the site header changes at the same width). */
const SHEET_QUERY = "(max-width: 833px)";
const ALL_VISIBLE: ServiceVisibility = {
  electricity: true, water: true, drainage: true, hvac: true, fire: true, grounding: true,
};
const NONE_VISIBLE: ServiceVisibility = {
  electricity: false, water: false, drainage: false, hvac: false, fire: false, grounding: false,
};
const only = (key: ServiceKey) => Object.fromEntries(SERVICE_KEYS.map(k => [k, k === key])) as ServiceVisibility;
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
      showFurniture={furniture} showLabels={labels && floor !== "all"} ghost={ghost} showRoomWalls={selectedSystem === "architecture"}
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
function CameraRig({ preset, selected, floor, nonce, floorCount, freeWidth }: {
  preset: Preset; selected: Vec3 | null; floor: Floor; nonce: number; floorCount: number;
  /** Width of the canvas the panel leaves free. */
  freeWidth: number;
}) {
  const { camera, size } = useThree();
  const free = Math.min(size.width, freeWidth || size.width);
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = free < 661 ? 45 : free < 1000 ? 44 : 41;
      camera.updateProjectionMatrix();
    }
  }, [camera, free]);
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
      if (preset==="iso") desired.current.set(13,base+8.4,14);
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
    /* A narrow view (a phone, or the part the panel leaves free) stands further back. */
    if (free < 661) {
      desired.current.sub(focus.current).multiplyScalar(floor === "all" ? 1.48 : 1.06).add(focus.current);
    }
    active.current = true;
  }, [preset, selected, floor, nonce, free, floorCount]);
  useFrame(() => {
    if (!active.current || !controls.current) return;
    camera.position.lerp(desired.current, 0.12);
    controls.current.target.lerp(focus.current, 0.12);
    controls.current.update();
    if (camera.position.distanceTo(desired.current) < 0.04
      && controls.current.target.distanceTo(focus.current) < 0.04) active.current = false;
  });
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08}
    minDistance={2} maxDistance={68} minPolarAngle={0.03} maxPolarAngle={Math.PI * 0.47}
    onStart={() => { active.current = false; }} />;
}

/**
 * Keeps the scene centred in the part of the canvas the panel leaves free: the projection is shifted
 * (an architectural lens shift), so orbiting, picking and the scene labels all stay true.
 * x shifts the centre towards the left by x px, y shifts it up by y px.
 */
function ViewShift({ x, y }: { x: number; y: number }) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const current = useRef({ x, y, w: 0, h: 0 });
  useFrame(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const c = current.current;
    const nx = Math.abs(x - c.x) < 0.5 ? x : c.x + (x - c.x) * 0.16;
    const ny = Math.abs(y - c.y) < 0.5 ? y : c.y + (y - c.y) * 0.16;
    const sizeChanged = c.w !== size.width || c.h !== size.height;
    if (!sizeChanged && nx === c.x && ny === c.y && camera.view?.enabled) return;
    current.current = { x: nx, y: ny, w: size.width, h: size.height };
    camera.setViewOffset(size.width, size.height, nx, ny, size.width, size.height);
  });
  useEffect(() => () => {
    if (camera instanceof THREE.PerspectiveCamera) camera.clearViewOffset();
  }, [camera]);
  return null;
}

function Model({ floor, selectedSystem, visible, ghost, exploded, flow, selected, onSelect, preset, nonce,
  activity, floorCount, roomFilter, furniture, labels, freeWidth }: {
  floor: Floor; selectedSystem: Utility; visible: ServiceVisibility;
  ghost: boolean; exploded: boolean; flow: boolean;
  selected: string | null; onSelect: (id: string) => void; preset: Preset; nonce: number;
  activity: ActivityId; floorCount: number; roomFilter: RoomFilter; furniture: boolean; labels: boolean;
  freeWidth: number;
}) {
  /* On phones the camera rig stands 1.48 times further back; the haze moves with it so the street
     stays as legible as on a desktop. */
  const hazeScale = useThree((state) => state.size.width) < 661 ? 1.3 : 1;
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
    <TwinHaze haze={hazeScale} />
    <ambientLight intensity={0.42} />
    <hemisphereLight args={["#f3f7fb", "#8c877e", 1.15]} />
    <directionalLight castShadow position={[15, 21, 14]} intensity={2.3} color="#fff7ec"
      shadow-mapSize-width={2048} shadow-mapSize-height={2048}
      shadow-camera-left={-26} shadow-camera-right={26}
      shadow-camera-top={26} shadow-camera-bottom={-26}
      shadow-camera-near={0.5} shadow-camera-far={80}
      shadow-bias={-0.00022} />
    <directionalLight position={[-9, 7, -12]} intensity={0.38} color="#c9dbe6" />
    {/* The building stands on its own corner plot, on a Riyadh street with neighbours around it. */}
    <TwinStreet />
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
    {(floor==="all"||floor==="ground") &&
      <ContactShadows position={[0, 0.012, 0]} opacity={0.32} blur={2.5} scale={30} far={18} frames={1} />}
    <CameraRig preset={preset} selected={selectedPos} floor={floor} nonce={nonce} floorCount={floorCount} freeWidth={freeWidth} />
  </>;
}

/** A row in the panel's lists: a title, an optional muted line, pressed when chosen. */
function ListRow({ active, title, detail, onClick, hint }: {
  active: boolean; title: string; detail?: string; onClick: () => void; hint?: string;
}) {
  return <button type="button" className={"tw-row" + (active ? " is-active" : "")} aria-pressed={active}
    onClick={onClick} title={hint}>
    <span className="tw-row__text">
      <span className="tw-row__title">{title}</span>
      {detail && <span className="tw-row__detail">{detail}</span>}
    </span>
    {active && <Check className="tw-row__check" {...ICON_SM} />}
  </button>;
}

/** An on/off setting drawn as a switch; the input stays a real checkbox for keyboards and screen readers. */
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="tw-switch">
    <span className="tw-switch__label">{label}</span>
    <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="tw-switch__track" aria-hidden="true" />
  </label>;
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
  const uid = useId();
  const [scene,setScene] = useState<SceneKey>("cafe");
  const isBuilding = scene==="building";
  const venueSpots = isBuilding ? [] : VENUE_SPOTS[scene];
  const currentVenue = isBuilding ? null : VENUE_META[scene];
  // Five-storey showcase is explicitly synthetic and independent of actual IFC / facility metadata.
  const floorCount = 5;
  void floors;
  /* The five-storey building can be fitted out for any of the four activities (restaurant, cafe,
     clinic, salon). It starts with the activity chosen on the check page. */
  const [activity,setActivity] = useState<ActivityId>(activityId);
  const activityLabel = activityExamples.find(item=>item.id===activity)?.label ?? activityName;
  const buildingName = activity===activityId ? projectName : getDefaultFacility(activity).projectName;
  const [system, setSystem] = useState<Utility>("all");
  const [floor, setFloor] = useState<Floor>("all");
  const floorLevel = Math.max(0, levelOf(floor));
  const floorTitle = floor==="all" ? "المبنى كاملًا" : floor==="roof" ? "السطح والخدمات" : getFloorTitle(activity,floorLevel);
  const rooms = getActivityRooms(activity, floorLevel);
  const [tab, setTab] = useState<PanelTab>("systems");
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
  /** Desktop: the panel floats over the scene and folds away to a pill. */
  const [panelOpen, setPanelOpen] = useState(true);
  /** Phones: the panel is a bottom sheet, peeking or open. */
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheet = useMediaQuery(SHEET_QUERY);
  const [isFullscreen,setIsFullscreen] = useState(false);
  const canFullscreen = typeof document !== "undefined" && document.fullscreenEnabled !== false;
  /** How far the panel covers the canvas: the scene is centred in what is left. */
  const [shift, setShift] = useState({ x: 0, y: 0, peek: 0, free: 0 });

  const overlayRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const peekRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const hideRef = useRef<HTMLButtonElement>(null);
  const showRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedCustom = CUSTOM_NODES.find(x => x.id === selected);
  const selectedNode = findServiceNode(selected);
  const detailedNode = getDetailPoint(selected);
  const selectedUpper = selected?.startsWith("UPPER-") ? selected.split("-") : null;
  const upperSystem = selectedUpper && SERVICE_KEYS.includes(selectedUpper[2] as ServiceKey)
    ? selectedUpper[2] as ServiceKey : null;
  const selectedRoom = selected?.startsWith("ROOM-")
    ? getActivityRooms(activity, Number(selected.split("-")[1])).find(r => r.key === selected.split("-")[2])
    : null;
  const selectedFurniture = isBuilding ? [0,1,2,3,4].filter(n=>n<floorCount).flatMap(n=>getInteriorItems(activity,n)).find(item=>item.id===selected) : undefined;
  const selectedVenueSpot = isBuilding ? undefined : getVenueSpot(selected);
  const selectedVenueElement = isBuilding ? undefined : getVenueElement(scene,selected);
  const inspected = selectedVenueElement && !selectedVenueSpot ? {
       id:selectedVenueElement.sceneId,system:(selectedVenueElement.system??"architecture") as Utility,
       label:selectedVenueElement.label,description:selectedVenueElement.description+" · "+selectedVenueElement.review,
       position:selectedVenueElement.position
    } : selectedVenueSpot ? {
     id:selectedVenueSpot.id,system:"architecture" as const,label:selectedVenueSpot.title,
     description:selectedVenueSpot.description,position:selectedVenueSpot.position
   } : selectedFurniture
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
  const inspectedSystem = inspected ? SYSTEM_LIST.find(x => x.key === inspected.system) : undefined;
  /* The chosen element's kind: its network, or an architectural element (not the «العمارة فقط» filter). */
  const inspectedKind = inspected?.system === "architecture" ? "عنصر معماري" : inspectedSystem?.label;

  /** On phones every pick that moves the camera folds the sheet away, so the scene is in view. */
  const revealScene = useCallback(() => { if (sheet) setSheetOpen(false); }, [sheet]);

  const chooseScene = (next:SceneKey) => {
    if (next === scene) return;
    bodyRef.current?.scrollTo({ top: 0 });
    setScene(next);
    setSystem("all");setVisible(ALL_VISIBLE);setFloor("all");
    setGhost(true);setFurniture(true);setSelected(null);setPreset("iso");
    setSheetOpen(false);setNonce(n=>n+1);
  };
  const chooseActivity = (next:ActivityId) => {
    setActivity(next);setRoomFilter("all");setSelected(null);setNonce(n=>n+1);
  };
  const chooseFloor = (next: Floor) => {
    setFloor(next); setSelected(null); setNonce(n => n + 1); revealScene();
  };
  const focusOn = (id: string) => { setSelected(id); setNonce(n => n + 1); revealScene(); };

  const setFocusSystem = useCallback((key: Utility) => {
    setSystem(key);
    setSelected(null);
    setVisible(key === "architecture" ? NONE_VISIBLE : key === "all" ? ALL_VISIBLE : only(key));
    if (isBuilding && floor === "roof") setFloor("ground");
    setGhost(true);
    if (key === "architecture") {setRoomFilter("all");setFurniture(true);}
    setNonce(n => n + 1);
    revealScene();
  }, [floor,isBuilding,revealScene]);

  const showDemoElement = (item:DemoFileElement) => {
    setFloor(LEVEL_KEYS[item.floor] ?? "ground");
    setSelected(item.sceneId);
    const discipline = item.system;
    const key:Utility = discipline && SERVICE_KEYS.includes(discipline as ServiceKey)
      ? discipline as Utility : "architecture";
    setSystem(key);
    setVisible(key==="architecture" ? NONE_VISIBLE : only(key as ServiceKey));
    setGhost(key!=="architecture");
    setFurniture(true);
    setRoomFilter("all");
    setNonce(n=>n+1);
    revealScene();
  };
  const showVenueElement = (item:VenueBimElement) => {
    if(isBuilding)return;
    setSelected(item.sceneId);
    if(item.system){
      setSystem(item.system);
      setVisible(only(item.system));
    }else{
      setSystem("architecture");setVisible(NONE_VISIBLE);
    }
    setGhost(true);setNonce(n=>n+1);
    revealScene();
  };
  const showVenueSystem = (key:ServiceKey) => {
    setSystem(key);setSelected(null);
    setVisible(only(key));
    setGhost(true);setNonce(n=>n+1);
  };
  const showDetailPoint = (point: ReturnType<typeof getDetailPoints>[number]) => {
    setSelected(point.id);setFloor(LEVEL_KEYS[point.floor]);setSystem(point.system);
    setVisible(only(point.system));
    setGhost(true);setNonce(n=>n+1);
    revealScene();
  };
  const reset = () => {
    setSystem("all"); setFloor("all"); setRoomFilter("all"); setVisible(ALL_VISIBLE);
    setFurniture(true); setLabels(false); setGhost(true); setExploded(false); setFlow(true);
    setPreset("iso"); setSelected(null); setNonce(n => n + 1);
  };
  const chooseTab = (next: PanelTab) => {
    if (next !== tab) {
      setTab(next);
      bodyRef.current?.scrollTo({ top: 0 });
    }
    if (sheet) setSheetOpen(true);
  };
  const onTabKey = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex(item => item.key === tab);
    let next = -1;
    /* Right to left: the next tab is to the left. */
    if (event.key === "ArrowLeft") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowRight") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    chooseTab(TABS[next].key);
    tabRefs.current[next]?.focus();
  };
  const hidePanel = () => {
    setPanelOpen(false);
    requestAnimationFrame(() => showRef.current?.focus());
  };
  const showPanel = () => {
    setPanelOpen(true);
    requestAnimationFrame(() => hideRef.current?.focus());
  };
  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    handleRef.current?.focus({ preventScroll: true });
  }, []);

  /* The handle follows a drag; a short flick up opens the sheet and down folds it. */
  const drag = useRef<{ y: number; moved: boolean; base: number } | null>(null);
  const dragged = useRef(false);
  const onHandleDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const panel = panelRef.current;
    if (!sheet || !panel) return;
    const height = panel.getBoundingClientRect().height;
    drag.current = { y: event.clientY, moved: false, base: sheetOpen ? 0 : Math.max(0, height - shift.peek) };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onHandleMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const panel = panelRef.current;
    const state = drag.current;
    if (!state || !panel) return;
    const dy = event.clientY - state.y;
    if (Math.abs(dy) > 6) state.moved = true;
    if (!state.moved) return;
    const height = panel.getBoundingClientRect().height;
    const offset = Math.min(Math.max(0, height - shift.peek), Math.max(0, state.base + dy));
    panel.style.transition = "none";
    panel.style.transform = `translateY(${offset}px)`;
  };
  const onHandleUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const panel = panelRef.current;
    const state = drag.current;
    drag.current = null;
    if (!state || !panel) return;
    panel.style.transition = "";
    panel.style.transform = "";
    dragged.current = state.moved;
    if (!state.moved) return;
    const dy = event.clientY - state.y;
    if (dy < -24) setSheetOpen(true);
    else if (dy > 24) setSheetOpen(false);
  };
  const onHandleClick = () => {
    /* A drag already decided; only a tap toggles. */
    if (dragged.current) { dragged.current = false; return; }
    setSheetOpen(open => !open);
  };

  /* The studio replaces the page: move focus to its title so keyboard and screen-reader users start here. */
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    /* Escape folds the open sheet over the scene first, then leaves the studio. */
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (overlayRef.current?.querySelector(".tw-panel.is-sheet-open")) {
        closeSheet();
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = bodyOverflow; window.removeEventListener("keydown", onKey); };
  }, [onClose, closeSheet]);
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement) && document.fullscreenElement === overlayRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  /* Leaving the phone layout leaves the sheet folded, and the desktop panel open. */
  useEffect(() => {
    if (!sheet) setSheetOpen(false);
  }, [sheet]);

  /* Measure what the panel covers: its footprint beside the scene on desktop, the peeking part of the
     sheet on phones. The scene is shifted into the rest. */
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const panel = panelRef.current;
    const peekEl = peekRef.current;
    if (!stage) return;
    type Shift = { x: number; y: number; peek: number; free: number };
    const apply = (next: Shift) => setShift(prev =>
      prev.x === next.x && prev.y === next.y && prev.peek === next.peek && prev.free === next.free ? prev : next);
    const measure = () => {
      const stageBox = stage.getBoundingClientRect();
      const free = Math.round(stageBox.width);
      if (sheet) {
        /* Measured folded only: the open sheet shows more, but the scene behind it stays put. */
        if (sheetOpen) return;
        const peek = peekEl && panel ? Math.ceil(peekEl.getBoundingClientRect().height) : 0;
        apply({ x: 0, y: peek / 2, peek, free });
        return;
      }
      if (!panel || !panelOpen) {
        apply({ x: 0, y: 0, peek: 0, free });
        return;
      }
      const box = panel.getBoundingClientRect();
      const gap = box.top - stageBox.top;
      /* Right to left: the panel is at the right edge; the free part is to its left. */
      const footprint = Math.max(0, stageBox.right - box.left + gap);
      apply({ x: Math.round(footprint / 2), y: 0, peek: 0, free: Math.round(stageBox.width - footprint) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    if (panel) observer.observe(panel);
    if (peekEl) observer.observe(peekEl);
    return () => observer.disconnect();
  }, [sheet, sheetOpen, panelOpen, inspected?.id]);

  const fullScreen = async () => {
    if (!overlayRef.current) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await overlayRef.current.requestFullscreen();
    } catch { /* Fullscreen depends on the browser context. */ }
  };
  const totalVisible = SERVICE_KEYS.filter(key => visible[key]).length;
  const titleId = uid + "-title";
  const panelId = uid + "-panel";
  const bodyId = uid + "-body";
  const kicker = isBuilding ? "عمارة توضيحية · 5 أدوار · " + activityLabel : "منشأة تجريبية · دور واحد";
  const sceneTitle = isBuilding ? buildingName : currentVenue?.title ?? "";
  const sceneLine = isBuilding ? floorTitle : currentVenue?.subtitle ?? "";
  const furnitureItems = isBuilding ? getInteriorItems(activity, floorLevel) : [];
  const detailPoints = isBuilding ? getDetailPoints(floorLevel).filter(p=>system==="all"||system==="architecture"||p.system===system) : [];
  const toggles: { label: string; value: boolean; set: (value: boolean) => void }[] = [
    { label: "شفافية الجدران", value: ghost, set: setGhost },
    { label: "الأثاث والتجهيزات", value: furniture, set: setFurniture },
    ...(isBuilding ? [
      { label: "تفكيك الطوابق", value: exploded, set: setExploded },
      { label: "أسماء الغرف", value: labels, set: setLabels },
      { label: "تحريك تدفق الخدمات", value: flow, set: setFlow },
    ] : []),
  ];
  const sheetInert = sheet && !sheetOpen ? true : undefined;

  const selection = inspected && (
    <section className="tw-selection" aria-labelledby={uid + "-selection"} aria-live="polite">
      <div className="tw-selection__top">
        <span className="tw-selection__system">
          <span className="tw-dot" style={{ "--dot": inspectedSystem?.color } as CSSProperties} aria-hidden="true" />
          {inspectedKind}
        </span>
        <button type="button" className="tw-selection__clear" onClick={() => setSelected(null)}
          aria-label="مسح التحديد" title="مسح التحديد">
          <X {...ICON_SM} />
        </button>
      </div>
      <h3 id={uid + "-selection"}>{inspected.label}</h3>
      <p className="tw-selection__text">{inspected.description}</p>
      <code className="tw-selection__id" dir="ltr">{inspected.id}</code>
    </section>
  );

  return (
    <div className={"twin-studio" + (sheet ? " is-sheet" : "") + (sheet && sheetOpen ? " has-sheet-open" : "")}
      ref={overlayRef} role="dialog" aria-modal="true"
      aria-labelledby={titleId} dir="rtl" data-focus={selected !== null || preset === "inside" ? "true" : undefined}>
      <header className="tw-bar">
        <div className="tw-bar__start">
          <Wordmark className="tw-bar__brand" />
          <span className="tw-bar__rule" aria-hidden="true" />
          <div className="tw-bar__titles">
            <h1 id={titleId} ref={titleRef} tabIndex={-1}>{TWIN_TITLE}</h1>
            <p className="tw-bar__note">{TWIN_NOTE}</p>
          </div>
        </div>
        <div className="tw-seg tw-bar__scenes" role="group" aria-label="اختيار المشهد" data-testid="venue-scene-switcher">
          {SCENES.map(({key,label})=><button type="button" key={key} data-scene={key}
             className="tw-seg__item" aria-pressed={scene===key}
             onClick={()=>chooseScene(key)}>{label}</button>)}
        </div>
        <div className="tw-bar__end">
          {canFullscreen && <IconButton className="tw-bar__fullscreen" label={isFullscreen?"إنهاء ملء الشاشة":"ملء الشاشة"}
            aria-pressed={isFullscreen} onClick={() => void fullScreen()}>
            {isFullscreen ? <Minimize2 {...ICON}/> : <Maximize2 {...ICON}/>}
          </IconButton>}
          <button type="button" className="btn btn--secondary btn--small tw-bar__back" onClick={onClose}
            aria-keyshortcuts="Escape">{TWIN_CLOSE}</button>
        </div>
        {/* Phones: the note sits under the scene switcher, where there is room for it. */}
        <p className="tw-bar__note tw-bar__note--row">{TWIN_NOTE}</p>
      </header>

      <div className={"tw-body" + (panelOpen ? "" : " is-collapsed")} ref={stageRef}
        style={{ "--tw-peek": shift.peek + "px" } as CSSProperties}>
        <main className="tw-stage" aria-label="المشهد ثلاثي الأبعاد">
          <div className="tw-canvas twin-studio__canvas">
            <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: "high-performance" }}
              camera={{ position: [23, 19, 23], fov: 38, near: 0.06, far: 3200 }}
              onCreated={({gl}) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.05;
                gl.outputColorSpace = THREE.SRGBColorSpace;
              }}
              onPointerMissed={() => setSelected(null)}>
              {scene==="building"
                ? <Model floor={floor} selectedSystem={system} visible={visible}
                  ghost={ghost} exploded={exploded} flow={flow} activity={activity}
                  floorCount={floorCount} roomFilter={roomFilter} furniture={furniture} labels={labels}
                  selected={selected} onSelect={setSelected} preset={preset} nonce={nonce} freeWidth={shift.free} />
                : <VenueScene3D kind={scene} visible={visible} ghost={ghost} furniture={furniture}
                    selected={selected} onSelect={setSelected} preset={preset} nonce={nonce} freeWidth={shift.free}/>}
              <ViewShift x={shift.x} y={shift.y} />
            </Canvas>
          </div>
          {/* The free part of the stage (beside the panel): only the view switcher floats here. */}
          <div className="tw-free">
            <div className="tw-views" role="group" aria-label="زاوية العرض">
              <button type="button" className="tw-views__reset" onClick={reset} aria-label="إعادة ضبط المشهد" title="إعادة ضبط المشهد">
                <RotateCcw {...ICON_SM}/>
              </button>
              <span className="tw-views__rule" aria-hidden="true" />
              {VIEW_PRESETS.map(([key, label]) =>
                <button type="button" key={key} className="tw-seg__item" aria-pressed={preset === key}
                  onClick={() => {setPreset(key); setSelected(null); setNonce(n => n + 1);}}>{label}</button>)}
            </div>
          </div>
        </main>

        {!sheet && !panelOpen && <button ref={showRef} type="button" className="tw-reopen"
          aria-expanded={false} aria-controls={panelId} onClick={showPanel}>
          <PanelRightOpen {...ICON}/>عرض اللوحة
        </button>}

        <aside id={panelId} ref={panelRef} aria-label="لوحة الاستوديو"
          className={"tw-panel" + (inspected ? " has-selection" : "") + (sheet && sheetOpen ? " is-sheet-open" : "")}
          hidden={!sheet && !panelOpen ? true : undefined}>
          <div className="tw-panel__peek" ref={peekRef}>
            {sheet && <button type="button" ref={handleRef} className="tw-panel__handle"
              aria-expanded={sheetOpen} aria-controls={bodyId}
              aria-label={sheetOpen ? "طي اللوحة" : "توسيع اللوحة"}
              onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp} onClick={onHandleClick}>
              <span aria-hidden="true" />
            </button>}
            <div className="tw-panel__head">
              <div className="tw-panel__heading">
                <p className="tw-panel__kicker">{kicker}</p>
                <h2>{sceneTitle}</h2>
                <p className="tw-panel__line">{sceneLine}</p>
              </div>
              {!sheet && <button type="button" ref={hideRef} className="icon-btn tw-panel__hide"
                aria-label="إخفاء اللوحة" title="إخفاء اللوحة"
                aria-expanded={true} aria-controls={panelId} onClick={hidePanel}>
                <PanelRightClose {...ICON}/>
              </button>}
            </div>
            {/* Phones: the chosen element replaces the heading in the peeking part of the sheet. */}
            {sheet && selection}
            <div className="tw-seg tw-panel__tabs" role="tablist" aria-label="أقسام اللوحة">
              {TABS.map((item, index) => <button type="button" key={item.key} id={uid + "-tab-" + item.key}
                ref={(el) => { tabRefs.current[index] = el; }}
                className="tw-seg__item" role="tab" aria-selected={tab === item.key} aria-controls={bodyId}
                tabIndex={tab === item.key ? 0 : -1} onKeyDown={onTabKey}
                onClick={() => chooseTab(item.key)}>{item.label}</button>)}
            </div>
          </div>

          <div className="tw-panel__body" id={bodyId} ref={bodyRef} role="tabpanel"
            aria-labelledby={uid + "-tab-" + tab} tabIndex={0} inert={sheetInert}>
            {tab === "systems" && <>
              <section className="tw-group" aria-labelledby={uid + "-g-systems"}>
                <h3 className="tw-group__title" id={uid + "-g-systems"}>الشبكات الهندسية</h3>
                <div className="tw-list" data-testid="network-visibility-summary">
                  {SYSTEM_LIST.map(item => {
                    const network = item.key !== "all" && item.key !== "architecture";
                    const shown = item.key === "all" ? totalVisible === 6 : item.key === "architecture" ? totalVisible === 0 : visible[item.key as ServiceKey];
                    return <button key={item.key} type="button"
                      className={"tw-row tw-system" + (system === item.key ? " is-active" : "")}
                      style={{ "--dot": item.color } as CSSProperties}
                      data-network-visible={shown}
                      onClick={() => setFocusSystem(item.key)} aria-pressed={system === item.key}>
                      {item.key === "all" ? <Layers3 className="tw-system__icon" {...ICON_SM}/>
                        : item.key === "architecture" ? <Building2 className="tw-system__icon" {...ICON_SM}/>
                        : <span className={"tw-dot" + (shown ? "" : " is-off")} aria-hidden="true" />}
                      <span className="tw-row__text"><span className="tw-row__title">{item.label}</span></span>
                      {network && shown ? <span className="sr-only">، ظاهر</span> : null}
                      {system === item.key ? <Check className="tw-row__check" {...ICON_SM}/> : null}
                    </button>;
                  })}
                </div>
              </section>
              <section className="tw-group" aria-labelledby={uid + "-g-view"}>
                <h3 className="tw-group__title" id={uid + "-g-view"}>العرض</h3>
                <div className="tw-list">
                  {toggles.map(item => <Toggle key={item.label} label={item.label} checked={item.value} onChange={item.set} />)}
                </div>
              </section>
              <p className="tw-hint">اسحب لتدوير المشهد، وقرّب بالعجلة أو بإصبعين، واضغط أي عنصر لعرض تفاصيله.</p>
            </>}

            {tab === "spaces" && !isBuilding && <section className="tw-group" aria-labelledby={uid + "-g-areas"}>
              <h3 className="tw-group__title" id={uid + "-g-areas"}>مناطق المنشأة</h3>
              <div className="tw-list" data-testid="venue-room-filters">
                {venueSpots.map(spot => <ListRow key={spot.id} active={selected === spot.id}
                  title={spot.title} detail={spot.description} onClick={() => focusOn(spot.id)} />)}
              </div>
            </section>}

            {tab === "spaces" && isBuilding && <>
              <section className="tw-group">
                <label className="tw-field">
                  <span className="tw-group__title">نشاط المبنى</span>
                  <select value={activity} onChange={e=>chooseActivity(e.target.value as ActivityId)}>
                    {activityExamples.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
              </section>
              <section className="tw-group" aria-labelledby={uid + "-g-floors"}>
                <h3 className="tw-group__title" id={uid + "-g-floors"}>الأدوار</h3>
                <div className="tw-list tw-floors">
                  {FLOOR_LIST.map(item => <ListRow key={item.key} active={floor === item.key} title={item.label}
                    detail={item.key!=="all" && item.key!=="roof" ? getFloorTitle(activity,Math.max(0,levelOf(item.key))) : undefined}
                    onClick={() => chooseFloor(item.key)} />)}
                </div>
              </section>
              <section className="tw-group" aria-labelledby={uid + "-g-rooms"}>
                <h3 className="tw-group__title" id={uid + "-g-rooms"}>الغرف</h3>
                <p className="tw-group__note">{floor==="all"||floor==="roof" ? "غرف الدور الأرضي. اختر دورًا لعرض غرفه." : "غرف "+floorTitle+"."}</p>
                <div className="tw-chips" data-testid="twin-room-filters">
                  <button type="button" className="tw-chip" aria-pressed={roomFilter==="all"}
                    onClick={() => {setRoomFilter("all");setSelected(null);setNonce(n=>n+1);}}>جميع الغرف</button>
                  {rooms.map(room => (
                    <button type="button" key={room.key} className="tw-chip" aria-pressed={roomFilter===room.key}
                      onClick={() => {
                        if (floor==="roof") setFloor("ground");
                        setRoomFilter(room.key);setSelected("ROOM-"+floorLevel+"-"+room.key);setNonce(n=>n+1);
                        revealScene();
                      }}>{room.name}</button>
                  ))}
                </div>
              </section>
              <section className="tw-group" aria-labelledby={uid + "-g-items"}>
                <h3 className="tw-group__title" id={uid + "-g-items"}>الأثاث والتجهيزات</h3>
                <div className="tw-list" data-testid="twin-inventory">
                  {furnitureItems.filter(item=>roomFilter==="all"||roomFilter===item.room).map(item =>
                    <ListRow key={item.id} active={selected === item.id} title={item.title}
                      detail={rooms.find(r=>r.key===item.room)?.name} hint={item.description}
                      onClick={()=>{setFurniture(true);if(floor==="roof")setFloor("ground");focusOn(item.id);}} />)}
                </div>
              </section>
            </>}

            {tab === "files" && (isBuilding
              ? <DemoBimPanel onPick={showDemoElement}/>
              : <VenueBimPanel key={scene} kind={scene} onPick={showVenueElement}/>)}

            {tab === "analysis" && <>
              {isBuilding ? <section className="tw-group" aria-labelledby={uid + "-g-points"}>
                <h3 className="tw-group__title" id={uid + "-g-points"}>نقاط الخدمات التفصيلية</h3>
                <p className="tw-group__note">{floorTitle}{system!=="all"&&system!=="architecture" ? " · " + SYSTEM_LIST.find(s=>s.key===system)?.label : ""}. اختر نقطة لتقترب منها الكاميرا.</p>
                <div className="tw-list">
                  {detailPoints.map(point => <ListRow key={point.id} active={selected === point.id}
                    title={point.label} detail={point.specification} onClick={() => showDetailPoint(point)} />)}
                </div>
              </section>
              : <VenueAnalysisPanel key={scene} kind={scene} onSystem={showVenueSystem} onPick={showVenueElement}/>}
              <section className="tw-group" aria-labelledby={uid + "-g-evidence"}>
                <h3 className="tw-group__title" id={uid + "-g-evidence"}>حالة البيانات</h3>
                <dl className="tw-facts">
                  <div><dt>مصدر هندسة المشهد</dt><dd>إجرائي تجريبي</dd></div>
                  <div><dt>الربط مع IFC</dt><dd>{isBuilding?"غير مرتبط هندسيًا":"معرّفات تجريبية فقط"}</dd></div>
                  <div><dt>نتائج الفحص</dt><dd>{findingsCount>0?<><span className="num">{findingsCount}</span> غير مطابق في آخر فحص، ولا تُعرض هنا</>:"مستقلة عن هذا المشهد"}</dd></div>
                </dl>
                <p className="tw-group__note">مشاهد المقهى والمطعم والعمارة أمثلة ثلاثية الأبعاد مولّدة بالكود، وليست هندسة IFC أو مخططات تنفيذ. نتائج الفحص الأصلية مستقلة عنها.</p>
              </section>
            </>}
          </div>
          {/* Desktop: the chosen element stays in view at the foot of the panel, whatever the section. */}
          {!sheet && selection}
        </aside>
      </div>
    </div>
  );
}
