import { Edges, Html, Line, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Crosshair, LayoutGrid, RotateCcw, ScanLine, Scissors } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import type { ResultStatus } from "../data";
import type {
  Box3,
  GeometryCategory,
  GeometryChunk,
  StandardFacts,
  StandardGeometry,
} from "../ifc/standard/model";
import { elementAtFace } from "./ifcViewer/picking";
import { RIYADH, solarPosition, sunVector, VIEW_TIME } from "./ifcViewer/sun";
import { plasterTexture, sandTexture, terrazzoTexture, woodTexture } from "./ifcViewer/textures";

/*
 * Draws the uploaded IFC file itself: every triangle comes from web-ifc's reading of the
 * same bytes the rules checked. The look follows the user's 3d-studio skill (RasQ, SPARK):
 * physical sky and sun for Riyadh, a balanced image light, real shadows, PBR materials at
 * real scale, and a dollhouse cut with dark caps. Only the sky and the sand are context.
 */

export interface IfcViewerMarker {
  stepId: number;
  status: ResultStatus;
  label: string;
  ruleId: string;
  title: string;
}

export interface IfcModelViewerProps {
  fileName: string;
  facts: StandardFacts;
  geometry: StandardGeometry;
  selectedStepId?: number;
  selectedStatus?: ResultStatus;
  selectedTitle?: string;
  selectedRuleId?: string;
  measurement?: { value: number; limit?: number; source: string };
  markers: IfcViewerMarker[];
  onSelectStep: (stepId?: number) => void;
  onSelectFinding?: (ruleId: string) => void;
}

const STATUS_HEX: Record<ResultStatus, string> = {
  pass: "#15704f",
  fail: "#c2412b",
  unknown: "#b07514",
};
const CAP_COLOR = new THREE.Color("#2c3133");
const CUT_HEIGHT = 1.45;
const NO_CUT = 1e5;
const CAPTURE =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("capture");

type ViewPreset = "iso" | "top" | "focus";

declare global {
  interface Window {
    __APP__?: Record<string, unknown>;
  }
}

function boxCenter(box: Box3): THREE.Vector3 {
  return new THREE.Vector3(
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  );
}

function boxRadius(box: Box3): number {
  return (
    Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) / 2
  );
}

/* ---------------- materials ---------------- */

type Textures = ReturnType<typeof makeTextures>;
function makeTextures() {
  return {
    plaster: plasterTexture(),
    terrazzo: terrazzoTexture(),
    wood: woodTexture(),
    sand: sandTexture(),
  };
}

function withCaps(material: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  material.side = THREE.DoubleSide;
  material.shadowSide = THREE.BackSide;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.capColor = { value: CAP_COLOR };
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "uniform vec3 capColor;\nvoid main() {")
      .replace(
        "#include <dithering_fragment>",
        "#include <dithering_fragment>\n  if (!gl_FrontFacing) gl_FragColor = vec4(capColor, 1.0);",
      );
  };
  return material;
}

function materialFor(
  category: GeometryCategory,
  textures: Textures,
  plane: THREE.Plane,
): THREE.MeshStandardMaterial {
  const clip = { clippingPlanes: [plane], clipShadows: true };
  switch (category) {
    case "wall":
      return withCaps(new THREE.MeshStandardMaterial({ vertexColors: true, map: textures.plaster, roughness: 0.9, ...clip }));
    case "floor":
      return withCaps(new THREE.MeshStandardMaterial({ vertexColors: true, map: textures.terrazzo, roughness: 0.55, metalness: 0, ...clip }));
    case "roof":
      return withCaps(new THREE.MeshStandardMaterial({ vertexColors: true, map: textures.plaster, roughness: 0.95, ...clip }));
    case "door":
      return withCaps(new THREE.MeshStandardMaterial({ vertexColors: true, map: textures.wood, roughness: 0.5, metalness: 0.15, ...clip }));
    case "window":
      return new THREE.MeshStandardMaterial({
        color: "#c9dfe6",
        vertexColors: true,
        roughness: 0.06,
        metalness: 0.1,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        envMapIntensity: 1.6,
        side: THREE.DoubleSide,
        ...clip,
      });
    case "furniture":
      return withCaps(new THREE.MeshStandardMaterial({ vertexColors: true, map: textures.wood, roughness: 0.62, ...clip }));
    case "sanitary":
      return withCaps(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, ...clip }));
    case "equipment":
      return withCaps(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.65, ...clip }));
    case "space":
      return new THREE.MeshStandardMaterial({ color: "#6fa7c9", transparent: true, opacity: 0.18, depthWrite: false, ...clip });
    default:
      return withCaps(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, ...clip }));
  }
}

