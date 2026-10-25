import { Html } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";

type Vec3 = [number, number, number];

export const SERVICE_KEYS = [
  "electricity",
  "water",
  "drainage",
  "hvac",
  "fire",
  "grounding",
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];
export type ServiceVisibility = Record<ServiceKey, boolean>;

export const SERVICE_META: Record<ServiceKey, { label: string; color: string; description: string }> = {
  electricity: {
    label: "الكهرباء",
    color: "#e5a52d",
    description: "التغذية ولوحات التوزيع والدوائر الكهربائية",
  },
  water: {
    label: "تغذية المياه",
    color: "#2489c7",
    description: "خطوط المياه الباردة والتفرعات إلى نقاط الاستخدام",
  },
  drainage: {
    label: "الصرف الصحي",
    color: "#8c6baf",
    description: "المصارف وخط التجميع وخروج الصرف من المبنى",
  },
  hvac: {
    label: "التكييف والتهوية",
    color: "#4d9a8b",
    description: "وحدة التهوية والدكت وفتحات التوزيع",
  },
  fire: {
    label: "الدفاع المدني والحريق",
    color: "#d75042",
    description: "تغذية مكافحة الحريق والرشاشات والإنذار",
  },
  grounding: {
    label: "التأريض",
    color: "#6c9c51",
    description: "ربط اللوحات بشبكة موصلات التأريض",
  },
};

export interface ServiceNode {
  id: string;
  system: ServiceKey;
  label: string;
  description: string;
  position: Vec3;
  size: Vec3;
}

interface ServicePath {
  points: Vec3[];
  radius: number;
}

interface ServiceNetwork {
  nodes: ServiceNode[];
  paths: ServicePath[];
}

