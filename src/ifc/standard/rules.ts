import type { FacilityDetails, Finding } from "../../data";
import { hasCompleteFacility } from "../rules";
import type { ExtractedIfcEntity, RuleEvaluation } from "../types";
import type { Box3, SpaceRole, StandardDoor, StandardFacts, StandardSpace } from "./model";

/*
 * Restaurant rules for standard IFC files. Each rule reads only what a normal BIM export
 * contains (IFC attributes, Pset_*Common, Qto_*, containment, geometry). A rule whose
 * evidence a standard architectural file cannot carry returns "unknown" with the reason;
 * it is never counted as a pass.
 *
 * The 0.90 m limits are the existing experimental values from the rule pack (marked
 * "حد تجريبي" in src/data.ts); they are not yet tied to an official clause.
 */

export const EXIT_WIDTH_LIMIT_M = 0.9;
const ADJACENCY_TOLERANCE_M = 0.4;

export const REQUIRED_RESTAURANT_ROLES: SpaceRole[] = ["DINING", "KITCHEN", "STORAGE", "SERVICE", "WC"];

const ROLE_AR: Record<SpaceRole, string> = {
  DINING: "صالة الطعام",
  KITCHEN: "المطبخ",
  WC: "دورة المياه",
  STORAGE: "المخزن",
  SERVICE: "الخدمة",
};

export type StandardEvaluation = RuleEvaluation & {
  /** Overrides for the finding text, so unverifiable results say so plainly. */
  presentation?: Partial<Pick<Finding, "title" | "shortTitle" | "explanation" | "recommendation" | "effort" | "expected">>;
  /** The measured value behind the result, for the viewer's dimension line. */
  measurement?: { value: number; unit: "m"; source: string; limit?: number };
};

const metres = (value: number) => `${value.toFixed(2)} م`;

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

/** Plan distance from a point to a box (0 inside). */
function planDistance(point: [number, number], box: Box3): number {
  const dx = Math.max(box.min[0] - point[0], 0, point[0] - box.max[0]);
  const dz = Math.max(box.min[2] - point[1], 0, point[1] - box.max[2]);
  return Math.hypot(dx, dz);
}

function inside(point: [number, number], box: Box3): boolean {
  return planDistance(point, box) === 0;
}

function unverifiable(
  ruleId: string,
  subject: string,
  reason: string,
  needed: string,
  target?: ExtractedIfcEntity,
): StandardEvaluation {
  return {
    ruleId,
    status: "unknown",
    actual: `غير قابل للتحقق من الملف: ${reason}`,
    target,
    presentation: {
      title: `لا يمكن التحقق من ${subject} من ملف IFC هذا`,
      shortTitle: `${subject}: غير قابل للتحقق من الملف`,
      explanation: `${reason}. لا تُحتسب هذه القاعدة مطابقة ما لم يتوفر الدليل في الملف.`,
      recommendation: `${needed}، ثم أعد الفحص.`,
      effort: "استكمال معلومات",
    },
  };
}

