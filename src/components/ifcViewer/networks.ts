import type { StandardFacts, StandardProduct, StandardSystem, SystemKind } from "../../ifc/standard/model";

/*
 * Building-services layers read from the file's own systems (IfcDistributionSystem / IfcSystem
 * and their IfcRelAssignsToGroup members). Colours are fixed per kind so the legend and the
 * pipes always agree; "unassigned" collects services elements the file puts in no system.
 */

export type LayerKind = SystemKind | "unassigned";

export const LAYER_ORDER: readonly LayerKind[] = [
  "water",
  "drainage",
  "electrical",
  "hvac",
  "fire",
  "other",
  "unassigned",
];

/** Base colours (sRGB). Water blue, drainage brown, electrical amber, HVAC grey-blue, fire red. */
export const LAYER_COLORS: Record<LayerKind, string> = {
  water: "#1f6fb2",
  drainage: "#7a5230",
  electrical: "#d9930d",
  hvac: "#6f8796",
  fire: "#c62828",
  other: "#6a5a8e",
  unassigned: "#8a8a86",
};

export const LAYER_LABELS: Record<LayerKind, string> = {
  water: "المياه",
  drainage: "الصرف الصحي",
  electrical: "الكهرباء",
  hvac: "التكييف والتهوية",
  fire: "الحماية من الحريق",
  other: "أنظمة أخرى",
  unassigned: "عناصر خدمات بلا نظام",
};

export interface NetworkLayer {
  kind: LayerKind;
  label: string;
  color: string;
  /** Systems of this kind, in file order (empty for "unassigned"). */
  systems: StandardSystem[];
  /** Distinct elements drawn on this layer. */
  count: number;
}

/** Kind of the first system (file order) that lists each element. */
export function memberKinds(systems: readonly StandardSystem[]): Map<number, SystemKind> {
  const out = new Map<number, SystemKind>();
  for (const system of systems) {
    for (const id of system.members) {
      if (!out.has(id)) out.set(id, system.kind);
    }
  }
  return out;
}

/** Every system that lists the element. */
export function systemsOf(systems: readonly StandardSystem[], expressId: number): StandardSystem[] {
  return systems.filter((system) => system.members.includes(expressId));
}

/**
 * The layers control: one row per system kind present in the file, plus "unassigned" when some
 * services geometry (the reader's "mep" category) belongs to no system. No systems, no layers.
 */
export function networkLayers(facts: Pick<StandardFacts, "systems">, mepElementIds: Iterable<number>): NetworkLayer[] {
  const systems = facts.systems ?? [];
  if (!systems.length) return [];
  const kinds = memberKinds(systems);
  const layers: NetworkLayer[] = [];
  for (const kind of LAYER_ORDER) {
    if (kind === "unassigned") continue;
    const ofKind = systems.filter((system) => system.kind === kind);
    if (!ofKind.length) continue;
    let count = 0;
    for (const [, k] of kinds) if (k === kind) count += 1;
    layers.push({ kind, label: LAYER_LABELS[kind], color: LAYER_COLORS[kind], systems: ofKind, count });
  }
  let loose = 0;
  for (const id of new Set(mepElementIds)) if (!kinds.has(id)) loose += 1;
  if (loose > 0) {
    layers.push({ kind: "unassigned", label: LAYER_LABELS.unassigned, color: LAYER_COLORS.unassigned, systems: [], count: loose });
  }
  return layers;
}

/** The layer an element of the services ("mep") geometry is drawn on. */
export function layerOf(kinds: ReadonlyMap<number, SystemKind>, expressId: number): LayerKind {
  return kinds.get(expressId) ?? "unassigned";
}

/** IFC classes of distribution elements (IFC2X3 and IFC4 names), used when the reader did not tag geometry "mep". */
const SERVICE_CLASS =
  /^IFC(FLOW|DISTRIBUTION|PIPE|DUCT|CABLE|ENERGYCONVERSION|AIRTERMINAL|ELECTRIC|LIGHTFIXTURE|LAMP|OUTLET|SWITCHINGDEVICE|PROTECTIVEDEVICE|FIRESUPPRESSION|SPRINKLER|ALARM|SENSOR|ACTUATOR|CONTROLLER|VALVE|PUMP|FAN|BOILER|CHILLER|COIL|UNITARYEQUIPMENT|TANK|JUNCTIONBOX|STACKTERMINAL|WASTETERMINAL|INTERCEPTOR|FILTER|DAMPER|COMPRESSOR|CONDENSER|HEATEXCHANGER|HUMIDIFIER|EVAPORATOR|AIRTOAIRHEATRECOVERY|MOTORCONNECTION|TRANSFORMER|DISTRIBUTIONBOARD|DISTRIBUTIONCHAMBER)/;

export function isServiceClass(ifcType: string): boolean {
  return SERVICE_CLASS.test(ifcType.toUpperCase());
}

/**
 * Whether a selection is best read in the services view: the element is services geometry, or a
 * distribution element the file assigns to a system (a sanitary terminal in a drainage system is
 * a building fixture first, so it stays in the cut).
 */
export function isServiceElement(
  product: Pick<StandardProduct, "expressId" | "ifcType"> | undefined,
  mepIds: ReadonlySet<number>,
  kinds: ReadonlyMap<number, SystemKind>,
): boolean {
  if (!product) return false;
  if (mepIds.has(product.expressId)) return true;
  return kinds.has(product.expressId) && isServiceClass(product.ifcType) && !/SANITARY|APPLIANCE/i.test(product.ifcType);
}

/** Topic words in rule ids ("MOMAH-REST-4.1.3-DRAIN") and the services layer that shows them. Order matters. */
const TOPICS: [RegExp, SystemKind][] = [
  [/DRAIN|SEWER|WASTE|SOIL|GREASE/, "drainage"],
  [/HVAC|VENTIL|EXHAUST|HOOD|AIRCON|COOLING/, "hvac"],
  [/FIRE|SPRINK|ALARM|EXTING|SMOKE/, "fire"],
  [/WATER|PLUMB|SUPPLY/, "water"],
  [/ELEC|POWER|LIGHTING|SOCKET/, "electrical"],
];

/** The services layer a finding is about, from its rule id; undefined for building findings. */
export function serviceTopic(ruleId: string | undefined): SystemKind | undefined {
  if (!ruleId) return undefined;
  const topic = ruleId.toUpperCase().split(/[-_.]/).slice(-2).join("-");
  return TOPICS.find(([pattern]) => pattern.test(topic))?.[1];
}