// All coordinates below are authored schematic examples in the existing demo
// facility's local scene coordinates. They are NOT taken from uploaded IFC files.
export const SERVICE_NETWORKS: Record<ServiceKey, ServiceNetwork> = {
  electricity: {
    nodes: [
      { id: "DEMO-E-METER", system: "electricity", label: "عداد الكهرباء", description: "نقطة دخول التغذية الرئيسية إلى المنشأة.", position: [-7.8, 1.6, 4.85], size: [0.42, 0.65, 0.22] },
      { id: "DEMO-E-DB", system: "electricity", label: "لوحة التوزيع", description: "توزيع الدوائر إلى الإنارة والمقابس والأجهزة.", position: [-6.7, 1.55, 4.85], size: [0.62, 0.92, 0.22] },
      { id: "DEMO-E-LIGHT", system: "electricity", label: "دائرة الإنارة", description: "مسار توضيحي من لوحة التوزيع إلى نقطة الإنارة.", position: [-2.6, 2.82, 1.3], size: [0.7, 0.08, 0.5] },
      { id: "DEMO-E-OUTLET", system: "electricity", label: "نقطة كهربائية", description: "مقبس ضمن دائرة كهربائية فرعية.", position: [2.8, 0.52, 4.73], size: [0.2, 0.28, 0.1] },
    ],
    paths: [
      { points: [[-7.8, 1.6, 4.7], [-6.7, 1.55, 4.7], [-6.7, 2.76, 4.4], [-2.6, 2.76, 4.4], [-2.6, 2.76, 1.3]], radius: 0.043 },
      { points: [[-6.7, 1.55, 4.7], [-6.7, 2.67, 4.25], [2.8, 2.67, 4.25], [2.8, 0.52, 4.65]], radius: 0.035 },
    ],
  },
  water: {
    nodes: [
      { id: "DEMO-W-ENTRY", system: "water", label: "مدخل مياه التغذية", description: "نقطة تغذية تخطيطية لشبكة المياه.", position: [-7.5, 0.72, -4.8], size: [0.45, 0.45, 0.45] },
      { id: "DEMO-W-MANIFOLD", system: "water", label: "مجمع توزيع المياه", description: "نقطة تفرع شبكة المياه إلى المناطق الخدمية.", position: [0.6, 0.75, -4.8], size: [0.75, 0.4, 0.38] },
      { id: "DEMO-W-VALVE", system: "water", label: "محبس تحكم", description: "عزل فرع المياه أثناء الفحص أو الصيانة.", position: [4.6, 0.78, -3.3], size: [0.28, 0.35, 0.28] },
    ],
    paths: [
      { points: [[-7.5, 0.6, -4.8], [0.6, 0.6, -4.8], [4.6, 0.6, -4.8], [4.6, 0.6, -3.3], [4.6, 0.95, -3.3]], radius: 0.075 },
      { points: [[0.6, 0.6, -4.8], [0.6, 0.6, -2.5], [1.7, 0.6, -2.5], [1.7, 0.92, -2.5]], radius: 0.055 },
    ],
  },
  drainage: {
    nodes: [
      { id: "DEMO-D-FLOOR", system: "drainage", label: "مصرف أرضي", description: "تجميع صرف أرضية المنطقة الخدمية.", position: [5.5, 0.09, -2.25], size: [0.42, 0.1, 0.42] },
      { id: "DEMO-D-STACK", system: "drainage", label: "عمود الصرف", description: "تجميع المياه المستعملة في مسار رأسي/فرعي.", position: [6.45, 1.35, -4.1], size: [0.29, 0.55, 0.29] },
      { id: "DEMO-D-EXIT", system: "drainage", label: "مخرج شبكة الصرف", description: "مخرج توضيحي خارج نطاق المبنى؛ ليس مخطط تنفيذ.", position: [7.9, 0.12, -4.8], size: [0.36, 0.3, 0.36] },
    ],
    paths: [
      { points: [[5.5, 0.12, -2.25], [5.5, 0.08, -4.1], [6.45, 0.08, -4.1], [7.9, 0.08, -4.8]], radius: 0.105 },
      { points: [[6.45, 2.7, -4.1], [6.45, 0.1, -4.1]], radius: 0.1 },
    ],
  },
  hvac: {
    nodes: [
      { id: "DEMO-H-AHU", system: "hvac", label: "وحدة مناولة الهواء", description: "معدات تهوية توضيحية، لا تمثل تجهيزًا مستخرجًا من IFC.", position: [6.95, 2.48, -4.3], size: [1.3, 0.75, 0.9] },
      { id: "DEMO-H-DUCT", system: "hvac", label: "مجرى توزيع الهواء", description: "المجرى الرئيسي الممتد عبر السقف المستعار.", position: [0.8, 2.53, -3.8], size: [1.6, 0.4, 0.55] },
      { id: "DEMO-H-DIFF", system: "hvac", label: "ناشر هواء", description: "فتحة توزيع الهواء إلى المساحة الداخلية.", position: [-2.3, 2.78, -0.8], size: [0.8, 0.08, 0.55] },
    ],
    paths: [
      { points: [[6.95, 2.53, -4.3], [0.8, 2.53, -4.3], [-2.3, 2.53, -4.3], [-2.3, 2.53, -0.8]], radius: 0.16 },
    ],
  },
  fire: {
    nodes: [
      { id: "DEMO-F-INLET", system: "fire", label: "تغذية شبكة الإطفاء", description: "مدخل افتراضي لشبكة مكافحة الحريق.", position: [-7.65, 1.12, -4.7], size: [0.52, 0.6, 0.48] },
      { id: "DEMO-F-CABINET", system: "fire", label: "خزانة خرطوم الحريق", description: "عنصر توضيحي لمعدات الاستجابة الأولية.", position: [7.7, 1.45, 4.7], size: [0.57, 0.9, 0.22] },
      { id: "DEMO-F-SPRINKLER-1", system: "fire", label: "مرش حريق ١", description: "نقطة رش افتراضية في السقف؛ توزيعها غير معتمد هندسيًا.", position: [-3.3, 2.7, -1.8], size: [0.32, 0.18, 0.32] },
      { id: "DEMO-F-SPRINKLER-2", system: "fire", label: "مرش حريق ٢", description: "نقطة رش افتراضية ثانية في السقف.", position: [2.5, 2.7, 1.8], size: [0.32, 0.18, 0.32] },
      { id: "DEMO-F-ALARM", system: "fire", label: "لوحة إنذار الحريق", description: "مثال على لوحة إنذار؛ لا يُستخدم للحكم على الامتثال.", position: [-7.65, 1.5, 3.5], size: [0.52, 0.7, 0.2] },
    ],
    paths: [
      { points: [[-7.65, 1.12, -4.7], [-7.65, 2.65, -4.7], [-3.3, 2.65, -4.7], [-3.3, 2.65, -1.8]], radius: 0.085 },
      { points: [[-3.3, 2.65, -4.7], [2.5, 2.65, -4.7], [2.5, 2.65, 1.8]], radius: 0.08 },
      { points: [[-7.65, 2.65, -4.7], [7.7, 2.65, -4.7], [7.7, 1.45, 4.7]], radius: 0.07 },
    ],
  },
  grounding: {
    nodes: [
      { id: "DEMO-G-BAR", system: "grounding", label: "قضيب التأريض الرئيسي", description: "ربط تأريض نموذجي بمعدات التوزيع الكهربائية.", position: [-6.45, 0.42, 4.7], size: [0.46, 0.2, 0.2] },
      { id: "DEMO-G-ROD", system: "grounding", label: "قطب التأريض", description: "تمثيل بصري لموضع قطب أرضي افتراضي.", position: [-7.65, 0.2, -4.8], size: [0.22, 0.42, 0.22] },
    ],
    paths: [
      { points: [[-6.45, 0.3, 4.7], [-7.65, 0.16, 4.7], [-7.65, 0.16, -4.8], [7.65, 0.16, -4.8], [7.65, 0.16, 4.7], [-7.65, 0.16, 4.7]], radius: 0.035 },
    ],
  },
};

