import type { FacilityDetails } from "../../data";
import { hasCompleteFacility } from "../rules";
import type { ExtractedIfcEntity, RuleEvaluation } from "../types";
import type {
  Box3,
  SpaceRole,
  StandardDoor,
  StandardFacts,
  StandardProduct,
  StandardSpace,
  StandardSystem,
} from "./model";
import { atLevel, distanceToSpace, doorSides, spaceGap } from "./plan";

/** Arabic count of systems: نظام واحد، نظامان، 3 أنظمة، 12 نظامًا. */
function systemsCount(n: number): string {
  if (n === 1) return "نظام واحد";
  if (n === 2) return "نظامان";
  const tail = n % 100;
  if (tail >= 3 && tail <= 10) return `${n} أنظمة`;
  if (tail >= 11) return `${n} نظامًا`;
  return `${n} نظام`;
}

/*
 * Restaurant rules for standard IFC files, one per requirement in ./requirements.ts (the
 * ministry's "اشتراطات المطاعم"). Each rule reads only what a normal BIM export contains:
 * IFC attributes, Pset_*Common, Qto_*, containment and geometry. A rule whose evidence an
 * architectural file cannot carry returns "unknown" with the reason; it never counts as a pass.
 */

export const MIN_SITE_AREA_M2 = 16; // 3.1
export const MIN_CLADDING_HEIGHT_M = 1.8; // 4.5.2
export const STORE_SHARE_LIMIT = 0.25; // 4.8.1
export const STORE_AREA_CAP_M2 = 150; // 4.8.1
/** Provisional: 4.9.1 refers to SBC-801 without a number in the requirements document. */
export const EXIT_WIDTH_LIMIT_M = 0.9;

const SHARED_WALL_GAP_M = 0.3;
const HANDWASH_NEAR_M = 1.0;

export const REQUIRED_RESTAURANT_ROLES: SpaceRole[] = ["KITCHEN", "STORAGE", "DINING"];

const ROLE_AR: Record<SpaceRole, string> = {
  DINING: "صالة التقديم",
  KITCHEN: "المطبخ (التحضير والطهي)",
  WC: "دورة المياه",
  STORAGE: "المخزن",
  SERVICE: "الخدمة",
};

export type StandardEvaluation = RuleEvaluation & {
  /** The measured value behind the result, for the viewer's dimension line. */
  measurement?: { value: number; unit: "m"; source: string; limit?: number; axis: "width" | "height" };
};

const metres = (value: number) => `${value.toFixed(2)} م`;
const area = (value: number) => `${value.toFixed(1)} م²`;

export function toEntity(
  facts: StandardFacts,
  expressId: number | undefined,
): ExtractedIfcEntity | undefined {
  if (expressId === undefined) return undefined;
  const product = facts.products.find((item) => item.expressId === expressId);
  if (!product) return undefined;
  return {
    stepId: product.expressId,
    type: product.ifcType.toUpperCase(),
    globalId: product.globalId,
    name: product.name,
    properties: {},
    propertySets: {},
  };
}

function centreXZ(box: Box3): [number, number] {
  return [(box.min[0] + box.max[0]) / 2, (box.min[2] + box.max[2]) / 2];
}

/** Plan distance from a product's centre to a space on its storey (Infinity elsewhere). */
function productToSpace(p: StandardProduct, space: StandardSpace): number {
  if (!p.bbox) return Infinity;
  if (!atLevel(space, p.bbox.min[1] + 0.1)) return Infinity;
  const [x, z] = centreXZ(p.bbox);
  return distanceToSpace(space, x, z);
}

function unknown(ruleId: string, reason: string, target?: ExtractedIfcEntity): StandardEvaluation {
  return { ruleId, status: "unknown", actual: `غير قابل للتحقق من الملف: ${reason}`, target };
}

const label = (p: { name?: string; longName?: string; reference?: string; globalId: string }) =>
  [p.reference, p.longName ?? p.name].filter(Boolean).join("، ") || p.globalId;

/* ---- building services (clause 4.1.3) ---- */

const NOT_FOUL_WATER = new Set(["STORMWATER", "RAINWATER", "VENT"]);

/** A drainage system that carries foul water to the sewer: not storm water and not a vent. */
export function isSewerSystem(system: StandardSystem): boolean {
  if (system.kind !== "drainage") return false;
  const type = system.predefinedType;
  if (type && type !== "USERDEFINED") return !NOT_FOUL_WATER.has(type);
  return !/storm|\brain|\bvent(?!ilat)/i.test(system.name ?? "");
}

