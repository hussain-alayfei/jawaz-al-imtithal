import {
  activityExamples,
  getFindings,
  type ActivityId,
  type FacilityDetails,
  type Finding,
  type ResultStatus,
} from "../data";
import { doorWidth, findAllByRole, findByRole } from "./extract";
import type {
  ExtractedIfcEntity,
  ExtractedIfcModel,
  RuleEvaluation,
} from "./types";

type EvaluationInput = {
  activityId: ActivityId;
  facility: FacilityDetails;
  model: ExtractedIfcModel;
};

const requiredRoles: Record<ActivityId, string[]> = {
  restaurant: ["DINING", "KITCHEN", "STORAGE", "SERVICE", "WC"],
  cafe: ["SEATING", "PREP", "STORAGE", "SERVICE", "WC"],
  clinic: ["RECEPTION", "WAITING", "EXAM_1", "EXAM_2", "WC"],
  salon: ["RECEPTION", "STYLING", "WASH", "NAIL", "TREATMENT", "WC"],
};

const primaryRole: Record<ActivityId, string> = {
  restaurant: "KITCHEN",
  cafe: "PREP",
  clinic: "EXAM_2",
  salon: "TREATMENT",
};

/* Internal role codes never reach the user. Every code extracted from the IFC
   file is translated through this table before it appears in a finding, so
   the reader always sees plain Arabic instead of an IFC property token. */
const roleLabel: Record<string, string> = {
  DINING: "صالة الطعام",
  KITCHEN: "المطبخ",
  STORAGE: "التخزين",
  SERVICE: "خدمة الضيوف",
  WC: "دورة المياه",
  SEATING: "منطقة الجلوس",
  PREP: "منطقة التحضير",
  RECEPTION: "الاستقبال",
  WAITING: "الانتظار",
  EXAM_1: "غرفة الفحص الأولى",
  EXAM_2: "غرفة الفحص الثانية",
  STYLING: "منطقة التصفيف",
  WASH: "منطقة غسيل الشعر",
  NAIL: "منطقة الأظافر",
  TREATMENT: "غرفة العناية",
  SANITARY_FIXTURE: "التجهيز الصحي",
  EXIT: "باب الطوارئ",
  MAIN_FACADE: "الواجهة الرئيسية",
  ACCESS_ROUTE: "مسار الوصول",
  KITCHEN_VENTILATION: "نظام تهوية المطبخ",
  PREP_HANDWASH: "حوض غسل اليدين في التحضير",
  COUNTER_AISLE: "ممر الكاونتر",
  PREP_DRAIN: "مصرف منطقة التحضير",
  EXAM_2_HANDWASH: "حوض غسل اليدين في غرفة الفحص الثانية",
  EXAM_2_HVAC: "نظام تكييف غرفة الفحص الثانية",
  HAIR_WASH_STATION: "محطة غسيل الشعر",
  STYLING_AISLE: "ممر التصفيف",
  CHEMICAL_STORAGE: "مخزن المواد الكيميائية",
  NAIL_VENTILATION: "نظام تهوية منطقة الأظافر",
};

function roleName(code: string): string {
  return roleLabel[code] ?? code;
}

function result(
  ruleId: string,
  status: ResultStatus,
  actual: string,
  target?: ExtractedIfcEntity,
): RuleEvaluation {
  return { ruleId, status, actual, target };
}

function hasCompleteFacility(facility: FacilityDetails): boolean {
  return Boolean(
    facility.projectName.trim() &&
      facility.activity.trim() &&
      facility.city.trim() &&
      facility.district.trim() &&
      facility.buildingType.trim() &&
      facility.area > 0 &&
      facility.floors > 0 &&
      facility.capacity > 0,
  );
}

function isLinkedToSpace(
  element: ExtractedIfcEntity | undefined,
  space: ExtractedIfcEntity | undefined,
  propertyName: "ServedSpaceGuid" | "ServesSpaceGuid",
): boolean {
  return Boolean(
    element &&
      space?.globalId &&
      element.properties[propertyName] === space.globalId,
  );
}

/* The mismatch is still detected from the real GUID relationship in the IFC
   file, but the message stays in plain Arabic. The identifiers involved
   remain visible to whoever expands the technical evidence in the UI. */
function relationshipMismatch(expectedRole: string): string {
  return `العنصر مرتبط بمساحة أخرى، ولا يطابق الربط المطلوب بـ${roleName(expectedRole)}.`;
}

