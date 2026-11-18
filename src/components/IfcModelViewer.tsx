import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing";
import { Check, Crosshair, Layers, LayoutGrid, Minus, Scissors, X } from "lucide-react";
import { ToneMappingMode } from "postprocessing";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { IconButton, StatusGlyph } from "../brand/ui";
import { copy } from "../content/copy";
import type { ResultStatus } from "../data";
import type {
  Box3,
  GeometryCategory,
  GeometryChunk,
  StandardFacts,
  StandardGeometry,
  StandardProduct,
} from "../ifc/standard/model";
import type { Finish } from "./ifcViewer/finishes";
import {
  isServiceElement,
  LAYER_COLORS,
  LAYER_LABELS,
  memberKinds,
  networkLayers,
  serviceTopic,
  systemsOf,
  type LayerKind,
} from "./ifcViewer/networks";
import { elementIndex, partsOfChunk, type PartSpec } from "./ifcViewer/parts";
import { elementAtFace } from "./ifcViewer/picking";
import { FrameGovernor, pinnedTier, type Tier } from "./ifcViewer/quality";
import { siteLayout, type Rect, type SiteLayout } from "./ifcViewer/site";
import { daylight, HERO_TIME, RIYADH, solarPosition, sunVector, VIEW_TIME } from "./ifcViewer/sun";
import { finishTextures, releaseTextures, siteTextures } from "./ifcViewer/textures";
import {
  buildingBoxOf,
  centerOf,
  facadePose,
  focusPose,
  frontSide,
  networksPose,
  openingsOf,
  planPose,
  radiusOf,
  sectionPose,
  type Lens,
  type Pose,
  type Side,
  type ViewId,
} from "./ifcViewer/views";
import "./ifcViewer/viewer.css";

/*
 * Draws the uploaded IFC file itself: every triangle comes from web-ifc's reading of the same
 * bytes the rules checked, and the building-services networks come from the file's own systems.
 * The look follows the user's 3d-studio skill (RasQ, SPARK): physical sky and sun for Riyadh, a
 * balanced image light, real shadows, ambient occlusion, PBR finishes at real scale, and a
 * dollhouse cut with dark caps. Only the sky, the sand, the paving and the street are context.
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
  measurement?: { value: number; limit?: number; source: string; axis: "width" | "height" };
  markers: IfcViewerMarker[];
  onSelectStep: (stepId?: number) => void;
  onSelectFinding?: (ruleId: string) => void;
}

/* Identity colours, the same values as the status tokens (3D materials cannot read CSS). */
const STATUS_HEX: Record<ResultStatus, string> = {
  pass: "#1d7348",
  fail: "#b42318",
  unknown: "#5f5f5f",
};
const SELECT_HEX = "#0f3b2e";
const PIN_ICON: Record<ResultStatus, typeof Check> = { pass: Check, fail: X, unknown: Minus };

/* Local strings. */
const SOURCE_NOTE = "مبني من هندسة الملف نفسه";
const CONTEXT_NOTE = "السماء والأرض والرصيف والشارع للسياق فقط، شمس الرياض 10:30";
const TOOLS_LABEL = "أدوات العارض";
const VIEWS_LABEL = "طريقة العرض";
const VIEW_LABEL: Record<ViewId, string> = {
  facade: "الواجهة",
  section: "المقطع",
  plan: "المسقط",
  networks: "الشبكات",
};
const VIEW_HINT: Record<ViewId, string> = {
  facade: "منظور خارجي للواجهة من مستوى النظر",
  section: "مقطع من أعلى يكشف الداخل",
  plan: "المسقط الأفقي",
  networks: "شبكات الخدمات من أنظمة الملف",
};
const NO_NETWORKS = "لا يحوي الملف عناصر شبكات خدمات";
const LAYERS_NOTE = "من أنظمة الملف (IfcSystem)";
const SYSTEM_LABEL = "النظام";
const SYSTEMS_LABEL = "الأنظمة";

const CAP_COLOR = new THREE.Color("#2c3133");
const CUT_HEIGHT = 1.45;
const NO_CUT = 1e5;

const SEARCH = typeof window !== "undefined" ? window.location.search : "";
const CAPTURE_PARAM = new URLSearchParams(SEARCH).get("capture");
/** `?capture` (any value): continuous frames, snapped cameras, DPR 1. */
const CAPTURE = CAPTURE_PARAM !== null;
/** `?capture=hero|networks`: a clean full-screen shot of one view, no interface. */
const SHOT: "hero" | "networks" | undefined =
  CAPTURE_PARAM === "hero" || CAPTURE_PARAM === "networks" ? CAPTURE_PARAM : undefined;
const PINNED: Tier | undefined = pinnedTier(SEARCH) ?? (CAPTURE ? "high" : undefined);
const COARSE = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

type CameraRequest = { kind: "view" | "focus"; nonce: number };

declare global {
  interface Window {
    __APP__?: Record<string, unknown>;
  }
}

const v3 = (p: readonly number[]) => new THREE.Vector3(p[0], p[1], p[2]);

/* ---------------- materials ---------------- */

interface Look {
  roughness: number;
  metalness: number;
  env?: number;
}

/** How each finish reflects light; with a roughness map, `roughness` scales the map. */
const LOOK: Record<Finish, Look> = {
  plaster: { roughness: 0.92, metalness: 0 },
  paint: { roughness: 0.8, metalness: 0 },
  concrete: { roughness: 0.95, metalness: 0 },
  stone: { roughness: 1, metalness: 0 },
  panel: { roughness: 1, metalness: 0.35, env: 1.1 },
  terrazzo: { roughness: 0.3, metalness: 0, env: 1.1 },
  porcelain: { roughness: 1, metalness: 0 },
  epoxy: { roughness: 0.3, metalness: 0, env: 1.1 },
  roofTile: { roughness: 1, metalness: 0 },
  ceilingTile: { roughness: 1, metalness: 0 },
  woodFloor: { roughness: 1, metalness: 0 },
  carpet: { roughness: 0.98, metalness: 0 },
  ceramicTile: { roughness: 1, metalness: 0, env: 0.8 },
  wood: { roughness: 1, metalness: 0 },
  fabric: { roughness: 0.97, metalness: 0, env: 0.8 },
  leather: { roughness: 0.55, metalness: 0 },
  stainless: { roughness: 1, metalness: 1, env: 0.9 },
  aluminium: { roughness: 0.36, metalness: 0.9, env: 1.2 },
  paintedMetal: { roughness: 0.46, metalness: 0.2, env: 0.8 },
  glass: { roughness: 0.04, metalness: 0 },
  ceramic: { roughness: 0.14, metalness: 0, env: 0.8 },
  generic: { roughness: 0.8, metalness: 0 },
};

/** Back faces of cut solids show a flat dark cap, so the dollhouse cut reads as a section. */
function withCaps<T extends THREE.MeshStandardMaterial>(material: T): T {
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
  material.customProgramCacheKey = () => "caps-v1";
  return material;
}