/** Fixtures and equipment that discharge water: sinks, basins, WCs, floor traps, dishwashers. */
export function dischargesWater(p: StandardProduct): boolean {
  const cls = p.ifcType.toUpperCase();
  const type = (p.typeClass ?? "").toUpperCase();
  const predefined = p.predefinedType ?? "";
  if (cls === "IFCSANITARYTERMINAL" || type === "IFCSANITARYTERMINALTYPE") return predefined !== "CISTERN";
  if (cls === "IFCWASTETERMINAL" || type === "IFCWASTETERMINALTYPE") return predefined !== "ROOFDRAIN";
  if (cls === "IFCELECTRICAPPLIANCE" || type === "IFCELECTRICAPPLIANCETYPE") {
    return predefined === "DISHWASHER" || predefined === "WASHINGMACHINE";
  }
  return false;
}

/**
 * The sewer drainage network of a file and, for any element, the first element of that network
 * it reaches through port connections. The search may pass through elements that belong to no
 * other service system and through other fixtures (a dishwasher may drain through a sink), but
 * never through the water supply or another network, so a sink whose drain port is left open is
 * not "connected" by way of its taps.
 */
export function drainageNetwork(facts: StandardFacts) {
  const sewers = facts.systems.filter(isSewerSystem);
  const sewerMembers = new Set(sewers.flatMap((s) => s.members));
  const otherMembers = new Set(facts.systems.filter((s) => !isSewerSystem(s)).flatMap((s) => s.members));
  const fixtures = new Set(facts.products.filter(dischargesWater).map((p) => p.expressId));
  const adjacency = new Map<number, number[]>();
  const link = (from: number, to: number) => {
    const list = adjacency.get(from);
    if (list) list.push(to);
    else adjacency.set(from, [to]);
  };
  for (const { a, b } of facts.connections) {
    link(a, b);
    link(b, a);
  }
  const reach = (start: number): number | undefined => {
    const seen = new Set([start]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      for (const next of adjacency.get(queue[i]) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        const fixture = fixtures.has(next);
        if (sewerMembers.has(next) && !fixture) return next;
        if (fixture || !otherMembers.has(next)) queue.push(next);
      }
    }
    return undefined;
  };
  const ported = facts.connections.some((c) => sewerMembers.has(c.a) || sewerMembers.has(c.b));
  return { sewers, sewerMembers, ported, reach };
}

