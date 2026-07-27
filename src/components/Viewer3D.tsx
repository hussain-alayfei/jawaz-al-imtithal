import {
  ContactShadows,
  Edges,
  Grid,
  Html,
  Line,
  OrbitControls,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Box,
  BoxSelect,
  CircleHelp,
  Compass,
  Eye,
  FileCheck2,
  Focus,
  Footprints,
  Layers3,
  Maximize2,
  Move3d,
  RotateCcw,
  Ruler,
  ScanLine,
  Tags,
} from "lucide-react";
import {
  type MouseEvent as ReactMouseEvent,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import {
  elementTargets,
  type ActivityId,
  type ResultStatus,
  type Scenario,
} from "../data";

type Vec3 = [number, number, number];
type LayerName = "shell" | "furniture" | "mep" | "spaces";
type ViewPreset = "iso" | "top" | "front" | "walk";

interface ViewerFindingMarker {
  elementId: string;
  status: ResultStatus;
  label: string;
  ruleId: string;
  title: string;
}

interface Viewer3DProps {
  activityId: ActivityId;
  scenario: Scenario;
  selectedElement?: string;
  selectedStatus?: ResultStatus;
  selectedFindingTitle?: string;
  selectedRuleId?: string;
  findingMarkers?: ViewerFindingMarker[];
  onSelectElement: (elementId: string) => void;
  onSelectFinding?: (ruleId: string, elementId: string) => void;
}

interface PartProps {
  id: string;
  name: string;
  position: Vec3;
  size: Vec3;
  color: string;
  selectedElement?: string;
  selectedStatus?: ResultStatus;
  onSelect: (id: string) => void;
  isolate: boolean;
  ghost: boolean;
  rotation?: Vec3;
  opacity?: number;
  metalness?: number;
  roughness?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  shellPart?: boolean;
  marker?: { status: ResultStatus; label: string };
}

type ModelMarker = {
  status: ResultStatus;
  label: string;
  ruleId?: string;
  title?: string;
};

interface FindingMarkerContextValue {
  byElement: Record<string, ModelMarker[]>;
  onSelectFinding?: (ruleId: string, elementId: string) => void;
}

const FindingMarkerContext = createContext<FindingMarkerContextValue | null>(
  null,
);

type CommonPartProps = Pick<
  PartProps,
  | "selectedElement"
  | "selectedStatus"
  | "onSelect"
  | "isolate"
  | "ghost"
>;

interface RoomDefinition {
  id: string;
  name: string;
  position: [number, number];
  size: [number, number];
  color: string;
  fragments?: Array<{
    position: [number, number];
    size: [number, number];
  }>;
}

interface CameraTarget {
  camera: Vec3;
  target: Vec3;
}

const statusColors: Record<ResultStatus, string> = {
  pass: "#16835d",
  fail: "#d8523c",
  unknown: "#d18a24",
};

const viewerStatusLabels: Record<ResultStatus, string> = {
  pass: "مطابق",
  fail: "ملاحظة تحتاج معالجة",
  unknown: "معلومات غير مكتملة",
};

const activityPalettes: Record<
  ActivityId,
  {
    partition: string;
    accent: string;
  }
> = {
  restaurant: {
    partition: "#ddd4c7",
    accent: "#6f969a",
  },
  cafe: {
    partition: "#ddd4c7",
    accent: "#6e739d",
  },
  clinic: {
    partition: "#d8d7d0",
    accent: "#7894c5",
  },
  salon: {
    partition: "#ded3d5",
    accent: "#b17d9b",
  },
};

const activityTitles: Record<ActivityId, string> = {
  restaurant: "مطعم",
  cafe: "مقهى",
  clinic: "عيادة",
  salon: "صالون تجميل",
};

const activityRooms: Record<ActivityId, RoomDefinition[]> = {
  restaurant: [
    {
      id: "SPACE-DINING",
      name: "صالة الطعام",
      position: [-3.1, 1.53],
      size: [9.5, 7.65],
      color: "#c49b72",
      fragments: [
        { position: [-3.1, 1.53], size: [9.5, 7.65] },
        { position: [-3.83, -3.91], size: [8.05, 2.89] },
      ],
    },
    {
      id: "SPACE-KITCHEN",
      name: "المطبخ التجاري",
      position: [4.84, 1.53],
      size: [6.02, 7.65],
      color: "#6f969a",
    },
    {
      id: "SPACE-STORAGE",
      name: "المخزن الجاف",
      position: [5.74, -3.91],
      size: [4.22, 2.89],
      color: "#9b806a",
    },
    {
      id: "SPACE-WC",
      name: "دورة المياه المهيأة",
      position: [1.84, -3.91],
      size: [3.27, 2.89],
      color: "#70a7b8",
    },
  ],
  cafe: [
    {
      id: "CAFE-SPACE-SEATING",
      name: "منطقة الجلوس",
      position: [-3.98, 1.44],
      size: [7.75, 7.83],
      color: "#b9855e",
      fragments: [
        { position: [-3.98, 1.44], size: [7.75, 7.83] },
        { position: [-3.93, -4.01], size: [7.85, 2.69] },
      ],
    },
    {
      id: "CAFE-SPACE-BAR",
      name: "منطقة تحضير القهوة",
      position: [0.94, 1.1],
      size: [1.98, 7],
      color: "#6e739d",
    },
    {
      id: "SPACE-BACK-OF-HOUSE",
      name: "التحضير والغسيل",
      position: [4.99, 1.43],
      size: [5.72, 7.85],
      color: "#7899a2",
    },
    {
      id: "SPACE-STORAGE",
      name: "المخزن",
      position: [5.62, -4.01],
      size: [4.47, 2.69],
      color: "#8f735c",
    },
    {
      id: "CAFE-SPACE-WC",
      name: "دورة المياه المهيأة",
      position: [1.61, -4.01],
      size: [3.22, 2.69],
      color: "#6ea4ae",
    },
  ],
  clinic: [
    {
      id: "CLINIC-SPACE-WAITING",
      name: "الاستقبال والانتظار",
      position: [-4.76, 1.44],
      size: [6.19, 7.82],
      color: "#6699aa",
    },
    {
      id: "SPACE-CORRIDOR",
      name: "الممر السريري",
      position: [-0.62, 0],
      size: [1.77, 10.7],
      color: "#95b6c2",
    },
    {
      id: "CLINIC-SPACE-EXAM-01",
      name: "غرفة الكشف ١",
      position: [4.14, 2.99],
      size: [7.42, 4.72],
      color: "#7894c5",
    },
    {
      id: "CLINIC-SPACE-EXAM-02",
      name: "غرفة الكشف ٢",
      position: [4.14, -2.44],
      size: [7.42, 5.82],
      color: "#968dc1",
    },
    {
      id: "CLINIC-SPACE-WC",
      name: "دورة مياه مهيأة",
      position: [-4.76, -3.99],
      size: [6.19, 2.72],
      color: "#6fa8b4",
    },
  ],
  salon: [
    {
      id: "SPACE-RECEPTION",
      name: "الاستقبال والانتظار",
      position: [-2.84, 4.1],
      size: [10.02, 2.5],
      color: "#c28f79",
    },
    {
      id: "SALON-SPACE-STYLING",
      name: "منطقة التصفيف",
      position: [-2.84, -0.3],
      size: [10.02, 6.14],
      color: "#b17d9b",
      fragments: [
        { position: [-2.84, -0.3], size: [10.02, 6.14] },
        { position: [-3.87, -4.44], size: [7.97, 1.82] },
      ],
    },
    {
      id: "SPACE-WASH",
      name: "منطقة الغسيل",
      position: [5.09, 2.94],
      size: [5.52, 4.82],
      color: "#6fa4aa",
    },
    {
      id: "SALON-SPACE-TREATMENT",
      name: "غرفة العناية",
      position: [6.45, -1.5],
      size: [2.8, 3.74],
      color: "#9582b4",
    },
    {
      id: "SALON-SPACE-NAIL",
      name: "منطقة الأظافر",
      position: [3.7, -1.5],
      size: [2.7, 3.74],
      color: "#c189aa",
    },
    {
      id: "SALON-SPACE-CHEMICAL",
      name: "خزانة المواد والتهوية",
      position: [5.74, -4.44],
      size: [4.22, 1.82],
      color: "#98765e",
    },
    {
      id: "SALON-SPACE-WC",
      name: "دورة المياه المهيأة",
      position: [1.8, -4.44],
      size: [3.35, 1.82],
      color: "#72a8b8",
    },
  ],
};

const activityRoutePoints: Record<ActivityId, Vec3[]> = {
  restaurant: [
    [-4.4, 0.11, 5.05],
    [-1.48, 0.11, 3.35],
    [-1.48, 0.11, -1.25],
    [1.75, 0.11, -1.25],
    [5.4, 0.11, -1.65],
    [5.4, 0.11, 1.7],
    [7.78, 0.11, 1.82],
  ],
  cafe: [
    [-4.4, 0.11, 5.05],
    [-0.43, 0.11, 2.9],
    [-0.43, 0.11, -1.95],
    [2.55, 0.11, -1.95],
    [3.6, 0.11, -1.95],
    [3.6, 0.11, 2.15],
    [7, 0.11, 2.15],
    [7.78, 0.11, 1.82],
  ],
  clinic: [
    [-4.4, 0.11, 5.05],
    [-4, 0.11, 3.45],
    [-1.58, 0.11, 3.45],
    [-0.65, 0.11, 2.75],
    [0.35, 0.11, 2.75],
    [1.05, 0.11, 1.2],
    [6.55, 0.11, 1.2],
    [7.78, 0.11, 1.82],
  ],
  salon: [
    [-4.4, 0.11, 5.05],
    [-2.92, 0.11, 3.2],
    [-2.92, 0.11, -0.8],
    [1.4, 0.11, -0.8],
    [1.4, 0.11, 1.6],
    [2.25, 0.11, 1.6],
    [7.78, 0.11, 1.82],
  ],
};

const activityRouteCenters: Record<ActivityId, [number, number]> = {
  restaurant: [-1.48, 1.15],
  cafe: [-0.43, 1.15],
  clinic: [-0.65, 0],
  salon: [-2.92, 0.2],
};

const activityExitIds: Record<ActivityId, string> = {
  restaurant: "D-EXIT-02",
  cafe: "CAFE-D-EXIT-02",
  clinic: "CLINIC-D-EXIT-01",
  salon: "SALON-D-EXIT-01",
};

const activityRouteIds: Record<ActivityId, string> = {
  restaurant: "COR-ACCESS-01",
  cafe: "CAFE-COR-COUNTER-01",
  clinic: "SPACE-CORRIDOR",
  salon: "SALON-COR-STYLING-01",
};

const localElementTargets: Record<string, CameraTarget> = {
  "D-MAIN-01": {
    camera: [-7.5, 4.2, 10.2],
    target: [-4.4, 1.15, 5.3],
  },
  "D-EXIT-02": {
    camera: [12, 4.8, 7],
    target: [7.8, 1.05, 1.8],
  },
  "CAFE-D-EXIT-02": {
    camera: [12, 4.8, 7],
    target: [7.8, 1.05, 1.8],
  },
  "CLINIC-D-EXIT-01": {
    camera: [12, 4.8, 7],
    target: [7.8, 1.05, 1.8],
  },
  "SALON-D-EXIT-01": {
    camera: [12, 4.8, 7],
    target: [7.8, 1.05, 1.8],
  },
  "COR-ACCESS-01": {
    camera: [5.5, 10.5, 10.5],
    target: [-0.8, 0.1, 0.8],
  },
  "CAFE-COR-COUNTER-01": {
    camera: [5.5, 10.5, 10.5],
    target: [-1.15, 0.1, 1.15],
  },
  "SALON-COR-STYLING-01": {
    camera: [5.5, 10.5, 10.5],
    target: [-1.25, 0.1, 0.2],
  },
  "CLINIC-D-EXAM-02": {
    camera: [6.2, 4.6, 3],
    target: [0.35, 1.1, -1.75],
  },
  "CLINIC-SINK-EXAM-02": {
    camera: [10.5, 4.8, 0.8],
    target: [6.65, 0.8, -1.5],
  },
  "CLINIC-VENT-EXAM-02": {
    camera: [9.2, 6.2, 1],
    target: [4.3, 2.7, -1.7],
  },
  "EQ-ESPRESSO-01": {
    camera: [6.8, 4.2, 7.5],
    target: [1.05, 1.2, 1.2],
  },
  "PLB-SINK-3C-01": {
    camera: [10.5, 5.2, 5.5],
    target: [5.7, 0.75, 2.9],
  },
  "EQ-EXAM-BED-01": {
    camera: [9.5, 5.8, 8],
    target: [4.2, 0.7, 2.65],
  },
  "EQ-EXAM-BED-02": {
    camera: [9.5, 5.8, 2],
    target: [4.2, 0.7, -1.75],
  },
  "CAB-MED-WASTE-01": {
    camera: [9.5, 4.2, -7],
    target: [5.8, 0.8, -3.55],
  },
  "EQ-STYLING-01": {
    camera: [-1, 4.6, 8.5],
    target: [-3.4, 0.9, 0.9],
  },
  "EQ-WASH-BASIN-01": {
    camera: [9.5, 4.7, 7],
    target: [4.8, 0.75, 3.25],
  },
  "SALON-STORAGE-CHEM-01": {
    camera: [10.2, 4.5, -7.5],
    target: [5.9, 1, -4.65],
  },
  "SALON-VENT-NAIL-01": {
    camera: [9.2, 6.5, -3],
    target: [4.9, 2.65, -1.35],
  },
  "SALON-SPACE-NAIL": {
    camera: [9.4, 6.2, 4],
    target: [3.7, 0.15, -1.5],
  },
  "R-SANITARY-01": {
    camera: [6.4, 4.2, -8],
    target: [1.35, 0.7, -4.55],
  },
  "C-SANITARY-01": {
    camera: [6.4, 4.2, -8],
    target: [1.35, 0.7, -4.55],
  },
  "L-SANITARY-01": {
    camera: [-9.5, 4.2, -7.8],
    target: [-5.25, 0.7, -4.2],
  },
  "S-SANITARY-01": {
    camera: [6.4, 4.2, -8],
    target: [1.35, 0.7, -4.55],
  },
};

const elementLabels: Record<string, string> = {
  "D-MAIN-01": "المدخل الرئيسي",
  "D-EXIT-02": "باب مخرج الطوارئ",
  "CAFE-D-EXIT-02": "باب مخرج المقهى",
  "CLINIC-D-EXIT-01": "باب مخرج العيادة",
  "SALON-D-EXIT-01": "باب مخرج الصالون",
  "COR-ACCESS-01": "مسار الوصول والإخلاء",
  "CAFE-COR-COUNTER-01": "ممر حاجز التحضير",
  "SALON-COR-STYLING-01": "ممر محطات التصفيف",
  "FACADE-MAIN": "واجهة زجاجية تجارية",
  "SPACE-DINING": "صالة الطعام",
  "SPACE-KITCHEN": "المطبخ التجاري",
  "CAFE-SPACE-SEATING": "منطقة الجلوس",
  "CAFE-SPACE-BAR": "منطقة تحضير القهوة",
  "CAFE-SPACE-WC": "دورة مياه المقهى",
  "CLINIC-SPACE-WAITING": "الاستقبال والانتظار",
  "SPACE-CORRIDOR": "الممر السريري",
  "CLINIC-SPACE-EXAM-01": "غرفة الكشف ١",
  "CLINIC-SPACE-EXAM-02": "غرفة الكشف ٢",
  "CLINIC-SPACE-WC": "دورة مياه العيادة",
  "CLINIC-D-EXAM-01": "باب غرفة الكشف ١",
  "CLINIC-D-EXAM-02": "باب غرفة الكشف ٢",
  "CLINIC-SINK-EXAM-02": "نقطة غسل اليدين، غرفة الكشف ٢",
  "CLINIC-VENT-EXAM-02": "نقطة تهوية غرفة الكشف ٢",
  "SALON-SPACE-STYLING": "منطقة التصفيف",
  "SALON-SPACE-TREATMENT": "غرفة العناية",
  "SALON-SPACE-NAIL": "منطقة الأظافر",
  "SALON-SPACE-WC": "دورة مياه الصالون",
  "SALON-D-TREATMENT-01": "باب غرفة العناية",
  "SALON-SINK-WASH-01": "وحدة غسل الشعر",
  "SALON-STORAGE-CHEM-01": "تخزين مواد التشغيل",
  "SALON-VENT-NAIL-01": "تهوية منطقة الأظافر",
  "R-SANITARY-01": "التجهيز الصحي للمطعم",
  "C-SANITARY-01": "التجهيز الصحي للمقهى",
  "L-SANITARY-01": "التجهيز الصحي للعيادة",
  "S-SANITARY-01": "التجهيز الصحي للصالون",
  "SPACE-WASH": "منطقة الغسيل",
  "SPACE-WC": "دورة المياه المهيأة",
  "EQ-ESPRESSO-01": "ماكينة الإسبريسو",
  "PLB-SINK-3C-01": "حوض الغسيل الثلاثي",
  "EQ-EXAM-BED-01": "سرير الكشف ١",
  "EQ-EXAM-BED-02": "سرير الكشف ٢",
  "CAB-MED-WASTE-01": "خزانة النفايات الطبية",
  "EQ-STYLING-01": "محطة التصفيف ١",
  "EQ-WASH-BASIN-01": "كرسي وحوض الغسيل",
  "CAB-CHEM-01": "خزانة المواد الكيميائية",
  "MEP-HOOD-01": "شفاط المطبخ",
  "MEP-FRESH-AIR-01": "هواء التعويض للمقهى",
  "MEP-DIFFUSER-01": "ناشر الهواء السريري",
  "MEP-EXHAUST-01": "سحب منطقة المواد",
};

function Part({
  id,
  name,
  position,
  size,
  color,
  selectedElement,
  selectedStatus = "pass",
  onSelect,
  isolate,
  ghost,
  rotation = [0, 0, 0],
  opacity = 1,
  metalness = 0,
  roughness = 0.72,
  castShadow = true,
  receiveShadow = true,
  shellPart = false,
  marker,
}: PartProps) {
  const [hovered, setHovered] = useState(false);
  const findingMarkerContext = useContext(FindingMarkerContext);
  const resolvedMarkers: ModelMarker[] =
    findingMarkerContext === null
      ? marker
        ? [marker]
        : []
      : findingMarkerContext.byElement[id] ?? [];
  const selected = selectedElement === id;
  const dimmed = isolate && Boolean(selectedElement) && !selected;
  const materialOpacity = dimmed
    ? 0.055
    : ghost && shellPart
      ? Math.min(opacity, 0.16)
      : opacity;

  return (
    <mesh
      name={id}
      userData={{ id, name }}
      position={position}
      rotation={rotation}
      castShadow={castShadow && materialOpacity > 0.25}
      receiveShadow={receiveShadow}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(id);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onSelect(id);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "default";
      }}
    >
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        emissive={selected ? statusColors[selectedStatus] : "#000000"}
        emissiveIntensity={selected ? 0.5 : 0}
        transparent={materialOpacity < 1}
        opacity={materialOpacity}
        depthWrite={materialOpacity > 0.28}
        metalness={metalness}
        roughness={roughness}
      />
      {selected && (
        <mesh scale={1.035}>
          <boxGeometry args={size} />
          <meshBasicMaterial
            color={statusColors[selectedStatus]}
            transparent
            opacity={0.12}
            depthWrite={false}
            side={THREE.BackSide}
          />
        </mesh>
      )}
      {(selected || hovered) && (
        <Edges
          scale={selected ? 1.025 : 1.006}
          color={selected ? statusColors[selectedStatus] : "#0b5d48"}
          lineWidth={selected ? 3.4 : 1.15}
        />
      )}
      {(hovered || selected) && (
        <Html
          position={[
            0,
            size[1] / 2 + (selected && resolvedMarkers.length ? 0.72 : 0.28),
            0,
          ]}
          center
          distanceFactor={9}
        >
          <div
            className={`model-tooltip ${
              selected ? `model-tooltip--selected model-tooltip--${selectedStatus}` : ""
            }`}
            dir="rtl"
          >
            {selected && <small>{viewerStatusLabels[selectedStatus]}</small>}
            <strong>{name}</strong>
            <span dir="ltr">{id}</span>
          </div>
        </Html>
      )}
      {resolvedMarkers.length > 0 && (
        <Html position={[0, size[1] / 2 + 0.16, 0]} center distanceFactor={9}>
          <div className="model-pin-group" aria-label={`نتائج مرتبطة بالعنصر ${name}`}>
            {resolvedMarkers.map((resolvedMarker, index) => (
              <button
                type="button"
                className={`model-pin model-pin--${resolvedMarker.status}`}
                aria-label={`${resolvedMarker.label}: ${
                  resolvedMarker.title ?? name
                }`}
                title={resolvedMarker.title}
                key={resolvedMarker.ruleId ?? `${resolvedMarker.label}-${index}`}
                onClick={(event: ReactMouseEvent) => {
                  event.stopPropagation();
                  if (
                    resolvedMarker.ruleId &&
                    findingMarkerContext?.onSelectFinding
                  ) {
                    findingMarkerContext.onSelectFinding(
                      resolvedMarker.ruleId,
                      id,
                    );
                    return;
                  }
                  onSelect(id);
                }}
              >
                {resolvedMarker.label}
              </button>
            ))}
          </div>
        </Html>
      )}
    </mesh>
  );
}

