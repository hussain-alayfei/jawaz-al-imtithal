import {
  ContactShadows,
  Edges,
  Grid,
  Html,
  OrbitControls,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Box,
  BoxSelect,
  Eye,
  Focus,
  Layers3,
  Maximize2,
  RotateCcw,
  ScanLine,
} from "lucide-react";
import {
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { elementTargets, type ResultStatus, type Scenario } from "../data";

type LayerName = "shell" | "furniture" | "mep" | "spaces";
type ViewPreset = "iso" | "top" | "front";

interface Viewer3DProps {
  scenario: Scenario;
  selectedElement?: string;
  selectedStatus?: ResultStatus;
  onSelectElement: (elementId: string) => void;
}

interface PartProps {
  id: string;
  name: string;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  selectedElement?: string;
  selectedStatus?: ResultStatus;
  onSelect: (id: string) => void;
  isolate: boolean;
  ghost: boolean;
  rotation?: [number, number, number];
  opacity?: number;
  metalness?: number;
  roughness?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  marker?: { status: ResultStatus; label: string };
}

const statusColors: Record<ResultStatus, string> = {
  pass: "#16835d",
  fail: "#d8523c",
  unknown: "#d18a24",
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
  marker,
}: PartProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const selected = selectedElement === id;
  const dimmed = isolate && Boolean(selectedElement) && !selected;

  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const pulse = selected
      ? 1 + Math.sin(clock.getElapsedTime() * 5.2) * 0.018
      : 1;
    mesh.current.scale.setScalar(THREE.MathUtils.lerp(mesh.current.scale.x, pulse, 0.14));
  });

  const displayColor = selected ? statusColors[selectedStatus] : color;
  const materialOpacity = dimmed
    ? 0.1
    : ghost && id.startsWith("WALL")
      ? 0.22
      : opacity;

  return (
    <mesh
      ref={mesh}
      name={id}
      userData={{ id, name }}
      position={position}
      rotation={rotation}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      onClick={(event) => {
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
        color={displayColor}
        emissive={selected ? displayColor : "#000000"}
        emissiveIntensity={selected ? 0.22 : 0}
        transparent={materialOpacity < 1}
        opacity={materialOpacity}
        depthWrite={materialOpacity > 0.3}
        metalness={metalness}
        roughness={roughness}
      />
      {(selected || hovered) && (
        <Edges
          scale={1.008}
          color={selected ? statusColors[selectedStatus] : "#143f35"}
          lineWidth={selected ? 2.4 : 1.2}
        />
      )}
      {(hovered || selected) && (
        <Html position={[0, size[1] / 2 + 0.28, 0]} center distanceFactor={10}>
          <div className="model-tooltip" dir="rtl">
            <strong>{name}</strong>
            <span dir="ltr">{id}</span>
          </div>
        </Html>
      )}
      {marker && (
        <Html position={[0, size[1] / 2 + 0.18, 0]} center distanceFactor={10}>
          <button
            type="button"
            className={`model-pin model-pin--${marker.status}`}
            aria-label={`${marker.label}: ${name}`}
            onClick={(event: ReactMouseEvent) => {
              event.stopPropagation();
              onSelect(id);
            }}
          >
            {marker.label}
          </button>
        </Html>
      )}
    </mesh>
  );
}

interface SceneProps extends Viewer3DProps {
  layers: Record<LayerName, boolean>;
  isolate: boolean;
  ghost: boolean;
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
  const goalTarget = useRef(new THREE.Vector3(0, 0.4, 0));
  const moving = useRef(true);

  useEffect(() => {
    const selectedTarget = selectedElement
      ? elementTargets[selectedElement]
      : undefined;

    if (selectedTarget) {
      goalPosition.current.set(...selectedTarget.camera);
      goalTarget.current.set(...selectedTarget.target);
    } else if (preset === "top") {
      goalPosition.current.set(0, 24, 0.01);
      goalTarget.current.set(0, 0, 0);
    } else if (preset === "front") {
      goalPosition.current.set(0, 6, 18);
      goalTarget.current.set(0, 0.8, 0);
    } else {
      goalPosition.current.set(14.5, 13.5, 16);
      goalTarget.current.set(0, 0.4, 0);
    }
    moving.current = true;
  }, [camera, focusNonce, preset, selectedElement]);

  useFrame(() => {
    if (!moving.current || !controls.current) return;
    camera.position.lerp(goalPosition.current, 0.085);
    controls.current.target.lerp(goalTarget.current, 0.1);
    controls.current.update();

    if (
      camera.position.distanceTo(goalPosition.current) < 0.04 &&
      controls.current.target.distanceTo(goalTarget.current) < 0.04
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
      minDistance={4}
      maxDistance={34}
      maxPolarAngle={Math.PI / 2.03}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
    />
  );
}

function DiningTable({
  position,
  selectedElement,
  selectedStatus,
  onSelect,
  isolate,
  ghost,
}: Omit<PartProps, "id" | "name" | "size" | "color">) {
  const chairPositions: [number, number, number][] = [
    [-0.78, 0.32, 0],
    [0.78, 0.32, 0],
    [0, 0.32, -0.72],
    [0, 0.32, 0.72],
  ];
  const tableId = `FURN-TABLE-${position[0]}-${position[2]}`;

  return (
    <group position={position}>
      <Part
        id={tableId}
        name="طاولة طعام"
        position={[0, 0.75, 0]}
        size={[1.18, 0.12, 1.02]}
        color="#b88759"
        selectedElement={selectedElement}
        selectedStatus={selectedStatus}
        onSelect={onSelect}
        isolate={isolate}
        ghost={ghost}
      />
      {chairPositions.map((chair, index) => (
        <Part
          key={index}
          id={`${tableId}-CHAIR-${index}`}
          name="مقعد"
          position={chair}
          size={[0.42, 0.62, 0.42]}
          color="#315b50"
          selectedElement={selectedElement}
          selectedStatus={selectedStatus}
          onSelect={onSelect}
          isolate={isolate}
          ghost={ghost}
        />
      ))}
    </group>
  );
}

function RestaurantScene({
  scenario,
  selectedElement,
  selectedStatus,
  onSelectElement,
  layers,
  isolate,
  ghost,
  preset,
  focusNonce,
}: SceneProps) {
  const common = {
    selectedElement,
    selectedStatus,
    onSelect: onSelectElement,
    isolate,
    ghost,
  };

  const tables: [number, number, number][] = [
    [-5.4, 0, -2.7],
    [-2.9, 0, -2.7],
    [-5.4, 0, 0],
    [-2.9, 0, 0],
    [-5.4, 0, 2.7],
    [-2.9, 0, 2.7],
  ];

  return (
    <>
      <color attach="background" args={["#edf1ed"]} />
      <fog attach="fog" args={["#edf1ed", 22, 42]} />
      <ambientLight intensity={1.7} />
      <hemisphereLight args={["#f4fff7", "#b4aa99", 1.9]} />
      <directionalLight
        position={[8, 14, 9]}
        intensity={2.4}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      <group position={[0, 0, 0]}>
        <Part
          {...common}
          id="SLAB-GROUND"
          name="أرضية الطابق الأرضي"
          position={[0, -0.16, 0]}
          size={[16.2, 0.32, 11.2]}
          color="#d8d2c7"
          receiveShadow
          castShadow={false}
        />

        {layers.spaces && (
          <>
            <Part
              {...common}
              id="SPACE-DINING"
              name="منطقة الطعام"
              position={[-3.2, 0.005, 0]}
              size={[8.9, 0.035, 10.2]}
              color="#dce9e1"
              opacity={0.78}
              castShadow={false}
              marker={undefined}
            />
            <Part
              {...common}
              id="SPACE-KITCHEN"
              name="المطبخ"
              position={[4.75, 0.012, 1.35]}
              size={[5.7, 0.045, 5.8]}
              color="#e6ded0"
              opacity={0.82}
              castShadow={false}
              marker={
                scenario === "review"
                  ? { status: "unknown", label: "؟" }
                  : undefined
              }
            />
            <Part
              {...common}
              id="SPACE-STORAGE"
              name="المخزن"
              position={[5.8, 0.012, -3.8]}
              size={[3.5, 0.045, 2.7]}
              color="#e1ddd2"
              opacity={0.82}
              castShadow={false}
            />
            <Part
              {...common}
              id="SPACE-WC"
              name="دورة المياه"
              position={[1.95, 0.012, -3.8]}
              size={[3.2, 0.045, 2.7]}
              color="#d9e6e7"
              opacity={0.82}
              castShadow={false}
            />
            <Part
              {...common}
              id="COR-ACCESS-01"
              name="مسار الوصول الرئيسي"
              position={[-1.18, 0.06, 1.2]}
              size={[0.76, 0.07, 7.45]}
              color={scenario === "review" ? "#d8523c" : "#52a67d"}
              opacity={0.58}
              castShadow={false}
              marker={
                scenario === "review"
                  ? { status: "fail", label: "2" }
                  : undefined
              }
            />
          </>
        )}

        {layers.shell && (
          <>
            <Part
              {...common}
              id="WALL-BACK"
              name="الجدار الخلفي"
              position={[0, 1.35, -5.5]}
              size={[16.15, 2.7, 0.18]}
              color="#f0eee8"
            />
            <Part
              {...common}
              id="WALL-LEFT"
              name="الجدار الجانبي"
              position={[-8, 1.35, 0]}
              size={[0.18, 2.7, 11]}
              color="#f0eee8"
            />
            <Part
              {...common}
              id="WALL-RIGHT-A"
              name="الجدار الجانبي"
              position={[8, 1.35, -2.05]}
              size={[0.18, 2.7, 6.75]}
              color="#f0eee8"
            />
            <Part
              {...common}
              id="WALL-RIGHT-B"
              name="الجدار الجانبي"
              position={[8, 1.35, 4.1]}
              size={[0.18, 2.7, 2.8]}
              color="#f0eee8"
            />
            <Part
              {...common}
              id="FACADE-MAIN"
              name="الواجهة الرئيسية"
              position={[0, 0.32, 5.5]}
              size={[16.15, 0.64, 0.18]}
              color="#d8e1dc"
            />
            <Part
              {...common}
              id="WALL-KITCHEN"
              name="فاصل المطبخ"
              position={[1.75, 1.35, 1.45]}
              size={[0.16, 2.7, 5.85]}
              color="#e9e6de"
            />
            <Part
              {...common}
              id="WALL-SERVICE"
              name="فاصل الخدمات"
              position={[4.85, 1.35, -2.38]}
              size={[6.25, 2.7, 0.16]}
              color="#e9e6de"
            />
            <Part
              {...common}
              id="WALL-WC"
              name="فاصل دورة المياه"
              position={[3.55, 1.35, -3.92]}
              size={[0.16, 2.7, 3]}
              color="#e9e6de"
            />
            <Part
              {...common}
              id="D-MAIN-01"
              name="المدخل الرئيسي"
              position={[-3.9, 1.05, 5.38]}
              size={[1.25, 2.1, 0.09]}
              color="#8fb7aa"
              metalness={0.12}
              opacity={0.72}
            />
            <Part
              {...common}
              id="D-EXIT-02"
              name="باب مخرج الطوارئ"
              position={[7.9, 1.03, 1.8]}
              size={[0.08, 2.06, scenario === "review" ? 0.82 : 1]}
              color={scenario === "review" ? "#d8523c" : "#4b9b76"}
              rotation={[0, -0.08, 0]}
              marker={
                scenario === "review"
                  ? { status: "fail", label: "1" }
                  : undefined
              }
            />
          </>
        )}

        {layers.furniture && (
          <>
            {tables.map((position, index) => (
              <DiningTable
                key={index}
                {...common}
                position={position}
              />
            ))}
            <Part
              {...common}
              id="FURN-SERVICE-COUNTER"
              name="حاجز الخدمة"
              position={[0.15, 0.62, 1.15]}
              size={[1.7, 1.24, 3.7]}
              color="#a36f49"
            />
            <Part
              {...common}
              id="KITCHEN-LINE-01"
              name="خط الطبخ"
              position={[6.8, 0.48, 0.4]}
              size={[1.35, 0.96, 4.1]}
              color="#9aa19f"
              metalness={0.65}
              roughness={0.25}
            />
            <Part
              {...common}
              id="KITCHEN-PREP-01"
              name="طاولة التحضير"
              position={[4.3, 0.48, 1.4]}
              size={[1.2, 0.96, 2.7]}
              color="#aeb3b0"
              metalness={0.55}
              roughness={0.28}
            />
            <Part
              {...common}
              id="STORAGE-RACK-01"
              name="رف تخزين"
              position={[6.7, 1, -4.6]}
              size={[1.6, 2, 0.5]}
              color="#8c7b68"
            />
            <Part
              {...common}
              id="WC-FIXTURE-01"
              name="تجهيز صحي"
              position={[1.4, 0.42, -4.45]}
              size={[0.7, 0.84, 0.82]}
              color="#f3f5f2"
              roughness={0.25}
            />
            <group position={[-6.8, 0.02, 4.25]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.55, 0.68, 0.85, 24]} />
                <meshStandardMaterial color="#65796e" roughness={0.88} />
              </mesh>
              <mesh position={[0, 0.85, 0]} castShadow>
                <sphereGeometry args={[0.6, 20, 16]} />
                <meshStandardMaterial color="#3f715e" roughness={0.9} />
              </mesh>
            </group>
          </>
        )}

        {layers.mep && (
          <>
            <Part
              {...common}
              id="MEP-HOOD-01"
              name="شفاط المطبخ"
              position={[6.65, 2.05, 0.4]}
              size={[1.65, 0.34, 3.6]}
              color={scenario === "review" ? "#c4a66f" : "#788b86"}
              metalness={0.55}
              roughness={0.25}
              opacity={scenario === "review" ? 0.38 : 1}
            />
            {scenario === "ready" && (
              <>
                <Part
                  {...common}
                  id="MEP-DUCT-01"
                  name="مجرى هواء"
                  position={[6.65, 2.38, -1.25]}
                  size={[0.68, 0.58, 3.2]}
                  color="#758783"
                  metalness={0.45}
                  roughness={0.35}
                />
                <Part
                  {...common}
                  id="MEP-FAN-01"
                  name="مروحة سحب"
                  position={[6.65, 2.4, -3.2]}
                  size={[1.05, 0.9, 0.9]}
                  color="#536965"
                  metalness={0.4}
                />
              </>
            )}
          </>
        )}
      </group>

      <Grid
        args={[50, 50]}
        position={[0, -0.34, 0]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#b9c4bd"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#8ea098"
        fadeDistance={30}
        fadeStrength={1.5}
        infiniteGrid
      />
      <ContactShadows
        position={[0, -0.31, 0]}
        opacity={0.3}
        scale={28}
        blur={2.4}
        far={12}
      />
      <CameraRig
        selectedElement={selectedElement}
        preset={preset}
        focusNonce={focusNonce}
      />
    </>
  );
}

export function Viewer3D({
  scenario,
  selectedElement,
  selectedStatus,
  onSelectElement,
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
  const [preset, setPreset] = useState<ViewPreset>("iso");
  const [focusNonce, setFocusNonce] = useState(0);

  const selectedName = useMemo(() => {
    if (!selectedElement) return undefined;
    const labels: Record<string, string> = {
      "D-EXIT-02": "باب مخرج الطوارئ",
      "COR-ACCESS-01": "مسار الوصول الرئيسي",
      "SPACE-KITCHEN": "المطبخ",
      "SPACE-DINING": "منطقة الطعام",
      "SPACE-WC": "دورة المياه",
      "FACADE-MAIN": "الواجهة الرئيسية",
    };
    return labels[selectedElement] ?? selectedElement;
  }, [selectedElement]);

  const toggleLayer = (layer: LayerName) =>
    setLayers((current) => ({ ...current, [layer]: !current[layer] }));

  const resetView = () => {
    setPreset("iso");
    setFocusNonce((value) => value + 1);
  };

  const requestFullscreen = async () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await containerRef.current.requestFullscreen();
    }
  };

  return (
    <div className="viewer" ref={containerRef}>
      <div className="viewer__canvas" aria-label="عارض ثلاثي الأبعاد تفاعلي">
        <Canvas
          shadows
          dpr={[1, 1.65]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          camera={{ position: [14.5, 13.5, 16], fov: 34, near: 0.1, far: 100 }}
          onPointerMissed={() => onSelectElement("")}
        >
          <RestaurantScene
            scenario={scenario}
            selectedElement={selectedElement}
            selectedStatus={selectedStatus}
            onSelectElement={onSelectElement}
            layers={layers}
            isolate={isolate}
            ghost={ghost}
            preset={preset}
            focusNonce={focusNonce}
          />
        </Canvas>
      </div>

      <div className="viewer__toolbar">
        <button type="button" onClick={resetView} title="إعادة ضبط المشهد">
          <RotateCcw size={17} />
        </button>
        <button
          type="button"
          className={preset === "top" ? "is-active" : ""}
          onClick={() => {
            setPreset("top");
            setFocusNonce((value) => value + 1);
          }}
          title="المسقط الأفقي"
        >
          <ScanLine size={18} />
        </button>
        <button
          type="button"
          className={preset === "front" ? "is-active" : ""}
          onClick={() => {
            setPreset("front");
            setFocusNonce((value) => value + 1);
          }}
          title="الواجهة"
        >
          <Box size={18} />
        </button>
        <button
          type="button"
          className={isolate ? "is-active" : ""}
          onClick={() => setIsolate((value) => !value)}
          disabled={!selectedElement}
          title="عزل العنصر المحدد"
        >
          <BoxSelect size={18} />
        </button>
        <button
          type="button"
          className={ghost ? "is-active" : ""}
          onClick={() => setGhost((value) => !value)}
          title="شفافية الجدران"
        >
          <Eye size={18} />
        </button>
        <div className="viewer__layer-wrap">
          <button
            type="button"
            className={layersOpen ? "is-active" : ""}
            onClick={() => setLayersOpen((value) => !value)}
            title="طبقات النموذج"
          >
            <Layers3 size={18} />
          </button>
          {layersOpen && (
            <div className="viewer__layers" dir="rtl">
              <strong>طبقات النموذج</strong>
              {(
                [
                  ["shell", "الجدران والأبواب"],
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
        <button type="button" onClick={requestFullscreen} title="ملء الشاشة">
          <Maximize2 size={18} />
        </button>
      </div>

      <div className="viewer__meta">
        <span className="viewer__live-dot" />
        نموذج دلالي مباشر
        <span>•</span>
        الطابق الأرضي
      </div>

      {selectedElement && (
        <div className="viewer__selection" dir="rtl">
          <Focus size={15} />
          <span>{selectedName}</span>
          <code dir="ltr">{selectedElement}</code>
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