/**
 * Glass: see-through with the file's tint, and a reflection that is not dimmed by the
 * transparency (premultiplied output), so panes pick up the sky, more at grazing angles.
 */
function glassMaterial(plane: THREE.Plane): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    color: new THREE.Color(0.3, 0.36, 0.38),
    roughness: LOOK.glass.roughness,
    metalness: 0,
    ior: 1.52,
    specularIntensity: 1,
    envMapIntensity: 2.4,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
    clippingPlanes: [plane],
    clipShadows: true,
  });
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor;
  m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      "gl_FragColor = vec4( totalDiffuse * diffuseColor.a + totalSpecular + totalEmissiveRadiance, diffuseColor.a );",
    );
  };
  m.customProgramCacheKey = () => "glass-v1";
  return m;
}

function partMaterial(part: PartSpec, plane: THREE.Plane): THREE.Material {
  if (part.category === "space") {
    return new THREE.MeshStandardMaterial({
      color: "#6fa7c9",
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      clippingPlanes: [plane],
    });
  }
  if (part.finish === "service") {
    // Services as built (galvanised ducts, white luminaires, coloured pipes from the file); never
    // cut, so runs above the cut height stay whole. The services view uses `systemMaterial`.
    const set = finishTextures("paintedMetal");
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: set?.map ?? null,
      roughness: 0.48,
      metalness: 0.3,
    });
  }
  if (part.pane === "glass") return glassMaterial(plane);
  if (part.pane === "frame") {
    return withCaps(
      new THREE.MeshStandardMaterial({
        color: "#80878d",
        roughness: LOOK.aluminium.roughness,
        metalness: LOOK.aluminium.metalness,
        envMapIntensity: LOOK.aluminium.env,
        clippingPlanes: [plane],
        clipShadows: true,
      }),
    );
  }
  const finish = part.finish;
  const look = LOOK[finish];
  const set = finishTextures(finish);
  const scale = set?.normalScale ?? 1;
  return withCaps(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: set?.map ?? null,
      normalMap: set?.normalMap ?? null,
      normalScale: new THREE.Vector2(scale, scale),
      roughnessMap: set?.roughnessMap ?? null,
      roughness: look.roughness,
      metalness: look.metalness,
      envMapIntensity: look.env ?? 1,
      clippingPlanes: [plane],
      clipShadows: true,
    }),
  );
}

/** Services in their system's fixed colour (the legend's colour), never cut. */
function systemMaterial(layer: LayerKind): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: LAYER_COLORS[layer],
    roughness: layer === "unassigned" ? 0.4 : 0.48,
    metalness: layer === "unassigned" ? 0.6 : 0.12,
  });
}

const GHOST_OPACITY: Partial<Record<GeometryCategory, number>> = {
  floor: 0.34,
  wall: 0.12,
  door: 0.1,
  window: 0.08,
  furniture: 0.14,
  sanitary: 0.18,
  equipment: 0.16,
  other: 0.12,
};

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

function sharedGeometry(base: THREE.BufferGeometry, index: Uint32Array): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv", "color"]) g.setAttribute(name, base.getAttribute(name));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.boundingSphere = base.boundingSphere;
  return g;
}

/** Ray hits on hidden meshes or on the clipped-away side of the cut are not picks. */
function visibleRaycast(this: THREE.Mesh, raycaster: THREE.Raycaster, hits: THREE.Intersection[]) {
  if (!this.visible) return;
  const start = hits.length;
  THREE.Mesh.prototype.raycast.call(this, raycaster, hits);
  const planes = (this.material as THREE.Material).clippingPlanes;
  if (!planes?.length) return;
  for (let i = hits.length - 1; i >= start; i--) {
    if (planes.some((p) => p.distanceToPoint(hits[i].point) < 0)) hits.splice(i, 1);
  }
}

/* ---------------- light, sky, site ---------------- */

function SkyAndLight({ bbox, time, shadowSize }: { bbox: Box3; time: Date; shadowSize: number }) {
  const { gl, scene, invalidate } = useThree();
  const sun = useMemo(() => {
    const { elevation, azimuth } = solarPosition(RIYADH.lat, RIYADH.lon, time);
    return { dir: new THREE.Vector3(...sunVector(elevation, azimuth)), elevation, light: daylight(elevation) };
  }, [time]);
  const center = useMemo(() => v3(centerOf(bbox)), [bbox]);
  const radius = Math.max(8, radiusOf(bbox));
  const light = useRef<THREE.DirectionalLight>(null);

  const sky = useMemo(() => {
    const s = new Sky();
    s.scale.setScalar(1500);
    const u = s.material.uniforms;
    u.turbidity.value = sun.light.sky.turbidity;
    u.rayleigh.value = sun.light.sky.rayleigh;
    u.mieCoefficient.value = sun.light.sky.mie;
    u.mieDirectionalG.value = sun.light.sky.mieG;
    u.sunPosition.value.copy(sun.dir);
    return s;
  }, [sun]);
  useEffect(() => () => {
    sky.geometry.dispose();
    sky.material.dispose();
  }, [sky]);

  // Image light: a soft dome (zenith / horizon / warm ground, all below 1) baked once with
  // PMREM, so the sun stays the key light and shade does not turn blue (3d-studio lesson).
  useEffect(() => {
    const { dome: tone, fog, exposure, envIntensity } = sun.light;
    const envScene = new THREE.Scene();
    const dome = new THREE.SphereGeometry(100, 48, 24);
    const colors: number[] = [];
    const zenith = new THREE.Color(...tone.zenith);
    const horizon = new THREE.Color(...tone.horizon);
    const ground = new THREE.Color(...tone.ground);
    const p = dome.getAttribute("position");
    const tmp = new THREE.Color();
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      if (v.y >= 0) tmp.copy(horizon).lerp(zenith, Math.pow(v.y, 0.6));
      else tmp.copy(horizon).lerp(ground, Math.min(1, -v.y * 4));
      tmp.multiplyScalar(1 + Math.max(0, v.dot(sun.dir)) ** 6 * tone.sunGlow);
      colors.push(tmp.r, tmp.g, tmp.b);
    }
    dome.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const domeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    envScene.add(new THREE.Mesh(dome, domeMaterial));
    const pmrem = new THREE.PMREMGenerator(gl);
    const rt = pmrem.fromScene(envScene, 0.04, 0.1, 1000);
    scene.environment = rt.texture;
    scene.environmentIntensity = envIntensity;
    scene.fog = new THREE.Fog(fog, radius * 6, radius * 40);
    gl.toneMappingExposure = exposure;
    invalidate();
    return () => {
      scene.environment = null;
      scene.fog = null;
      rt.dispose();
      pmrem.dispose();
      dome.dispose();
      domeMaterial.dispose();
    };
  }, [gl, scene, sun, radius, invalidate]);

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
  }, [center, radius, gl, sun]);

  const lightPos = center.clone().addScaledVector(sun.dir, radius * 4);
  const { sun: key, hemisphere } = sun.light;
  return (
    <>
      <primitive object={sky} />
      <hemisphereLight args={[hemisphere.sky, hemisphere.ground, hemisphere.intensity]} />
      <directionalLight
        ref={light}
        position={lightPos}
        color={key.color}
        intensity={key.intensity}
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
        shadow-radius={2.5}
      />
    </>
  );
}

