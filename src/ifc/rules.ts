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
      `${model.schema}، ${model.records} سجل STEP صالح و${model.elements.length} عنصرًا بمعرف دائم`,
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
        ? `${model.spaces.length} من ${model.spaces.length} مساحات تحمل اسمًا وRoleCode`
        : `${model.spaces.filter((space) => space.name && space.properties.RoleCode).length} من ${model.spaces.length} مساحات مصنفة`,
      firstSpace,
    ),
    result(
      activityId === "restaurant"
        ? "REST-SPACE-001"
        : `${activityId.toUpperCase()}-SPACE-001`,
      missingRoles.length ? "fail" : "pass",
      missingRoles.length
        ? `المساحات المطلوبة المفقودة: ${missingRoles.join(", ")}`
        : `تم العثور على الأدوار المطلوبة: ${requiredRoles[activityId].join(", ")}`,
      primarySpace,
    ),
  ];
}

function evaluateRestaurant(input: EvaluationInput): RuleEvaluation[] {
  const { model } = input;
  const wc = findByRole(model, "WC", "IFCSPACE");
  const sanitary = findByRole(model, "SANITARY_FIXTURE");
  const exit = findByRole(model, "EXIT", "IFCDOOR");
  const facade = findByRole(model, "MAIN_FACADE");
  const route = findByRole(model, "ACCESS_ROUTE");
  const kitchen = findByRole(model, "KITCHEN", "IFCSPACE");
  const ventilation = findByRole(model, "KITCHEN_VENTILATION");
  const width = doorWidth(exit);
  const routeWidth = route?.properties.MinimumClearWidth;

  return [
    ...evaluateBase(input),
    result(
      "REST-SAN-001",
      wc && sanitary ? "pass" : "fail",
      wc && sanitary
        ? "مساحة WC وتجهيز SANITARY_FIXTURE مرتبطان بالنموذج"
        : "مساحة دورة المياه أو تجهيزها غير موجود",
      wc ?? sanitary,
    ),
    result(
      "EGRESS-001",
      exit?.properties.ConnectsToExterior === true ? "pass" : "fail",
      exit?.properties.ConnectsToExterior === true
        ? "باب EXIT مصرح باتصاله بالحد الخارجي"
        : "لم يثبت اتصال باب الخروج بالحد الخارجي",
      exit,
    ),
    result(
      "FACADE-MEP-001",
      facade?.properties.ServicesConcealed === true ? "pass" : "fail",
      facade?.properties.ServicesConcealed === true
        ? "عنصر MAIN_FACADE مصرح بخلوه من الخدمات المكشوفة"
        : "بيانات إخفاء خدمات الواجهة غير مكتملة",
      facade,
    ),
    result(
      "DOOR-WIDTH-001",
      width === undefined ? "unknown" : width >= 0.9 ? "pass" : "fail",
      width === undefined
        ? "OverallWidth غير مسجل على باب EXIT"
        : `${width.toFixed(2)} م من IfcDoor.OverallWidth`,
      exit,
    ),
    result(
      "ACCESS-ROUTE-001",
      typeof routeWidth !== "number"
        ? "unknown"
        : routeWidth >= 0.9
          ? "pass"
          : "fail",
      typeof routeWidth !== "number"
        ? "MinimumClearWidth غير مسجل على ACCESS_ROUTE"
        : `${routeWidth.toFixed(2)} م عند أضيق نقطة`,
      route,
    ),
    result(
      "KITCHEN-VENT-001",
      !ventilation
        ? "unknown"
        : ventilation.properties.HasServiceConnection === true
          ? "pass"
          : "fail",
      !ventilation
        ? "لا يوجد عنصر KITCHEN_VENTILATION مرتبط بالمطبخ"
        : ventilation.properties.HasServiceConnection === true
          ? "عنصر تهوية مرتبط بالمطبخ ويحمل HasServiceConnection=true"
          : "عنصر التهوية موجود لكن اتصال الخدمة غير مثبت",
      ventilation ?? kitchen,
    ),
  ];
}