function DetailBox({
  position,
  size,
  color,
  rotation = [0, 0, 0],
  metalness = 0,
  roughness = 0.72,
  opacity = 1,
  castShadow = true,
}: {
  position: Vec3;
  size: Vec3;
  color: string;
  rotation?: Vec3;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  castShadow?: boolean;
}) {
  return (
    <mesh
      position={position}
      rotation={rotation}
      castShadow={castShadow && opacity > 0.25}
      receiveShadow
    >
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        metalness={metalness}
        roughness={roughness}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity > 0.3}
      />
    </mesh>
  );
}

function DetailCylinder({
  position,
  radius,
  height,
  color,
  rotation = [0, 0, 0],
  metalness = 0,
  roughness = 0.62,
}: {
  position: Vec3;
  radius: number;
  height: number;
  color: string;
  rotation?: Vec3;
  metalness?: number;
  roughness?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, height, 20]} />
      <meshStandardMaterial
        color={color}
        metalness={metalness}
        roughness={roughness}
      />
    </mesh>
  );
}

function RoomLabel({
  position,
  name,
}: {
  position: Vec3;
  name: string;
}) {
  return (
    <Html position={position} center distanceFactor={11}>
      <div
        dir="rtl"
        style={{
          padding: "5px 9px",
          border: "1px solid rgba(11,93,72,.22)",
          borderRadius: 999,
          color: "#143f35",
          background: "rgba(255,255,255,.91)",
          boxShadow: "0 5px 14px rgba(20,50,42,.12)",
          fontSize: 10,
          fontWeight: 800,
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        {name}
      </div>
    </Html>
  );
}

function DimensionLine({
  start,
  end,
  label,
  color,
}: {
  start: Vec3;
  end: Vec3;
  label: string;
  color: string;
}) {
  const midpoint: Vec3 = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2 + 0.12,
    (start[2] + end[2]) / 2,
  ];

  return (
    <group>
      <Line points={[start, end]} color={color} lineWidth={2.2} />
      <mesh position={start}>
        <sphereGeometry args={[0.055, 12, 10]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={end}>
        <sphereGeometry args={[0.055, 12, 10]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Html position={midpoint} center distanceFactor={8}>
        <div
          dir="rtl"
          style={{
            padding: "4px 7px",
            borderRadius: 5,
            color: "#fff",
            background: color,
            boxShadow: "0 4px 12px rgba(0,0,0,.18)",
            fontSize: 9,
            fontWeight: 850,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

function DoorAssembly({
  id,
  name,
  position,
  width,
  orientation,
  common,
  marker,
  kind = "glass",
}: {
  id: string;
  name: string;
  position: Vec3;
  width: number;
  orientation: "front" | "side";
  common: CommonPartProps;
  marker?: { status: ResultStatus; label: string };
  kind?: "glass" | "solid";
}) {
  const front = orientation === "front";
  const frameColor = "#2e3b39";
  const panelColor = kind === "glass" ? "#82aaa3" : "#92745e";
  const panelOpacity = kind === "glass" ? 0.58 : 1;

  return (
    <group position={position}>
      <DetailBox
        position={front ? [-width / 2 - 0.06, 1.2, 0] : [0, 1.2, -width / 2 - 0.06]}
        size={front ? [0.12, 2.4, 0.15] : [0.15, 2.4, 0.12]}
        color={frameColor}
        metalness={0.55}
        roughness={0.28}
      />
      <DetailBox
        position={front ? [width / 2 + 0.06, 1.2, 0] : [0, 1.2, width / 2 + 0.06]}
        size={front ? [0.12, 2.4, 0.15] : [0.15, 2.4, 0.12]}
        color={frameColor}
        metalness={0.55}
        roughness={0.28}
      />
      <DetailBox
        position={[0, 2.36, 0]}
        size={front ? [width + 0.24, 0.14, 0.15] : [0.15, 0.14, width + 0.24]}
        color={frameColor}
        metalness={0.55}
        roughness={0.28}
      />
      <Part
        {...common}
        id={id}
        name={name}
        position={[0, 1.16, 0]}
        size={front ? [width, 2.22, 0.065] : [0.065, 2.22, width]}
        color={panelColor}
        opacity={panelOpacity}
        metalness={kind === "glass" ? 0.12 : 0.03}
        roughness={kind === "glass" ? 0.14 : 0.6}
        shellPart
        marker={marker}
      />
      <DetailCylinder
        position={
          front
            ? [width * 0.34, 1.12, -0.07]
            : [-0.07, 1.12, width * 0.34]
        }
        radius={0.035}
        height={0.28}
        rotation={front ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2]}
        color="#d8c49a"
        metalness={0.8}
        roughness={0.2}
      />
    </group>
  );
}

function PartitionWall({
  id,
  name,
  axis,
  fixed,
  start,
  end,
  openings = [],
  color,
  accent,
  common,
}: {
  id: string;
  name: string;
  axis: "x" | "z";
  fixed: number;
  start: number;
  end: number;
  openings?: Array<{ center: number; width: number }>;
  color: string;
  accent: string;
  common: CommonPartProps;
}) {
  const wallHeight = 3.1;
  const openingHeight = 2.4;
  const thickness = 0.16;
  const sortedOpenings = openings
    .map((opening) => ({
      start: Math.max(start, opening.center - opening.width / 2),
      end: Math.min(end, opening.center + opening.width / 2),
      center: opening.center,
      width: opening.width,
    }))
    .filter((opening) => opening.end > opening.start)
    .sort((a, b) => a.start - b.start);

  const segments: Array<{ start: number; end: number }> = [];
  let cursor = start;
  sortedOpenings.forEach((opening) => {
    if (opening.start > cursor) {
      segments.push({ start: cursor, end: opening.start });
    }
    cursor = Math.max(cursor, opening.end);
  });
  if (cursor < end) segments.push({ start: cursor, end });

  const positionFor = (center: number, y: number): Vec3 =>
    axis === "x" ? [center, y, fixed] : [fixed, y, center];
  const sizeFor = (length: number, height: number): Vec3 =>
    axis === "x"
      ? [length, height, thickness]
      : [thickness, height, length];

  return (
    <group>
      {segments.map((segment, index) => {
        const length = segment.end - segment.start;
        const center = (segment.start + segment.end) / 2;
        return (
          <group key={`${segment.start}-${segment.end}`}>
            <Part
              {...common}
              id={`${id}-SEG-${index + 1}`}
              name={name}
              position={positionFor(center, wallHeight / 2)}
              size={sizeFor(length, wallHeight)}
              color={color}
              roughness={0.88}
              shellPart
            />
            <DetailBox
              position={positionFor(center, 0.085)}
              size={sizeFor(length, 0.17)}
              color={accent}
              roughness={0.66}
            />
          </group>
        );
      })}
      {sortedOpenings.map((opening, index) => (
        <Part
          key={`${opening.center}-${opening.width}`}
          {...common}
          id={`${id}-LINTEL-${index + 1}`}
          name={`${name}، عتب الفتحة`}
          position={positionFor(
            opening.center,
            openingHeight + (wallHeight - openingHeight) / 2,
          )}
          size={sizeFor(opening.end - opening.start, wallHeight - openingHeight)}
          color={color}
          roughness={0.88}
          shellPart
        />
      ))}
    </group>
  );
}

function Storefront({
  common,
  exploded,
}: {
  common: CommonPartProps;
  exploded: boolean;
}) {
  const spread = exploded ? 0.65 : 0;
  const bays = [
    { x: -6.22, width: 2.34 },
    { x: -2.3, width: 2.55 },
    { x: 0.52, width: 2.72 },
    { x: 3.43, width: 2.78 },
    { x: 6.15, width: 2.38 },
  ];

  return (
    <group position={[0, 0, spread]}>
      <Part
        {...common}
        id="FACADE-MAIN"
        name="الواجهة الزجاجية الرئيسية"
        position={[0, 2.86, 5.48]}
        size={[15.5, 0.48, 0.24]}
        color="#ddd4c7"
        roughness={0.88}
        shellPart
      />
      <DetailBox
        position={[0, 0.11, 5.48]}
        size={[15.5, 0.22, 0.24]}
        color="#7d8883"
        metalness={0.35}
        roughness={0.42}
      />
      <DetailBox
        position={[-7.72, 1.52, 5.48]}
        size={[0.56, 3.06, 0.28]}
        color="#f1ece2"
      />
      <DetailBox
        position={[7.72, 1.52, 5.48]}
        size={[0.56, 3.06, 0.28]}
        color="#f1ece2"
      />
      {bays.map(({ x, width }, index) => (
        <group key={x}>
          <mesh position={[x, 1.48, 5.48]} receiveShadow>
            <boxGeometry args={[width, 2.48, 0.055]} />
            <meshPhysicalMaterial
              color="#a9d0ca"
              transparent
              opacity={0.5}
              transmission={0.32}
              thickness={0.06}
              roughness={0.11}
              metalness={0.04}
              depthWrite={false}
            />
          </mesh>
          {index < bays.length - 1 && (
            <DetailBox
              position={[x + width / 2 + 0.035, 1.48, 5.48]}
              size={[0.075, 2.5, 0.12]}
              color="#344441"
              metalness={0.68}
              roughness={0.25}
            />
          )}
        </group>
      ))}
      <DoorAssembly
        id="D-MAIN-01"
        name="باب المدخل الرئيسي"
        position={[-4.36, 0, 5.43]}
        width={1.28}
        orientation="front"
        common={common}
      />
    </group>
  );
}

function SharedShell({
  activityId,
  scenario,
  common,
  exploded,
}: {
  activityId: ActivityId;
  scenario: Scenario;
  common: CommonPartProps;
  exploded: boolean;
}) {
  const spread = exploded ? 0.65 : 0;
  const floorDrop = exploded ? -0.5 : 0;
  const exitHasReviewIssue =
    scenario === "review" &&
    (activityId === "restaurant" || activityId === "cafe");
  const exitWidth = exitHasReviewIssue ? 0.82 : 1;

  return (
    <group>
      <Part
        {...common}
        id="SLAB-GROUND"
        name="البلاطة الخرسانية"
        position={[0, -0.18 + floorDrop, 0]}
        size={[16.3, 0.36, 11.3]}
        color="#9b968d"
        roughness={0.98}
        receiveShadow
        castShadow={false}
        shellPart
      />
      <Part
        {...common}
        id="FLOOR-FINISH"
        name="تشطيب الأرضية"
        position={[0, 0.005, 0]}
        size={[15.85, 0.045, 10.85]}
        color="#c9c2b6"
        roughness={0.82}
        receiveShadow
        castShadow={false}
        shellPart
      />
      <Part
        {...common}
        id="WALL-BACK"
        name="الجدار الخلفي"
        position={[0, 1.55, -5.5 - spread]}
        size={[16.2, 3.1, 0.24]}
        color="#f1ece2"
        roughness={0.92}
        shellPart
      />
      <Part
        {...common}
        id="WALL-LEFT"
        name="الجدار الجانبي"
        position={[-8 - spread, 1.55, 0]}
        size={[0.24, 3.1, 11.2]}
        color="#f1ece2"
        roughness={0.92}
        shellPart
      />
      <Part
        {...common}
        id="WALL-RIGHT-A"
        name="الجدار الجانبي"
        position={[8 + spread, 1.55, -2.05]}
        size={[0.24, 3.1, 6.7]}
        color="#f1ece2"
        roughness={0.92}
        shellPart
      />
      <Part
        {...common}
        id="WALL-RIGHT-B"
        name="الجدار الجانبي"
        position={[8 + spread, 1.55, 4.13]}
        size={[0.24, 3.1, 2.75]}
        color="#f1ece2"
        roughness={0.92}
        shellPart
      />
      {[
        [-7.55 - spread, 1.55, -5.05 - spread],
        [7.55 + spread, 1.55, -5.05 - spread],
        [-7.55 - spread, 1.55, 5.03 + spread],
        [7.55 + spread, 1.55, 5.03 + spread],
      ].map((position, index) => (
        <Part
          key={index}
          {...common}
          id={`COL-STRUCT-${index + 1}`}
          name="عمود إنشائي"
          position={position as Vec3}
          size={[0.42, 3.1, 0.42]}
          color="#afa69a"
          roughness={0.94}
          shellPart
        />
      ))}
      <Storefront common={common} exploded={exploded} />
      <group position={[spread, 0, 0]}>
        <DoorAssembly
          id={activityExitIds[activityId]}
          name="باب مخرج الطوارئ"
          position={[7.91, 0, 1.82]}
          width={exitWidth}
          orientation="side"
          common={common}
          marker={exitHasReviewIssue ? { status: "fail", label: "1" } : undefined}
        />
      </group>
    </group>
  );
}

function ActivityPartitions({
  activityId,
  scenario,
  common,
  exploded,
}: {
  activityId: ActivityId;
  scenario: Scenario;
  common: CommonPartProps;
  exploded: boolean;
}) {
  const y = exploded ? 0.28 : 0;
  const palette = activityPalettes[activityId];
  const partition = (
    id: string,
    name: string,
    axis: "x" | "z",
    fixed: number,
    start: number,
    end: number,
    openings: Array<{ center: number; width: number }> = [],
  ) => (
    <PartitionWall
      key={id}
      id={id}
      name={name}
      axis={axis}
      fixed={fixed}
      start={start}
      end={end}
      openings={openings}
      color={palette.partition}
      accent={palette.accent}
      common={common}
    />
  );

  if (activityId === "clinic") {
    const secondDoorWidth = scenario === "review" ? 0.78 : 0.95;
    return (
      <group position={[0, y, 0]}>
        {partition(
          "WALL-CLINIC-COR-L",
          "فاصل الممر",
          "z",
          -1.58,
          -5.35,
          5.35,
          [
            { center: 3.45, width: 1.05 },
            { center: -3.9, width: 1 },
          ],
        )}
        {partition(
          "WALL-CLINIC-COR-R",
          "فاصل غرف الكشف",
          "z",
          0.35,
          -5.35,
          5.35,
          [
            { center: 2.75, width: 0.95 },
            { center: -1.75, width: secondDoorWidth },
          ],
        )}
        {partition(
          "WALL-CONSULT-01",
          "فاصل غرف الكشف",
          "x",
          0.55,
          0.35,
          7.85,
        )}
        {partition(
          "WALL-WAIT-WC",
          "فاصل الانتظار ودورة المياه",
          "x",
          -2.55,
          -7.85,
          -1.58,
        )}
        <DoorAssembly
          id="CLINIC-D-CORRIDOR-01"
          name="باب الممر السريري"
          position={[-1.58, 0, 3.45]}
          width={1.05}
          orientation="side"
          common={common}
          kind="solid"
        />
        <DoorAssembly
          id="CLINIC-D-EXAM-01"
          name="باب غرفة الفحص ١"
          position={[0.35, 0, 2.75]}
          width={0.95}
          orientation="side"
          common={common}
          kind="solid"
        />
        <DoorAssembly
          id="CLINIC-D-EXAM-02"
          name="باب غرفة الفحص ٢"
          position={[0.35, 0, -1.75]}
          width={secondDoorWidth}
          orientation="side"
          common={common}
          kind="solid"
          marker={
            scenario === "review"
              ? { status: "fail", label: "1" }
              : undefined
          }
        />
        <DoorAssembly
          id="CLINIC-D-WC-01"
          name="باب دورة المياه المهيأة"
          position={[-1.58, 0, -3.9]}
          width={1}
          orientation="side"
          common={common}
          kind="solid"
        />
      </group>
    );
  }

  if (activityId === "salon") {
    return (
      <group position={[0, y, 0]}>
        {partition(
          "WALL-SALON-WET",
          "فاصل المنطقة الرطبة",
          "z",
          2.25,
          -0.1,
          5.35,
          [{ center: 1.6, width: 1.05 }],
        )}
        {partition(
          "WALL-SALON-TREAT",
          "فاصل منطقة العناية",
          "x",
          0.45,
          2.25,
          7.85,
          [{ center: 3.45, width: 0.95 }],
        )}
        {partition(
          "WALL-SALON-CHEM",
          "فاصل المواد ودورة المياه",
          "x",
          -3.45,
          0.12,
          7.85,
          [
            { center: 1.4, width: 0.95 },
            { center: 5.6, width: 0.95 },
          ],
        )}
        {partition(
          "WALL-SALON-WC-CHEM",
          "فاصل خزانة المواد",
          "z",
          3.55,
          -5.35,
          -3.45,
        )}
        <DoorAssembly
          id="SALON-D-WASH-01"
          name="باب منطقة الغسيل"
          position={[2.25, 0, 1.6]}
          width={1.05}
          orientation="side"
          common={common}
          kind="solid"
        />
        <DoorAssembly
          id="SALON-D-TREATMENT-01"
          name="باب غرفة العناية"
          position={[3.45, 0, 0.45]}
          width={0.95}
          orientation="front"
          common={common}
          kind="solid"
        />
        <DoorAssembly
          id="SALON-D-WC-01"
          name="باب دورة المياه المهيأة"
          position={[1.4, 0, -3.45]}
          width={0.95}
          orientation="front"
          common={common}
          kind="solid"
        />
        <DoorAssembly
          id="SALON-D-CHEMICAL-01"
          name="باب خزانة المواد"
          position={[5.6, 0, -3.45]}
          width={0.95}
          orientation="front"
          common={common}
          kind="solid"
        />
      </group>
    );
  }

  if (activityId === "cafe") {
    return (
      <group position={[0, y, 0]}>
        {partition(
          "WALL-CAFE-BOH",
          "فاصل التحضير",
          "z",
          2.05,
          -2.5,
          5.35,
          [{ center: -1.95, width: 1.05 }],
        )}
        {partition(
          "WALL-CAFE-SERVICE",
          "فاصل الخدمات",
          "x",
          -2.58,
          0,
          7.85,
          [
            { center: 1.5, width: 1 },
            { center: 5.6, width: 1 },
          ],
        )}
        {partition(
          "WALL-CAFE-WC",
          "فاصل دورة المياه",
          "z",
          3.3,
          -5.35,
          -2.58,
        )}
        <DoorAssembly
          id="CAFE-D-BOH-01"
          name="باب منطقة التحضير"
          position={[2.05, 0, -1.95]}
          width={1.05}
          orientation="side"
          common={common}
          kind="solid"
        />
        <DoorAssembly
          id="CAFE-D-WC-01"
          name="باب دورة المياه المهيأة"
          position={[1.5, 0, -2.58]}
          width={1}
          orientation="front"
          common={common}
          kind="solid"
        />
        <DoorAssembly
          id="CAFE-D-STORAGE-01"
          name="باب المخزن"
          position={[5.6, 0, -2.58]}
          width={1}
          orientation="front"
          common={common}
          kind="solid"
        />
      </group>
    );
  }

  return (
    <group position={[0, y, 0]}>
      {partition(
        "WALL-KITCHEN",
        "فاصل المطبخ",
        "z",
        1.75,
        -2.3,
        5.35,
        [{ center: -1.25, width: 1.05 }],
      )}
      {partition(
        "WALL-SERVICE",
        "فاصل الخدمات",
        "x",
        -2.38,
        0.2,
        7.85,
        [
          { center: 1.2, width: 1 },
          { center: 5.1, width: 1 },
        ],
      )}
      {partition(
        "WALL-WC",
        "فاصل دورة المياه",
        "z",
        3.55,
        -5.35,
        -2.38,
      )}
      <DoorAssembly
        id="D-KITCHEN-01"
        name="باب المطبخ"
        position={[1.75, 0, -1.25]}
        width={1.05}
        orientation="side"
        common={common}
        kind="solid"
      />
      <DoorAssembly
        id="D-WC-01"
        name="باب دورة المياه المهيأة"
        position={[1.2, 0, -2.38]}
        width={1}
        orientation="front"
        common={common}
        kind="solid"
      />
      <DoorAssembly
        id="D-STORAGE-01"
        name="باب المخزن"
        position={[5.1, 0, -2.38]}
        width={1}
        orientation="front"
        common={common}
        kind="solid"
      />
    </group>
  );
}

function DiningSet({
  id,
  name,
  position,
  common,
  compact = false,
}: {
  id: string;
  name: string;
  position: Vec3;
  common: CommonPartProps;
  compact?: boolean;
}) {
  const width = compact ? 0.9 : 1.18;
  const chairDistance = compact ? 0.62 : 0.78;
  const chairs: { position: Vec3; rotation: Vec3 }[] = [
    {
      position: [-chairDistance, 0, 0],
      rotation: [0, Math.PI / 2, 0],
    },
    {
      position: [chairDistance, 0, 0],
      rotation: [0, -Math.PI / 2, 0],
    },
    { position: [0, 0, -chairDistance], rotation: [0, 0, 0] },
    { position: [0, 0, chairDistance], rotation: [0, Math.PI, 0] },
  ];

  return (
    <group position={position}>
      <Part
        {...common}
        id={id}
        name={name}
        position={[0, 0.76, 0]}
        size={[width, 0.11, width * 0.86]}
        color="#94643f"
        roughness={0.58}
      />
      <DetailCylinder
        position={[0, 0.39, 0]}
        radius={0.08}
        height={0.72}
        color="#303c39"
        metalness={0.45}
        roughness={0.34}
      />
      <DetailBox
        position={[0, 0.07, 0]}
        size={[0.58, 0.06, 0.58]}
        color="#303c39"
        metalness={0.45}
        roughness={0.34}
      />
      {chairs.map((chair, index) => (
        <group key={index} position={chair.position} rotation={chair.rotation}>
          <DetailBox
            position={[0, 0.46, 0]}
            size={[0.4, 0.1, 0.42]}
            color="#315b50"
            roughness={0.72}
          />
          <DetailBox
            position={[0, 0.74, 0.17]}
            size={[0.4, 0.48, 0.08]}
            color="#315b50"
            roughness={0.72}
          />
          {[-0.15, 0.15].flatMap((x) =>
            [-0.14, 0.14].map((z) => (
              <DetailBox
                key={`${x}-${z}`}
                position={[x, 0.22, z]}
                size={[0.045, 0.44, 0.045]}
                color="#273a35"
                metalness={0.28}
                roughness={0.4}
              />
            )),
          )}
        </group>
      ))}
    </group>
  );
}

function CafeTableSet({
  id,
  position,
  common,
}: {
  id: string;
  position: Vec3;
  common: CommonPartProps;
}) {
  return (
    <group position={position}>
      <Part
        {...common}
        id={id}
        name="طاولة مقهى دائرية بمقعدين"
        position={[0, 0.39, 0]}
        size={[0.1, 0.72, 0.1]}
        color="#334342"
        metalness={0.42}
        roughness={0.36}
      />
      <DetailCylinder
        position={[0, 0.76, 0]}
        radius={0.55}
        height={0.1}
        color="#a8754f"
        roughness={0.52}
      />
      <DetailBox
        position={[0, 0.07, 0]}
        size={[0.5, 0.06, 0.5]}
        color="#334342"
        metalness={0.42}
        roughness={0.36}
      />
      {[-0.92, 0.92].map((x, index) => (
        <group
          key={x}
          position={[x, 0, 0]}
          rotation={[0, index === 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
        >
          <DetailBox
            position={[0, 0.47, 0]}
            size={[0.46, 0.12, 0.46]}
            color="#59638f"
            roughness={0.65}
          />
          <DetailBox
            position={[0, 0.77, 0.18]}
            size={[0.46, 0.5, 0.09]}
            color="#59638f"
            roughness={0.65}
          />
          {[-0.17, 0.17].flatMap((chairX) =>
            [-0.15, 0.15].map((chairZ) => (
              <DetailBox
                key={`${chairX}-${chairZ}`}
                position={[chairX, 0.22, chairZ]}
                size={[0.045, 0.44, 0.045]}
                color="#344342"
                metalness={0.25}
                roughness={0.4}
              />
            )),
          )}
        </group>
      ))}
    </group>
  );
}

function ManicureStation({
  id,
  position,
  common,
}: {
  id: string;
  position: Vec3;
  common: CommonPartProps;
}) {
  return (
    <group position={position}>
      <Part
        {...common}
        id={id}
        name="طاولة عناية بالأظافر مع شفط موضعي"
        position={[0, 0.76, 0]}
        size={[1.25, 0.11, 0.66]}
        color="#9a6f89"
        roughness={0.52}
      />
      {[-0.48, 0.48].map((x) => (
        <DetailBox
          key={x}
          position={[x, 0.38, 0]}
          size={[0.08, 0.72, 0.48]}
          color="#4f454d"
          roughness={0.52}
        />
      ))}
      {[-0.72, 0.72].map((z, index) => (
        <group
          key={z}
          position={[0, 0, z]}
          rotation={[0, index === 0 ? 0 : Math.PI, 0]}
        >
          <DetailBox
            position={[0, 0.49, 0]}
            size={[0.55, 0.13, 0.48]}
            color="#765d70"
            roughness={0.62}
          />
          <DetailBox
            position={[0, 0.82, 0.18]}
            size={[0.55, 0.54, 0.1]}
            color="#765d70"
            roughness={0.62}
          />
        </group>
      ))}
      <DetailCylinder
        position={[0, 0.84, 0]}
        radius={0.14}
        height={0.04}
        color="#55474f"
        metalness={0.3}
        roughness={0.35}
      />
    </group>
  );
}

function Counter({
  id,
  name,
  position,
  size,
  common,
  color = "#875b3d",
}: {
  id: string;
  name: string;
  position: Vec3;
  size: Vec3;
  common: CommonPartProps;
  color?: string;
}) {
  return (
    <group position={position}>
      <Part
        {...common}
        id={id}
        name={name}
        position={[0, size[1] / 2, 0]}
        size={size}
        color={color}
        roughness={0.62}
      />
      <DetailBox
        position={[0, size[1] + 0.045, 0]}
        size={[size[0] + 0.12, 0.09, size[2] + 0.12]}
        color="#343b39"
        metalness={0.14}
        roughness={0.3}
      />
      <DetailBox
        position={[0, 0.07, size[2] / 2 + 0.025]}
        size={[size[0] * 0.82, 0.14, 0.05]}
        color="#503a2c"
        roughness={0.7}
      />
    </group>
  );
}

function SinkStation({
  id,
  name,
  position,
  width,
  common,
  marker,
}: {
  id: string;
  name: string;
  position: Vec3;
  width: number;
  common: CommonPartProps;
  marker?: { status: ResultStatus; label: string };
}) {
  const bowls = width > 1.5 ? [-0.55, 0, 0.55] : [0];
  return (
    <group position={position}>
      <Part
        {...common}
        id={id}
        name={name}
        position={[0, 0.46, 0]}
        size={[width, 0.86, 0.66]}
        color="#9fa9a7"
        metalness={0.68}
        roughness={0.25}
        marker={marker}
      />
      <DetailBox
        position={[0, 0.93, 0]}
        size={[width + 0.08, 0.08, 0.72]}
        color="#c1cac7"
        metalness={0.78}
        roughness={0.18}
      />
      {bowls.map((x) => (
        <group key={x}>
          <DetailBox
            position={[x, 0.96, 0]}
            size={[0.43, 0.025, 0.42]}
            color="#66736f"
            metalness={0.75}
            roughness={0.2}
          />
          <DetailCylinder
            position={[x, 1.18, -0.24]}
            radius={0.025}
            height={0.4}
            color="#aeb7b4"
            metalness={0.82}
            roughness={0.16}
          />
        </group>
      ))}
    </group>
  );
}

function ExamBed({
  id,
  position,
  common,
}: {
  id: string;
  position: Vec3;
  common: CommonPartProps;
}) {
  return (
    <group position={position}>
      <Part
        {...common}
        id={id}
        name={id.endsWith("01") ? "سرير الكشف ١" : "سرير الكشف ٢"}
        position={[0, 0.72, 0]}
        size={[0.82, 0.18, 2.05]}
        color="#d9e8e7"
        roughness={0.52}
      />
      <DetailBox
        position={[0, 0.86, -0.78]}
        size={[0.82, 0.16, 0.48]}
        color="#eef3f1"
        rotation={[-0.16, 0, 0]}
        roughness={0.48}
      />
      {[-0.32, 0.32].flatMap((x) =>
        [-0.78, 0.78].map((z) => (
          <DetailBox
            key={`${x}-${z}`}
            position={[x, 0.36, z]}
            size={[0.055, 0.7, 0.055]}
            color="#687875"
            metalness={0.58}
            roughness={0.28}
          />
        )),
      )}
      <DetailCylinder
        position={[0, 1.03, -0.8]}
        radius={0.18}
        height={0.5}
        rotation={[0, 0, Math.PI / 2]}
        color="#f3f5f2"
        roughness={0.7}
      />
    </group>
  );
}

function WaitingBench({
  id,
  position,
  common,
  color = "#54766d",
}: {
  id: string;
  position: Vec3;
  common: CommonPartProps;
  color?: string;
}) {
  return (
    <group position={position}>
      <Part
        {...common}
        id={id}
        name="مقاعد الانتظار"
        position={[0, 0.5, 0]}
        size={[1.65, 0.16, 0.55]}
        color={color}
        roughness={0.68}
      />
      <DetailBox
        position={[0, 0.86, 0.23]}
        size={[1.65, 0.62, 0.1]}
        color={color}
        roughness={0.68}
      />
      {[-0.7, 0, 0.7].map((x) => (
        <DetailBox
          key={x}
          position={[x, 0.25, 0]}
          size={[0.055, 0.5, 0.055]}
          color="#344744"
          metalness={0.45}
          roughness={0.35}
        />
      ))}
    </group>
  );
}

function StylingStation({
  id,
  position,
  common,
}: {
  id: string;
  position: Vec3;
  common: CommonPartProps;
}) {
  return (
    <group position={position}>
      <Part
        {...common}
        id={id}
        name="محطة تصفيف متكاملة"
        position={[0, 0.76, 0]}
        size={[0.72, 0.11, 0.58]}
        color="#9c785d"
        roughness={0.55}
      />
      <DetailBox
        position={[0, 1.62, 0.25]}
        size={[0.92, 1.35, 0.055]}
        color="#91aaa6"
        metalness={0.38}
        roughness={0.12}
      />
      <DetailCylinder
        position={[0, 0.38, -0.76]}
        radius={0.06}
        height={0.62}
        color="#333d3b"
        metalness={0.65}
        roughness={0.28}
      />
      <DetailBox
        position={[0, 0.62, -0.76]}
        size={[0.58, 0.14, 0.55]}
        color="#4f4747"
        roughness={0.6}
      />
      <DetailBox
        position={[0, 0.97, -0.96]}
        size={[0.58, 0.58, 0.12]}
        color="#4f4747"
        roughness={0.6}
      />
      <DetailBox
        position={[0, 0.08, -0.76]}
        size={[0.62, 0.07, 0.62]}
        color="#333d3b"
        metalness={0.65}
        roughness={0.28}
      />
    </group>
  );
}

function WashBasin({
  id,
  position,
  common,
}: {
  id: string;
  position: Vec3;
  common: CommonPartProps;
}) {
  return (
    <group position={position}>
      <Part
        {...common}
        id={id}
        name="كرسي وحوض غسل الشعر"
        position={[0, 0.67, 0]}
        size={[0.78, 0.28, 0.72]}
        color="#313b3a"
        roughness={0.38}
      />
      <mesh position={[0, 0.94, 0.18]} castShadow>
        <cylinderGeometry args={[0.42, 0.32, 0.24, 28]} />
        <meshStandardMaterial color="#e5e8e5" roughness={0.22} />
      </mesh>
      <DetailBox
        position={[0, 0.5, -0.7]}
        size={[0.62, 0.16, 0.72]}
        color="#6a575b"
        roughness={0.55}
      />
      <DetailBox
        position={[0, 0.83, -0.94]}
        size={[0.62, 0.62, 0.13]}
        color="#6a575b"
        roughness={0.55}
      />
    </group>
  );
}

function RestroomFixture({
  common,
  id,
  position = [1.35, 0, -4.55],
}: {
  common: CommonPartProps;
  id: string;
  position?: Vec3;
}) {
  return (
    <group position={position}>
      <Part
        {...common}
        id={id}
        name="مرحاض مهيأ"
        position={[0, 0.42, 0]}
        size={[0.68, 0.78, 0.76]}
        color="#eef1ee"
        roughness={0.22}
      />
      <DetailBox
        position={[0, 0.88, 0.24]}
        size={[0.62, 0.55, 0.22]}
        color="#f4f6f3"
        roughness={0.2}
      />
      <mesh position={[0, 0.66, -0.16]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.25, 0.055, 12, 28]} />
        <meshStandardMaterial color="#f5f6f4" roughness={0.22} />
      </mesh>
      <DetailCylinder
        position={[-0.5, 0.73, 0]}
        radius={0.025}
        height={0.95}
        color="#d18a24"
        metalness={0.55}
        roughness={0.3}
      />
    </group>
  );
}

function RestaurantFitout({
  common,
  scenario,
}: {
  common: CommonPartProps;
  scenario: Scenario;
}) {
  const tables: Vec3[] = [
    [-5.45, 0, -2.65],
    [-2.85, 0, -2.65],
    [-5.45, 0, 0],
    [-2.85, 0, 0],
    [-5.45, 0, 2.7],
  ];
  return (
    <>
      {tables.map((position, index) => (
        <DiningSet
          key={index}
          id={`FURN-TABLE-${index + 1}`}
          name={`طاولة طعام ${index + 1}`}
          position={position}
          common={common}
        />
      ))}
      <Counter
        id="FURN-SERVICE-COUNTER"
        name="كاونتر الخدمة"
        position={[scenario === "review" ? -0.375 : -0.155, 0, 1.15]}
        size={[1.45, 1.08, 3.45]}
        common={common}
      />
      <group position={[6.75, 0, -0.5]}>
        <Part
          {...common}
          id="EQ-RANGE-01"
          name="خط الطهي التجاري"
          position={[0, 0.49, 0]}
          size={[1.25, 0.98, 2.4]}
          color="#929d9b"
          metalness={0.72}
          roughness={0.24}
        />
        {[-0.75, -0.25, 0.25, 0.75].map((z) => (
          <DetailCylinder
            key={z}
            position={[-0.24, 1, z]}
            radius={0.22}
            height={0.035}
            color="#29312f"
            metalness={0.5}
            roughness={0.3}
          />
        ))}
      </group>
      <SinkStation
        id="PLB-SINK-3C-01"
        name="حوض غسيل ثلاثي"
        position={[5.2, 0, 3.75]}
        width={1.85}
        common={common}
      />
      <SinkStation
        id="PLB-HANDWASH-01"
        name="حوض غسل اليدين"
        position={[3.2, 0, 3.9]}
        width={0.75}
        common={common}
      />
      <Counter
        id="KITCHEN-PREP-01"
        name="طاولة التحضير"
        position={[4.1, 0, 1.15]}
        size={[1.15, 0.9, 2.5]}
        color="#9ca5a2"
        common={common}
      />
      <Part
        {...common}
        id="STORAGE-RACK-01"
        name="رف التخزين الجاف"
        position={[6.65, 1.1, -4.65]}
        size={[1.65, 2.2, 0.5]}
        color="#856e56"
        roughness={0.62}
      />
      <RestroomFixture common={common} id="R-SANITARY-01" />
    </>
  );
}

function CafeFitout({
  common,
  scenario,
}: {
  common: CommonPartProps;
  scenario: Scenario;
}) {
  const counterX = scenario === "review" ? 0.66 : 0.86;
  const tables: Vec3[] = [
    [-5.6, 0, -2.5],
    [-3.25, 0, -2.5],
    [-5.6, 0, 0.3],
    [-1.97, 0, 0.3],
    [-3.25, 0, 2.65],
  ];
  return (
    <>
      {tables.map((position, index) => (
        <CafeTableSet
          key={index}
          id={`CAFE-TABLE-${index + 1}`}
          position={position}
          common={common}
        />
      ))}
      <Counter
        id="COUNTER-SERVICE-01"
        name="كاونتر تحضير وطلب القهوة"
        position={[counterX, 0, 1]}
        size={[1.4, 1.08, 5.2]}
        color="#8a5f43"
        common={common}
      />
      <group position={[counterX, 1.13, 1.3]}>
        <Part
          {...common}
          id="EQ-ESPRESSO-01"
          name="ماكينة الإسبريسو التجارية"
          position={[0, 0.28, 0]}
          size={[0.75, 0.55, 1.15]}
          color="#424d4b"
          metalness={0.64}
          roughness={0.22}
        />
        <DetailCylinder
          position={[-0.23, 0.67, -0.33]}
          radius={0.15}
          height={0.24}
          color="#b28c65"
          metalness={0.3}
          roughness={0.35}
        />
        <DetailCylinder
          position={[0.23, 0.67, -0.33]}
          radius={0.15}
          height={0.24}
          color="#b28c65"
          metalness={0.3}
          roughness={0.35}
        />
      </group>
      <Part
        {...common}
        id="EQ-DISPLAY-01"
        name="واجهة عرض المخبوزات"
        position={[counterX, 1.5, 3.1]}
        size={[1.1, 0.7, 0.75]}
        color="#a8c5c0"
        opacity={0.58}
        metalness={0.08}
        roughness={0.12}
      />
      <SinkStation
        id="CAFE-SINK-BAR-01"
        name="حوض منطقة التحضير"
        position={[5.55, 0, 3.75]}
        width={1.85}
        common={common}
      />
      <SinkStation
        id="PLB-HANDWASH-01"
        name="حوض غسل اليدين"
        position={[3.35, 0, 3.85]}
        width={0.75}
        common={common}
      />
      <Part
        {...common}
        id="EQ-REFRIGERATOR-01"
        name="ثلاجة تحت الكاونتر"
        position={[5.95, 0.56, 0.45]}
        size={[1.2, 1.12, 2.15]}
        color="#818d8a"
        metalness={0.7}
        roughness={0.24}
      />
      <RestroomFixture common={common} id="C-SANITARY-01" />
    </>
  );
}

function ClinicFitout({
  common,
  scenario,
}: {
  common: CommonPartProps;
  scenario: Scenario;
}) {
  return (
    <>
      <Counter
        id="COUNTER-RECEPTION-01"
        name="مكتب الاستقبال"
        position={[-2.8, 0, 2.2]}
        size={[0.82, 1.05, 2.5]}
        color="#58796f"
        common={common}
      />
      <WaitingBench
        id="FURN-WAITING-01"
        position={[-6.15, 0, 2.75]}
        common={common}
        color="#477a86"
      />
      <WaitingBench
        id="FURN-WAITING-02"
        position={[-6.15, 0, 0.85]}
        common={common}
        color="#477a86"
      />
      <ExamBed
        id="EQ-EXAM-BED-01"
        position={[4.45, 0, 2.75]}
        common={common}
      />
      <ExamBed
        id="EQ-EXAM-BED-02"
        position={[4.45, 0, -1.65]}
        common={common}
      />
      {scenario === "review" ? (
        <Part
          {...common}
          id="CLINIC-SINK-EXAM-02"
          name="موضع نقطة غسل اليدين غير الممثلة"
          position={[6.65, 0.46, -1.45]}
          size={[0.78, 0.86, 0.66]}
          color="#d8b0a8"
          opacity={0.24}
          castShadow={false}
          marker={{ status: "fail", label: "2" }}
        />
      ) : (
        <SinkStation
          id="CLINIC-SINK-EXAM-02"
          name="نقطة غسل اليدين، غرفة الفحص ٢"
          position={[6.65, 0, -1.45]}
          width={0.78}
          common={common}
        />
      )}
      <Part
        {...common}
        id="CAB-CLINICAL-01"
        name="خزانة المستلزمات النظيفة"
        position={[6.7, 1.05, -0.2]}
        size={[1.4, 2.1, 0.48]}
        color="#d7dedb"
        roughness={0.48}
      />
      <Part
        {...common}
        id="CAB-MED-WASTE-01"
        name="خزانة النفايات الطبية"
        position={[6.75, 0.68, -3.75]}
        size={[0.75, 1.36, 0.58]}
        color="#d8b14d"
        roughness={0.5}
      />
      <Part
        {...common}
        id="FURN-PRIVACY-SCREEN-01"
        name="حاجز خصوصية سريري"
        position={[2.05, 1.08, 3.9]}
        size={[0.08, 1.75, 1.4]}
        color="#b8ced3"
        opacity={0.82}
        roughness={0.58}
      />
      <RestroomFixture
        common={common}
        id="L-SANITARY-01"
        position={[-5.25, 0, -4.2]}
      />
    </>
  );
}

function SalonFitout({
  common,
  scenario,
}: {
  common: CommonPartProps;
  scenario: Scenario;
}) {
  return (
    <>
      <Counter
        id="COUNTER-RECEPTION-01"
        name="كاونتر الاستقبال"
        position={[-5.9, 0, 2.7]}
        size={[0.82, 1.03, 2.35]}
        color="#8d6b58"
        common={common}
      />
      <WaitingBench
        id="FURN-WAITING-01"
        position={[-5.5, 0, 4.35]}
        common={common}
        color="#7b5c70"
      />
      {[
        [-3.75, 0, 1.05],
        [scenario === "review" ? -2.09 : -1.85, 0, 1.05],
        [-3.75, 0, -2],
        [scenario === "review" ? -2.09 : -1.85, 0, -2],
      ].map((position, index) => (
        <StylingStation
          key={index}
          id={`EQ-STYLING-0${index + 1}`}
          position={position as Vec3}
          common={common}
        />
      ))}
      <WashBasin
        id="SALON-SINK-WASH-01"
        position={[4, 0, 3.2]}
        common={common}
      />
      <WashBasin
        id="EQ-WASH-BASIN-02"
        position={[6.25, 0, 3.2]}
        common={common}
      />
      <ManicureStation
        id="EQ-MANICURE-01"
        position={[4.8, 0, -1.05]}
        common={common}
      />
      <Part
        {...common}
        id="CAB-STERILIZE-01"
        name="خزانة التعقيم"
        position={[6.75, 1, -2.35]}
        size={[1.25, 2, 0.5]}
        color="#d4d9d7"
        metalness={0.25}
        roughness={0.38}
      />
      {scenario === "review" ? (
        <group position={[6.55, 0, -4.7]}>
          <Part
            {...common}
            id="SALON-STORAGE-CHEM-01"
            name="رف مواد تشغيل مفتوح"
            position={[-0.68, 1.1, 0]}
            size={[0.09, 2.2, 0.62]}
            color="#9b6f58"
            roughness={0.55}
            marker={{ status: "fail", label: "2" }}
          />
          <DetailBox
            position={[0.68, 1.1, 0]}
            size={[0.09, 2.2, 0.62]}
            color="#9b6f58"
            roughness={0.55}
          />
          {[0.18, 0.78, 1.38, 2.02].map((shelfY) => (
            <DetailBox
              key={shelfY}
              position={[0, shelfY, 0]}
              size={[1.45, 0.08, 0.62]}
              color="#b38a6d"
              roughness={0.58}
            />
          ))}
        </group>
      ) : (
        <group position={[6.55, 0, -4.7]}>
          <Part
            {...common}
            id="SALON-STORAGE-CHEM-01"
            name="خزانة مواد تشغيل مغلقة"
            position={[0, 1.1, 0]}
            size={[1.45, 2.2, 0.62]}
            color="#8b765f"
            roughness={0.55}
          />
          <DetailBox
            position={[0, 1.12, 0.325]}
            size={[0.035, 2.02, 0.025]}
            color="#443d38"
            roughness={0.4}
          />
          {[-0.12, 0.12].map((x) => (
            <DetailCylinder
              key={x}
              position={[x, 1.12, 0.36]}
              radius={0.022}
              height={0.24}
              color="#c5ad82"
              metalness={0.65}
              roughness={0.25}
            />
          ))}
        </group>
      )}
      <RestroomFixture common={common} id="S-SANITARY-01" />
    </>
  );
}

function ActivityFitout({
  activityId,
  scenario,
  common,
}: {
  activityId: ActivityId;
  scenario: Scenario;
  common: CommonPartProps;
}) {
  if (activityId === "cafe") {
    return <CafeFitout common={common} scenario={scenario} />;
  }
  if (activityId === "clinic") {
    return <ClinicFitout common={common} scenario={scenario} />;
  }
  if (activityId === "salon") {
    return <SalonFitout common={common} scenario={scenario} />;
  }
  return <RestaurantFitout common={common} scenario={scenario} />;
}

function ActivityMep({
  activityId,
  scenario,
  common,
}: {
  activityId: ActivityId;
  scenario: Scenario;
  common: CommonPartProps;
}) {
  const review = scenario === "review";

  if (activityId === "cafe") {
    return (
      <>
        <Part
          {...common}
          id="MEP-FRESH-AIR-01"
          name="هواء التعويض لمنطقة التحضير"
          position={[5.25, 2.7, 1.15]}
          size={[2.25, 0.18, 0.85]}
          color="#718681"
          metalness={0.48}
          roughness={0.3}
        />
        {[-1.8, 1.2, 4.2].map((z, index) => (
          <Part
            key={z}
            {...common}
            id={`MEP-DIFFUSER-0${index + 1}`}
            name="ناشر هواء سقفي"
            position={[0.2, 2.72, z]}
            size={[1.1, 0.09, 0.62]}
            color="#d7ddda"
            metalness={0.18}
            roughness={0.48}
          />
        ))}
      </>
    );
  }

  if (activityId === "clinic") {
    return (
      <>
        {[
          [4.3, 2.72, 2.7],
          [4.3, 2.72, -1.7],
          [-4.8, 2.72, 2.1],
        ].map((position, index) => (
          <Part
            key={index}
            {...common}
            id={
              index === 1
                ? "CLINIC-VENT-EXAM-02"
                : `CLINIC-VENT-0${index + 1}`
            }
            name="ناشر هواء سريري"
            position={position as Vec3}
            size={[1.05, 0.09, 0.62]}
            color={review && index === 1 ? "#c5a262" : "#d5dcda"}
            metalness={0.2}
            roughness={0.46}
            opacity={review && index === 1 ? 0.52 : 1}
            marker={
              review && index === 1
                ? { status: "unknown", label: "3" }
                : undefined
            }
          />
        ))}
      </>
    );
  }

  if (activityId === "salon") {
    return (
      <>
        <Part
          {...common}
          id="SALON-VENT-NAIL-01"
          name="تهوية منطقة الأظافر"
          position={[4.9, 2.55, -1.35]}
          size={[1.1, 0.52, 0.52]}
          color={review ? "#c59f62" : "#627873"}
          metalness={0.5}
          roughness={0.3}
          opacity={review ? 0.5 : 1}
          marker={review ? { status: "unknown", label: "3" } : undefined}
        />
        {!review && (
          <Part
            {...common}
            id="MEP-DUCT-01"
            name="مجرى سحب المواد"
            position={[5.9, 2.63, -2.95]}
            size={[0.58, 0.38, 3.05]}
            color="#71827e"
            metalness={0.48}
            roughness={0.3}
          />
        )}
      </>
    );
  }

  return (
    <>
      <Part
        {...common}
        id="MEP-HOOD-01"
        name="شفاط المطبخ التجاري"
        position={[6.65, 2.2, -0.5]}
        size={[1.58, 0.38, 2.6]}
        color={review ? "#c4a064" : "#748783"}
        metalness={0.62}
        roughness={0.24}
        opacity={review ? 0.48 : 1}
      />
      {!review && (
        <>
          <Part
            {...common}
            id="MEP-DUCT-01"
            name="مجرى هواء الشفاط"
            position={[6.65, 2.55, -1.55]}
            size={[0.7, 0.62, 2.75]}
            color="#6b7e7a"
            metalness={0.5}
            roughness={0.3}
          />
          <Part
            {...common}
            id="MEP-FAN-01"
            name="مروحة السحب"
            position={[6.65, 2.55, -3.25]}
            size={[1, 0.9, 0.9]}
            color="#4d625e"
            metalness={0.46}
            roughness={0.34}
          />
        </>
      )}
    </>
  );
}

function RoomZones({
  activityId,
  scenario,
  common,
  labels,
}: {
  activityId: ActivityId;
  scenario: Scenario;
  common: CommonPartProps;
  labels: boolean;
}) {
  return (
    <>
      {activityRooms[activityId].map((room) => {
        const footprints = room.fragments ?? [
          { position: room.position, size: room.size },
        ];
        const marker =
          scenario === "review" &&
          ((activityId === "restaurant" && room.id === "SPACE-KITCHEN") ||
            (activityId === "cafe" && room.id === "CAFE-SPACE-BAR"))
            ? { status: "unknown" as const, label: "3" }
            : undefined;

        return (
          <group key={room.id}>
            {footprints.map((footprint, index) => (
              <Part
                key={`${room.id}-${index}`}
                {...common}
                id={room.id}
                name={room.name}
                position={[
                  footprint.position[0],
                  0.038,
                  footprint.position[1],
                ]}
                size={[footprint.size[0], 0.035, footprint.size[1]]}
                color={room.color}
                opacity={0.86}
                castShadow={false}
                marker={index === 0 ? marker : undefined}
              />
            ))}
            {labels && (
              <RoomLabel
                position={[room.position[0], 0.18, room.position[1]]}
                name={room.name}
              />
            )}
          </group>
        );
      })}
    </>
  );
}

function RouteOverlay({
  activityId,
  scenario,
  common,
  dimensions,
}: {
  activityId: ActivityId;
  scenario: Scenario;
  common: CommonPartProps;
  dimensions: boolean;
}) {
  const review = scenario === "review";
  const routeHasReviewIssue = review && activityId !== "clinic";
  const reviewWidths: Record<ActivityId, number> = {
    restaurant: 0.76,
    cafe: 0.78,
    clinic: 1.2,
    salon: 0.74,
  };
  const width =
    activityId === "clinic"
      ? 1.77
      : routeHasReviewIssue
        ? reviewWidths[activityId]
        : 0.98;
  const [reviewCenterX, centerZ] = activityRouteCenters[activityId];
  const centerX =
    !review && activityId === "restaurant"
      ? -1.37
      : !review && activityId === "cafe"
        ? -0.33
        : !review && activityId === "salon"
          ? -2.8
          : reviewCenterX;
  const color = routeHasReviewIssue ? statusColors.fail : statusColors.pass;
  const routePoints = activityRoutePoints[activityId];

  return (
    <group>
      <Line
        points={routePoints}
        color={color}
        lineWidth={4.2}
        transparent
        opacity={0.9}
        dashed
        dashScale={2.5}
        dashSize={0.36}
        gapSize={0.18}
      />
      {routePoints.slice(1).map((point, index) => {
        const previous = routePoints[index];
        const angle = Math.atan2(
          point[0] - previous[0],
          point[2] - previous[2],
        );
        return (
          <mesh
            key={`${point[0]}-${point[2]}`}
            position={[
              (point[0] + previous[0]) / 2,
              0.13,
              (point[2] + previous[2]) / 2,
            ]}
            rotation={[Math.PI / 2, 0, -angle]}
          >
            <coneGeometry args={[0.12, 0.32, 3]} />
            <meshBasicMaterial color={color} />
          </mesh>
        );
      })}
      <Part
        {...common}
        id={activityRouteIds[activityId]}
        name="نقطة قياس مسار الوصول"
        position={[centerX, 0.072, centerZ]}
        size={[width, 0.035, 2.1]}
        color={color}
        opacity={0.32}
        castShadow={false}
        marker={
          routeHasReviewIssue
            ? {
                status: "fail",
                label: activityId === "salon" ? "1" : "2",
              }
            : undefined
        }
      />
      {dimensions && (
        <>
          <DimensionLine
            start={[centerX - width / 2, 0.19, centerZ - 0.25]}
            end={[centerX + width / 2, 0.19, centerZ - 0.25]}
            label={`${width.toFixed(2)} م / المطلوب 0.90 م`}
            color={color}
          />
          {(activityId === "restaurant" || activityId === "cafe") && (
            <DimensionLine
              start={[
                7.72,
                2.48,
                1.82 - (review ? 0.82 : 1) / 2,
              ]}
              end={[
                7.72,
                2.48,
                1.82 + (review ? 0.82 : 1) / 2,
              ]}
              label={`${review ? "0.82" : "1.00"} م`}
              color={review ? statusColors.fail : statusColors.pass}
            />
          )}
          {activityId === "clinic" && (
            <DimensionLine
              start={[0.52, 2.48, -1.75 - (review ? 0.78 : 0.95) / 2]}
              end={[0.52, 2.48, -1.75 + (review ? 0.78 : 0.95) / 2]}
              label={`${review ? "0.78" : "0.95"} م`}
              color={review ? statusColors.fail : statusColors.pass}
            />
          )}
        </>
      )}
    </group>
  );
}

interface SceneProps extends Viewer3DProps {
  layers: Record<LayerName, boolean>;
  isolate: boolean;
  ghost: boolean;
  labels: boolean;
  dimensions: boolean;
  exploded: boolean;
  preset: ViewPreset;
  focusNonce: number;
}

function CameraRig({
  selectedElement,
  preset,
  focusNonce,
}: {
  selectedElement?: string;
  preset: ViewPreset;
  focusNonce: number;
}) {
  const { camera } = useThree();
  const controls = useRef<any>(null);
  const goalPosition = useRef(new THREE.Vector3(14.5, 13.5, 16));
  const goalTarget = useRef(new THREE.Vector3(0, 0.55, 0));
  const moving = useRef(true);
  const previousSelectedElement = useRef<string | undefined>(undefined);
  const previousFocusNonce = useRef(-1);

  useEffect(() => {
    const selectedTarget = selectedElement
      ? localElementTargets[selectedElement] ?? elementTargets[selectedElement]
      : undefined;
    const selectedChanged =
      selectedElement !== previousSelectedElement.current;
    const focusRequested = focusNonce !== previousFocusNonce.current;

    if (selectedTarget && (selectedChanged || focusRequested)) {
      goalPosition.current.set(...selectedTarget.camera);
      goalTarget.current.set(...selectedTarget.target);
    } else if (preset === "top") {
      goalPosition.current.set(0, 24, 0.01);
      goalTarget.current.set(0, 0, 0);
    } else if (preset === "front") {
      goalPosition.current.set(0, 5.6, 19);
      goalTarget.current.set(0, 1, 0.25);
    } else if (preset === "walk") {
      goalPosition.current.set(-3.85, 1.62, 4.4);
      goalTarget.current.set(-1.1, 1.35, -1.8);
    } else {
      goalPosition.current.set(14.5, 13.5, 16);
      goalTarget.current.set(0, 0.55, 0);
    }
    previousSelectedElement.current = selectedElement;
    previousFocusNonce.current = focusNonce;
    moving.current = true;
  }, [camera, focusNonce, preset, selectedElement]);

  useFrame(() => {
    if (!moving.current || !controls.current) return;
    camera.position.lerp(goalPosition.current, 0.14);
    controls.current.target.lerp(goalTarget.current, 0.16);
    controls.current.update();

    if (
      camera.position.distanceTo(goalPosition.current) < 0.035 &&
      controls.current.target.distanceTo(goalTarget.current) < 0.035
    ) {
      moving.current = false;
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.07}
      minDistance={preset === "walk" ? 0.8 : 3.5}
      maxDistance={36}
      minPolarAngle={0.08}
      maxPolarAngle={preset === "walk" ? Math.PI * 0.82 : Math.PI / 2.02}
      screenSpacePanning
      onStart={() => {
        moving.current = false;
      }}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
    />
  );
}

function FacilityScene({
  activityId,
  scenario,
  selectedElement,
  selectedStatus,
  onSelectElement,
  layers,
  isolate,
  ghost,
  labels,
  dimensions,
  exploded,
  preset,
  focusNonce,
}: SceneProps) {
  const common: CommonPartProps = {
    selectedElement,
    selectedStatus,
    onSelect: onSelectElement,
    isolate,
    ghost,
  };

  return (
    <>
      <color attach="background" args={["#dfe9e6"]} />
      <fog attach="fog" args={["#dfe9e6", 28, 54]} />
      <ambientLight intensity={0.3} />
      <hemisphereLight args={["#f7fff9", "#948b7e", 0.56]} />
      <directionalLight
        position={[9, 15, 10]}
        intensity={2}
        castShadow
        shadow-mapSize-width={1536}
        shadow-mapSize-height={1536}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={38}
        shadow-bias={-0.00018}
      />
      <directionalLight position={[-8, 7, -6]} intensity={0.36} color="#b9d4cf" />

      {layers.shell && (
        <>
          <SharedShell
            activityId={activityId}
            scenario={scenario}
            common={common}
            exploded={exploded}
          />
          <ActivityPartitions
            activityId={activityId}
            scenario={scenario}
            common={common}
            exploded={exploded}
          />
        </>
      )}

      {layers.spaces && (
        <group position={[0, exploded ? 0.18 : 0, 0]}>
          <RoomZones
            activityId={activityId}
            scenario={scenario}
            common={common}
            labels={labels}
          />
          <RouteOverlay
            activityId={activityId}
            scenario={scenario}
            common={common}
            dimensions={dimensions}
          />
        </group>
      )}

      {layers.furniture && (
        <group position={[0, exploded ? 0.62 : 0, 0]}>
          <ActivityFitout
            activityId={activityId}
            scenario={scenario}
            common={common}
          />
        </group>
      )}

      {layers.mep && (
        <group position={[0, exploded ? 1.2 : 0, 0]}>
          <ActivityMep
            activityId={activityId}
            scenario={scenario}
            common={common}
          />
        </group>
      )}

      <Grid
        args={[50, 50]}
        position={[0, -0.39 - (exploded ? 0.5 : 0), 0]}
        cellSize={1}
        cellThickness={0.45}
        cellColor="#aebcb5"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#738a80"
        fadeDistance={31}
        fadeStrength={1.55}
        infiniteGrid
      />
      <ContactShadows
        position={[0, -0.36 - (exploded ? 0.5 : 0), 0]}
        opacity={0.46}
        scale={29}
        blur={2.25}
        far={12}
        frames={1}
      />
      <CameraRig
        selectedElement={selectedElement}
        preset={preset}
        focusNonce={focusNonce}
      />
    </>
  );
}

const chromePanelStyle: React.CSSProperties = {
  position: "absolute",
  zIndex: 6,
  color: "#263832",
  background: "rgba(255,255,255,.96)",
  border: "1px solid rgba(190,203,196,.95)",
  borderRadius: 10,
  boxShadow: "0 8px 22px rgba(30,52,44,.13)",
};

export function Viewer3D({
  activityId,
  scenario,
  selectedElement,
  selectedStatus,
  selectedFindingTitle,
  selectedRuleId,
  findingMarkers = [],
  onSelectElement,
  onSelectFinding,
}: Viewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layers, setLayers] = useState<Record<LayerName, boolean>>({
    shell: true,
    furniture: true,
    mep: true,
    spaces: true,
  });
  const [layersOpen, setLayersOpen] = useState(false);
  const [isolate, setIsolate] = useState(false);
  const [ghost, setGhost] = useState(false);
  const [labels, setLabels] = useState(true);
  const [dimensions, setDimensions] = useState(true);
  const [exploded, setExploded] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [preset, setPreset] = useState<ViewPreset>("iso");
  const [focusNonce, setFocusNonce] = useState(0);

  const selectedName = useMemo(
    () =>
      selectedElement
        ? elementLabels[selectedElement] ?? selectedElement
        : undefined,
    [selectedElement],
  );
  const selectionStatus = selectedStatus ?? "pass";
  const isFileResult = Boolean(selectedFindingTitle && !selectedElement);
  const findingMarkerContext = useMemo<FindingMarkerContextValue>(() => {
    const byElement: Record<string, ModelMarker[]> = {};
    findingMarkers.forEach((markerItem) => {
      const markers = byElement[markerItem.elementId] ?? [];
      markers.push({
        status: markerItem.status,
        label: markerItem.label,
        ruleId: markerItem.ruleId,
        title: markerItem.title,
      });
      byElement[markerItem.elementId] = markers;
    });
    return { byElement, onSelectFinding };
  }, [findingMarkers, onSelectFinding]);

  const toggleLayer = (layer: LayerName) =>
    setLayers((current) => ({ ...current, [layer]: !current[layer] }));

  const selectPreset = useCallback(
    (nextPreset: ViewPreset) => {
      setPreset(nextPreset);
      setIsolate(false);
    },
    [],
  );

  const resetView = useCallback(() => {
    setGhost(false);
    setExploded(false);
    onSelectElement("");
    selectPreset("iso");
  }, [onSelectElement, selectPreset]);

  useEffect(() => {
    if (!selectedElement) setIsolate(false);
  }, [selectedElement]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }

      if (event.key === "1") selectPreset("iso");
      if (event.key === "2") selectPreset("top");
      if (event.key === "3") selectPreset("front");
      if (event.key === "4") selectPreset("walk");
      if (event.key.toLowerCase() === "f" && selectedElement) {
        setFocusNonce((value) => value + 1);
      }
      if (event.key === "Escape") {
        onSelectElement("");
        setIsolate(false);
        setLayersOpen(false);
        setHelpOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSelectElement, selectPreset, selectedElement]);

  const requestFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current.requestFullscreen();
      }
    } catch {
      // Fullscreen can be blocked by browser policy. The viewer remains usable.
    }
  };

  return (
    <div
      className="viewer"
      ref={containerRef}
      onPointerLeave={() => {
        document.body.style.cursor = "default";
      }}
      data-activity={activityId}
    >
      <div
        className="viewer__canvas"
        aria-label={`عارض ثلاثي الأبعاد تفاعلي لنشاط ${activityTitles[activityId]}`}
      >
        <Canvas
          shadows
          dpr={[1, 1.65]}
          gl={{
            antialias: true,
            powerPreference: "high-performance",
          }}
          camera={{
            position: [14.5, 13.5, 16],
            fov: 34,
            near: 0.1,
            far: 120,
          }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 0.97;
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
          onPointerMissed={() => onSelectElement("")}
        >
          <FindingMarkerContext.Provider value={findingMarkerContext}>
            <FacilityScene
              activityId={activityId}
              scenario={scenario}
              selectedElement={selectedElement}
              selectedStatus={selectedStatus}
              onSelectElement={onSelectElement}
              layers={layers}
              isolate={isolate}
              ghost={ghost}
              labels={labels}
              dimensions={dimensions}
              exploded={exploded}
              preset={preset}
              focusNonce={focusNonce}
            />
          </FindingMarkerContext.Provider>
        </Canvas>
      </div>

      <div
        className="viewer__toolbar"
        aria-label="أدوات العارض ثلاثي الأبعاد"
        style={{ flexWrap: "wrap", maxWidth: "calc(100% - 24px)" }}
      >
        <button
          type="button"
          onClick={resetView}
          title="إعادة ضبط المشهد"
          aria-label="إعادة ضبط المشهد"
          data-testid="viewer-reset"
        >
          <RotateCcw size={17} />
        </button>
        <button
          type="button"
          className={preset === "top" ? "is-active" : ""}
          onClick={() => selectPreset("top")}
          title="المسقط الأفقي"
          aria-label="المسقط الأفقي"
          data-testid="viewer-preset-top"
        >
          <ScanLine size={18} />
        </button>
        <button
          type="button"
          className={preset === "front" ? "is-active" : ""}
          onClick={() => selectPreset("front")}
          title="الواجهة الأمامية"
          aria-label="الواجهة الأمامية"
          data-testid="viewer-preset-front"
        >
          <Box size={18} />
        </button>
        <button
          type="button"
          className={preset === "walk" ? "is-active" : ""}
          onClick={() => selectPreset("walk")}
          title="منظور داخلي"
          aria-label="منظور داخلي"
          data-testid="viewer-preset-walk"
        >
          <Footprints size={18} />
        </button>
        <button
          type="button"
          className={isolate ? "is-active" : ""}
          onClick={() => setIsolate((value) => !value)}
          disabled={!selectedElement}
          title="عزل العنصر المحدد"
          aria-label="عزل العنصر المحدد"
          aria-pressed={isolate}
          data-testid="viewer-isolate"
        >
          <BoxSelect size={18} />
        </button>
        <button
          type="button"
          className={ghost ? "is-active" : ""}
          onClick={() => setGhost((value) => !value)}
          title="شفافية الغلاف المعماري"
          aria-label="شفافية الغلاف المعماري"
          aria-pressed={ghost}
          data-testid="viewer-ghost"
        >
          <Eye size={18} />
        </button>
        <button
          type="button"
          className={labels ? "is-active" : ""}
          onClick={() => setLabels((value) => !value)}
          title="إظهار أسماء المساحات"
          aria-label="إظهار أسماء المساحات"
          aria-pressed={labels}
          data-testid="viewer-labels-toggle"
        >
          <Tags size={18} />
        </button>
        <button
          type="button"
          className={dimensions ? "is-active" : ""}
          onClick={() => setDimensions((value) => !value)}
          title="إظهار القياسات"
          aria-label="إظهار القياسات"
          aria-pressed={dimensions}
          data-testid="viewer-dimensions-toggle"
        >
          <Ruler size={18} />
        </button>
        <button
          type="button"
          className={exploded ? "is-active" : ""}
          onClick={() => setExploded((value) => !value)}
          title="عرض المشهد المفكك"
          aria-label="عرض المشهد المفكك"
          aria-pressed={exploded}
          data-testid="viewer-exploded-toggle"
        >
          <Move3d size={18} />
        </button>
        <div className="viewer__layer-wrap">
          <button
            type="button"
            className={layersOpen ? "is-active" : ""}
            onClick={() => setLayersOpen((value) => !value)}
            title="طبقات النموذج"
            aria-label="طبقات النموذج"
            aria-expanded={layersOpen}
            data-testid="viewer-layers"
          >
            <Layers3 size={18} />
          </button>
          {layersOpen && (
            <div className="viewer__layers" dir="rtl">
              <strong>طبقات النموذج</strong>
              {(
                [
                  ["shell", "الغلاف والإنشاء"],
                  ["spaces", "المساحات والمسارات"],
                  ["furniture", "الأثاث والتجهيزات"],
                  ["mep", "الميكانيكا والتهوية"],
                ] as [LayerName, string][]
              ).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={() => toggleLayer(key)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void requestFullscreen()}
          title="ملء الشاشة"
          aria-label="ملء الشاشة"
          data-testid="viewer-fullscreen"
        >
          <Maximize2 size={18} />
        </button>
        <button
          type="button"
          className={helpOpen ? "is-active" : ""}
          onClick={() => setHelpOpen((value) => !value)}
          title="مساعدة التحكم"
          aria-label="مساعدة التحكم"
          aria-expanded={helpOpen}
          data-testid="viewer-help"
        >
          <CircleHelp size={18} />
        </button>
      </div>

      {helpOpen && (
        <div
          dir="rtl"
          role="status"
          data-testid="viewer-help-panel"
          style={{
            ...chromePanelStyle,
            top: 61,
            right: 12,
            width: 230,
            padding: "12px 14px",
            fontSize: 10,
            lineHeight: 1.8,
          }}
        >
          <strong style={{ display: "block", marginBottom: 4 }}>
            التحكم في النموذج
          </strong>
          <span style={{ display: "block" }}>السحب: تدوير • العجلة: تقريب</span>
          <span style={{ display: "block" }}>الزر الأيمن: تحريك المشهد</span>
          <span style={{ display: "block" }}>١–٤: زوايا العرض • F: تركيز</span>
          <span style={{ display: "block" }}>Esc: إلغاء التحديد</span>
        </div>
      )}

      <div className="viewer__meta">
        <span className="viewer__live-dot" />
        مشهد {activityTitles[activityId]} دلالي توضيحي
        <span>•</span>
        الطابق الأرضي
      </div>

      <div
        aria-label="بوصلة النموذج"
        title="الشمال"
        style={{
          ...chromePanelStyle,
          left: 13,
          top: 48,
          width: 38,
          height: 38,
          display: "grid",
          placeItems: "center",
          color: "#0b5d48",
          pointerEvents: "none",
        }}
      >
        <Compass size={23} />
        <strong
          style={{
            position: "absolute",
            top: 1,
            fontSize: 7,
            lineHeight: 1,
          }}
        >
          ش
        </strong>
      </div>

      {(selectedElement || selectedFindingTitle) && (
        <div
          className={`viewer__selection viewer__selection--${selectionStatus} ${
            isFileResult ? "viewer__selection--file" : ""
          }`}
          dir="rtl"
          role="status"
        >
          <span className="viewer__selection-icon">
            {isFileResult ? <FileCheck2 size={17} /> : <Focus size={17} />}
          </span>
          <span className="viewer__selection-copy">
            <small>
              {isFileResult
                ? "نتيجة على مستوى الملف"
                : viewerStatusLabels[selectionStatus]}
            </small>
            <strong>{selectedFindingTitle ?? selectedName}</strong>
            <span>
              {isFileResult
                ? "لا يوجد عنصر هندسي مرتبط بهذه النتيجة"
                : selectedName}
              {selectedRuleId && <code dir="ltr">{selectedRuleId}</code>}
              {!selectedRuleId && selectedElement && (
                <code dir="ltr">{selectedElement}</code>
              )}
            </span>
          </span>
        </div>
      )}

      <div className="viewer__legend">
        <span>
          <i className="legend-dot legend-dot--fail" /> ملاحظة
        </span>
        <span>
          <i className="legend-dot legend-dot--unknown" /> معلومات ناقصة
        </span>
        <span>
          <i className="legend-dot legend-dot--pass" /> مطابق
        </span>
      </div>
    </div>
  );
}