/**
 * Interior reflections: stainless steel, glazed ceramics and enamel reflect a neutral room
 * (three's procedural RoomEnvironment), not the blue sky, so they read as kitchen finishes.
 */
function InteriorReflections({ materials }: { materials: THREE.MeshStandardMaterial[] }) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const rt = pmrem.fromScene(room, 0.04);
    for (const m of materials) {
      m.envMap = rt.texture;
      m.needsUpdate = true;
    }
    invalidate();
    return () => {
      for (const m of materials) {
        m.envMap = null;
        m.needsUpdate = true;
      }
      rt.dispose();
      pmrem.dispose();
      room.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    };
  }, [gl, materials, invalidate]);
  return null;
}

/** World-space macro variation so large paved and sand areas do not show their tile. */
function antiTile(material: THREE.MeshStandardMaterial, scale: number, amount: number, twoSamples: boolean, key: string) {
  material.onBeforeCompile = (shader) => {
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
        twoSamples
          ? `vec2 uvA = vMapUv;
vec2 uvB = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.61;
float macro = noise2(vWorldPos.xz / ${(scale * 4.6).toFixed(1)}) * 0.65 + noise2(vWorldPos.xz / ${(scale * 1.1).toFixed(1)}) * 0.35;
vec4 texelColor = mix(texture2D(map, uvA), texture2D(map, uvB), smoothstep(0.3, 0.7, macro));
texelColor.rgb *= ${(1 - amount / 2).toFixed(3)} + ${amount.toFixed(3)} * noise2(vWorldPos.xz / ${(scale * 7.6).toFixed(1)});
diffuseColor *= texelColor;`
          : `vec4 texelColor = texture2D(map, vMapUv);
texelColor.rgb *= ${(1 - amount / 2).toFixed(3)} + ${amount.toFixed(3)} * (noise2(vWorldPos.xz / ${scale.toFixed(1)}) * 0.7 + noise2(vWorldPos.xz / ${(scale * 0.27).toFixed(2)}) * 0.3);
diffuseColor *= texelColor;`,
      );
  };
  material.customProgramCacheKey = () => key;
}

function siteMaterial(surface: "pavers" | "asphalt" | "kerb" | "sand", roughness: number): THREE.MeshStandardMaterial {
  const set = siteTextures(surface);
  const scale = set.normalScale ?? 1;
  const m = new THREE.MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap ?? null,
    normalScale: new THREE.Vector2(scale, scale),
    roughnessMap: set.roughnessMap ?? null,
    roughness,
    metalness: 0,
  });
  if (surface === "sand") antiTile(m, 8, 0.18, true, "sand-v2");
  else if (surface === "pavers") antiTile(m, 9, 0.12, false, "pavers-v1");
  else if (surface === "asphalt") antiTile(m, 14, 0.16, false, "asphalt-v1");
  return m;
}