export const findServiceNode = (id: string | null): ServiceNode | undefined => {
  if (!id) return undefined;
  for (const system of SERVICE_KEYS) {
    const match = SERVICE_NETWORKS[system].nodes.find((node) => node.id === id);
    if (match) return match;
  }
  return undefined;
};

function Conduit({ points, color, radius }: ServicePath & { color: string }) {
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, "centripetal"),
    [points],
  );
  return (
    <mesh>
      <tubeGeometry args={[curve, Math.max(24, points.length * 12), radius, 10, false]} />
      <meshStandardMaterial color={color} metalness={0.2} roughness={0.35} />
    </mesh>
  );
}

function ServiceDevice({
  node,
  selected,
  onSelect,
}: {
  node: ServiceNode;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const color = SERVICE_META[node.system].color;
  return (
    <mesh
      name={node.id}
      position={node.position}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(node.id);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "default";
      }}
    >
      <boxGeometry args={node.size} />
      <meshStandardMaterial
        color={selected ? "#fff7dc" : color}
        metalness={0.18}
        roughness={0.4}
        emissive={selected ? color : "#000000"}
        emissiveIntensity={selected ? 0.45 : 0}
      />
      {selected && (
        <Html position={[0, node.size[1] / 2 + 0.36, 0]} center distanceFactor={10}>
          <div className="model-tooltip model-tooltip--selected" dir="rtl">
            <strong>{node.label}</strong>
            <span>{node.description}</span>
            <small>عنصر توضيحي، غير مستخرج من ملف IFC</small>
          </div>
        </Html>
      )}
    </mesh>
  );
}

export function EngineeringNetworks3D({
  visible,
  selectedId,
  onSelect,
}: {
  visible: ServiceVisibility;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <group name="illustrative-engineering-services">
      {SERVICE_KEYS.filter((system) => visible[system]).map((system) => (
        <group key={system} name={system}>
          {SERVICE_NETWORKS[system].paths.map((path, index) => (
            <Conduit key={index} {...path} color={SERVICE_META[system].color} />
          ))}
          {SERVICE_NETWORKS[system].nodes.map((node) => (
            <ServiceDevice
              key={node.id}
              node={node}
              selected={selectedId === node.id}
              onSelect={onSelect}
            />
          ))}
        </group>
      ))}
    </group>
  );
}