function evaluateBase({
  activityId,
  facility,
  model,
}: EvaluationInput): RuleEvaluation[] {
  const firstSpace = model.spaces[0];
  const allSpacesClassified = model.spaces.every(
    (space) =>
      Boolean(space.name?.trim()) &&
      typeof space.properties.RoleCode === "string",
  );
  const classifiedCount = model.spaces.filter(
    (space) => space.name && space.properties.RoleCode,
  ).length;
  const roles = new Set(
    model.spaces.map((space) => String(space.properties.RoleCode ?? "")),
  );
  const missingRoles = requiredRoles[activityId].filter(
    (role) => !roles.has(role),
  );
  const primarySpace = findByRole(model, primaryRole[activityId], "IFCSPACE");

  return [
    result(
      "IFC-QUAL-001",
      "pass",
      `${model.schema}، ${model.records} سجل بيانات صالح و${model.elements.length} عنصرًا بمعرف دائم`,
    ),
    result(
      "DATA-CORE-001",
      hasCompleteFacility(facility) ? "pass" : "fail",
      hasCompleteFacility(facility)
        ? "اسم المشروع والموقع والنشاط والمساحة والطوابق والطاقة مكتملة"
        : "حقل واحد أو أكثر من بيانات المنشأة غير مكتمل",
    ),
    result(
      "DATA-SPACE-001",
      allSpacesClassified ? "pass" : "fail",
      allSpacesClassified
        ? `جميع مساحات النموذج (${model.spaces.length}) تحمل اسمًا وتصنيفًا واضحين`
        : `${classifiedCount} من ${model.spaces.length} مساحات مصنفة باسم ونوع واضحين`,
      firstSpace,
    ),
    result(
      activityId === "restaurant"
        ? "REST-SPACE-001"
        : `${activityId.toUpperCase()}-SPACE-001`,
      missingRoles.length ? "fail" : "pass",
      missingRoles.length
        ? `مساحات مطلوبة غير موجودة في النموذج: ${missingRoles.map(roleName).join("، ")}`
        : `جميع المساحات المطلوبة موجودة: ${requiredRoles[activityId].map(roleName).join("، ")}`,
      primarySpace,
    ),
  ];
}

function evaluateRestaurant(input: EvaluationInput): RuleEvaluation[] {
  const { model } = input;
  const dining = findByRole(model, "DINING", "IFCSPACE");
  const wc = findByRole(model, "WC", "IFCSPACE");
  const sanitary = findByRole(model, "SANITARY_FIXTURE");
  const exit = findByRole(model, "EXIT", "IFCDOOR");
  const facade = findByRole(model, "MAIN_FACADE");
  const route = findByRole(model, "ACCESS_ROUTE");
  const kitchen = findByRole(model, "KITCHEN", "IFCSPACE");
  const ventilation = findByRole(model, "KITCHEN_VENTILATION");
  const width = doorWidth(exit);
  const routeWidth = route?.properties.MinimumClearWidth;
  const sanitaryConnected =
    sanitary?.properties.HasServiceConnection === true;
  const sanitaryLinked = isLinkedToSpace(sanitary, wc, "ServedSpaceGuid");
  const exitLinked = isLinkedToSpace(exit, dining, "ServesSpaceGuid");
  const routeLinked = isLinkedToSpace(route, dining, "ServedSpaceGuid");
  const ventilationLinked = isLinkedToSpace(
    ventilation,
    kitchen,
    "ServedSpaceGuid",
  );

  return [
    ...evaluateBase(input),
    result(
      "REST-SAN-001",
      wc && sanitary && sanitaryConnected && sanitaryLinked ? "pass" : "fail",
      !wc
        ? "مساحة دورة المياه غير موجودة"
        : !sanitary
          ? "التجهيز الصحي غير موجود في النموذج"
          : !sanitaryLinked
            ? relationshipMismatch("WC")
            : sanitaryConnected
              ? "التجهيز الصحي داخل دورة المياه، واتصال الخدمة (تغذية وصرف) مثبت في النموذج"
              : "التجهيز الصحي داخل دورة المياه، لكن اتصال الخدمة (تغذية وصرف) غير مثبت في النموذج",
      sanitary ?? wc,
    ),
    result(
      "EGRESS-001",
      exit?.properties.ConnectsToExterior === true && exitLinked
        ? "pass"
        : "fail",
      !exit
        ? "باب الطوارئ غير موجود في النموذج"
        : !exitLinked
          ? relationshipMismatch("DINING")
          : exit.properties.ConnectsToExterior === true
            ? "باب الطوارئ متصل بالحد الخارجي ومرتبط بصالة الطعام"
            : "باب الطوارئ مرتبط بصالة الطعام، لكنه غير مسجَّل كمتصل بالحد الخارجي",
      exit,
    ),
    result(
      "FACADE-MEP-001",
      facade?.properties.ServicesConcealed === true ? "pass" : "fail",
      facade?.properties.ServicesConcealed === true
        ? "الواجهة الرئيسية مسجّلة كخالية من الخدمات الميكانيكية والكهربائية المكشوفة"
        : "بيانات إخفاء خدمات الواجهة الرئيسية غير مكتملة",
      facade,
    ),
    result(
      "DOOR-WIDTH-001",
      !exit || !exitLinked || width === undefined
        ? "unknown"
        : width >= 0.9
          ? "pass"
          : "fail",
      !exit
        ? "باب الطوارئ غير موجود لقياس عرضه"
        : !exitLinked
          ? relationshipMismatch("DINING")
          : width === undefined
            ? "عرض باب الطوارئ غير مسجل في النموذج"
            : `${width.toFixed(2)} م (عرض الباب المقاس من النموذج)`,
      exit,
    ),
    result(
      "ACCESS-ROUTE-001",
      !route || !routeLinked || typeof routeWidth !== "number"
        ? "unknown"
        : routeWidth >= 0.9
          ? "pass"
          : "fail",
      !route
        ? "مسار الوصول غير موجود في النموذج"
        : !routeLinked
          ? relationshipMismatch("DINING")
          : typeof routeWidth !== "number"
            ? "عرض مسار الوصول غير مسجل في النموذج"
            : `${routeWidth.toFixed(2)} م عند أضيق نقطة`,
      route,
    ),
    result(
      "KITCHEN-VENT-001",
      !ventilation
        ? "unknown"
        : ventilationLinked &&
            ventilation.properties.HasServiceConnection === true
          ? "pass"
          : "fail",
      !ventilation
        ? "لا يوجد نظام تهوية مرتبط بالمطبخ"
        : !ventilationLinked
          ? relationshipMismatch("KITCHEN")
          : ventilation.properties.HasServiceConnection === true
            ? "نظام تهوية المطبخ مرتبط بالمطبخ واتصال الخدمة مثبت في النموذج"
            : "نظام تهوية المطبخ مرتبط بالمطبخ، لكن اتصال الخدمة غير مثبت في النموذج",
      ventilation ?? kitchen,
    ),
  ];
}