function geometryFor(chunk: GeometryChunk): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(chunk.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(chunk.normals, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(chunk.uvs, 2));
  // IFC surface colours are display (sRGB) values; vertex colours are linear.
  const linear = new Float32Array(chunk.colors.length);
  const c = new THREE.Color();
  for (let i = 0; i < linear.length; i += 3) {
    c.setRGB(chunk.colors[i], chunk.colors[i + 1], chunk.colors[i + 2], THREE.SRGBColorSpace);
    linear[i] = c.r;
    linear[i + 1] = c.g;
    linear[i + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(linear, 3));
  g.setIndex(new THREE.BufferAttribute(chunk.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/** Triangles of one element, sharing the chunk's vertex buffers. */
function subsetGeometry(chunk: GeometryChunk, base: THREE.BufferGeometry, expressId: number) {
  const parts = chunk.ranges.filter((r) => r.expressId === expressId);
  if (!parts.length) return undefined;
  const total = parts.reduce((sum, r) => sum + r.count * 3, 0);
  const index = new Uint32Array(total);
  let offset = 0;
  for (const r of parts) {
    index.set(chunk.indices.subarray(r.start * 3, (r.start + r.count) * 3), offset);
    offset += r.count * 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", base.getAttribute("position"));
  g.setAttribute("normal", base.getAttribute("normal"));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  return g;
}

/* ---------------- light, sky, ground ---------------- */

function SkyAndLight({ bbox }: { bbox: Box3 }) {
  const { gl, scene } = useThree();
  const sun = useMemo(() => {
    const { elevation, azimuth } = solarPosition(RIYADH.lat, RIYADH.lon, VIEW_TIME);
    return { dir: new THREE.Vector3(...sunVector(elevation, azimuth)), elevation, azimuth };
  }, []);
  const center = boxCenter(bbox);
  const radius = Math.max(8, boxRadius(bbox));
  const light = useRef<THREE.DirectionalLight>(null);

  const sky = useMemo(() => {
    const s = new Sky();
    s.scale.setScalar(1500);
    const u = s.material.uniforms;
    u.turbidity.value = 6.5;
    u.rayleigh.value = 1.5;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.82;
    u.sunPosition.value.copy(sun.dir);
    return s;
  }, [sun]);

  // Image light: a soft dome (zenith / horizon / warm ground, all below 1) baked once with
  // PMREM, so the sun stays the key light and shade does not turn blue (3d-studio lesson).
  useEffect(() => {
    const envScene = new THREE.Scene();
    const dome = new THREE.SphereGeometry(100, 48, 24);
    const colors: number[] = [];
    const zenith = new THREE.Color(0.5, 0.62, 0.78);
    const horizon = new THREE.Color(0.86, 0.84, 0.8);
    const ground = new THREE.Color(0.42, 0.37, 0.3);
    const p = dome.getAttribute("position");
    const tmp = new THREE.Color();
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      if (v.y >= 0) tmp.copy(horizon).lerp(zenith, Math.pow(v.y, 0.6));
      else tmp.copy(horizon).lerp(ground, Math.min(1, -v.y * 4));
      tmp.multiplyScalar(1 + Math.max(0, v.dot(sun.dir)) ** 6 * 0.6);
      colors.push(tmp.r, tmp.g, tmp.b);
    }
    dome.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const domeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    envScene.add(new THREE.Mesh(dome, domeMaterial));
    const pmrem = new THREE.PMREMGenerator(gl);
    const rt = pmrem.fromScene(envScene, 0.04, 0.1, 1000);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.85;
    scene.fog = new THREE.Fog("#ddd6c9", radius * 6, radius * 40);
    return () => {
      scene.environment = null;
      scene.fog = null;
      rt.dispose();
      pmrem.dispose();
      dome.dispose();
      domeMaterial.dispose();
    };
  }, [gl, scene, sun, radius]);

  useEffect(() => {
    const l = light.current;
    if (!l) return;
    const ext = radius * 1.25;
    const cam = l.shadow.camera;
    cam.left = -ext;
    cam.right = ext;
    cam.top = ext;
    cam.bottom = -ext;
    cam.near = 1;
    cam.far = radius * 8;
    cam.updateProjectionMatrix();
    l.target.position.copy(center);
    l.target.updateMatrixWorld();
    gl.shadowMap.needsUpdate = true;
  }, [center, radius, gl]);

  const lightPos = center.clone().addScaledVector(sun.dir, radius * 4);
  return (
    <>
      <primitive object={sky} />
      <hemisphereLight args={["#dfe7ee", "#9a8466", 0.32]} />
      <directionalLight
        ref={light}
        position={lightPos}
        color="#fff4e6"
        intensity={3.3}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
        shadow-radius={2.5}
      />
    </>
  );
}

function Ground({ y, textures }: { y: number; textures: Textures }) {
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: textures.sand, color: "#efe7d8", roughness: 1 });
    // Anti-tiling: a second sample at another scale and rotation, mixed by world-space noise.
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWorldPos;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
varying vec3 vWorldPos;
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0)), u.x), u.y);
}`,
        )
        .replace(
          "#include <map_fragment>",
          `vec2 uvA = vWorldPos.xz / 8.0;