/** A box from y0 to y1 over a plan rectangle, with UVs in metres (box projection, like the reader). */
function slabGeometry(r: Rect, y0: number, y1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(r.x1 - r.x0, y1 - y0, r.z1 - r.z0);
  g.translate((r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2);
  const p = g.getAttribute("position");
  const n = g.getAttribute("normal");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ay > 0.5) uv.setXY(i, p.getX(i), p.getZ(i));
    else if (ax > 0.5) uv.setXY(i, p.getZ(i), p.getY(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  return g;
}

function Site({ layout }: { layout: SiteLayout }) {
  const built = useMemo(() => {
    const pavers = siteMaterial("pavers", 1);
    const kerb = siteMaterial("kerb", 0.9);
    const asphalt = siteMaterial("asphalt", 0.92);
    const sand = siteMaterial("sand", 1);
    sand.color.set("#efe7d8");
    const paint = new THREE.MeshStandardMaterial({ color: "#e9e6dc", roughness: 0.7 });
    const plaza = slabGeometry(layout.plaza, layout.streetY - 0.25, layout.plazaY);
    const kerbs = layout.kerbs.map((r) => slabGeometry(r, layout.plazaY - 0.02, layout.plazaY + 0.006));
    const street = slabGeometry(layout.street, layout.streetY - 0.2, layout.streetY + 0.002);
    const lines = layout.markings.map((r) => slabGeometry(r, layout.streetY, layout.streetY + 0.005));
    const ground = new THREE.CircleGeometry(900, 96);
    ground.rotateX(-Math.PI / 2);
    // Sand UVs in metres.
    const p = ground.getAttribute("position");
    const uv = ground.getAttribute("uv");
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
    ground.translate(0, layout.streetY - 0.004, 0);
    return { pavers, kerb, asphalt, sand, paint, plaza, kerbs, street, lines, ground };
  }, [layout]);
  useEffect(
    () => () => {
      for (const m of [built.pavers, built.kerb, built.asphalt, built.sand, built.paint]) m.dispose();
      for (const g of [built.plaza, built.street, built.ground, ...built.kerbs, ...built.lines]) g.dispose();
    },
    [built],
  );
  // BoxGeometry groups: +x, -x, +y, -y, +z, -z.
  const plazaMaterials = useMemo(
    () => [built.kerb, built.kerb, built.pavers, built.kerb, built.kerb, built.kerb],
    [built],
  );
  return (
    <group name="site-context">
      <mesh geometry={built.ground} material={built.sand} receiveShadow />
      <mesh geometry={built.plaza} material={plazaMaterials} receiveShadow castShadow />
      {built.kerbs.map((g, i) => (
        <mesh key={i} geometry={g} material={built.kerb} receiveShadow />
      ))}
      <mesh geometry={built.street} material={built.asphalt} receiveShadow />
      {built.lines.map((g, i) => (
        <mesh key={`m${i}`} geometry={g} material={built.paint} receiveShadow />
      ))}
    </group>
  );
}

/* ---------------- model ---------------- */

interface BuiltPart {
  part: PartSpec;
  chunk: GeometryChunk;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  ghost?: THREE.Material;
  /** Services only: the system's fixed colour (services view, and the layers panel). */
  system?: THREE.Material;
  /** Services only: drawn where the run is hidden (under the slab, in the ground), faded. */
  xray?: THREE.Material;
}

interface BuiltModel {
  parts: BuiltPart[];
  bases: Map<GeometryChunk, THREE.BufferGeometry>;
  /** Materials lit by the neutral room reflection instead of the sky. */
  interior: THREE.MeshStandardMaterial[];
}

const INTERIOR_FINISHES = new Set<Finish>(["stainless", "ceramic", "ceramicTile", "paintedMetal"]);

function useBuiltModel(geometry: StandardGeometry, facts: StandardFacts, plane: THREE.Plane): BuiltModel {
  const built = useMemo(() => {
    const products = new Map(facts.products.map((p) => [p.expressId, p]));
    const kinds = memberKinds(facts.systems ?? []);
    const bases = new Map<GeometryChunk, THREE.BufferGeometry>();
    const parts: BuiltPart[] = [];
    const ghosts = new Map<GeometryCategory, THREE.Material>();
    for (const chunk of geometry.chunks) {
      const base = geometryFor(chunk);
      bases.set(chunk, base);
      for (const part of partsOfChunk(chunk, { products, kinds })) {
        let ghost: THREE.Material | undefined;
        const opacity = GHOST_OPACITY[part.category];
        if (part.finish !== "service" && opacity !== undefined && !part.member) {
          ghost = ghosts.get(part.category);
          if (!ghost) {
            ghost = new THREE.MeshLambertMaterial({
              color: "#f3f2ee",
              transparent: true,
              opacity,
              depthWrite: false,
              clippingPlanes: [plane],
            });
            ghosts.set(part.category, ghost);
          }
        }
        const xray =
          part.finish === "service"
            ? new THREE.MeshBasicMaterial({
                color: LAYER_COLORS[part.layer ?? "unassigned"],
                transparent: true,
                opacity: 0.72,
                depthWrite: false,
                depthFunc: THREE.GreaterDepth,
              })
            : undefined;
        const system = part.finish === "service" ? systemMaterial(part.layer ?? "unassigned") : undefined;
        parts.push({ part, chunk, geometry: sharedGeometry(base, part.index), material: partMaterial(part, plane), ghost, xray, system });
      }
    }
    const interior = parts
      .filter((b) => (b.part.finish === "service" || INTERIOR_FINISHES.has(b.part.finish as Finish)) && b.part.pane === undefined)
      .map((b) => b.material as THREE.MeshStandardMaterial);
    return { parts, bases, ghosts: [...ghosts.values()], interior };
  }, [geometry, facts, plane]);
  useEffect(
    () => () => {
      for (const b of built.parts) {
        b.geometry.dispose();
        b.material.dispose();
        b.xray?.dispose();
        b.system?.dispose();
      }
      for (const g of built.ghosts) g.dispose();
      for (const base of built.bases.values()) base.dispose();
    },
    [built],
  );
  return built;
}

/** Outline of the building shell, drawn over the ghosted walls in the services view. */
function ShellEdges({ parts, plane }: { parts: BuiltPart[]; plane: THREE.Plane }) {
  const edges = useMemo(() => {
    const material = new THREE.LineBasicMaterial({
      color: "#77776f",
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      clippingPlanes: [plane],
    });
    const lines = parts
      .filter((b) => ["wall", "floor", "door", "window", "roof"].includes(b.part.category) && b.part.pane !== "glass")
      .map((b) => new THREE.EdgesGeometry(b.geometry, 30));
    return { material, lines };
  }, [parts, plane]);
  useEffect(
    () => () => {
      edges.material.dispose();
      for (const g of edges.lines) g.dispose();
    },
    [edges],
  );
  return (
    <>
      {edges.lines.map((g, i) => (
        <lineSegments key={i} geometry={g} material={edges.material} renderOrder={2} />
      ))}
    </>
  );
}

/** How services show: as built (exterior), in system colours (services view, layers panel) or not at all. */
type ServiceStyle = "real" | "system" | "off";

function Model({
  model,
  mode,
  services,
  showSpaces,
  hidden,
  onPick,
}: {
  model: BuiltModel;
  mode: "building" | "services";
  services: ServiceStyle;
  showSpaces: boolean;
  hidden: ReadonlySet<LayerKind>;
  onPick: (expressId?: number) => void;
}) {
  const click = (part: PartSpec) => (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 4) return;
    event.stopPropagation();
    onPick(event.faceIndex != null ? elementAtFace(part.ranges, event.faceIndex) : undefined);
  };
  return (
    <>
      {model.parts.map(({ part, geometry, material, ghost, xray, system }) => {
        if (part.finish === "service") {
          const on = services !== "off" && !hidden.has(part.layer ?? "unassigned");
          return (
            <group key={part.key}>
              <mesh geometry={geometry} material={material} visible={on && services === "real"} castShadow receiveShadow
                raycast={visibleRaycast} onClick={click(part)} />
              <mesh geometry={geometry} material={system} visible={on && services === "system"} castShadow receiveShadow
                raycast={visibleRaycast} onClick={click(part)} />
              <mesh geometry={geometry} material={xray} visible={on && services === "system" && mode === "services"} renderOrder={3} />
            </group>
          );
        }
        const space = part.category === "space";
        const glass = part.pane === "glass";
        let real: boolean;
        if (space) real = showSpaces;
        else real = mode === "building" || part.member || !ghost;
        if (mode === "services" && part.category === "roof") real = false;
        const ghostOn = mode === "services" && !!ghost && !real && part.category !== "roof";
        return (
          <group key={part.key}>
            <mesh
              geometry={geometry}
              material={material}
              visible={real}
              castShadow={!glass && !space}
              receiveShadow={!glass && !space}
              renderOrder={glass ? 2 : space ? 3 : 0}
              raycast={visibleRaycast}
              onClick={space && !showSpaces ? undefined : click(part)}
            />
            {ghost && <mesh geometry={geometry} material={ghost} visible={ghostOn} renderOrder={1} />}
          </group>
        );
      })}
    </>
  );
}

function Highlight({
  stepId,
  status,
  model,
  plane,
  service,
}: {
  stepId?: number;
  status?: ResultStatus;
  model: BuiltModel;
  plane: THREE.Plane;
  service: boolean;
}) {
  const subset = useMemo(() => {
    if (stepId === undefined) return undefined;
    for (const [chunk, base] of model.bases) {
      const index = elementIndex(model.parts.filter((b) => b.chunk === chunk).map((b) => b.part), stepId);
      if (!index) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", base.getAttribute("position"));
      g.setAttribute("normal", base.getAttribute("normal"));
      g.setIndex(new THREE.BufferAttribute(index, 1));
      return { geometry: g, isSpace: chunk.category === "space" };
    }
    return undefined;
  }, [stepId, model]);
  useEffect(() => () => subset?.geometry.dispose(), [subset]);
  // Plain thin edges: drei's fat-line Edges could streak across the canvas from some angles.
  const outline = useMemo(() => (subset ? new THREE.EdgesGeometry(subset.geometry, 25) : undefined), [subset]);
  useEffect(() => () => outline?.dispose(), [outline]);
  if (!subset) return null;
  const color = status ? STATUS_HEX[status] : SELECT_HEX;
  const unclipped = subset.isSpace || service;
  return (
    <mesh geometry={subset.geometry} renderOrder={4}>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={subset.isSpace ? 0.28 : status ? 0.62 : 0.38}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        toneMapped={false}
        side={THREE.DoubleSide}
        clippingPlanes={unclipped ? [] : [plane]}
      />
      {outline && (
        <lineSegments geometry={outline} renderOrder={5}>
          <lineBasicMaterial color={color} toneMapped={false} clippingPlanes={unclipped ? [] : [plane]} />
        </lineSegments>
      )}
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
  axis,
  floorY,
}: {
  box: Box3;
  value: number;
  limit?: number;
  status: ResultStatus;
  cut: boolean;
  building: Box3;
  axis: "width" | "height";
  floorY: number;
}) {
  const color = STATUS_HEX[status];
  const label = (
    <div className={`vw-dim vw-dim--${status}`} dir="rtl" data-testid="ifc-dimension">
      <strong>{value.toFixed(2)} م</strong>
      {limit !== undefined && <span>{copy.results.detail.required} {limit.toFixed(2)} م</span>}
    </div>
  );
  if (axis === "height") {
    // Vertical line from the floor to the measured top, on the room side of the element.
    const c = v3(centerOf(box));
    const b0 = v3(centerOf(building));
    const dx = box.max[0] - box.min[0];
    const dz = box.max[2] - box.min[2];
    const inward = dx < dz
      ? new THREE.Vector3(Math.sign(b0.x - c.x) || 1, 0, 0)
      : new THREE.Vector3(0, 0, Math.sign(b0.z - c.z) || 1);
    const foot = new THREE.Vector3(c.x, floorY, c.z).addScaledVector(inward, 0.35);
    const head = foot.clone().setY(floorY + value);
    const tick = new THREE.Vector3(inward.z, 0, inward.x).multiplyScalar(0.12);
    const limitPoint = limit !== undefined ? foot.clone().setY(floorY + limit) : undefined;
    return (
      <group renderOrder={5}>
        <Line points={[foot, head]} color={color} lineWidth={3} depthTest={false} />
        <Line points={[head.clone().sub(tick), head.clone().add(tick)]} color={color} lineWidth={3} depthTest={false} />
        <Line points={[foot.clone().sub(tick), foot.clone().add(tick)]} color={color} lineWidth={3} depthTest={false} />
        {limitPoint && (
          <Line points={[limitPoint.clone().sub(tick.clone().multiplyScalar(2)), limitPoint.clone().add(tick.clone().multiplyScalar(2))]}
            color="#161616" lineWidth={2} dashed dashSize={0.06} gapSize={0.05} depthTest={false} />
        )}
        <Html position={head.clone().add(new THREE.Vector3(0, 0.18, 0))} center zIndexRange={[20, 10]}>
          {label}
        </Html>
      </group>
    );
  }
  const dx = box.max[0] - box.min[0];
  const dz = box.max[2] - box.min[2];
  const alongX = dx >= dz;
  const c = v3(centerOf(box));
  const b0 = v3(centerOf(building));
  const y = Math.min(box.min[1] + 1.05, box.min[1] + (cut ? CUT_HEIGHT : 99) - 0.1);
  // Offset the line to the side of the door that faces away from the building centre.
  const side = Math.sign(alongX ? c.z - b0.z : c.x - b0.x) || 1;
  const out = side * ((alongX ? dz : dx) / 2 + 0.3);
  const a = alongX ? new THREE.Vector3(c.x - value / 2, y, c.z + out) : new THREE.Vector3(c.x + out, y, c.z - value / 2);
  const b = alongX ? new THREE.Vector3(c.x + value / 2, y, c.z + out) : new THREE.Vector3(c.x + out, y, c.z + value / 2);
  const tick = alongX ? new THREE.Vector3(0, 0, 0.12) : new THREE.Vector3(0.12, 0, 0);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  return (
    <group renderOrder={5}>
      <Line points={[a, b]} color={color} lineWidth={3} depthTest={false} />
      <Line points={[a.clone().sub(tick), a.clone().add(tick)]} color={color} lineWidth={3} depthTest={false} />
      <Line points={[b.clone().sub(tick), b.clone().add(tick)]} color={color} lineWidth={3} depthTest={false} />
      <Html position={mid} center zIndexRange={[20, 10]}>
        {label}
      </Html>
    </group>
  );
}

function Markers({
  markers,
  products,
  cutY,
  onSelectFinding,
}: {
  markers: IfcViewerMarker[];
  products: ReadonlyMap<number, StandardProduct>;
  cutY: number;
  onSelectFinding?: (ruleId: string) => void;
}) {
  return (
    <>
      {markers.map((marker) => {
        const box = products.get(marker.stepId)?.bbox;
        if (!box) return null;
        const c = centerOf(box);
        if (box.min[1] > cutY) return null;
        const top = Math.min(box.max[1], cutY) + 0.45;
        const Icon = PIN_ICON[marker.status];
        const name = [marker.label, marker.title].filter(Boolean).join(" ");
        return (
          <Html key={`${marker.ruleId}-${marker.stepId}`} position={[c[0], top, c[2]]} center zIndexRange={[30, 20]}>
            <button
              type="button"
              className={`vw-pin vw-pin--${marker.status}`}
              title={name}
              aria-label={name}
              // Pins can sit outside the canvas when the camera is close; the register already gives
              // keyboard access to every finding, so pins stay out of the tab order.
              tabIndex={-1}
              onClick={(event) => {
                // The pin sits in the canvas container: without this, the scene also sees the click
                // as a miss and clears the selection the pin just made.
                event.stopPropagation();
                onSelectFinding?.(marker.ruleId);
              }}
            >
              <Icon size={16} strokeWidth={3} aria-hidden="true" />
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
        const c = centerOf(space.bbox);
        const text = space.longName ?? space.name ?? "";
        const arabic = text.split("/").map((t) => t.trim()).find((t) => /[؀-ۿ]/.test(t));
        return (
          <Html key={space.expressId} position={[c[0], space.bbox.min[1] + 0.15, c[2]]} center zIndexRange={[15, 5]}>
            <span className="vw-space">
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

function CameraRig({ request, poseFor }: { request: CameraRequest; poseFor: (lens: Lens) => Pose }) {
  const { camera, controls, invalidate } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls: { target: THREE.Vector3; update: () => void } | null;
    invalidate: () => void;
  };
  const glide = useRef<{ from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number } | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (!controls) return;
    const pose = poseFor({ fov: camera.fov, aspect: camera.aspect || 1 });
    const position = v3(pose.position);
    const target = v3(pose.target);
    const reduce = CAPTURE || first.current || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    first.current = false;
    if (reduce) {
      glide.current = null;
      camera.position.copy(position);
      controls.target.copy(target);
      controls.update();
      invalidate();
      return;
    }
    glide.current = { from: camera.position.clone(), to: position, tFrom: controls.target.clone(), tTo: target, t: 0 };
    invalidate();
    // poseFor changes with its inputs; a new request (nonce) is what moves the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, camera, controls, invalidate]);

  useFrame((_, delta) => {
    const g = glide.current;
    if (!g || !controls) return;
    g.t = Math.min(1, g.t + Math.min(delta, 0.1) / 1.3);
    const e = g.t < 0.5 ? 4 * g.t ** 3 : 1 - (-2 * g.t + 2) ** 3 / 2;
    camera.position.lerpVectors(g.from, g.to, e);
    controls.target.lerpVectors(g.tFrom, g.tTo, e);
    controls.update();
    if (g.t >= 1) glide.current = null;
    else invalidate();
  });
  return null;
}

/* ---------------- rendering quality, warm-up, instrumentation ---------------- */

function Effects() {
  return (
    <EffectComposer multisampling={4}>
      <N8AO halfRes aoRadius={1.0} distanceFalloff={0.7} intensity={3} quality="medium" />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
}

/**
 * Steps quality down when bursts of frames run slow. In a demand frame loop R3F sets
 * `internal.frames` to 2 when a frame asks for the next one from inside useFrame (a glide, orbit
 * damping), so only frames that follow such a request are timed: idle time between bursts is never
 * mistaken for a slow frame, and a very slow renderer is still caught. Mounted after the camera rig
 * and the controls, so their requests are already counted when this runs.
 */
function Governor({ onTier }: { onTier: (tier: Tier) => void }) {
  const governor = useRef(new FrameGovernor("high", { window: 20, downMs: 40, gapMs: 10000 }));
  const continues = useRef(false);
  useFrame((state, delta) => {
    if (continues.current) {
      const next = governor.current.push(delta * 1000);
      if (next) onTier(next);
    }
    continues.current = state.internal.frames > 1;
  });
  return null;
}

/** Compiles every material once (hidden views included), so switching views does not stall. */
function WarmUp({ composer, onDone }: { composer: boolean; onDone: () => void }) {
  const { gl, scene, camera } = useThree();
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    const target = composer ? new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }) : null;
    const previous = gl.getRenderTarget();
    gl.setRenderTarget(target);
    gl.compile(scene, camera);
    gl.setRenderTarget(previous);
    target?.dispose();
    for (const o of hidden) o.visible = false;
    onDone();
  });
  return null;
}

function Instrumentation({ geometry, warm, extra }: { geometry: StandardGeometry; warm: boolean; extra: Record<string, unknown> }) {
  const { gl, scene, invalidate, setFrameloop } = useThree();
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
      // Capture scripts stop the continuous loop before a screenshot (the last frame stays on screen).
      freeze: () => setFrameloop("demand"),
      resume: () => setFrameloop(CAPTURE ? "always" : "demand"),
      // Debug handles for capture and development scripts (dump the scene, count calls, inspect shadows).
      ...(CAPTURE || import.meta.env.DEV ? { renderer: gl, scene } : {}),
    };
    frames.current = 0;
  }, [gl, scene, geometry, setFrameloop]);
  useEffect(() => {
    window.__APP__ = { ...(window.__APP__ ?? {}), ...extra };
  }, [extra]);
  useFrame((_, delta) => {
    const app = (window.__APP__ ??= {});
    const times = (app.frameTimes ??= []) as number[];
    if (times.length >= 600) times.shift();
    times.push(delta * 1000);
    // A demand frame loop renders only on change: ask for frames until the scene reports ready.
    if (frames.current < 8) invalidate();
    if (!warm) return;
    frames.current += 1;
    if (frames.current === 8) app.ready = true;
  });
  // Counts every draw of a frame (shadow map, scene, post-processing passes): runs first in each
  // frame (negative priority does not take over rendering), reads the previous frame, then resets.
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame(() => {
    const app = (window.__APP__ ??= {});
    if (gl.info.render.calls > 0) {
      app.drawCalls = gl.info.render.calls;
      app.trianglesDrawn = gl.info.render.triangles;
    }
    gl.info.reset();
  }, -1);
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
  selectedRuleId,
  measurement,
  markers,
  onSelectStep,
  onSelectFinding,
}: IfcModelViewerProps) {
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), CUT_HEIGHT), []);
  const model = useBuiltModel(geometry, facts, plane);
  const [tier, setTier] = useState<Tier>(PINNED ?? "high");
  const [warm, setWarm] = useState(false);
  const products = useMemo(() => new Map(facts.products.map((p) => [p.expressId, p])), [facts]);

  /* ---- services ---- */
  const kinds = useMemo(() => memberKinds(facts.systems ?? []), [facts]);
  const mepIds = useMemo(() => {
    const ids = new Set<number>();
    for (const chunk of geometry.chunks) if (chunk.category === "mep") for (const r of chunk.ranges) ids.add(r.expressId);
    return ids;
  }, [geometry]);
  const layers = useMemo(() => networkLayers(facts, mepIds), [facts, mepIds]);
  const hasServices = mepIds.size > 0 || layers.length > 0;
  const [hidden, setHidden] = useState<ReadonlySet<LayerKind>>(() => new Set());
  const [layersOpen, setLayersOpen] = useState(SHOT === "networks");

  /* ---- site, levels ---- */
  // The building's own box: services outside the walls do not move the site or the framing.
  const building = useMemo(() => buildingBoxOf(facts.products, geometry.bbox), [facts, geometry]);
  const floorTop = useMemo(() => {
    const floor = facts.products.filter((p) => p.ifcType.toUpperCase() === "IFCSLAB" && p.bbox);
    return floor.length ? Math.min(...floor.map((p) => p.bbox!.max[1])) : geometry.bbox.min[1] + 0.15;
  }, [facts, geometry]);
  const front: Side = useMemo(() => frontSide(building, openingsOf(facts.products)), [facts, building]);
  const site = useMemo(() => siteLayout(building, floorTop, front), [building, floorTop, front]);
  const time = SHOT === "hero" ? HERO_TIME : VIEW_TIME;
  const sunFlat = useMemo((): [number, number] => {
    const { elevation, azimuth } = solarPosition(RIYADH.lat, RIYADH.lon, time);
    const [x, , z] = sunVector(elevation, azimuth);
    const l = Math.hypot(x, z) || 1;
    return [x / l, z / l];
  }, [time]);

  // Storeys and the floor level of each, from the elements the file places in them.
  const { levels, storeyOf } = useMemo(() => {
    const storeyIds = new Set(facts.storeys.map((s) => s.expressId));
    const owner = new Map<number, number>();
    const find = (id: number) => {
      let current = products.get(id)?.containerId;
      for (let guard = 0; current !== undefined && !storeyIds.has(current) && guard < 8; guard++) {
        current = products.get(current)?.containerId;
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
  }, [facts, products]);

  /* ---- view state ---- */
  const initialView: ViewId = SHOT === "hero" ? "facade" : SHOT === "networks" ? "networks" : "section";
  const [view, setView] = useState<ViewId>(initialView);
  const [cut, setCut] = useState(initialView === "section");
  const [camera, setCamera] = useState<CameraRequest>({ kind: "view", nonce: 0 });
  const [showSpaces, setShowSpaces] = useState(false);
  const [level, setLevel] = useState(0);
  const levelY = levels[level]?.y ?? floorTop;
  // A height measurement (e.g. wall tiles) raises the cut so the measured top stays visible.
  const cutHeight = measurement?.axis === "height" ? Math.max(CUT_HEIGHT, measurement.value + 0.3) : CUT_HEIGHT;
  const cutY = cut ? levelY + cutHeight : Infinity;

  useEffect(() => {
    plane.constant = cut ? levelY + cutHeight : NO_CUT;
  }, [cut, plane, levelY, cutHeight]);

  useEffect(() => () => releaseTextures(), []);

  const selected = SHOT ? undefined : selectedStepId !== undefined ? products.get(selectedStepId) : undefined;
  const focusBox = selected?.bbox;
  // A finding about a network (drainage, water...) is read in the services view on its layer.
  const topic = SHOT ? undefined : serviceTopic(selectedRuleId);
  const topicLayer = topic && layers.some((l) => l.kind === topic) ? topic : undefined;
  const selectedIsService = isServiceElement(selected, mepIds, kinds) || topicLayer !== undefined;
  const selectedSystems = useMemo(
    () => (selected ? systemsOf(facts.systems ?? [], selected.expressId) : []),
    [selected, facts],
  );

  const goto = useCallback(
    (next: ViewId) => {
      if (next === "networks" && !hasServices) return;
      setView(next);
      setCut(next === "section" || next === "plan");
      setLayersOpen(next === "networks");
      setCamera((c) => ({ kind: "view", nonce: c.nonce + 1 }));
    },
    [hasServices],
  );

  const focus = useCallback(() => {
    if (!focusBox) return;
    const toServices = selectedIsService && hasServices;
    setView(toServices ? "networks" : "section");
    setCut(!toServices);
    setLayersOpen(toServices);
    setCamera((c) => ({ kind: "focus", nonce: c.nonce + 1 }));
  }, [focusBox, selectedIsService, hasServices]);

  /* A selection made outside the scene (the register, a pin) moves to the view that shows it best;
     a pick in the scene keeps the view the visitor chose. */
  const picked = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (SHOT || selectedStepId === undefined || !focusBox) return;
    if (picked.current !== undefined && picked.current === selectedStepId) {
      picked.current = undefined;
      return;
    }
    picked.current = undefined;
    const storey = storeyOf.get(selectedStepId);
    const index = levels.findIndex((l) => l.id === storey);
    if (index >= 0) setLevel(index);
    // Only the finding's network on (the panel shows the others, unchecked); all on otherwise.
    setHidden(new Set(topicLayer ? layers.map((l) => l.kind).filter((k) => k !== topicLayer) : []));
    focus();
    // Only a new selection moves the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStepId, focusBox]);

  const onPick = useCallback(
    (id?: number) => {
      picked.current = id;
      onSelectStep(id);
    },
    [onSelectStep],
  );

  const room = useMemo((): [number, number] | undefined => {
    const container = selected?.containerId;
    const space = facts.spaces.find((s) => s.expressId === container);
    return space?.bbox ? [centerOf(space.bbox)[0], centerOf(space.bbox)[2]] : undefined;
  }, [selected, facts]);

  const poseFor = useCallback(
    (lens: Lens): Pose => {
      if (camera.kind === "focus" && focusBox) {
        return focusPose(focusBox, building, lens, {
          axis: selectedIsService ? undefined : measurement?.axis,
          floorY: levelY,
          room,
          value: measurement?.value,
          services: selectedIsService,
        });
      }
      switch (view) {
        case "facade":
          return SHOT === "hero"
            ? facadePose(building, front, sunFlat, site.plazaY, lens, "shade", 0.86)
            : facadePose(building, front, sunFlat, site.plazaY, lens);
        case "plan":
          return planPose(building, front, levelY, lens);
        case "networks":
          return networksPose(building, front, levelY, lens);
        default:
          return sectionPose(building, front, levelY, lens);
      }
    },
    [camera.kind, focusBox, building, selectedIsService, measurement, levelY, room, view, front, sunFlat, site],
  );

  const toggleLayer = useCallback((kind: LayerKind, on: boolean) => {
    setHidden((current) => {
      const next = new Set(current);
      if (on) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const appExtra = useMemo(
    () => ({
      view,
      cut,
      tier,
      shot: SHOT ?? null,
      layers: layers.map((l) => ({ kind: l.kind, count: l.count, visible: !hidden.has(l.kind) })),
      systems: (facts.systems ?? []).length,
      parts: model.parts.length,
      goto: (next: string) => {
        if (next === "focus") return focus();
        const alias: Record<string, ViewId> = { iso: "section", top: "plan" };
        const id = (alias[next] ?? next) as ViewId;
        if (id in VIEW_LABEL) goto(id);
      },
      setLayer: (kind: LayerKind, on: boolean) => toggleLayer(kind, on),
    }),
    [view, cut, tier, layers, hidden, facts, model, focus, goto, toggleLayer],
  );

  const services = view === "networks";
  // Pins mark interior elements: from outside, with the walls whole, they would float.
  const inside = cut || services;
  // Services: in system colours in the services view or with the layers panel open, as built from
  // outside, and off in the cut and the plan (ceiling runs would bury the rooms; the panel shows them).
  const serviceStyle: ServiceStyle =
    services || (layersOpen && layers.length > 0) ? "system" : view === "facade" ? "real" : "off";
  const statusClass = selectedStatus ?? "file";
  const dpr = CAPTURE ? 1 : tier === "low" ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
  const shadowSize = COARSE ? 2048 : 4096;
  const ui = !SHOT;

  const scene = (
    <div
      className={`vw${SHOT ? " vw--shot" : ""}${services ? " vw--services" : ""}${layers.length > 0 && layersOpen ? " vw--layers" : ""}`}
      data-testid="ifc-model-viewer"
      data-view={view}
    >
      <div className="vw__canvas" aria-label={`عارض ثلاثي الأبعاد لهندسة الملف ${fileName}`}>
        <Canvas
          shadows="percentage"
          dpr={dpr}
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
          onPointerMissed={() => onPick(undefined)}
        >
          <SkyAndLight bbox={building} time={time} shadowSize={shadowSize} />
          <Site layout={site} />
          <InteriorReflections materials={model.interior} />
          <Model model={model} mode={services ? "services" : "building"} services={serviceStyle} showSpaces={showSpaces}
            hidden={hidden} onPick={onPick} />
          {services && <ShellEdges parts={model.parts} plane={plane} />}
          {ui && (
            <Highlight stepId={selectedStepId} status={selectedStatus} model={model} plane={plane} service={selectedIsService} />
          )}
          {ui && cut && measurement && focusBox && (
            <DimensionLine
              box={focusBox}
              value={measurement.value}
              limit={measurement.limit}
              status={selectedStatus ?? "unknown"}
              cut={cut}
              building={building}
              axis={measurement.axis}
              floorY={levelY}
            />
          )}
          {ui && inside && <Markers markers={markers} products={products} cutY={cutY} onSelectFinding={onSelectFinding} />}
          {ui && showSpaces && (
            <SpaceLabels
              facts={facts}
              show={(id) => levels.length <= 1 || storeyOf.get(id) === levels[level]?.id}
            />
          )}
          <ShadowRefresh dep={`${cut}-${level}-${cutHeight}-${view}-${serviceStyle}-${[...hidden].join(",")}-${geometry.triangles}`} />
          <CameraRig request={camera} poseFor={poseFor} />
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            minDistance={1.5}
            maxDistance={radiusOf(building) * 8}
            maxPolarAngle={Math.PI / 2 - 0.04}
          />
          {tier === "high" && <Effects />}
          {!PINNED && <Governor onTier={setTier} />}
          {!warm && <WarmUp composer={tier === "high"} onDone={() => setWarm(true)} />}
          <Instrumentation geometry={geometry} warm={warm} extra={appExtra} />
        </Canvas>
      </div>

      {ui && (
        <>
          <p className="vw__meta" data-testid="ifc-viewer-source" title={fileName}>
            <strong>{copy.model.title}</strong>
            <span>{SOURCE_NOTE}</span>
          </p>

          <ul className="vw__legend">
            <li><i className="vw__dot vw__dot--fail" aria-hidden="true" />{copy.status.fail}</li>
            <li><i className="vw__dot vw__dot--unknown" aria-hidden="true" />{copy.status.unknown}</li>
            <li><i className="vw__dot vw__dot--pass" aria-hidden="true" />{copy.status.pass}</li>
            <li className="vw__legend-note">{CONTEXT_NOTE}</li>
          </ul>

          <div className="vw__bar">
            <div className="vw__views" role="group" aria-label={VIEWS_LABEL}>
              {(Object.keys(VIEW_LABEL) as ViewId[]).map((id) => {
                const disabled = id === "networks" && !hasServices;
                const testId = id === "section" ? "ifc-view-iso" : id === "plan" ? "ifc-view-top" : `ifc-view-${id}`;
                return (
                  <button
                    key={id}
                    type="button"
                    className="vw-seg"
                    aria-pressed={view === id}
                    disabled={disabled}
                    title={disabled ? NO_NETWORKS : VIEW_HINT[id]}
                    onClick={() => goto(id)}
                    data-testid={testId}
                  >
                    {VIEW_LABEL[id]}
                  </button>
                );
              })}
            </div>

            <div className="vw__tools" role="toolbar" aria-label={TOOLS_LABEL}>
              <IconButton label="التركيز على العنصر المحدد" disabled={!focusBox} onClick={focus} data-testid="ifc-view-focus">
                <Crosshair size={18} strokeWidth={1.6} />
              </IconButton>
              <IconButton label="قص الجدران لرؤية الداخل" aria-pressed={cut} onClick={() => setCut((v) => !v)}
                data-testid="ifc-cut">
                <Scissors size={18} strokeWidth={1.6} />
              </IconButton>
              <IconButton label="المساحات وأسماؤها" aria-pressed={showSpaces} onClick={() => setShowSpaces((v) => !v)}
                data-testid="ifc-spaces">
                <LayoutGrid size={18} strokeWidth={1.6} />
              </IconButton>
              {layers.length > 0 && (
                <IconButton label="طبقات الشبكات" aria-pressed={layersOpen} aria-controls="vw-layers"
                  onClick={() => setLayersOpen((v) => !v)} data-testid="ifc-layers-toggle">
                  <Layers size={18} strokeWidth={1.6} />
                </IconButton>
              )}
              {levels.length > 1 && (
                <select className="vw-level" value={level} aria-label="الدور المعروض في المقطع"
                  onChange={(event) => { setLevel(Number(event.target.value)); setCut(true); }} data-testid="ifc-level">
                  {levels.map((l, i) => (
                    <option key={l.id} value={i}>{l.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {layers.length > 0 && layersOpen && (
            <section className="vw__layers" id="vw-layers" aria-label={copy.results.networks} data-testid="ifc-layers">
              <h3>{copy.results.networks}</h3>
              <ul>
                {layers.map((layer) => (
                  <li key={layer.kind}>
                    <label>
                      <input
                        type="checkbox"
                        checked={!hidden.has(layer.kind)}
                        onChange={(event) => toggleLayer(layer.kind, event.target.checked)}
                        data-testid={`ifc-layer-${layer.kind}`}
                      />
                      <i className="vw-swatch" style={{ "--swatch": layer.color } as React.CSSProperties} aria-hidden="true" />
                      <span className="vw__layer-name">{layer.label}</span>
                      <span className="vw__layer-count num">{layer.count}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <p>{LAYERS_NOTE}</p>
            </section>
          )}

          {selected && (
            <div className={`vw__selection vw__selection--${statusClass}`} data-testid="ifc-selection">
              {selectedStatus && (
                <span className={`status status--${selectedStatus}`}>
                  <StatusGlyph status={selectedStatus} size={22} />
                </span>
              )}
              <div className="vw__selection-copy">
                <small>{selectedTitle ?? "عنصر من الملف"}</small>
                <strong><bdi>{facts.spaces.find((space) => space.expressId === selected.expressId)?.longName ?? selected.name ?? selected.ifcType}</bdi></strong>
                <span>
                  <bdi dir="ltr">{selected.ifcType}</bdi>
                  <bdi dir="ltr" className="vw__guid">{selected.globalId}</bdi>
                </span>
                {selectedSystems.length > 0 && (
                  <span className="vw__systems" data-testid="ifc-selection-systems">
                    <span className="vw__systems-label">{selectedSystems.length > 1 ? SYSTEMS_LABEL : SYSTEM_LABEL}</span>
                    {selectedSystems.map((system) => (
                      <span key={system.expressId} className="vw__system" title={LAYER_LABELS[system.kind]} data-testid="ifc-selection-system">
                        <i className="vw-swatch" style={{ "--swatch": LAYER_COLORS[system.kind] } as React.CSSProperties} aria-hidden="true" />
                        <bdi>{system.name ?? system.predefinedType ?? LAYER_LABELS[system.kind]}</bdi>
                        {!/[\u0600-\u06FF]/.test(system.name ?? "") && <span className="vw__system-kind">{LAYER_LABELS[system.kind]}</span>}
                      </span>
                    ))}
                  </span>
                )}
                {measurement && (
                  <span>
                    {copy.results.detail.measured} {measurement.value.toFixed(2)} م، {measurement.source}
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  return SHOT ? <ShotPortal>{scene}</ShotPortal> : scene;
}

/** Capture shots fill the window above the page, whatever layout the page has around the viewer. */
function ShotPortal({ children }: { children: ReactNode }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return createPortal(children, document.body);
}