function evaluateCafe(input: EvaluationInput): RuleEvaluation[] {
  const { model } = input;
  const seating = findByRole(model, "SEATING", "IFCSPACE");
  const prep = findByRole(model, "PREP", "IFCSPACE");
  const handwash = findByRole(model, "PREP_HANDWASH");
  const wc = findByRole(model, "WC", "IFCSPACE");
  const sanitary = findByRole(model, "SANITARY_FIXTURE");
  const exit = findByRole(model, "EXIT", "IFCDOOR");
  const route = findByRole(model, "COUNTER_AISLE");
  const drain = findByRole(model, "PREP_DRAIN");
  const width = doorWidth(exit);
  const aisleWidth = route?.properties.MinimumClearWidth;
  const handwashConnected =
    handwash?.properties.HasServiceConnection === true;
  const sanitaryConnected =
    sanitary?.properties.HasServiceConnection === true;
  const handwashLinked = isLinkedToSpace(
    handwash,
    prep,
    "ServedSpaceGuid",
  );
  const sanitaryLinked = isLinkedToSpace(sanitary, wc, "ServedSpaceGuid");
  const exitLinked = isLinkedToSpace(exit, seating, "ServesSpaceGuid");
  const routeLinked = isLinkedToSpace(route, prep, "ServedSpaceGuid");
  const drainLinked = isLinkedToSpace(drain, prep, "ServedSpaceGuid");

  return [
    ...evaluateBase(input),
    result(
      "CAFE-HANDWASH-001",
      handwash && handwashConnected && handwashLinked ? "pass" : "fail",
      !handwash
        ? "حوض غسل اليدين في منطقة التحضير غير موجود في جرد التجهيزات"
        : !handwashLinked
          ? relationshipMismatch("PREP")
          : handwashConnected
            ? "حوض غسل اليدين مرتبط بمنطقة التحضير واتصال الخدمة مثبت في النموذج"
            : "حوض غسل اليدين مرتبط بمنطقة التحضير، لكن اتصال الخدمة غير مثبت في النموذج",
      handwash ?? prep,
    ),
    result(
      "CAFE-SAN-001",
      wc && sanitary && sanitaryConnected && sanitaryLinked ? "pass" : "fail",
      !wc
        ? "مساحة دورة المياه غير موجودة"
        : !sanitary
          ? "التجهيز الصحي غير موجود في النموذج"
          : !sanitaryLinked
            ? relationshipMismatch("WC")
            : sanitaryConnected
              ? "التجهيز الصحي داخل دورة المياه، واتصال الخدمة مثبت في النموذج"
              : "التجهيز الصحي داخل دورة المياه، لكن اتصال الخدمة غير مثبت في النموذج",
      sanitary ?? wc,
    ),
    result(
      "CAFE-EGRESS-001",
      exit?.properties.ConnectsToExterior === true && exitLinked
        ? "pass"
        : "fail",
      !exit
        ? "باب الطوارئ غير موجود في النموذج"
        : !exitLinked
          ? relationshipMismatch("SEATING")
          : exit.properties.ConnectsToExterior === true
            ? "باب الطوارئ متصل بالحد الخارجي ومرتبط بمنطقة الجلوس"
            : "باب الطوارئ مرتبط بمنطقة الجلوس، لكنه غير مسجَّل كمتصل بالحد الخارجي",
      exit,
    ),
    result(
      "CAFE-AISLE-001",
      !route || !routeLinked || typeof aisleWidth !== "number"
        ? "unknown"
        : aisleWidth >= 0.9
          ? "pass"
          : "fail",
      !route
        ? "ممر الكاونتر غير موجود في النموذج"
        : !routeLinked
          ? relationshipMismatch("PREP")
          : typeof aisleWidth !== "number"
            ? "عرض ممر الكاونتر غير مسجل في النموذج"
            : `${aisleWidth.toFixed(2)} م عند أضيق نقطة`,
      route,
    ),
    result(
      "CAFE-EXIT-WIDTH-001",
      !exit || !exitLinked || width === undefined
        ? "unknown"
        : width >= 0.9
          ? "pass"
          : "fail",
      !exit
        ? "باب الطوارئ غير موجود لقياس عرضه"
        : !exitLinked
          ? relationshipMismatch("SEATING")
          : width === undefined
            ? "عرض باب الطوارئ غير مسجل في النموذج"
            : `${width.toFixed(2)} م (عرض الباب المقاس من النموذج)`,
      exit,
    ),
    result(
      "CAFE-DRAIN-001",
      !drain
        ? "unknown"
        : drainLinked && drain.properties.HasServiceConnection === true
          ? "pass"
          : "fail",
      !drain
        ? "مصرف منطقة التحضير غير موجود في النموذج"
        : !drainLinked
          ? relationshipMismatch("PREP")
          : drain.properties.HasServiceConnection === true
            ? "مصرف منطقة التحضير مرتبط بها واتصال الخدمة مثبت في النموذج"
            : "مصرف منطقة التحضير مرتبط بها، لكن اتصال الخدمة غير مثبت في النموذج",
      drain ?? prep,
    ),
  ];
}