function evaluateCafe(input: EvaluationInput): RuleEvaluation[] {
  const { model } = input;
  const prep = findByRole(model, "PREP", "IFCSPACE");
  const handwash = findByRole(model, "PREP_HANDWASH");
  const wc = findByRole(model, "WC", "IFCSPACE");
  const sanitary = findByRole(model, "SANITARY_FIXTURE");
  const exit = findByRole(model, "EXIT", "IFCDOOR");
  const route = findByRole(model, "COUNTER_AISLE");
  const drain = findByRole(model, "PREP_DRAIN");
  const width = doorWidth(exit);
  const aisleWidth = route?.properties.MinimumClearWidth;

  return [
    ...evaluateBase(input),
    result(
      "CAFE-HANDWASH-001",
      handwash ? "pass" : "fail",
      handwash
        ? "عنصر PREP_HANDWASH مصنف ومرتبط بمنطقة PREP"
        : "لم يوجد عنصر PREP_HANDWASH في جرد التجهيزات المكتمل",
      handwash ?? prep,
    ),
    result(
      "CAFE-SAN-001",
      wc && sanitary ? "pass" : "fail",
      wc && sanitary
        ? "مساحة WC وتجهيز صحي موجودان"
        : "مساحة WC أو تجهيزها غير موجود",
      wc ?? sanitary,
    ),
    result(
      "CAFE-EGRESS-001",
      exit?.properties.ConnectsToExterior === true ? "pass" : "fail",
      exit?.properties.ConnectsToExterior === true
        ? "باب EXIT متصل بالحد الخارجي"
        : "اتصال باب الخروج بالخارج غير مثبت",
      exit,
    ),
    result(
      "CAFE-AISLE-001",
      typeof aisleWidth !== "number"
        ? "unknown"
        : aisleWidth >= 0.9
          ? "pass"
          : "fail",
      typeof aisleWidth !== "number"
        ? "MinimumClearWidth غير مسجل"
        : `${aisleWidth.toFixed(2)} م عند أضيق نقطة`,
      route,
    ),
    result(
      "CAFE-EXIT-WIDTH-001",
      width === undefined ? "unknown" : width >= 0.9 ? "pass" : "fail",
      width === undefined
        ? "OverallWidth غير مسجل"
        : `${width.toFixed(2)} م من IfcDoor.OverallWidth`,
      exit,
    ),
    result(
      "CAFE-DRAIN-001",
      !drain
        ? "unknown"
        : drain.properties.HasServiceConnection === true
          ? "pass"
          : "fail",
      !drain
        ? "لا يوجد عنصر PREP_DRAIN مرتبط بمنطقة التحضير"
        : drain.properties.HasServiceConnection === true
          ? "مصرف مصنف واتصال الخدمة مثبت"
          : "المصرف موجود لكن اتصال الخدمة غير مثبت",
      drain ?? prep,
    ),
  ];
}

function evaluateClinic(input: EvaluationInput): RuleEvaluation[] {
  const { model } = input;
  const exam1 = findByRole(model, "EXAM_1", "IFCSPACE");
  const exam2 = findByRole(model, "EXAM_2", "IFCSPACE");
  const examDoor = findByRole(model, "EXAM_2", "IFCDOOR");
  const wc = findByRole(model, "WC", "IFCSPACE");
  const sanitary = findByRole(model, "SANITARY_FIXTURE");
  const exit = findByRole(model, "EXIT", "IFCDOOR");
  const handwash = findByRole(model, "EXAM_2_HANDWASH");
  const hvac = findByRole(model, "EXAM_2_HVAC");
  const examWidth = doorWidth(examDoor);
  const privacy =
    exam1?.properties.IsEnclosed === true &&
    exam2?.properties.IsEnclosed === true;

  return [
    ...evaluateBase(input),
    result(
      "CLINIC-PRIVACY-001",
      privacy ? "pass" : "fail",
      privacy
        ? "غرفتا EXAM_1 وEXAM_2 تحملان IsEnclosed=true"
        : "إغلاق إحدى غرف الفحص غير مثبت",
      examDoor ?? exam2,
    ),
    result(
      "CLINIC-SAN-001",
      wc && sanitary ? "pass" : "fail",
      wc && sanitary
        ? "مساحة WC وتجهيز صحي موجودان"
        : "مساحة WC أو تجهيزها غير موجود",
      wc ?? sanitary,
    ),
    result(
      "CLINIC-EGRESS-001",
      exit?.properties.ConnectsToExterior === true ? "pass" : "fail",
      exit?.properties.ConnectsToExterior === true
        ? "باب EXIT متصل بالحد الخارجي"
        : "اتصال باب الخروج بالخارج غير مثبت",
      exit,
    ),
    result(
      "CLINIC-DOOR-001",
      examWidth === undefined
        ? "unknown"
        : examWidth >= 0.9
          ? "pass"
          : "fail",
      examWidth === undefined
        ? "OverallWidth غير مسجل على باب EXAM_2"
        : `${examWidth.toFixed(2)} م من IfcDoor.OverallWidth`,
      examDoor,
    ),
    result(
      "CLINIC-HANDWASH-001",
      handwash ? "pass" : "fail",
      handwash
        ? "عنصر EXAM_2_HANDWASH مصنف ومرتبط بغرفة الفحص"
        : "لم يوجد EXAM_2_HANDWASH في جرد التجهيزات المكتمل",
      handwash ?? exam2,
    ),
    result(
      "CLINIC-HVAC-001",
      !hvac
        ? "unknown"
        : hvac.properties.HasServiceConnection === true
          ? "pass"
          : "fail",
      !hvac
        ? "لا يوجد عنصر EXAM_2_HVAC مرتبط بالغرفة"
        : hvac.properties.HasServiceConnection === true
          ? "عنصر HVAC مصنف واتصال الخدمة مثبت"
          : "عنصر HVAC موجود لكن اتصال الخدمة غير مثبت",
      hvac ?? exam2,
    ),
  ];
}

