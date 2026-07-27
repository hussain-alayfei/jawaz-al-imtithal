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

function relationshipMismatch(
  element: ExtractedIfcEntity,
  space: ExtractedIfcEntity | undefined,
  propertyName: "ServedSpaceGuid" | "ServesSpaceGuid",
  expectedRole: string,
): string {
  const recorded = element.properties[propertyName];
  return `${propertyName}=${typeof recorded === "string" && recorded ? recorded : "N/A"} لا يطابق GUID مساحة ${expectedRole} (${space?.globalId ?? "N/A"})`;
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
        ? "مساحة WC غير موجودة"
        : !sanitary
          ? "عنصر SANITARY_FIXTURE غير موجود"
          : !sanitaryLinked
            ? relationshipMismatch(
                sanitary,
                wc,
                "ServedSpaceGuid",
                "WC",
              )
          : sanitaryConnected
              ? "تجهيز SANITARY_FIXTURE مرتبط بمساحة WC ويحمل HasServiceConnection=true"
              : "التجهيز الصحي مرتبط بمساحة WC لكن HasServiceConnection=false",
      sanitary ?? wc,
    ),
    result(
      "EGRESS-001",
      exit?.properties.ConnectsToExterior === true && exitLinked
        ? "pass"
        : "fail",
      !exit
        ? "باب EXIT غير موجود"
        : !exitLinked
          ? relationshipMismatch(exit, dining, "ServesSpaceGuid", "DINING")
          : exit.properties.ConnectsToExterior === true
            ? "باب EXIT يحمل ConnectsToExterior=true ويرتبط بمساحة DINING"
            : "باب EXIT مرتبط بمساحة DINING لكن ConnectsToExterior=false",
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
      !exit || !exitLinked || width === undefined
        ? "unknown"
        : width >= 0.9
          ? "pass"
          : "fail",
      !exit
        ? "باب EXIT غير موجود لقياس عرضه"
        : !exitLinked
          ? relationshipMismatch(exit, dining, "ServesSpaceGuid", "DINING")
          : width === undefined
            ? "OverallWidth غير مسجل على باب EXIT"
            : `${width.toFixed(2)} م من IfcDoor.OverallWidth`,
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
        ? "عنصر ACCESS_ROUTE غير موجود"
        : !routeLinked
          ? relationshipMismatch(route, dining, "ServedSpaceGuid", "DINING")
          : typeof routeWidth !== "number"
            ? "MinimumClearWidth غير مسجل على ACCESS_ROUTE"
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
        ? "لا يوجد عنصر KITCHEN_VENTILATION مرتبط بالمطبخ"
        : !ventilationLinked
          ? relationshipMismatch(
              ventilation,
              kitchen,
              "ServedSpaceGuid",
              "KITCHEN",
            )
          : ventilation.properties.HasServiceConnection === true
            ? "عنصر KITCHEN_VENTILATION مرتبط بمساحة KITCHEN واتصال الخدمة مثبت"
            : "عنصر التهوية مرتبط بالمطبخ لكن HasServiceConnection=false",
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
        ? "لم يوجد عنصر PREP_HANDWASH في جرد التجهيزات المكتمل"
        : !handwashLinked
          ? relationshipMismatch(
              handwash,
              prep,
              "ServedSpaceGuid",
              "PREP",
            )
          : handwashConnected
            ? "عنصر PREP_HANDWASH مرتبط بمساحة PREP واتصال الخدمة مثبت"
            : "عنصر PREP_HANDWASH مرتبط بمساحة PREP لكن HasServiceConnection=false",
      handwash ?? prep,
    ),
    result(
      "CAFE-SAN-001",
      wc && sanitary && sanitaryConnected && sanitaryLinked ? "pass" : "fail",
      !wc
        ? "مساحة WC غير موجودة"
        : !sanitary
          ? "التجهيز الصحي غير موجود"
          : !sanitaryLinked
            ? relationshipMismatch(
                sanitary,
                wc,
                "ServedSpaceGuid",
                "WC",
              )
          : sanitaryConnected
              ? "التجهيز الصحي مرتبط بمساحة WC واتصال الخدمة مثبت"
              : "التجهيز الصحي مرتبط بمساحة WC لكن HasServiceConnection=false",
      sanitary ?? wc,
    ),
    result(
      "CAFE-EGRESS-001",
      exit?.properties.ConnectsToExterior === true && exitLinked
        ? "pass"
        : "fail",
      !exit
        ? "باب EXIT غير موجود"
        : !exitLinked
          ? relationshipMismatch(exit, seating, "ServesSpaceGuid", "SEATING")
          : exit.properties.ConnectsToExterior === true
            ? "باب EXIT يحمل ConnectsToExterior=true ويرتبط بمساحة SEATING"
            : "باب EXIT مرتبط بمساحة SEATING لكن ConnectsToExterior=false",
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
        ? "عنصر COUNTER_AISLE غير موجود"
        : !routeLinked
          ? relationshipMismatch(route, prep, "ServedSpaceGuid", "PREP")
          : typeof aisleWidth !== "number"
            ? "MinimumClearWidth غير مسجل"
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
        ? "باب EXIT غير موجود لقياس عرضه"
        : !exitLinked
          ? relationshipMismatch(exit, seating, "ServesSpaceGuid", "SEATING")
          : width === undefined
            ? "OverallWidth غير مسجل"
            : `${width.toFixed(2)} م من IfcDoor.OverallWidth`,
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
        ? "لا يوجد عنصر PREP_DRAIN مرتبط بمنطقة التحضير"
        : !drainLinked
          ? relationshipMismatch(drain, prep, "ServedSpaceGuid", "PREP")
          : drain.properties.HasServiceConnection === true
            ? "مصرف PREP_DRAIN مرتبط بمساحة PREP واتصال الخدمة مثبت"
            : "المصرف مرتبط بمساحة PREP لكن HasServiceConnection=false",
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
        ? "غرفتا EXAM_1 وEXAM_2 مغلقتان وباب EXAM_2 مرتبط بالغرفة الصحيحة"
        : !exam2
          ? "مساحة EXAM_2 غير موجودة"
          : exam2.properties.IsEnclosed !== true
            ? "مساحة EXAM_2 تحمل IsEnclosed=false"
            : !examDoor
              ? "باب EXAM_2 غير موجود"
              : relationshipMismatch(
                  examDoor,
                  exam2,
                  "ServesSpaceGuid",
                  "EXAM_2",
                ),
      privacy ? (examDoor ?? exam2) : (exam2 ?? examDoor),
    ),
    result(
      "CLINIC-SAN-001",
      wc && sanitary && sanitaryConnected && sanitaryLinked ? "pass" : "fail",
      !wc
        ? "مساحة WC غير موجودة"
        : !sanitary
          ? "التجهيز الصحي غير موجود"
          : !sanitaryLinked
            ? relationshipMismatch(
                sanitary,
                wc,
                "ServedSpaceGuid",
                "WC",
              )
          : sanitaryConnected
              ? "التجهيز الصحي مرتبط بمساحة WC واتصال الخدمة مثبت"
              : "التجهيز الصحي مرتبط بمساحة WC لكن HasServiceConnection=false",
      sanitary ?? wc,
    ),
    result(
      "CLINIC-EGRESS-001",
      exit?.properties.ConnectsToExterior === true && exitLinked
        ? "pass"
        : "fail",
      !exit
        ? "باب EXIT غير موجود"
        : !exitLinked
          ? relationshipMismatch(
              exit,
              reception,
              "ServesSpaceGuid",
              "RECEPTION",
            )
          : exit.properties.ConnectsToExterior === true
            ? "باب EXIT يحمل ConnectsToExterior=true ويرتبط بمساحة RECEPTION"
            : "باب EXIT مرتبط بمساحة RECEPTION لكن ConnectsToExterior=false",
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
        ? "باب EXAM_2 غير موجود لقياس عرضه"
        : !examDoorLinked
          ? relationshipMismatch(
              examDoor,
              exam2,
              "ServesSpaceGuid",
              "EXAM_2",
            )
          : examWidth === undefined
            ? "OverallWidth غير مسجل على باب EXAM_2"
            : `${examWidth.toFixed(2)} م من IfcDoor.OverallWidth`,
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
        ? "لم يوجد EXAM_2_HANDWASH في جرد التجهيزات المكتمل"
        : !handwashLinked
          ? relationshipMismatch(
              handwash,
              exam2,
              "ServedSpaceGuid",
              "EXAM_2",
            )
          : handwash.properties.HasServiceConnection === true
            ? "عنصر EXAM_2_HANDWASH مرتبط بمساحة EXAM_2 واتصال الخدمة مثبت"
            : "عنصر EXAM_2_HANDWASH مرتبط بالغرفة لكن HasServiceConnection=false",
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
        ? "لا يوجد عنصر EXAM_2_HVAC مرتبط بالغرفة"
        : !hvacLinked
          ? relationshipMismatch(
              hvac,
              exam2,
              "ServedSpaceGuid",
              "EXAM_2",
            )
          : hvac.properties.HasServiceConnection === true
            ? "عنصر EXAM_2_HVAC مرتبط بمساحة EXAM_2 واتصال الخدمة مثبت"
            : "عنصر HVAC مرتبط بالغرفة لكن HasServiceConnection=false",
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
        ? "مساحة TREATMENT غير موجودة"
        : treatment.properties.IsEnclosed !== true
          ? "مساحة TREATMENT تحمل IsEnclosed=false"
          : !treatmentDoor
            ? "باب TREATMENT غير موجود"
            : treatmentDoorLinked
              ? "غرفة TREATMENT مغلقة وبابها مرتبط بالمساحة الصحيحة"
              : relationshipMismatch(
                  treatmentDoor,
                  treatment,
                  "ServesSpaceGuid",
                  "TREATMENT",
                ),
      treatment?.properties.IsEnclosed === true
        ? (treatmentDoor ?? treatment)
        : (treatment ?? treatmentDoor),
    ),
    result(
      "SALON-WASH-001",
      validWash.length >= 2 ? "pass" : "fail",
      `${validWash.length} من ${wash.length} وحدات HAIR_WASH_STATION مرتبطة بمساحة WASH واتصال خدمتها مثبت`,
      wash[0] ?? washSpace,
    ),
    result(
      "SALON-EGRESS-001",
      exit?.properties.ConnectsToExterior === true && exitLinked
        ? "pass"
        : "fail",
      !exit
        ? "باب EXIT غير موجود"
        : !exitLinked
          ? relationshipMismatch(
              exit,
              reception,
              "ServesSpaceGuid",
              "RECEPTION",
            )
          : exit.properties.ConnectsToExterior === true
            ? "باب EXIT يحمل ConnectsToExterior=true ويرتبط بمساحة RECEPTION"
            : "باب EXIT مرتبط بمساحة RECEPTION لكن ConnectsToExterior=false",
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
        ? "عنصر STYLING_AISLE غير موجود"
        : !routeLinked
          ? relationshipMismatch(route, styling, "ServedSpaceGuid", "STYLING")
          : typeof aisleWidth !== "number"
            ? "MinimumClearWidth غير مسجل"
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
        ? "لا يوجد عنصر CHEMICAL_STORAGE"
        : !chemicalLinked
          ? relationshipMismatch(
              chemical,
              storage,
              "ServedSpaceGuid",
              "STORAGE",
            )
          : chemical.properties.IsEnclosed === true
            ? "خزانة CHEMICAL_STORAGE مرتبطة بمساحة STORAGE وتحمل IsEnclosed=true"
            : "عنصر CHEMICAL_STORAGE مرتبط بمساحة STORAGE لكنه يحمل IsEnclosed=false",
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
        ? "لا يوجد عنصر NAIL_VENTILATION مرتبط بمنطقة الأظافر"
        : !ventilationLinked
          ? relationshipMismatch(
              ventilation,
              nail,
              "ServedSpaceGuid",
              "NAIL",
            )
          : ventilation.properties.HasServiceConnection === true
            ? "عنصر NAIL_VENTILATION مرتبط بمساحة NAIL واتصال الخدمة مثبت"
            : "عنصر التهوية مرتبط بمنطقة الأظافر لكن HasServiceConnection=false",
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
    expected: "تجهيز صحي مرتبط بدورة المياه واتصال خدمة مثبت",
    explanation:
      "مساحة دورة المياه موجودة، لكن خاصية اتصال خدمة التجهيز الصحي لا تثبت جاهزيته في النموذج.",
    recommendation:
      "اربط التجهيز الصحي بخدمة السباكة وسجّل HasServiceConnection=true بعد التحقق الهندسي.",
    effort: "استكمال نموذج السباكة",
  },
  "EGRESS-001": {
    title: "اتصال مخرج المطعم بالحد الخارجي غير مثبت",
    shortTitle: "اتصال مخرج المطعم",
    expected: "باب خروج يحمل ConnectsToExterior=true",
    explanation:
      "باب الخروج موجود، لكن علاقته الدلالية بالحد الخارجي غير مثبتة في ملف IFC.",
    recommendation:
      "راجع مسار الإخلاء واربط باب EXIT بالحد الخارجي في النموذج قبل إعادة الفحص.",
    effort: "تعديل علاقات النموذج",
  },
  "FACADE-MEP-001": {
    title: "إخفاء خدمات الواجهة غير مثبت",
    shortTitle: "خدمات الواجهة",
    expected: "عنصر واجهة يحمل ServicesConcealed=true",
    explanation:
      "عنصر الواجهة موجود، لكن خصائصه تصرح بأن إخفاء الخدمات الميكانيكية والكهربائية غير محقق.",
    recommendation:
      "حدّث تصميم الواجهة أو مسارات الخدمات، ثم وثّق النتيجة في خاصية ServicesConcealed.",
    effort: "تنسيق معماري وMEP",
  },
  "CAFE-HANDWASH-001": {
    title: "اتصال خدمة حوض التحضير غير مثبت",
    shortTitle: "توصيل حوض التحضير",
    expected: "حوض تحضير مصنف واتصال خدمته مثبت",
    explanation:
      "حوض PREP_HANDWASH موجود في منطقة التحضير، لكن خاصية اتصال الخدمة مسجلة كغير محققة.",
    recommendation:
      "أكمل ربط الحوض بخدمات التغذية والصرف وحدّث HasServiceConnection في نموذج IFC.",
    effort: "استكمال نموذج السباكة",
  },
  "CAFE-SAN-001": {
    title: "اتصال خدمة تجهيز دورة المياه غير مثبت",
    shortTitle: "توصيل المرفق الصحي",
    expected: "تجهيز صحي داخل WC باتصال خدمة مثبت",
    explanation:
      "مساحة WC وتجهيزها موجودان، لكن النموذج لا يثبت اتصال التجهيز بالخدمة.",
    recommendation:
      "اربط التجهيز الصحي بخدمات السباكة وسجّل الاتصال في مجموعة الخصائص.",
    effort: "استكمال نموذج السباكة",
  },
  "CAFE-EGRESS-001": {
    title: "اتصال مخرج المقهى بالخارج غير مثبت",
    shortTitle: "اتصال مخرج المقهى",
    expected: "باب EXIT مرتبط بحد خارجي",
    explanation:
      "باب المخرج موجود، لكن ConnectsToExterior=false يمنع إثبات اكتمال مسار الخروج.",
    recommendation:
      "صحح علاقة باب EXIT بالحد الخارجي بعد مراجعة مسار الإخلاء.",
    effort: "تعديل علاقات النموذج",
  },
  "CLINIC-PRIVACY-001": {
    title: "إغلاق غرفة الفحص الثانية غير مثبت",
    shortTitle: "خصوصية غرفة الفحص 2",
    expected: "غرف الفحص تحمل IsEnclosed=true وترتبط بأبواب مستقلة",
    explanation:
      "غرفة EXAM_2 مصنفة في الملف، لكن IsEnclosed=false لا يثبت الفصل المطلوب للخصوصية.",
    recommendation:
      "أكمل حدود الغرفة أو صحح تصنيف الإغلاق بعد مراجعة المخطط المعماري.",
    effort: "تعديل معماري",
  },
  "CLINIC-SAN-001": {
    title: "اتصال خدمة تجهيز دورة مياه العيادة غير مثبت",
    shortTitle: "توصيل المرفق الصحي",
    expected: "تجهيز صحي داخل WC باتصال خدمة مثبت",
    explanation:
      "دورة المياه وتجهيزها موجودان، لكن خاصية اتصال خدمة التجهيز غير محققة.",
    recommendation:
      "أكمل علاقة التجهيز بخدمات السباكة وحدّث الخاصية في نموذج IFC.",
    effort: "استكمال نموذج السباكة",
  },
  "CLINIC-EGRESS-001": {
    title: "اتصال مخرج العيادة بالخارج غير مثبت",
    shortTitle: "اتصال مخرج العيادة",
    expected: "باب EXIT مرتبط بحد خارجي",
    explanation:
      "باب الخروج موجود، لكن النموذج لا يثبت اتصاله بالحد الخارجي.",
    recommendation:
      "راجع مسار خروج المرضى والعاملين وصحح ConnectsToExterior لباب EXIT.",
    effort: "تعديل علاقات النموذج",
  },
  "SALON-PRIVACY-001": {
    title: "إغلاق غرفة العناية غير مثبت",
    shortTitle: "خصوصية غرفة العناية",
    expected: "غرفة TREATMENT مغلقة ومرتبطة بباب مستقل",
    explanation:
      "غرفة العناية موجودة وبها باب، لكن IsEnclosed=false لا يثبت اكتمال الفصل.",
    recommendation:
      "أكمل حدود غرفة العناية أو صحح خاصية الإغلاق بعد مراجعة التصميم.",
    effort: "تعديل معماري",
  },
  "SALON-WASH-001": {
    title: "عدد وحدات غسل الشعر أقل من المطلوب في حزمة العرض",
    shortTitle: "وحدة غسل شعر ناقصة",
    expected: "وحدتا HAIR_WASH_STATION مصنفتان ومرتبطتان بمنطقة الغسيل",
    explanation:
      "استخرج النظام وحدة غسل شعر واحدة فقط من جرد التجهيزات المكتمل.",
    recommendation:
      "أضف وحدة الغسيل الناقصة واربطها بمنطقة WASH وخدماتها، ثم أعد الفحص.",
    effort: "إضافة تجهيز وخدمات",
  },
  "SALON-EGRESS-001": {
    title: "اتصال مخرج الصالون بالخارج غير مثبت",
    shortTitle: "اتصال مخرج الصالون",
    expected: "باب EXIT مرتبط بحد خارجي",
    explanation:
      "باب المخرج موجود، لكن ConnectsToExterior=false يمنع إثبات اكتمال مسار الخروج.",
    recommendation:
      "راجع مسار الخروج وصحح علاقة باب EXIT بالحد الخارجي في نموذج IFC.",
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
      explanation: `لم تتوفر في ملف IFC بيانات كافية لإصدار حكم على القاعدة ${evaluation.ruleId}. الدليل المستخرج: ${evaluation.actual}.`,
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
      explanation: `سجلت القاعدة ${evaluation.ruleId} ملاحظة مثبتة من بيانات IFC المستخرجة: ${evaluation.actual}.`,
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
    explanation: `تحققت القاعدة ${evaluation.ruleId} من بيانات IFC المستخرجة: ${evaluation.actual}.`,
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