function evaluateClinic(input: EvaluationInput): RuleEvaluation[] {
  const { model } = input;
  const reception = findByRole(model, "RECEPTION", "IFCSPACE");
  const exam1 = findByRole(model, "EXAM_1", "IFCSPACE");
  const exam2 = findByRole(model, "EXAM_2", "IFCSPACE");
  const examDoor = findByRole(model, "EXAM_2", "IFCDOOR");
  const wc = findByRole(model, "WC", "IFCSPACE");
  const sanitary = findByRole(model, "SANITARY_FIXTURE");
  const exit = findByRole(model, "EXIT", "IFCDOOR");
  const handwash = findByRole(model, "EXAM_2_HANDWASH");
  const hvac = findByRole(model, "EXAM_2_HVAC");
  const examWidth = doorWidth(examDoor);
  const sanitaryConnected =
    sanitary?.properties.HasServiceConnection === true;
  const sanitaryLinked = isLinkedToSpace(sanitary, wc, "ServedSpaceGuid");
  const examDoorLinked = isLinkedToSpace(
    examDoor,
    exam2,
    "ServesSpaceGuid",
  );
  const exitLinked = isLinkedToSpace(exit, reception, "ServesSpaceGuid");
  const handwashLinked = isLinkedToSpace(
    handwash,
    exam2,
    "ServedSpaceGuid",
  );
  const hvacLinked = isLinkedToSpace(hvac, exam2, "ServedSpaceGuid");
  const privacy =
    exam1?.properties.IsEnclosed === true &&
    exam2?.properties.IsEnclosed === true &&
    Boolean(examDoor) &&
    examDoorLinked;

  return [
    ...evaluateBase(input),
    result(
      "CLINIC-PRIVACY-001",
      privacy ? "pass" : "fail",
      privacy
        ? "غرفتا الفحص الأولى والثانية مغلقتان، وباب غرفة الفحص الثانية مرتبط بالغرفة الصحيحة"
        : !exam2
          ? "غرفة الفحص الثانية غير موجودة"
          : exam2.properties.IsEnclosed !== true
            ? "غرفة الفحص الثانية غير مسجَّلة كمغلقة بالكامل"
            : !examDoor
              ? "باب غرفة الفحص الثانية غير موجود"
              : relationshipMismatch("EXAM_2"),
      privacy ? (examDoor ?? exam2) : (exam2 ?? examDoor),
    ),
    result(
      "CLINIC-SAN-001",
      wc && sanitary && sanitaryConnected && sanitaryLinked ? "pass" : "fail",
      !wc
        ? "مساحة دورة المياه غير موجودة"
        : !sanitary
          ? "التجهيز الصحي غير موجود في النموذج"
          : !sanitaryLinked
            ? relationshipMismatch("WC")
            : sanitaryConnected
              ? "التجهيز الصحي داخل دورة المياه، واتصال الخدمة مثبت في النموذج"
              : "التجهيز الصحي داخل دورة المياه، لكن اتصال الخدمة غير مثبت في النموذج",
      sanitary ?? wc,
    ),
    result(
      "CLINIC-EGRESS-001",
      exit?.properties.ConnectsToExterior === true && exitLinked
        ? "pass"
        : "fail",
      !exit
        ? "باب الطوارئ غير موجود في النموذج"
        : !exitLinked
          ? relationshipMismatch("RECEPTION")
          : exit.properties.ConnectsToExterior === true
            ? "باب الطوارئ متصل بالحد الخارجي ومرتبط بالاستقبال"
            : "باب الطوارئ مرتبط بالاستقبال، لكنه غير مسجَّل كمتصل بالحد الخارجي",
      exit,
    ),
    result(
      "CLINIC-DOOR-001",
      !examDoor || !examDoorLinked || examWidth === undefined
        ? "unknown"
        : examWidth >= 0.9
          ? "pass"
          : "fail",
      !examDoor
        ? "باب غرفة الفحص الثانية غير موجود لقياس عرضه"
        : !examDoorLinked
          ? relationshipMismatch("EXAM_2")
          : examWidth === undefined
            ? "عرض باب غرفة الفحص الثانية غير مسجل في النموذج"
            : `${examWidth.toFixed(2)} م (عرض الباب المقاس من النموذج)`,
      examDoor,
    ),
    result(
      "CLINIC-HANDWASH-001",
      handwash &&
      handwashLinked &&
      handwash.properties.HasServiceConnection === true
        ? "pass"
        : "fail",
      !handwash
        ? "حوض غسل اليدين في غرفة الفحص الثانية غير موجود في جرد التجهيزات"
        : !handwashLinked
          ? relationshipMismatch("EXAM_2")
          : handwash.properties.HasServiceConnection === true
            ? "حوض غسل اليدين مرتبط بغرفة الفحص الثانية واتصال الخدمة مثبت في النموذج"
            : "حوض غسل اليدين مرتبط بالغرفة، لكن اتصال الخدمة غير مثبت في النموذج",
      handwash ?? exam2,
    ),
    result(
      "CLINIC-HVAC-001",
      !hvac
        ? "unknown"
        : hvacLinked && hvac.properties.HasServiceConnection === true
          ? "pass"
          : "fail",
      !hvac
        ? "لا يوجد نظام تكييف مرتبط بغرفة الفحص الثانية"
        : !hvacLinked
          ? relationshipMismatch("EXAM_2")
          : hvac.properties.HasServiceConnection === true
            ? "نظام التكييف مرتبط بغرفة الفحص الثانية واتصال الخدمة مثبت في النموذج"
            : "نظام التكييف مرتبط بالغرفة، لكن اتصال الخدمة غير مثبت في النموذج",
      hvac ?? exam2,
    ),
  ];
}