vec2 uvB = mat2(0.8, -0.6, 0.6, 0.8) * vWorldPos.xz / 13.0;
float macro = noise2(vWorldPos.xz / 37.0) * 0.65 + noise2(vWorldPos.xz / 9.0) * 0.35;
vec4 texelColor = mix(texture2D(map, uvA), texture2D(map, uvB), smoothstep(0.3, 0.7, macro));
texelColor.rgb *= 0.9 + 0.18 * noise2(vWorldPos.xz / 61.0);
diffuseColor *= texelColor;`,
        );
    };
    return m;
  }, [textures]);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, y, 0]} receiveShadow material={material}>
      <circleGeometry args={[900, 96]} />
    </mesh>
  );
}

/* ---------------- model ---------------- */

function Model({
  geometry,
  plane,
  textures,
  showSpaces,
  onPick,
  meshes,
}: {
  geometry: StandardGeometry;
  plane: THREE.Plane;
  textures: Textures;
  showSpaces: boolean;
  onPick: (expressId?: number) => void;
  meshes: React.MutableRefObject<Map<GeometryCategory, { chunk: GeometryChunk; geometry: THREE.BufferGeometry }>>;
}) {
  const built = useMemo(() => {
    const out = geometry.chunks.map((chunk) => ({
      chunk,
      geometry: geometryFor(chunk),
      material: materialFor(chunk.category, textures, plane),
    }));
    meshes.current = new Map(out.map((o) => [o.chunk.category, { chunk: o.chunk, geometry: o.geometry }]));
    return out;
  }, [geometry, textures, plane, meshes]);

  useEffect(
    () => () => {
      for (const b of built) {
        b.geometry.dispose();
        b.material.dispose();
      }
    },
    [built],
  );

  const click = (chunk: GeometryChunk) => (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 4) return;
    event.stopPropagation();
    onPick(event.faceIndex != null ? elementAtFace(chunk.ranges, event.faceIndex) : undefined);
  };

  return (
    <>
      {built.map(({ chunk, geometry: g, material }) => (
        <mesh
          key={chunk.category}
          geometry={g}
          material={material}
          visible={chunk.category !== "space" || showSpaces}
          castShadow={chunk.category !== "window" && chunk.category !== "space"}
          receiveShadow={chunk.category !== "window" && chunk.category !== "space"}
          renderOrder={chunk.category === "window" ? 2 : chunk.category === "space" ? 3 : 0}
          onClick={chunk.category === "space" && !showSpaces ? undefined : click(chunk)}
        />
      ))}
    </>
  );
}

function Highlight({
  stepId,
  status,
  meshes,
  plane,
  geometryKey,
}: {
  stepId?: number;
  status?: ResultStatus;
  meshes: React.MutableRefObject<Map<GeometryCategory, { chunk: GeometryChunk; geometry: THREE.BufferGeometry }>>;
  plane: THREE.Plane;
  geometryKey: StandardGeometry;
}) {
  const subset = useMemo(() => {
    if (stepId === undefined) return undefined;
    for (const { chunk, geometry } of meshes.current.values()) {
      const g = subsetGeometry(chunk, geometry, stepId);
      if (g) return { geometry: g, isSpace: chunk.category === "space" };
    }
    return undefined;
    // geometryKey: rebuild when a new model is shown
  }, [stepId, meshes, geometryKey]);
  useEffect(() => () => subset?.geometry.dispose(), [subset]);
  if (!subset) return null;
  const color = STATUS_HEX[status ?? "unknown"];
  return (
    <mesh geometry={subset.geometry} renderOrder={4}>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={subset.isSpace ? 0.28 : 0.62}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        toneMapped={false}
        side={THREE.DoubleSide}
        clippingPlanes={subset.isSpace ? [] : [plane]}
      />
      <Edges threshold={25} color={color} />
    </mesh>
  );
}

function DimensionLine({
  box,
  value,
  limit,
  status,
  cut,
  building,
}: {
  box: Box3;
  value: number;
  limit?: number;
  status: ResultStatus;
  cut: boolean;
  building: Box3;
}) {
  const dx = box.max[0] - box.min[0];
  const dz = box.max[2] - box.min[2];
  const alongX = dx >= dz;
  const c = boxCenter(box);
  const b0 = boxCenter(building);
  const y = Math.min(box.min[1] + 1.05, box.min[1] + (cut ? CUT_HEIGHT : 99) - 0.1);
  // Offset the line to the side of the door that faces away from the building centre.
  const side = Math.sign(alongX ? c.z - b0.z : c.x - b0.x) || 1;
  const out = side * ((alongX ? dz : dx) / 2 + 0.3);
  const a = alongX ? new THREE.Vector3(c.x - value / 2, y, c.z + out) : new THREE.Vector3(c.x + out, y, c.z - value / 2);
  const b = alongX ? new THREE.Vector3(c.x + value / 2, y, c.z + out) : new THREE.Vector3(c.x + out, y, c.z + value / 2);
  const tick = alongX ? new THREE.Vector3(0, 0, 0.12) : new THREE.Vector3(0.12, 0, 0);
  const color = STATUS_HEX[status];
  const mid = a.clone().add(b).multiplyScalar(0.5);
  return (
    <group renderOrder={5}>
      <Line points={[a, b]} color={color} lineWidth={3} depthTest={false} />
      <Line points={[a.clone().sub(tick), a.clone().add(tick)]} color={color} lineWidth={3} depthTest={false} />
      <Line points={[b.clone().sub(tick), b.clone().add(tick)]} color={color} lineWidth={3} depthTest={false} />
      <Html position={mid} center zIndexRange={[20, 10]}>
        <div className={`ifc-dimension ifc-dimension--${status}`} dir="rtl" data-testid="ifc-dimension">
          <strong>{value.toFixed(2)} م</strong>
          {limit !== undefined && <span>الحد {limit.toFixed(2)} م</span>}
        </div>
      </Html>
    </group>
  );
}

function Markers({
  markers,
  facts,
  cutY,
  onSelectFinding,
}: {
  markers: IfcViewerMarker[];
  facts: StandardFacts;
  cutY: number;
  onSelectFinding?: (ruleId: string) => void;
}) {
  return (
    <>
      {markers.map((marker) => {
        const box = facts.products.find((p) => p.expressId === marker.stepId)?.bbox;
        if (!box) return null;
        const c = boxCenter(box);
        if (box.min[1] > cutY) return null;
        const top = Math.min(box.max[1], cutY) + 0.45;
        return (
          <Html key={`${marker.ruleId}-${marker.stepId}`} position={[c.x, top, c.z]} center zIndexRange={[30, 20]}>
            <button
              type="button"
              className={`ifc-pin ifc-pin--${marker.status}`}
              title={marker.title}
              onClick={() => onSelectFinding?.(marker.ruleId)}
            >
              {marker.label}
            </button>
          </Html>
        );
      })}
    </>
  );
}

function SpaceLabels({ facts, show }: { facts: StandardFacts; show: (expressId: number) => boolean }) {
  return (
    <>
      {facts.spaces.map((space) => {
        if (!space.bbox || !show(space.expressId)) return null;
        const c = boxCenter(space.bbox);
        const text = space.longName ?? space.name ?? "";
        const arabic = text.split("/").map((t) => t.trim()).find((t) => /[؀-ۿ]/.test(t));
        return (
          <Html key={space.expressId} position={[c.x, space.bbox.min[1] + 0.15, c.z]} center zIndexRange={[15, 5]}>
            <span className="ifc-space-label">
              {arabic ?? text}
              {space.netFloorArea !== undefined && <small>{space.netFloorArea.toFixed(1)} م²</small>}
            </span>
          </Html>
        );
      })}
    </>
  );
}

/* ---------------- camera ---------------- */

function CameraRig({
  bbox,
  preset,
  focusBox,
  nonce,
}: {
  bbox: Box3;
  preset: ViewPreset;
  focusBox?: Box3;
  nonce: number;
}) {
  const { camera, controls, invalidate } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void } | null;
    invalidate: () => void;
  };
  const glide = useRef<{ from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number } | null>(null);

  useEffect(() => {
    if (!controls) return;
    const center = boxCenter(bbox);
    const radius = boxRadius(bbox);
    // Fit the narrower of the vertical and horizontal fields of view (phones are portrait).
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const fov = Math.min(vfov, hfov);
    let target: THREE.Vector3;
    let position: THREE.Vector3;
    if (preset === "top") {
      target = new THREE.Vector3(center.x, bbox.min[1], center.z);
      position = target.clone().add(new THREE.Vector3(0, (radius / Math.sin(fov / 2)) * 1.02, 0.01));
    } else if (preset === "focus" && focusBox) {
      // Look down into the cut plan from outside the building, on the element's side.
      target = boxCenter(focusBox);
      target.y = Math.min(target.y, focusBox.min[1] + 1.0);
      const out = new THREE.Vector3(target.x - center.x, 0, target.z - center.z);
      if (out.lengthSq() < 0.25) out.set(-0.6, 0, 1);
      out.normalize();
      const dir = out.multiplyScalar(0.62).add(new THREE.Vector3(0.18, 1, 0.22)).normalize();
      const distance = Math.max(7, boxRadius(focusBox) * 7);
      position = target.clone().addScaledVector(dir, distance);
    } else {
      target = new THREE.Vector3(center.x, bbox.min[1] + 0.8, center.z);
      const dir = new THREE.Vector3(-0.62, 0.95, 1).normalize();
      position = target.clone().addScaledVector(dir, (radius / Math.sin(fov / 2)) * 0.92);
    }
    const reduce = CAPTURE || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      camera.position.copy(position);
      controls.target.copy(target);
      controls.update();
      invalidate();
      return;
    }
    glide.current = { from: camera.position.clone(), to: position, tFrom: controls.target.clone(), tTo: target, t: 0 };
    invalidate();
  }, [preset, nonce, bbox, focusBox, camera, controls, invalidate]);

  useFrame((_, delta) => {
    const g = glide.current;
    if (!g || !controls) return;
    g.t = Math.min(1, g.t + delta / 1.2);
    const e = g.t < 0.5 ? 4 * g.t ** 3 : 1 - (-2 * g.t + 2) ** 3 / 2;
    camera.position.lerpVectors(g.from, g.to, e);
    controls.target.lerpVectors(g.tFrom, g.tTo, e);
    controls.update();
    if (g.t >= 1) glide.current = null;
    else invalidate();
  });
  return null;
}

function Instrumentation({ geometry }: { geometry: StandardGeometry }) {
  const { gl } = useThree();
  const frames = useRef(0);
  useEffect(() => {
    const ctx = gl.getContext();
    const debug = ctx.getExtension("WEBGL_debug_renderer_info");
    window.__APP__ = {
      ...(window.__APP__ ?? {}),
      ready: false,
      gpu: debug ? ctx.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "unknown",
      triangles: geometry.triangles,
      frameTimes: [] as number[],
    };
  }, [gl, geometry]);
  useFrame((_, delta) => {
    frames.current += 1;
    const app = (window.__APP__ ??= {});
    const times = (app.frameTimes ??= []) as number[];
    if (times.length < 600) times.push(delta * 1000);
    if (frames.current === 8) {
      app.ready = true;
      app.drawCalls = gl.info.render.calls;
    }
  });
  return null;
}

function ShadowRefresh({ dep }: { dep: unknown }) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [dep, gl, invalidate]);
  return null;
}

/* ---------------- component ---------------- */

export default function IfcModelViewer({
  fileName,
  facts,
  geometry,
  selectedStepId,
  selectedStatus,
  selectedTitle,
  measurement,
  markers,
  onSelectStep,
  onSelectFinding,
}: IfcModelViewerProps) {
  const [cut, setCut] = useState(true);
  const [showSpaces, setShowSpaces] = useState(false);
  const [preset, setPreset] = useState<ViewPreset>("iso");
  const [nonce, setNonce] = useState(0);
  const [dpr, setDpr] = useState(1.5);
  const textures = useMemo(makeTextures, []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), CUT_HEIGHT), []);
  const meshes = useRef(new Map<GeometryCategory, { chunk: GeometryChunk; geometry: THREE.BufferGeometry }>());

  const groundY = useMemo(() => {
    const floor = facts.products.filter((p) => p.ifcType.toUpperCase() === "IFCSLAB" && p.bbox);
    const top = floor.length ? Math.min(...floor.map((p) => p.bbox!.max[1])) : geometry.bbox.min[1];
    return top - 0.15;
  }, [facts, geometry]);

  // Storeys and the floor level of each, from the elements the file places in them.
  const { levels, storeyOf } = useMemo(() => {
    const byId = new Map(facts.products.map((p) => [p.expressId, p]));
    const storeyIds = new Set(facts.storeys.map((s) => s.expressId));
    const owner = new Map<number, number>();
    const find = (id: number) => {
      let current = byId.get(id)?.containerId;
      for (let guard = 0; current !== undefined && !storeyIds.has(current) && guard < 8; guard++) {
        current = byId.get(current)?.containerId;
      }
      return current !== undefined && storeyIds.has(current) ? current : undefined;
    };
    const floorY = new Map<number, number>();
    for (const p of facts.products) {
      const storey = find(p.expressId);
      if (storey === undefined) continue;
      owner.set(p.expressId, storey);
      if (!p.bbox || !/WALL|DOOR|SPACE|COLUMN/.test(p.ifcType.toUpperCase())) continue;
      floorY.set(storey, Math.min(floorY.get(storey) ?? Infinity, p.bbox.min[1]));
    }
    const sorted = facts.storeys
      .filter((s) => floorY.has(s.expressId))
      .map((s) => ({ id: s.expressId, name: s.name ?? "دور", y: floorY.get(s.expressId)! }))
      .sort((a, b) => a.y - b.y);
    return { levels: sorted, storeyOf: owner };
  }, [facts]);
  const [level, setLevel] = useState(0);
  const levelY = levels[level]?.y ?? groundY + 0.15;
  const cutY = cut ? levelY + CUT_HEIGHT : Infinity;

  useEffect(() => {
    plane.constant = cut ? levelY + CUT_HEIGHT : NO_CUT;
  }, [cut, plane, levelY]);

  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures]);

  const selected = facts.products.find((p) => p.expressId === selectedStepId);
  const focusBox = selected?.bbox;

  useEffect(() => {
    if (selectedStepId !== undefined && focusBox) {
      const storey = storeyOf.get(selectedStepId);
      const index = levels.findIndex((l) => l.id === storey);
      if (index >= 0) setLevel(index);
      setPreset("focus");
      setNonce((n) => n + 1);
    }
  }, [selectedStepId, focusBox, storeyOf, levels]);

  useEffect(() => {
    if (!window.__APP__) window.__APP__ = {};
    window.__APP__.goto = (view: ViewPreset) => {
      setPreset(view);
      setNonce((n) => n + 1);
    };
  }, []);

  const statusClass = selectedStatus ?? "file";
  const elementCount = facts.products.length;

  return (
    <div className="viewer ifc-viewer" data-testid="ifc-model-viewer">
      <div className="viewer__canvas" aria-label={`عارض ثلاثي الأبعاد لهندسة الملف ${fileName}`}>
        <Canvas
          shadows="percentage"
          dpr={CAPTURE ? 1 : dpr}
          frameloop={CAPTURE ? "always" : "demand"}
          gl={{ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: CAPTURE }}
          camera={{ position: [20, 18, 24], fov: 36, near: 0.1, far: 4000 }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.NeutralToneMapping;
            gl.toneMappingExposure = 0.95;
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.localClippingEnabled = true;
            gl.shadowMap.autoUpdate = false;
            gl.shadowMap.needsUpdate = true;
          }}
          onPointerMissed={() => onSelectStep(undefined)}
        >
          <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
          <SkyAndLight bbox={geometry.bbox} />
          <Ground y={groundY} textures={textures} />
          <Model
            geometry={geometry}
            plane={plane}
            textures={textures}
            showSpaces={showSpaces}
            onPick={onSelectStep}
            meshes={meshes}
          />
          <Highlight stepId={selectedStepId} status={selectedStatus} meshes={meshes} plane={plane} geometryKey={geometry} />
          {measurement && focusBox && (
            <DimensionLine
              box={focusBox}
              value={measurement.value}
              limit={measurement.limit}
              status={selectedStatus ?? "unknown"}
              cut={cut}
              building={geometry.bbox}
            />
          )}
          <Markers markers={markers} facts={facts} cutY={cutY} onSelectFinding={onSelectFinding} />
          {showSpaces && (
            <SpaceLabels
              facts={facts}
              show={(id) => levels.length <= 1 || storeyOf.get(id) === levels[level]?.id}
            />
          )}
          <ShadowRefresh dep={`${cut}-${level}-${geometry.triangles}`} />
          <CameraRig bbox={geometry.bbox} preset={preset} focusBox={focusBox} nonce={nonce} />
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            minDistance={1.5}
            maxDistance={boxRadius(geometry.bbox) * 8}
            maxPolarAngle={Math.PI / 2 - 0.04}
          />
          <Instrumentation geometry={geometry} />
        </Canvas>
      </div>

      <div className="viewer__toolbar" aria-label="أدوات العارض">
        <button type="button" onClick={() => { setPreset("iso"); setNonce((n) => n + 1); }}
          title="المنظور العام" aria-label="المنظور العام" data-testid="ifc-view-iso">
          <RotateCcw size={17} />
        </button>
        <button type="button" className={preset === "top" ? "is-active" : ""}
          onClick={() => { setPreset("top"); setNonce((n) => n + 1); }}
          title="المسقط الأفقي" aria-label="المسقط الأفقي" data-testid="ifc-view-top">
          <ScanLine size={18} />
        </button>
        <button type="button" disabled={!focusBox}
          onClick={() => { setPreset("focus"); setNonce((n) => n + 1); }}
          title="التركيز على العنصر المحدد" aria-label="التركيز على العنصر المحدد" data-testid="ifc-view-focus">
          <Crosshair size={18} />
        </button>
        <button type="button" className={cut ? "is-active" : ""} aria-pressed={cut}
          onClick={() => setCut((v) => !v)}
          title="قص الجدران لرؤية الداخل" aria-label="قص الجدران لرؤية الداخل" data-testid="ifc-cut">
          <Scissors size={17} />
        </button>
        {levels.length > 1 && (
          <select className="ifc-level" value={level} aria-label="الدور المعروض في المقطع"
            onChange={(event) => { setLevel(Number(event.target.value)); setCut(true); }} data-testid="ifc-level">
            {levels.map((l, i) => (
              <option key={l.id} value={i}>{l.name}</option>
            ))}
          </select>
        )}
        <button type="button" className={showSpaces ? "is-active" : ""} aria-pressed={showSpaces}
          onClick={() => setShowSpaces((v) => !v)}
          title="المساحات وأسماؤها" aria-label="المساحات وأسماؤها" data-testid="ifc-spaces">
          <LayoutGrid size={17} />
        </button>
      </div>

      <div className="viewer__meta" data-testid="ifc-viewer-source">
        <span className="viewer__live-dot" />
        <span>
          مبني من هندسة الملف: <bdi>{fileName}</bdi> • {elementCount} عنصرًا • {geometry.triangles.toLocaleString("en-US")} مثلثًا
        </span>
      </div>

      {selected && (
        <div className={`viewer__selection viewer__selection--${statusClass}`} data-testid="ifc-selection">
          <div className="viewer__selection-copy">
            <small>{selectedTitle ?? "عنصر من الملف"}</small>
            <strong>{selected.name ?? selected.ifcType}</strong>
            <span>
              {selected.ifcType} • <code dir="ltr">{selected.globalId}</code>
            </span>
            {measurement && (
              <span>
                القياس: {measurement.value.toFixed(2)} م ({measurement.source})
              </span>
            )}
          </div>
        </div>
      )}

      <div className="viewer__legend ifc-viewer__legend">
        <span><i style={{ background: STATUS_HEX.fail }} /> غير مطابق</span>
        <span><i style={{ background: STATUS_HEX.unknown }} /> غير قابل للتحقق</span>
        <span><i style={{ background: STATUS_HEX.pass }} /> مطابق</span>
        <small>السماء والأرض للسياق فقط • شمس الرياض 10:30</small>
      </div>
    </div>
  );
}