function evaluateSalon(input: EvaluationInput): RuleEvaluation[] {
  const { model } = input;
  const treatment = findByRole(model, "TREATMENT", "IFCSPACE");
  const treatmentDoor = findByRole(model, "TREATMENT", "IFCDOOR");
  const wash = findAllByRole(model, "HAIR_WASH_STATION");
  const exit = findByRole(model, "EXIT", "IFCDOOR");
  const route = findByRole(model, "STYLING_AISLE");
  const chemical = findByRole(model, "CHEMICAL_STORAGE");
  const nail = findByRole(model, "NAIL", "IFCSPACE");
  const ventilation = findByRole(model, "NAIL_VENTILATION");
  const aisleWidth = route?.properties.MinimumClearWidth;

  return [
    ...evaluateBase(input),
    result(
      "SALON-PRIVACY-001",
      treatment?.properties.IsEnclosed === true && treatmentDoor
        ? "pass"
        : "fail",
      treatment?.properties.IsEnclosed === true && treatmentDoor
        ? "غرفة TREATMENT مغلقة ومرتبطة بباب مستقل"
        : "خصوصية غرفة العناية غير مثبتة",
      treatmentDoor ?? treatment,
    ),
    result(
      "SALON-WASH-001",
      wash.length >= 2 ? "pass" : "fail",
      `${wash.length} وحدة HAIR_WASH_STATION مصنفة`,
      wash[0] ?? findByRole(model, "WASH", "IFCSPACE"),
    ),
    result(
      "SALON-EGRESS-001",
      exit?.properties.ConnectsToExterior === true ? "pass" : "fail",
      exit?.properties.ConnectsToExterior === true
        ? "باب EXIT متصل بالحد الخارجي"
        : "اتصال باب الخروج بالخارج غير مثبت",
      exit,
    ),
    result(
      "SALON-AISLE-001",
      typeof aisleWidth !== "number"
        ? "unknown"
        : aisleWidth >= 0.9
          ? "pass"
          : "fail",
      typeof aisleWidth !== "number"
        ? "MinimumClearWidth غير مسجل"
        : `${aisleWidth.toFixed(2)} م عند أضيق نقطة`,
      route,
    ),
    result(
      "SALON-CHEM-STORE-001",
      !chemical
        ? "unknown"
        : chemical.properties.IsEnclosed === true
          ? "pass"
          : "fail",
      !chemical
        ? "لا يوجد عنصر CHEMICAL_STORAGE"
        : chemical.properties.IsEnclosed === true
          ? "خزانة CHEMICAL_STORAGE تحمل IsEnclosed=true"
          : "عنصر CHEMICAL_STORAGE يحمل IsEnclosed=false",
      chemical ?? treatment,
    ),
    result(
      "SALON-VENT-001",
      !ventilation
        ? "unknown"
        : ventilation.properties.HasServiceConnection === true
          ? "pass"
          : "fail",
      !ventilation
        ? "لا يوجد عنصر NAIL_VENTILATION مرتبط بمنطقة الأظافر"
        : ventilation.properties.HasServiceConnection === true
          ? "عنصر تهوية مصنف واتصال الخدمة مثبت"
          : "عنصر التهوية موجود لكن اتصال الخدمة غير مثبت",
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
    return {
      ...template,
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