function evaluateSalon(input: EvaluationInput): RuleEvaluation[] {
  const { model } = input;
  const reception = findByRole(model, "RECEPTION", "IFCSPACE");
  const styling = findByRole(model, "STYLING", "IFCSPACE");
  const washSpace = findByRole(model, "WASH", "IFCSPACE");
  const storage = findByRole(model, "STORAGE", "IFCSPACE");
  const treatment = findByRole(model, "TREATMENT", "IFCSPACE");
  const treatmentDoor = findByRole(model, "TREATMENT", "IFCDOOR");
  const wash = findAllByRole(model, "HAIR_WASH_STATION");
  const exit = findByRole(model, "EXIT", "IFCDOOR");
  const route = findByRole(model, "STYLING_AISLE");
  const chemical = findByRole(model, "CHEMICAL_STORAGE");
  const nail = findByRole(model, "NAIL", "IFCSPACE");
  const ventilation = findByRole(model, "NAIL_VENTILATION");
  const aisleWidth = route?.properties.MinimumClearWidth;
  const treatmentDoorLinked = isLinkedToSpace(
    treatmentDoor,
    treatment,
    "ServesSpaceGuid",
  );
  const validWash = wash.filter(
    (station) =>
      isLinkedToSpace(station, washSpace, "ServedSpaceGuid") &&
      station.properties.HasServiceConnection === true,
  );
  const exitLinked = isLinkedToSpace(exit, reception, "ServesSpaceGuid");
  const routeLinked = isLinkedToSpace(route, styling, "ServedSpaceGuid");
  const chemicalLinked = isLinkedToSpace(
    chemical,
    storage,
    "ServedSpaceGuid",
  );
  const ventilationLinked = isLinkedToSpace(
    ventilation,
    nail,
    "ServedSpaceGuid",
  );

  return [
    ...evaluateBase(input),
    result(
      "SALON-PRIVACY-001",
      treatment?.properties.IsEnclosed === true &&
      treatmentDoor &&
      treatmentDoorLinked
        ? "pass"
        : "fail",
      !treatment
        ? "غرفة العناية غير موجودة"
        : treatment.properties.IsEnclosed !== true
          ? "غرفة العناية غير مسجَّلة كمغلقة بالكامل"
          : !treatmentDoor
            ? "باب غرفة العناية غير موجود"
            : treatmentDoorLinked
              ? "غرفة العناية مغلقة، وبابها مرتبط بالمساحة الصحيحة"
              : relationshipMismatch("TREATMENT"),
      treatment?.properties.IsEnclosed === true
        ? (treatmentDoor ?? treatment)
        : (treatment ?? treatmentDoor),
    ),
    result(
      "SALON-WASH-001",
      validWash.length >= 2 ? "pass" : "fail",
      `${validWash.length} من ${wash.length} محطات غسيل شعر مرتبطة بمنطقة الغسيل واتصال خدمتها مثبت`,
      wash[0] ?? washSpace,
    ),
    result(
      "SALON-EGRESS-001",
      exit?.properties.ConnectsToExterior === true && exitLinked
        ? "pass"
        : "fail",
      !exit
        ? "باب الطوارئ غير موجود في النموذج"
        : !exitLinked
          ? relationshipMismatch("RECEPTION")
          : exit.properties.ConnectsToExterior === true
            ? "باب الطوارئ متصل بالحد الخارجي ومرتبط بالاستقبال"
            : "باب الطوارئ مرتبط بالاستقبال، لكنه غير مسجَّل كمتصل بالحد الخارجي",
      exit,
    ),
    result(
      "SALON-AISLE-001",
      !route || !routeLinked || typeof aisleWidth !== "number"
        ? "unknown"
        : aisleWidth >= 0.9
          ? "pass"
          : "fail",
      !route
        ? "ممر التصفيف غير موجود في النموذج"
        : !routeLinked
          ? relationshipMismatch("STYLING")
          : typeof aisleWidth !== "number"
            ? "عرض ممر التصفيف غير مسجل في النموذج"
            : `${aisleWidth.toFixed(2)} م عند أضيق نقطة`,
      route,
    ),
    result(
      "SALON-CHEM-STORE-001",
      !chemical
        ? "unknown"
        : chemicalLinked && chemical.properties.IsEnclosed === true
          ? "pass"
          : "fail",
      !chemical
        ? "مخزن المواد الكيميائية غير موجود في النموذج"
        : !chemicalLinked
          ? relationshipMismatch("STORAGE")
          : chemical.properties.IsEnclosed === true
            ? "مخزن المواد الكيميائية مرتبط بمساحة التخزين ومسجَّل كمغلق بالكامل"
            : "مخزن المواد الكيميائية مرتبط بمساحة التخزين، لكنه غير مسجَّل كمغلق بالكامل",
      chemical ?? treatment,
    ),
    result(
      "SALON-VENT-001",
      !ventilation
        ? "unknown"
        : ventilationLinked &&
            ventilation.properties.HasServiceConnection === true
          ? "pass"
          : "fail",
      !ventilation
        ? "لا يوجد نظام تهوية مرتبط بمنطقة الأظافر"
        : !ventilationLinked
          ? relationshipMismatch("NAIL")
          : ventilation.properties.HasServiceConnection === true
            ? "نظام تهوية منطقة الأظافر مرتبط بها واتصال الخدمة مثبت في النموذج"
            : "نظام تهوية منطقة الأظافر مرتبط بها، لكن اتصال الخدمة غير مثبت في النموذج",
      ventilation ?? nail,
    ),
  ];
}