export function evaluateStandardRestaurant(
  facts: StandardFacts,
  facility: FacilityDetails,
): StandardEvaluation[] {
  const entity = (id?: number) => toEntity(facts, id);
  const spacesBy = (role: SpaceRole) => facts.spaces.filter((space) => space.role === role);
  const dining = spacesBy("DINING")[0];
  const kitchen = spacesBy("KITCHEN")[0];
  const wcs = spacesBy("WC");
  const unclassified = facts.spaces.filter((space) => !space.role);
  const missing = REQUIRED_RESTAURANT_ROLES.filter((role) => spacesBy(role).length === 0);
  const withoutGuid = facts.products.filter((product) => product.globalId.length !== 22);

  const results: StandardEvaluation[] = [];

  results.push({
    ruleId: "IFC-QUAL-001",
    status: withoutGuid.length === 0 && facts.products.length > 0 ? "pass" : "fail",
    actual:
      withoutGuid.length === 0
        ? `${facts.schema}، ${facts.records} سجلًا، ${facts.products.length} عنصرًا بمعرّف GUID دائم، الوحدة ${facts.lengthUnit.declared}`
        : `${withoutGuid.length} عنصرًا بلا معرّف GUID صالح`,
  });

  results.push({
    ruleId: "DATA-CORE-001",
    status: hasCompleteFacility(facility) ? "pass" : "fail",
    actual: hasCompleteFacility(facility)
      ? "اسم المشروع والموقع والنشاط والمساحة والطوابق والطاقة مكتملة"
      : "حقل واحد أو أكثر من بيانات المنشأة غير مكتمل",
  });

  results.push({
    ruleId: "DATA-SPACE-001",
    status: facts.spaces.length > 0 && unclassified.length === 0 ? "pass" : "fail",
    actual:
      facts.spaces.length === 0
        ? "لا توجد مساحات IfcSpace في الملف"
        : unclassified.length === 0
          ? `جميع المساحات (${facts.spaces.length}) مصنفة من أسمائها: ${facts.spaces.map((s) => s.roleMatchedOn).join("، ")}`
          : `${unclassified.length} من ${facts.spaces.length} مساحات بلا تصنيف من اسمها: ${unclassified.map((s) => s.longName ?? s.name ?? s.globalId).join("، ")}`,
    target: entity(unclassified[0]?.expressId ?? facts.spaces[0]?.expressId),
  });

  results.push({
    ruleId: "REST-SPACE-001",
    status: missing.length ? "fail" : "pass",
    actual: missing.length
      ? `مساحات مطلوبة غير موجودة في الملف: ${missing.map((role) => ROLE_AR[role]).join("، ")}`
      : `جميع المساحات المطلوبة موجودة: ${REQUIRED_RESTAURANT_ROLES.map((role) => `${ROLE_AR[role]} (${spacesBy(role)[0].roleMatchedOn})`).join("، ")}`,
    target: entity(kitchen?.expressId ?? facts.spaces[0]?.expressId),
  });

  // Sanitary fixture inside a WC: containment first, geometry as fallback.
  const sanitaryProducts = facts.products.filter((p) => p.ifcType.toUpperCase() === "IFCSANITARYTERMINAL");
  const inWc = (p: (typeof sanitaryProducts)[number]) =>
    wcs.some(
      (wc) =>
        p.containerId === wc.expressId || (p.bbox && wc.bbox && inside(centreXZ(p.bbox), wc.bbox)),
    );
  const wcFixture = sanitaryProducts.find(inWc);
  if (!wcs.length) {
    results.push({ ruleId: "REST-SAN-001", status: "fail", actual: "لا توجد مساحة مصنفة كدورة مياه في الملف" });
  } else if (!wcFixture) {
    results.push({
      ruleId: "REST-SAN-001",
      status: "fail",
      actual: "لا يوجد تجهيز صحي (IfcSanitaryTerminal) داخل دورة المياه",
      target: entity(wcs[0].expressId),
    });
  } else if (facts.ports.connected > 0) {
    results.push({
      ruleId: "REST-SAN-001",
      status: "pass",
      actual: `${wcFixture.name ?? "تجهيز صحي"} داخل دورة المياه، والملف يحتوي ${facts.ports.connected} وصلات منافذ MEP`,
      target: entity(wcFixture.expressId),
    });
  } else {
    results.push(
      unverifiable(
        "REST-SAN-001",
        "اتصال التجهيز الصحي",
        `${wcFixture.name ?? "التجهيز الصحي"} موجود داخل دورة المياه، لكن الملف لا يحتوي منافذ أو شبكة سباكة تثبت التغذية والصرف`,
        "أرفق نموذج السباكة (MEP) بمنافذ موصولة بالتجهيز الصحي",
        entity(wcFixture.expressId),
      ),
    );
  }

  // Exits: Pset_DoorCommon.FireExit is the standard flag.
  const exits = facts.doors.filter((door) => door.fireExit === true);
  const flagged = facts.doors.some((door) => door.fireExit !== undefined);
  const narrowest = exits
    .filter((door): door is StandardDoor & { width: number } => door.width !== undefined)
    .sort((a, b) => a.width - b.width)[0];
  const doorLabel = (door: StandardDoor) => [door.reference, door.name].filter(Boolean).join("، ");

  // Emergency exit from the dining hall: an external FireExit door on the dining boundary.
  const diningExits = exits.filter(
    (door) => door.isExternal === true && dining?.bbox && door.bbox &&
      planDistance(centreXZ(door.bbox), dining.bbox) <= ADJACENCY_TOLERANCE_M,
  );
  if (!flagged) {
    results.push(
      unverifiable(
        "EGRESS-001",
        "مخرج الطوارئ",
        "لا يحدد أي باب في الملف الخاصية Pset_DoorCommon.FireExit، فلا يمكن تمييز مخارج الطوارئ",
        "حدد مخارج الطوارئ بالخاصية FireExit في Pset_DoorCommon",
      ),
    );
  } else if (!dining) {
    results.push({ ruleId: "EGRESS-001", status: "fail", actual: "لا توجد صالة طعام مصنفة لربط مخرج الطوارئ بها" });
  } else if (diningExits.length) {
    const door = diningExits[0];
    const gap = planDistance(centreXZ(door.bbox!), dining.bbox!);
    results.push({
      ruleId: "EGRESS-001",
      status: "pass",
      actual: `${doorLabel(door)}: باب طوارئ خارجي (IsExternal) يقع على حد صالة الطعام (${metres(gap)} من حدها)`,
      target: entity(door.expressId),
    });
  } else {
    results.push({
      ruleId: "EGRESS-001",
      status: "fail",
      actual: exits.length
        ? `مخارج الطوارئ في الملف (${exits.map(doorLabel).join("، ")}) ليست أبوابًا خارجية على حد صالة الطعام`
        : "لا يوجد باب محدد كمخرج طوارئ في الملف",
      target: entity(exits[0]?.expressId ?? dining.expressId),
    });
  }

  results.push(
    unverifiable(
      "FACADE-MEP-001",
      "إخفاء خدمات الواجهة",
      "النموذج المعماري لا يحتوي وحدات تكييف أو تمديدات خارجية مصنفة على الواجهة",
      "أرفق نموذج الخدمات (MEP) مع عناصر الواجهة",
    ),
  );

  if (!flagged) {
    results.push(
      unverifiable(
        "DOOR-WIDTH-001",
        "عرض مخرج الطوارئ",
        "لا يحدد أي باب الخاصية FireExit، فلا يُعرف أي باب يُقاس",
        "حدد مخارج الطوارئ بالخاصية FireExit في Pset_DoorCommon",
      ),
    );
  } else if (!narrowest) {
    results.push({
      ruleId: "DOOR-WIDTH-001",
      status: "unknown",
      actual: "مخرج الطوارئ موجود لكن عرضه غير مسجل ولا هندسة له",
      target: entity(exits[0]?.expressId),
    });
  } else {
    const source =
      narrowest.widthSource === "OverallWidth"
        ? "من خاصية OverallWidth في الملف"
        : "تقديري من حدود هندسة الباب (يشمل الإطار)";
    results.push({
      ruleId: "DOOR-WIDTH-001",
      status: narrowest.width >= EXIT_WIDTH_LIMIT_M - 1e-9 ? "pass" : "fail",
      actual: `${metres(narrowest.width)}: أضيق مخرج طوارئ (${doorLabel(narrowest)})، ${source}`,
      target: entity(narrowest.expressId),
      measurement: { value: narrowest.width, unit: "m", source, limit: EXIT_WIDTH_LIMIT_M },
    });
  }

  results.push(
    unverifiable(
      "ACCESS-ROUTE-001",
      "عرض مسار الوصول",
      "قياس أضيق نقطة بين الأثاث على طول المسار يحتاج تحليل مسارات لم يُفعّل بعد",
      "يُفعّل هذا القياس في المرحلة القادمة من المحرك",
      entity(dining?.expressId),
    ),
  );

  const ventilation = facts.products.find(
    (p) =>
      /AIRTERMINAL|FAN|DUCT/.test(p.ifcType.toUpperCase()) ||
      (kitchen && p.containerId === kitchen.expressId && /hood|exhaust|شفاط|تهوية/i.test(p.name ?? "")),
  );
  results.push(
    ventilation && facts.ports.connected > 0
      ? {
          ruleId: "KITCHEN-VENT-001",
          status: "pass",
          actual: `${ventilation.name ?? ventilation.ifcType} في المطبخ وموصول بمنافذ MEP`,
          target: entity(ventilation.expressId),
        }
      : unverifiable(
          "KITCHEN-VENT-001",
          "تهوية المطبخ",
          ventilation
            ? `${ventilation.name ?? "عنصر التهوية"} موجود في المطبخ، لكن الملف لا يحتوي مجرى أو مروحة موصولة به`
            : "لا يوجد عنصر تهوية في المطبخ",
          "أرفق نموذج التهوية (MEP) بمجاري ومراوح موصولة بالمطبخ",
          entity(ventilation?.expressId ?? kitchen?.expressId),
        ),
  );

  return results;
}

export function spaceLabel(space: StandardSpace): string {
  return space.longName ?? space.name ?? space.globalId;
}