export function evaluateStandardRestaurant(
  facts: StandardFacts,
  facility: FacilityDetails,
): StandardEvaluation[] {
  const entity = (id?: number) => toEntity(facts, id);
  const spacesBy = (role: SpaceRole) => facts.spaces.filter((space) => space.role === role);
  const kitchens = spacesBy("KITCHEN");
  const dining = spacesBy("DINING")[0];
  const wcs = spacesBy("WC");
  const stores = spacesBy("STORAGE");
  const results: StandardEvaluation[] = [];

  // 3.1 minimum site area
  const measuredSpaces = facts.spaces.filter((s) => s.netFloorArea !== undefined);
  const totalArea = measuredSpaces.reduce((sum, s) => sum + (s.netFloorArea ?? 0), 0);
  results.push(
    measuredSpaces.length === 0
      ? unknown("MOMAH-REST-3.1-AREA", "لا توجد مساحات بمساحة مقاسة في الملف")
      : {
          ruleId: "MOMAH-REST-3.1-AREA",
          status: totalArea >= MIN_SITE_AREA_M2 ? "pass" : "fail",
          actual: `${area(totalArea)}: مجموع المساحات الصافية لـ ${measuredSpaces.length} مساحات في الملف`,
        },
  );

  // 4.2.2 preparation/cooking, storage and serving hall
  const missing = REQUIRED_RESTAURANT_ROLES.filter((role) => spacesBy(role).length === 0);
  results.push({
    ruleId: "MOMAH-REST-4.2.2-SPACES",
    status: missing.length ? "fail" : "pass",
    actual: missing.length
      ? `مساحات غير موجودة في الملف: ${missing.map((role) => ROLE_AR[role]).join("، ")}`
      : REQUIRED_RESTAURANT_ROLES.map((role) => `${ROLE_AR[role]}: ${spacesBy(role)[0].roleMatchedOn}`).join(" • "),
    target: entity(kitchens[0]?.expressId ?? facts.spaces[0]?.expressId),
  });

  // 4.5.2 kitchen wall cladding height
  const inKitchen = (p: StandardProduct, kitchen: StandardSpace) =>
    p.containerId === kitchen.expressId || productToSpace(p, kitchen) === 0;
  const cladding = facts.products.filter(
    (p) => p.ifcType.toUpperCase() === "IFCCOVERING" && p.predefinedType === "CLADDING" && p.bbox &&
      kitchens.some((k) => inKitchen(p, k)),
  );
  if (!kitchens.length) {
    results.push(unknown("MOMAH-REST-4.5.2-CLADDING", "لا توجد مساحة مصنفة مطبخًا لقياس تكسيتها"));
  } else if (!cladding.length) {
    results.push(
      unknown(
        "MOMAH-REST-4.5.2-CLADDING",
        "لا توجد عناصر تكسية (IfcCovering من نوع CLADDING) داخل المطبخ في الملف",
        entity(kitchens[0].expressId),
      ),
    );
  } else {
    const floorY = Math.min(...kitchens.map((k) => k.bbox?.min[1] ?? 0));
    const lowest = cladding
      .map((p) => ({ p, height: p.bbox!.max[1] - floorY }))
      .sort((a, b) => a.height - b.height)[0];
    const source = "من هندسة عناصر IfcCovering في الملف";
    results.push({
      ruleId: "MOMAH-REST-4.5.2-CLADDING",
      status: lowest.height >= MIN_CLADDING_HEIGHT_M - 1e-6 ? "pass" : "fail",
      actual: `${metres(lowest.height)}: أدنى ارتفاع تكسية في المطبخ (${lowest.p.name ?? lowest.p.globalId})، ${source}`,
      target: entity(lowest.p.expressId),
      measurement: { value: lowest.height, unit: "m", source, limit: MIN_CLADDING_HEIGHT_M, axis: "height" },
    });
  }

  // 4.8.1 storage share of the licensed area
  const storeArea = stores.reduce((sum, s) => sum + (s.netFloorArea ?? 0), 0);
  const licensed = facility.area;
  const limit = Math.min(STORE_SHARE_LIMIT * licensed, STORE_AREA_CAP_M2);
  if (!stores.length) {
    results.push({
      ruleId: "MOMAH-REST-4.8.1-STORE",
      status: "pass",
      actual: "لا يوجد مستودع في الملف، فلا ينطبق حد المساحة",
    });
  } else if (!(licensed > 0) || stores.some((s) => s.netFloorArea === undefined)) {
    results.push(unknown("MOMAH-REST-4.8.1-STORE", "مساحة المستودع أو المساحة الإجمالية للترخيص غير متوفرة", entity(stores[0].expressId)));
  } else {
    results.push({
      ruleId: "MOMAH-REST-4.8.1-STORE",
      status: storeArea <= limit + 1e-6 ? "pass" : "fail",
      actual: `${area(storeArea)} للمستودع، والحد ${area(limit)} (الأقل من 25% × ${licensed} م² و150 م²)`,
      target: entity(stores[0].expressId),
    });
  }

  // 4.10.1 (1) at least one WC (recommendation)
  results.push({
    ruleId: "MOMAH-REST-4.10.1-WC",
    status: wcs.length >= 1 ? "pass" : "fail",
    actual: wcs.length ? `${wcs.length} دورة مياه: ${wcs.map((w) => label(w)).join("، ")}` : "لا توجد دورة مياه في الملف",
    target: entity(wcs[0]?.expressId),
  });

  // 4.10.1 (2) WC doors must not open directly onto a food handling room
  const spacesAt = (door: StandardDoor): StandardSpace[] => {
    const sides: (StandardSpace | undefined)[] = doorSides(door, facts.spaces) ?? [];
    return sides.filter((s): s is StandardSpace => Boolean(s));
  };
  const wcDoors = facts.doors.filter((d) => spacesAt(d).some((s) => s.role === "WC"));
  const toKitchen = wcDoors.filter((d) => spacesAt(d).some((s) => s.role === "KITCHEN"));
  if (!wcs.length) {
    results.push(unknown("MOMAH-REST-4.10.1-DOOR", "لا توجد دورة مياه في الملف"));
  } else if (!wcDoors.length) {
    results.push(unknown("MOMAH-REST-4.10.1-DOOR", "لم يُعثر على باب يقع على حد دورة المياه في هندسة الملف", entity(wcs[0].expressId)));
  } else {
    const opensTo = wcDoors.map((d) => {
      const other = spacesAt(d).filter((s) => s.role !== "WC").map((s) => label(s));
      return `${label(d)} ← ${other.join(" / ") || "خارج المبنى"}`;
    });
    results.push({
      ruleId: "MOMAH-REST-4.10.1-DOOR",
      status: toKitchen.length ? "fail" : "pass",
      actual: toKitchen.length
        ? `باب دورة المياه يفتح على المطبخ: ${toKitchen.map((d) => label(d)).join("، ")}`
        : `أبواب دورات المياه: ${opensTo.join(" • ")}`,
      target: entity((toKitchen[0] ?? wcDoors[0]).expressId),
    });
  }

  // 4.10.1 (2) WCs away from food handling areas
  if (!wcs.length || !kitchens.length) {
    results.push(unknown("MOMAH-REST-4.10.1-SEPARATION", "يلزم وجود دورة مياه ومطبخ مصنفين في الملف"));
  } else {
    const pairs = wcs
      .flatMap((w) => kitchens.map((k) => ({ w, k, gap: spaceGap(w, k) })))
      .filter((pair) => Number.isFinite(pair.gap));
    const closest = pairs.sort((a, b) => a.gap - b.gap)[0];
    results.push(
      !closest
        ? {
            ruleId: "MOMAH-REST-4.10.1-SEPARATION",
            status: "pass",
            actual: "دورات المياه والمطبخ في أدوار مختلفة، فلا يوجد جدار مشترك بينها",
            target: entity(wcs[0].expressId),
          }
        : {
            ruleId: "MOMAH-REST-4.10.1-SEPARATION",
            status: closest.gap >= SHARED_WALL_GAP_M ? "pass" : "fail",
            actual:
              closest.gap >= SHARED_WALL_GAP_M
                ? `${metres(closest.gap)} بين ${label(closest.w)} و${label(closest.k)}، ولا يوجد جدار مشترك`
                : `${label(closest.w)} يشترك بجدار مع ${label(closest.k)} (${metres(closest.gap)})`,
            target: entity(closest.w.expressId),
          },
    );
  }

  // 4.10.1 (2) hand-wash basins in or near the WC
  const basins = facts.products.filter(
    (p) => p.ifcType.toUpperCase() === "IFCSANITARYTERMINAL" && p.predefinedType === "WASHHANDBASIN",
  );
  const nearWc = basins.find((b) =>
    wcs.some((w) => b.containerId === w.expressId || productToSpace(b, w) <= HANDWASH_NEAR_M),
  );
  results.push(
    !wcs.length
      ? unknown("MOMAH-REST-4.10.1-HANDWASH", "لا توجد دورة مياه في الملف")
      : nearWc
        ? {
            ruleId: "MOMAH-REST-4.10.1-HANDWASH",
            status: "pass",
            actual: `${nearWc.name ?? "حوض غسل أيدي"} (WASHHANDBASIN) داخل دورة المياه أو بجوارها`,
            target: entity(nearWc.expressId),
          }
        : {
            ruleId: "MOMAH-REST-4.10.1-HANDWASH",
            status: "fail",
            actual: basins.length
              ? "أحواض غسل الأيدي في الملف بعيدة عن دورات المياه"
              : "لا يوجد حوض غسل أيدي (IfcSanitaryTerminal من نوع WASHHANDBASIN) في الملف",
            target: entity(wcs[0].expressId),
          },
  );

  // 4.9.1 -> SBC-801: exit from the dining hall, and its width (provisional limit)
  const exits = facts.doors.filter((door) => door.fireExit === true);
  const flagged = facts.doors.some((door) => door.fireExit !== undefined);
  if (!flagged) {
    const reason = "لا يحدد أي باب في الملف الخاصية Pset_DoorCommon.FireExit، فلا يمكن تمييز مخارج الطوارئ";
    results.push(unknown("MOMAH-REST-4.9.1-EXIT", reason));
    results.push(unknown("MOMAH-REST-4.9.1-WIDTH", reason));
  } else {
    const diningExit = exits.find((d) => {
      const sides = doorSides(d, facts.spaces);
      return d.isExternal === true && Boolean(sides?.some((s) => s?.role === "DINING")) && Boolean(sides?.some((s) => !s));
    });
    results.push(
      !dining
        ? { ruleId: "MOMAH-REST-4.9.1-EXIT", status: "fail", actual: "لا توجد صالة طعام مصنفة لربط مخرج الطوارئ بها" }
        : diningExit
          ? {
              ruleId: "MOMAH-REST-4.9.1-EXIT",
              status: "pass",
              actual: `${label(diningExit)}: باب طوارئ خارجي (IsExternal) يصل صالة الطعام بخارج المبنى، من هندسة الملف`,
              target: entity(diningExit.expressId),
            }
          : {
              ruleId: "MOMAH-REST-4.9.1-EXIT",
              status: "fail",
              actual: exits.length
                ? `مخارج الطوارئ في الملف (${exits.map(label).join("، ")}) ليست أبوابًا خارجية على حد صالة الطعام`
                : "لا يوجد باب محدد كمخرج طوارئ في الملف",
              target: entity(exits[0]?.expressId ?? dining.expressId),
            },
    );
    const narrowest = exits
      .filter((d): d is StandardDoor & { width: number } => d.width !== undefined)
      .sort((a, b) => a.width - b.width)[0];
    if (!narrowest) {
      results.push(unknown("MOMAH-REST-4.9.1-WIDTH", "مخرج الطوارئ موجود لكن عرضه غير مسجل ولا هندسة له", entity(exits[0]?.expressId)));
    } else {
      const source =
        narrowest.widthSource === "OverallWidth"
          ? "من خاصية OverallWidth في الملف"
          : "تقديري من حدود هندسة الباب (يشمل الإطار)";
      results.push({
        ruleId: "MOMAH-REST-4.9.1-WIDTH",
        status: narrowest.width >= EXIT_WIDTH_LIMIT_M - 1e-9 ? "pass" : "fail",
        actual: `${metres(narrowest.width)}: أضيق مخرج طوارئ (${label(narrowest)})، ${source}`,
        target: entity(narrowest.expressId),
        measurement: { value: narrowest.width, unit: "m", source, limit: EXIT_WIDTH_LIMIT_M, axis: "width" },
      });
    }
  }

  // 4.1.3 every fixture that discharges water reaches the sewer drainage network through its ports
  const drainage = drainageNetwork(facts);
  const dischargers = facts.products.filter(dischargesWater);
  if (!dischargers.length) {
    results.push(
      unknown(
        "MOMAH-REST-4.1.3-DRAIN",
        "لا توجد في الملف تجهيزات تصرف ماءً (أحواض أو مغاسل أو مراحيض أو صفايات أرضية أو غسالات صحون)",
      ),
    );
  } else if (!drainage.sewers.length) {
    results.push(
      unknown(
        "MOMAH-REST-4.1.3-DRAIN",
        `${dischargers.length} تجهيزات تصرف ماءً في الملف، لكن لا توجد شبكة صرف صحي (IfcDistributionSystem من نوع DRAINAGE) لتتبع اتصالها بها`,
        entity(dischargers[0].expressId),
      ),
    );
  } else if (!drainage.ported) {
    results.push(
      unknown(
        "MOMAH-REST-4.1.3-DRAIN",
        "شبكة الصرف في الملف بلا منافذ موصولة (IfcDistributionPort وIfcRelConnectsPorts)، فلا يمكن تتبع اتصال التجهيزات بها",
        entity(dischargers[0].expressId),
      ),
    );
  } else {
    const open = dischargers.filter((p) => drainage.reach(p.expressId) === undefined);
    const measured = `${dischargers.length - open.length} من ${dischargers.length} تجهيزات موصولة بشبكة الصرف`;
    const network = drainage.sewers.map((s) => s.name ?? s.predefinedType ?? s.globalId).join("، ");
    if (open.length) {
      const first = open[0];
      const room = facts.spaces.find((s) => s.expressId === first.containerId);
      results.push({
        ruleId: "MOMAH-REST-4.1.3-DRAIN",
        status: "fail",
        actual: `${measured}: ${label(first)}${room ? ` (${label(room)})` : ""} لا يصل إلى شبكة الصرف (${network}) عبر منافذه${open.length > 1 ? `، و${open.length - 1} تجهيزات أخرى` : ""}`,
        target: entity(first.expressId),
      });
    } else {
      const outlet =
        facts.products.find((p) => drainage.sewerMembers.has(p.expressId) && p.ifcType.toUpperCase() === "IFCINTERCEPTOR") ??
        facts.products.find(
          (p) => drainage.sewerMembers.has(p.expressId) && p.ifcType.toUpperCase() === "IFCDISTRIBUTIONCHAMBERELEMENT",
        );
      results.push({
        ruleId: "MOMAH-REST-4.1.3-DRAIN",
        status: "pass",
        actual: `${measured}: كل تجهيز يصرف ماءً يصل إلى شبكة الصرف (${network}) عبر وصلات المنافذ في الملف`,
        target: entity(outlet?.expressId ?? dischargers[0].expressId),
      });
    }
  }

  // 4.3.2 facade services: a services model can place units, but visibility needs a sight-line analysis
  results.push(
    unknown(
      "MOMAH-REST-4.3.2-FACADE",
      facts.systems.length
        ? `يحتوي الملف نموذج خدمات (${systemsCount(facts.systems.length)})، لكن الحكم بظهور التمديدات ووحدات التكييف على الواجهة أو السطح يحتاج تحليل خطوط الرؤية، ولم يُفعّل بعد`
        : "النموذج المعماري لا يحتوي نموذج خدمات يحدد مواقع وحدات التكييف والتمديدات، فلا يثبت غيابها عن الواجهة",
    ),
  );

  // 4.7.1 ventilation per SBC: the network can be read, but compliance needs airflow figures
  const hvac = facts.systems.filter((s) => s.kind === "hvac");
  const hood = facts.products.find(
    (p) => kitchens.some((k) => p.containerId === k.expressId) && /hood|exhaust|شفاط|تهوية/i.test(p.name ?? ""),
  );
  const ventilation = hood ?? facts.products.find((p) => /AIRTERMINAL|FAN|DUCT/.test(p.ifcType.toUpperCase()));
  const hvacNames = hvac.map((s) => s.name ?? s.predefinedType ?? s.globalId);
  results.push(
    unknown(
      "MOMAH-REST-4.7.1-VENT",
      hvac.length
        ? `يحتوي الملف ${systemsCount(hvac.length)} للتهوية والتكييف (${hvacNames.slice(0, 3).join("، ")}${hvac.length > 3 ? "…" : ""})، لكن مطابقة تصميمها لكود البناء السعودي تحتاج معدلات تدفق الهواء ومتطلبات الكود، ولم تُطابق بعد`
        : ventilation
          ? `${ventilation.name ?? "عنصر التهوية"} موجود، لكن لا توجد شبكة تهوية (مجارٍ ومراوح) مسجلة كنظام في الملف`
          : "لا يوجد عنصر تهوية في المطبخ",
      entity(ventilation?.expressId ?? kitchens[0]?.expressId),
    ),
  );

  // 4.4.1 accessibility per SBC-201
  results.push(
    unknown("MOMAH-REST-4.4.1-ACCESS", "قياس المسارات والمناسيب وفق SBC-201 يحتاج تحليل مسارات لم يُفعّل بعد", entity(dining?.expressId)),
  );

  // Mowaem data checks
  const withoutGuid = facts.products.filter((product) => product.globalId.length !== 22);
  results.push({
    ruleId: "MOWAEM-DATA-IFC",
    status: withoutGuid.length === 0 && facts.products.length > 0 ? "pass" : "fail",
    actual:
      withoutGuid.length === 0
        ? `${facts.schema}، ${facts.records} سجلًا، ${facts.products.length} عنصرًا بمعرّف GUID دائم، الوحدة ${facts.lengthUnit.declared}`
        : `${withoutGuid.length} عنصرًا بلا معرّف GUID صالح`,
  });
  results.push({
    ruleId: "MOWAEM-DATA-FACILITY",
    status: hasCompleteFacility(facility) ? "pass" : "fail",
    actual: hasCompleteFacility(facility)
      ? `مكتملة، والمساحة الإجمالية المسجلة ${facility.area} م²`
      : "حقل واحد أو أكثر من بيانات المنشأة غير مكتمل",
  });
  const unclassified = facts.spaces.filter((space) => !space.role);
  results.push({
    ruleId: "MOWAEM-DATA-SPACES",
    status: facts.spaces.length > 0 && unclassified.length === 0 ? "pass" : "fail",
    actual:
      facts.spaces.length === 0
        ? "لا توجد مساحات IfcSpace في الملف"
        : unclassified.length === 0
          ? `جميع المساحات (${facts.spaces.length}) مصنفة من أسمائها`
          : `${unclassified.length} من ${facts.spaces.length} مساحات بلا تصنيف: ${unclassified.map((s) => label(s)).join("، ")}`,
    target: entity(unclassified[0]?.expressId ?? facts.spaces[0]?.expressId),
  });

  return results;
}