export function evaluateRules(input: EvaluationInput): RuleEvaluation[] {
  if (input.activityId === "cafe") return evaluateCafe(input);
  if (input.activityId === "clinic") return evaluateClinic(input);
  if (input.activityId === "salon") return evaluateSalon(input);
  return evaluateRestaurant(input);
}

function severityFor(status: ResultStatus): Finding["severity"] {
  if (status === "fail") return "high";
  if (status === "unknown") return "medium";
  return "info";
}

const actionableCopy: Record<
  string,
  Pick<
    Finding,
    | "title"
    | "shortTitle"
    | "expected"
    | "explanation"
    | "recommendation"
    | "effort"
  >
> = {
  "REST-SAN-001": {
    title: "اتصال خدمة التجهيز الصحي غير مثبت",
    shortTitle: "توصيل المرفق الصحي",
    expected: "تجهيز صحي داخل دورة المياه، مع اتصال خدمة (تغذية وصرف) مثبت",
    explanation:
      "مساحة دورة المياه موجودة، لكن خاصية اتصال خدمة التجهيز الصحي لا تثبت جاهزيته في النموذج.",
    recommendation:
      "اربط التجهيز الصحي بخدمة السباكة (التغذية والصرف)، ثم صدّر نسخة محدثة من ملف IFC وأعد الفحص.",
    effort: "استكمال نموذج السباكة",
  },
  "EGRESS-001": {
    title: "اتصال مخرج المطعم بالحد الخارجي غير مثبت",
    shortTitle: "اتصال مخرج المطعم",
    expected: "باب طوارئ مسجَّل كمتصل بالحد الخارجي للمبنى",
    explanation:
      "باب الطوارئ موجود، لكن علاقته الدلالية بالحد الخارجي غير مثبتة في ملف IFC.",
    recommendation:
      "راجع مسار الإخلاء واربط باب الطوارئ بالحد الخارجي في النموذج قبل إعادة الفحص.",
    effort: "تعديل علاقات النموذج",
  },
  "FACADE-MEP-001": {
    title: "إخفاء خدمات الواجهة غير مثبت",
    shortTitle: "خدمات الواجهة",
    expected: "عنصر واجهة مسجَّل كخالٍ من الخدمات الميكانيكية والكهربائية المكشوفة",
    explanation:
      "عنصر الواجهة موجود، لكن خصائصه تصرح بأن إخفاء الخدمات الميكانيكية والكهربائية غير محقق.",
    recommendation:
      "حدّث تصميم الواجهة أو مسارات الخدمات، ثم وثّق إخفاء الخدمات في نموذج IFC المصحح.",
    effort: "تنسيق معماري وخدمات",
  },
  "CAFE-HANDWASH-001": {
    title: "اتصال خدمة حوض التحضير غير مثبت",
    shortTitle: "توصيل حوض التحضير",
    expected: "حوض غسل يدين مصنف في منطقة التحضير، مع اتصال خدمة مثبت",
    explanation:
      "حوض غسل اليدين موجود في منطقة التحضير، لكن خاصية اتصال الخدمة مسجلة كغير محققة.",
    recommendation:
      "أكمل ربط الحوض بخدمات التغذية والصرف، وحدّث حالة الاتصال في نموذج IFC.",
    effort: "استكمال نموذج السباكة",
  },
  "CAFE-SAN-001": {
    title: "اتصال خدمة تجهيز دورة المياه غير مثبت",
    shortTitle: "توصيل المرفق الصحي",
    expected: "تجهيز صحي داخل دورة المياه، مع اتصال خدمة مثبت",
    explanation:
      "مساحة دورة المياه وتجهيزها موجودان، لكن النموذج لا يثبت اتصال التجهيز بالخدمة.",
    recommendation:
      "اربط التجهيز الصحي بخدمات السباكة وسجّل الاتصال في مجموعة الخصائص.",
    effort: "استكمال نموذج السباكة",
  },
  "CAFE-EGRESS-001": {
    title: "اتصال مخرج المقهى بالخارج غير مثبت",
    shortTitle: "اتصال مخرج المقهى",
    expected: "باب طوارئ مرتبط بحد خارجي",
    explanation:
      "باب المخرج موجود، لكن اتصاله بالحد الخارجي غير مثبت في النموذج، مما يمنع إثبات اكتمال مسار الخروج.",
    recommendation:
      "صحح علاقة باب الطوارئ بالحد الخارجي بعد مراجعة مسار الإخلاء.",
    effort: "تعديل علاقات النموذج",
  },
  "CLINIC-PRIVACY-001": {
    title: "إغلاق غرفة الفحص الثانية غير مثبت",
    shortTitle: "خصوصية غرفة الفحص 2",
    expected: "غرف الفحص مغلقة بالكامل ومرتبطة بأبواب مستقلة",
    explanation:
      "غرفة الفحص الثانية مصنفة في الملف، لكنها غير مسجَّلة كمغلقة بالكامل، ما لا يثبت الفصل المطلوب للخصوصية.",
    recommendation:
      "أكمل حدود الغرفة أو صحح تصنيف الإغلاق بعد مراجعة المخطط المعماري.",
    effort: "تعديل معماري",
  },
  "CLINIC-SAN-001": {
    title: "اتصال خدمة تجهيز دورة مياه العيادة غير مثبت",
    shortTitle: "توصيل المرفق الصحي",
    expected: "تجهيز صحي داخل دورة المياه، مع اتصال خدمة مثبت",
    explanation:
      "دورة المياه وتجهيزها موجودان، لكن خاصية اتصال خدمة التجهيز غير محققة.",
    recommendation:
      "أكمل علاقة التجهيز بخدمات السباكة وحدّث الخاصية في نموذج IFC.",
    effort: "استكمال نموذج السباكة",
  },
  "CLINIC-EGRESS-001": {
    title: "اتصال مخرج العيادة بالخارج غير مثبت",
    shortTitle: "اتصال مخرج العيادة",
    expected: "باب طوارئ مرتبط بحد خارجي",
    explanation:
      "باب الخروج موجود، لكن النموذج لا يثبت اتصاله بالحد الخارجي.",
    recommendation:
      "راجع مسار خروج المرضى والعاملين وصحح علاقة باب الطوارئ بالحد الخارجي.",
    effort: "تعديل علاقات النموذج",
  },
  "SALON-PRIVACY-001": {
    title: "إغلاق غرفة العناية غير مثبت",
    shortTitle: "خصوصية غرفة العناية",
    expected: "غرفة عناية مغلقة بالكامل ومرتبطة بباب مستقل",
    explanation:
      "غرفة العناية موجودة وبها باب، لكنها غير مسجَّلة كمغلقة بالكامل، ما لا يثبت اكتمال الفصل.",
    recommendation:
      "أكمل حدود غرفة العناية أو صحح خاصية الإغلاق بعد مراجعة التصميم.",
    effort: "تعديل معماري",
  },
  "SALON-WASH-001": {
    title: "عدد وحدات غسل الشعر أقل من المطلوب في حزمة العرض",
    shortTitle: "وحدة غسل شعر ناقصة",
    expected: "محطتا غسيل شعر على الأقل، مصنفتان ومرتبطتان بمنطقة الغسيل",
    explanation:
      "استخرج النظام محطة غسيل شعر واحدة فقط من جرد التجهيزات المكتمل.",
    recommendation:
      "أضف المحطة الناقصة واربطها بمنطقة الغسيل وخدماتها، ثم أعد الفحص.",
    effort: "إضافة تجهيز وخدمات",
  },
  "SALON-EGRESS-001": {
    title: "اتصال مخرج الصالون بالخارج غير مثبت",
    shortTitle: "اتصال مخرج الصالون",
    expected: "باب طوارئ مرتبط بحد خارجي",
    explanation:
      "باب المخرج موجود، لكن اتصاله بالحد الخارجي غير مثبت في النموذج، مما يمنع إثبات اكتمال مسار الخروج.",
    recommendation:
      "راجع مسار الخروج وصحح علاقة باب الطوارئ بالحد الخارجي في نموذج IFC.",
    effort: "تعديل علاقات النموذج",
  },
};

const conservativeSubjects: Record<string, string> = {
  "EGRESS-001": "خصائص باب خروج المطعم",
  "CAFE-EGRESS-001": "خصائص باب خروج المقهى",
  "CLINIC-EGRESS-001": "خصائص باب خروج العيادة",
  "SALON-EGRESS-001": "خصائص باب خروج الصالون",
};

type FindingPresentation = Pick<
  Finding,
  | "title"
  | "shortTitle"
  | "expected"
  | "explanation"
  | "recommendation"
  | "effort"
>;

function presentationFor(
  evaluation: RuleEvaluation,
  template: Finding,
): FindingPresentation {
  const curated = actionableCopy[evaluation.ruleId];
  const subject =
    curated?.shortTitle ??
    conservativeSubjects[evaluation.ruleId] ??
    (template.status === evaluation.status
      ? template.shortTitle
      : `متطلب ${template.category}`);
  const expected = curated?.expected ?? template.expected;

  if (evaluation.status === "unknown") {
    return {
      title: `تعذر التحقق من ${subject}`,
      shortTitle: `${subject}: معلومات غير مكتملة`,
      expected,
      explanation: `لم تتوفر في ملف IFC بيانات كافية لإصدار حكم على هذا المتطلب. الدليل المستخرج: ${evaluation.actual}.`,
      recommendation: `أكمل أو صحح البيانات اللازمة لإثبات المتطلب التالي: ${expected}، ثم أعد الفحص.`,
      effort: "استكمال معلومات",
    };
  }

  if (evaluation.status === "fail") {
    const templateAlreadyDescribesFailure = template.status === "fail";
    return {
      title: `لم يتحقق متطلب «${subject}»`,
      shortTitle: subject,
      expected,
      explanation: `رصد الفحص الآلي هذه الملاحظة من بيانات IFC المستخرجة: ${evaluation.actual}.`,
      recommendation: `راجع التصميم أو البيانات الدلالية لتحقيق المتطلب التالي: ${expected}، ثم أعد تصدير ملف IFC والفحص.`,
      effort:
        curated?.effort ??
        (templateAlreadyDescribesFailure && template.effort !== "لا يوجد"
          ? template.effort
          : "مراجعة وتعديل"),
    };
  }

  return {
    title:
      conservativeSubjects[evaluation.ruleId] !== undefined
        ? `اكتملت ${subject} الدلالية`
        : template.title,
    shortTitle:
      conservativeSubjects[evaluation.ruleId] !== undefined
        ? `${subject}: متحقق`
        : template.shortTitle,
    expected,
    explanation: `تحقق هذا المتطلب من بيانات IFC المستخرجة: ${evaluation.actual}.`,
    recommendation: "لا يلزم إجراء ضمن نطاق هذه القاعدة.",
    effort: "لا يوجد",
  };
}

export function materializeFindings(
  activityId: ActivityId,
  evaluations: RuleEvaluation[],
): Finding[] {
  const reviewTemplates = getFindings("review", activityId);
  const readyTemplates = getFindings("ready", activityId);
  const activity = activityExamples.find((item) => item.id === activityId);

  return evaluations.map((evaluation) => {
    const templates =
      evaluation.status === "pass" ? readyTemplates : reviewTemplates;
    const template =
      templates.find((item) => item.ruleId === evaluation.ruleId) ??
      reviewTemplates.find((item) => item.ruleId === evaluation.ruleId);
    if (!template) {
      throw new Error(`Missing finding template for ${evaluation.ruleId}`);
    }

    const viewerElementId = evaluation.target?.properties.ViewerElementId;
    const presentation = presentationFor(evaluation, template);
    return {
      ...template,
      ...presentation,
      status: evaluation.status,
      severity: severityFor(evaluation.status),
      actual: evaluation.actual,
      version: activity?.ruleVersion ?? template.version,
      elementId:
        typeof viewerElementId === "string"
          ? viewerElementId
          : evaluation.target
            ? `STEP-${evaluation.target.stepId}`
            : undefined,
      elementGuid: evaluation.target?.globalId,
      elementName: evaluation.target?.name,
      elementStepId: evaluation.target?.stepId,
    };
  });
}

export function countAvailableEvidence(
  activityId: ActivityId,
  evaluations: RuleEvaluation[],
): number {
  void activityId;
  return evaluations.filter((evaluation) => evaluation.status !== "unknown")
    .length;
}
