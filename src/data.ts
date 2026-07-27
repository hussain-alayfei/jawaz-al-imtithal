export type Scenario = "review" | "ready";
export type ResultStatus = "pass" | "fail" | "unknown";
export type ResultFilter = "action" | "all" | ResultStatus;
export type ActivityId = "restaurant" | "cafe" | "clinic" | "salon";

export interface FacilityDetails {
  projectName: string;
  activity: string;
  city: string;
  district: string;
  buildingType: string;
  establishmentState: "new" | "existing";
  area: number;
  floors: number;
  capacity: number;
}

export interface ModelMetadata {
  activityId: ActivityId;
  fileName: string;
  size: string;
  schema: string;
  units: string;
  storeys: number;
  spaces: number;
  doors: number;
  elements: number;
  scenario: Scenario;
}

export interface Finding {
  ruleId: string;
  status: ResultStatus;
  severity: "high" | "medium" | "info";
  title: string;
  shortTitle: string;
  category: string;
  elementId?: string;
  elementStepId?: number;
  elementGuid?: string;
  elementName?: string;
  actual: string;
  expected: string;
  explanation: string;
  recommendation: string;
  source: string;
  clause: string;
  version: string;
  effort: string;
}

export interface Summary {
  passed: number;
  failed: number;
  unknown: number;
  score: number;
}

export interface ActivityExample {
  id: ActivityId;
  label: string;
  description: string;
  rulePack: string;
  ruleVersion: string;
  facility: FacilityDetails;
}

export const activityIds: ActivityId[] = [
  "restaurant",
  "cafe",
  "clinic",
  "salon",
];

const facilityDefaults: Record<ActivityId, FacilityDetails> = {
  restaurant: {
    projectName: "مطعم النخيل، فرع الياسمين",
    activity: "مطعم",
    city: "الرياض",
    district: "حي الياسمين",
    buildingType: "محل ضمن مبنى تجاري",
    establishmentState: "new",
    area: 284,
    floors: 1,
    capacity: 72,
  },
  cafe: {
    projectName: "مقهى السدر، فرع الملقا",
    activity: "مقهى",
    city: "الرياض",
    district: "حي الملقا",
    buildingType: "محل ضمن مبنى تجاري",
    establishmentState: "new",
    area: 168,
    floors: 1,
    capacity: 42,
  },
  clinic: {
    projectName: "عيادات واحة الصحة، فرع النرجس",
    activity: "عيادة خارجية",
    city: "الرياض",
    district: "حي النرجس",
    buildingType: "وحدة ضمن مبنى طبي",
    establishmentState: "new",
    area: 236,
    floors: 1,
    capacity: 36,
  },
  salon: {
    projectName: "صالون لمسة، فرع الروضة",
    activity: "صالون تجميل",
    city: "جدة",
    district: "حي الروضة",
    buildingType: "محل ضمن مبنى تجاري",
    establishmentState: "existing",
    area: 142,
    floors: 1,
    capacity: 28,
  },
};

export const activityExamples: ActivityExample[] = [
  {
    id: "restaurant",
    label: "مطعم",
    description: "صالة طعام ومطبخ وخدمات ومسارات خروج مترابطة.",
    rulePack: "حزمة قواعد نشاط المطاعم (مرجع تجريبي)",
    ruleVersion: "MIYAR-REST-2026.2",
    facility: { ...facilityDefaults.restaurant },
  },
  {
    id: "cafe",
    label: "مقهى",
    description: "منطقة جلوس وبار تحضير وتخزين وتجهيزات سباكة.",
    rulePack: "حزمة قواعد نشاط المقاهي (مرجع تجريبي)",
    ruleVersion: "MIYAR-CAFE-2026.2",
    facility: { ...facilityDefaults.cafe },
  },
  {
    id: "clinic",
    label: "عيادة خارجية",
    description: "استقبال وغرف فحص وتجهيزات نظافة وخصوصية سريرية.",
    rulePack: "حزمة قواعد نشاط العيادات (مرجع تجريبي)",
    ruleVersion: "MIYAR-CLIN-2026.2",
    facility: { ...facilityDefaults.clinic },
  },
  {
    id: "salon",
    label: "صالون تجميل",
    description: "استقبال ومحطات تصفيف وغسيل وعناية وتخزين تشغيلي.",
    rulePack: "حزمة قواعد نشاط صالونات التجميل (مرجع تجريبي)",
    ruleVersion: "MIYAR-SALON-2026.2",
    facility: { ...facilityDefaults.salon },
  },
];

export function getActivityIdFromLabel(value: unknown): ActivityId {
  if (typeof value !== "string") return "restaurant";
  const normalized = value.trim().toLowerCase();
  const byId = activityIds.find((activityId) => activityId === normalized);
  if (byId) return byId;
  return (
    activityExamples.find((example) => example.label === value.trim())?.id ??
    "restaurant"
  );
}

export const getDefaultFacility = (activityId: ActivityId): FacilityDetails => ({
  ...facilityDefaults[activityId],
});

export const defaultFacility = getDefaultFacility("restaurant");

const sharedPasses: Finding[] = [
  {
    ruleId: "IFC-QUAL-001",
    status: "pass",
    severity: "info",
    title: "سلامة بنية النموذج الهندسي",
    shortTitle: "بنية IFC قابلة للفحص",
    category: "جودة النموذج",
    actual: "تمت قراءة المخطط والوحدات والهندسة بنجاح",
    expected: "نموذج منظم وقابل للاستخراج",
    explanation:
      "اجتاز النموذج فحوص البنية الأساسية، وتم التعرف على الطابق والعناصر والمعرفات الدائمة.",
    recommendation: "لا يلزم إجراء في نطاق هذه القاعدة.",
    source: "متطلبات جودة النموذج (مرجع تجريبي)",
    clause: "قاعدة نموذجية لأغراض العرض",
    version: "MIYAR-REST-2026.2",
    effort: "لا يوجد",
  },
  {
    ruleId: "DATA-CORE-001",
    status: "pass",
    severity: "info",
    title: "اكتمال بيانات المنشأة الأساسية",
    shortTitle: "البيانات الأساسية مكتملة",
    category: "اكتمال البيانات",
    actual: "الموقع، النشاط، المساحة، الطوابق والطاقة مدخلة",
    expected: "توفر جميع الحقول المطلوبة للفحص",
    explanation:
      "تتوفر البيانات اللازمة لاختيار حزمة قواعد المطاعم وتشغيل الفحص الأولي.",
    recommendation: "راجع البيانات عند تغير نطاق المشروع.",
    source: "قاموس بيانات مِعيار",
    clause: "تعريف الحقول الأساسية",
    version: "MIYAR-REST-2026.2",
    effort: "لا يوجد",
  },
  {
    ruleId: "DATA-SPACE-001",
    status: "pass",
    severity: "info",
    title: "تسمية وتصنيف المساحات",
    shortTitle: "كل المساحات مصنفة",
    category: "المساحات",
    elementId: "SPACE-DINING",
    elementGuid: "2JwZ$DINING$001",
    elementName: "منطقة الطعام",
    actual: "6 من 6 مساحات تحمل اسمًا وتصنيفًا",
    expected: "اسم وتصنيف لكل IfcSpace",
    explanation:
      "تم ربط المساحات الست بفئات المطعم دون وجود أسماء فارغة أو ملتبسة.",
    recommendation: "حافظ على معايير التسمية عند تحديث النموذج.",
    source: "متطلبات تسليم نموذج BIM (مرجع تجريبي)",
    clause: "قاعدة نموذجية لأغراض العرض",
    version: "MIYAR-REST-2026.2",
    effort: "لا يوجد",
  },
  {
    ruleId: "REST-SPACE-001",
    status: "pass",
    severity: "info",
    title: "توفر مناطق التشغيل الأساسية",
    shortTitle: "مناطق المطعم الأساسية موجودة",
    category: "المساحات",
    elementId: "SPACE-KITCHEN",
    elementGuid: "2JwZ$KITCHEN$001",
    elementName: "المطبخ",
    actual: "مطبخ، طعام، تخزين وخدمة",
    expected: "تمثيل المناطق المطلوبة في نموذج العرض",
    explanation:
      "تعرف النظام على المطبخ ومنطقة العملاء والتخزين ومنطقة الخدمة كمساحات مستقلة.",
    recommendation: "لا يلزم إجراء في نطاق هذه القاعدة.",
    source: "حزمة قواعد نشاط المطاعم (مرجع تجريبي)",
    clause: "قاعدة نموذجية لأغراض العرض",
    version: "MIYAR-REST-2026.2",
    effort: "لا يوجد",
  },
  {
    ruleId: "REST-SAN-001",
    status: "pass",
    severity: "info",
    title: "تمثيل المرافق الصحية",
    shortTitle: "دورة المياه ممثلة",
    category: "المرافق",
    elementId: "SPACE-WC",
    elementGuid: "2JwZ$WC$001",
    elementName: "دورة المياه",
    actual: "مساحة صحية وتجهيزات مرتبطة",
    expected: "وجود مساحة أو تجهيز صحي",
    explanation:
      "يحتوي النموذج على دورة مياه مصنفة وتجهيز صحي داخل حدودها.",
    recommendation: "تحتاج الأبعاد التفصيلية إلى مرجع معتمد في النسخة الإنتاجية.",
    source: "حزمة قواعد نشاط المطاعم (مرجع تجريبي)",
    clause: "قاعدة نموذجية لأغراض العرض",
    version: "MIYAR-REST-2026.2",
    effort: "لا يوجد",
  },
  {
    ruleId: "EGRESS-001",
    status: "pass",
    severity: "info",
    title: "اتصال مسار الخروج بالخارج",
    shortTitle: "مسار الخروج متصل",
    category: "السلامة",
    elementId: "D-EXIT-02",
    elementGuid: "2JwZ$DOOR$EXIT02",
    elementName: "باب مخرج الطوارئ",
    actual: "مسار متصل من منطقة العملاء إلى حد خارجي",
    expected: "مخرج متصل بحد المبنى الخارجي",
    explanation:
      "أثبت تحليل العلاقات وجود مسار متصل من منطقة الطعام إلى باب خارجي.",
    recommendation: "عالج عرض الباب الموضح في القاعدة المنفصلة.",
    source: "حزمة قواعد مسارات الخروج (مرجع تجريبي)",
    clause: "قاعدة نموذجية لأغراض العرض",
    version: "MIYAR-REST-2026.2",
    effort: "لا يوجد",
  },
  {
    ruleId: "FACADE-MEP-001",
    status: "pass",
    severity: "info",
    title: "خلو الواجهة الرئيسية من الخدمات المكشوفة",
    shortTitle: "عناصر الواجهة غير مكشوفة",
    category: "الواجهة",
    elementId: "FACADE-MAIN",
    elementGuid: "2JwZ$FACADE$001",
    elementName: "الواجهة الرئيسية",
    actual: "لا توجد عناصر خدمة متقاطعة مع نطاق الرؤية",
    expected: "عدم ظهور الخدمات في نطاق الواجهة المصنف",
    explanation:
      "لم يرصد النموذج عناصر تكييف أو تمديدات مكشوفة ضمن منطقة الواجهة الرئيسية.",
    recommendation: "يتطلب التحقق الميداني للتأكد من التنفيذ الفعلي.",
    source: "فحص الواجهة (مرجع تجريبي)",
    clause: "قاعدة نموذجية لأغراض العرض",
    version: "MIYAR-REST-2026.2",
    effort: "لا يوجد",
  },
];

const reviewFindings: Finding[] = [
  ...sharedPasses,
  {
    ruleId: "DOOR-WIDTH-001",
    status: "fail",
    severity: "high",
    title: "عرض مخرج الطوارئ أقل من الحد التجريبي",
    shortTitle: "عرض مخرج الطوارئ",
    category: "السلامة",
    elementId: "D-EXIT-02",
    elementGuid: "2JwZ$DOOR$EXIT02",
    elementName: "باب مخرج الطوارئ",
    actual: "0.82 م",
    expected: "≥ 0.90 م (حد تجريبي)",
    explanation:
      "قاس محرك القواعد العرض الصافي لعنصر الباب المرتبط بالمخرج، فوجد أنه أقل من القيمة المضبوطة في حزمة العرض.",
    recommendation:
      "راجع تصميم فتحة الباب وارفع العرض الصافي إلى الحد المعتمد بعد التحقق من المختص.",
    source: "حزمة قواعد مسارات الخروج (مرجع تجريبي)",
    clause: "حد تجريبي بانتظار اعتماد المرجع",
    version: "MIYAR-REST-2026.2",
    effort: "تعديل هندسي متوسط",
  },
  {
    ruleId: "ACCESS-ROUTE-001",
    status: "fail",
    severity: "high",
    title: "نقطة تضيق في مسار الوصول",
    shortTitle: "تضيق مسار الوصول",
    category: "الوصول الشامل",
    elementId: "COR-ACCESS-01",
    elementGuid: "2JwZ$ROUTE$ACCESS01",
    elementName: "مسار الوصول الرئيسي",
    actual: "0.76 م عند نقطة التضيق",
    expected: "≥ 0.90 م (حد تجريبي)",
    explanation:
      "المسار متصل، لكن المسافة الحرة بين حاجز الخدمة والطاولة تنخفض عند نقطة محددة عن إعداد قاعدة العرض.",
    recommendation:
      "أعد توزيع الأثاث أو حاجز الخدمة لتوفير عرض مستمر، ثم أعد تصدير النموذج.",
    source: "حزمة قواعد الوصول الشامل (مرجع تجريبي)",
    clause: "حد تجريبي بانتظار اعتماد المرجع",
    version: "MIYAR-REST-2026.2",
    effort: "تعديل بسيط",
  },
  {
    ruleId: "KITCHEN-VENT-001",
    status: "unknown",
    severity: "medium",
    title: "لا يمكن إثبات خدمة تهوية المطبخ",
    shortTitle: "بيانات تهوية المطبخ ناقصة",
    category: "الميكانيكا",
    elementId: "SPACE-KITCHEN",
    elementGuid: "2JwZ$KITCHEN$001",
    elementName: "المطبخ",
    actual: "لم يُرفق نموذج MEP أو علاقة مروحة/مجرى",
    expected: "دليل ميكانيكي مرتبط بمساحة المطبخ",
    explanation:
      "النموذج المعماري يثبت وجود المطبخ، لكنه لا يحتوي على بيانات كافية لاتخاذ حكم على التهوية.",
    recommendation:
      "أرفق نموذج MEP أو أضف المروحة ومجرى الهواء وعلاقة الخدمة بالمطبخ.",
    source: "حزمة قواعد تهوية المطاعم (مرجع تجريبي)",
    clause: "تحتاج مراجعة مختص ميكانيكي",
    version: "MIYAR-REST-2026.2",
    effort: "استكمال معلومات",
  },
];

const readyAdditions: Finding[] = [
  {
    ...reviewFindings.find((item) => item.ruleId === "DOOR-WIDTH-001")!,
    status: "pass",
    severity: "info",
    actual: "1.00 م",
    shortTitle: "عرض مخرج الطوارئ مستوفٍ",
    title: "عرض مخرج الطوارئ يحقق حد العرض التجريبي",
    explanation:
      "العرض الصافي للباب يساوي أو يتجاوز القيمة المضبوطة في حزمة العرض.",
    recommendation: "لا يلزم إجراء في نطاق هذه القاعدة.",
    effort: "لا يوجد",
  },
  {
    ...reviewFindings.find((item) => item.ruleId === "ACCESS-ROUTE-001")!,
    status: "pass",
    severity: "info",
    actual: "1.10 م في أضيق نقطة",
    shortTitle: "مسار الوصول مستمر",
    title: "مسار الوصول متصل وبعرض مناسب للعرض",
    explanation:
      "تمثل أسطح الحركة مسارًا مستمرًا من المدخل إلى منطقة العملاء دون نقطة تضيق.",
    recommendation: "لا يلزم إجراء في نطاق هذه القاعدة.",
    effort: "لا يوجد",
  },
  {
    ...reviewFindings.find((item) => item.ruleId === "KITCHEN-VENT-001")!,
    status: "pass",
    severity: "info",
    actual: "مروحة ومجرى مرتبطان بالمطبخ",
    shortTitle: "دليل تهوية المطبخ موجود",
    title: "المطبخ مرتبط بنظام تهوية في النموذج",
    explanation:
      "وجد النظام علاقة خدمة صريحة بين المطبخ والمروحة ومجرى الهواء في نموذج العرض.",
    recommendation: "تظل السعة والمواصفات بحاجة إلى مرجع هندسي معتمد.",
    effort: "لا يوجد",
  },
];

type FindingSeed = Omit<
  Finding,
  "status" | "severity" | "version" | "recommendation" | "clause" | "effort"
> &
  Partial<
    Pick<Finding, "recommendation" | "clause" | "effort">
  >;

const makePass = (version: string, seed: FindingSeed): Finding => ({
  status: "pass",
  severity: "info",
  recommendation: "لا يلزم إجراء في نطاق هذه القاعدة.",
  clause: "قاعدة نموذجية لأغراض العرض",
  effort: "لا يوجد",
  version,
  ...seed,
});

const makeIssue = (
  version: string,
  status: "fail" | "unknown",
  seed: FindingSeed,
): Finding => ({
  status,
  severity: status === "fail" ? "high" : "medium",
  recommendation: "راجع العنصر والبيانات المرتبطة به ثم أعد تشغيل الفحص.",
  clause:
    status === "fail"
      ? "حد تجريبي بانتظار اعتماد المرجع"
      : "تحتاج مراجعة مختص واستكمال معلومات",
  effort: status === "fail" ? "تعديل هندسي" : "استكمال معلومات",
  version,
  ...seed,
});

const resolveIssue = (
  finding: Finding,
  updates: Partial<Finding>,
): Finding => ({
  ...finding,
  status: "pass",
  severity: "info",
  recommendation: "لا يلزم إجراء في نطاق هذه القاعدة.",
  effort: "لا يوجد",
  ...updates,
});

function createBasePasses({
  version,
  activityLabel,
  rulePack,
  spaces,
  spaceElementId,
  spaceElementGuid,
  spaceElementName,
}: {
  version: string;
  activityLabel: string;
  rulePack: string;
  spaces: number;
  spaceElementId: string;
  spaceElementGuid: string;
  spaceElementName: string;
}): Finding[] {
  return [
    makePass(version, {
      ruleId: "IFC-QUAL-001",
      title: "سلامة بنية النموذج الهندسي",
      shortTitle: "بنية IFC قابلة للفحص",
      category: "جودة النموذج",
      actual: "تمت قراءة المخطط والوحدات والهندسة بنجاح",
      expected: "نموذج منظم وقابل للاستخراج",
      explanation:
        "اجتاز النموذج فحوص البنية الأساسية، وتم التعرف على الطابق والعناصر والمعرفات الدائمة.",
      source: "متطلبات جودة النموذج (مرجع تجريبي)",
    }),
    makePass(version, {
      ruleId: "DATA-CORE-001",
      title: "اكتمال بيانات المنشأة الأساسية",
      shortTitle: "البيانات الأساسية مكتملة",
      category: "اكتمال البيانات",
      actual: "الموقع، النشاط، المساحة، الطوابق والطاقة مدخلة",
      expected: "توفر جميع الحقول المطلوبة للفحص",
      explanation: `تتوفر البيانات اللازمة لاختيار حزمة قواعد ${activityLabel} وتشغيل الفحص الأولي.`,
      recommendation: "راجع البيانات عند تغير نطاق المشروع.",
      source: "قاموس بيانات مِعيار",
      clause: "تعريف الحقول الأساسية",
    }),
    makePass(version, {
      ruleId: "DATA-SPACE-001",
      title: "تسمية وتصنيف المساحات",
      shortTitle: "كل المساحات مصنفة",
      category: "المساحات",
      elementId: spaceElementId,
      elementGuid: spaceElementGuid,
      elementName: spaceElementName,
      actual: `${spaces} من ${spaces} مساحات تحمل اسمًا وتصنيفًا`,
      expected: "اسم وتصنيف لكل IfcSpace",
      explanation: `تم ربط المساحات المصنفة بحزمة ${activityLabel} دون أسماء فارغة أو ملتبسة.`,
      recommendation: "حافظ على معايير التسمية عند تحديث النموذج.",
      source: `${rulePack}، متطلبات تسليم BIM`,
    }),
  ];
}

const cafeVersion = "MIYAR-CAFE-2026.2";
const cafePack = "حزمة قواعد نشاط المقاهي (مرجع تجريبي)";
const cafePasses: Finding[] = [
  ...createBasePasses({
    version: cafeVersion,
    activityLabel: "المقاهي",
    rulePack: cafePack,
    spaces: 6,
    spaceElementId: "CAFE-SPACE-SEATING",
    spaceElementGuid: "3CfE$SPACE$SEAT01",
    spaceElementName: "منطقة الجلوس",
  }),
  makePass(cafeVersion, {
    ruleId: "CAFE-SPACE-001",
    title: "توفر مناطق تشغيل المقهى الأساسية",
    shortTitle: "مناطق المقهى الأساسية موجودة",
    category: "المساحات",
    elementId: "CAFE-SPACE-BAR",
    elementGuid: "3CfE$SPACE$BAR001",
    elementName: "منطقة التحضير والبار",
    actual: "جلوس، تحضير، تخزين، خدمة، منافع ودورة مياه",
    expected: "تمثيل المناطق المطلوبة في نموذج العرض",
    explanation:
      "تعرف النظام على مناطق العملاء والتحضير والتخزين والخدمة كمناطق تشغيل مستقلة.",
    source: cafePack,
  }),
  makePass(cafeVersion, {
    ruleId: "CAFE-HANDWASH-001",
    title: "تمثيل نقطة غسيل في منطقة التحضير",
    shortTitle: "حوض التحضير ممثل",
    category: "التجهيزات",
    elementId: "CAFE-SINK-BAR-01",
    elementGuid: "3CfE$SINK$BAR001",
    elementName: "حوض منطقة التحضير",
    actual: "حوض مصنف ومرتبط بمنطقة التحضير",
    expected: "تجهيز غسيل ممثل داخل نطاق التحضير",
    explanation:
      "وجد الفحص تجهيز غسيل مصنفًا ومتموضعًا داخل حدود منطقة التحضير في نموذج العرض.",
    source: cafePack,
  }),
  makePass(cafeVersion, {
    ruleId: "CAFE-SAN-001",
    title: "تمثيل المرافق الصحية",
    shortTitle: "دورة المياه ممثلة",
    category: "المرافق",
    elementId: "CAFE-SPACE-WC",
    elementGuid: "3CfE$SPACE$WC0001",
    elementName: "دورة المياه",
    actual: "مساحة صحية وتجهيز مرتبط",
    expected: "وجود مساحة وتجهيز صحي في نموذج العرض",
    explanation:
      "يحتوي النموذج على دورة مياه مصنفة وتجهيز صحي داخل حدودها.",
    recommendation:
      "تحتاج الأبعاد التفصيلية إلى مرجع معتمد في النسخة الإنتاجية.",
    source: cafePack,
  }),
  makePass(cafeVersion, {
    ruleId: "CAFE-EGRESS-001",
    title: "اتصال مسار الخروج بالخارج",
    shortTitle: "مسار الخروج متصل",
    category: "السلامة",
    elementId: "CAFE-D-EXIT-02",
    elementGuid: "3CfE$DOOR$EXIT02",
    elementName: "باب المخرج",
    actual: "مسار متصل من منطقة الجلوس إلى حد خارجي",
    expected: "مخرج متصل بحد المبنى الخارجي",
    explanation:
      "أثبت تحليل العلاقات وجود مسار متصل من منطقة العملاء إلى باب خارجي.",
    recommendation: "عالج عرض الباب الموضح في القاعدة المنفصلة.",
    source: "حزمة قواعد مسارات الخروج (مرجع تجريبي)",
  }),
];

const cafeIssues: Finding[] = [
  makeIssue(cafeVersion, "fail", {
    ruleId: "CAFE-AISLE-001",
    title: "نقطة تضيق بين حاجز التحضير ومنطقة الجلوس",
    shortTitle: "تضيق ممر حاجز التحضير",
    category: "الوصول الشامل",
    elementId: "CAFE-COR-COUNTER-01",
    elementGuid: "3CfE$ROUTE$BAR001",
    elementName: "ممر حاجز التحضير",
    actual: "0.72 م عند أضيق نقطة",
    expected: "≥ 0.90 م (حد تجريبي)",
    explanation:
      "تنخفض المسافة الحرة بين حاجز التحضير وأقرب مقعد عن القيمة المضبوطة في حزمة العرض.",
    recommendation:
      "أعد توزيع المقاعد أو حاجز التحضير لتوفير عرض مستمر، ثم أعد تصدير النموذج.",
    source: "حزمة قواعد الوصول الشامل (مرجع تجريبي)",
    effort: "تعديل بسيط",
  }),
  makeIssue(cafeVersion, "fail", {
    ruleId: "CAFE-EXIT-WIDTH-001",
    title: "عرض باب المخرج أقل من الحد التجريبي",
    shortTitle: "عرض باب المخرج",
    category: "السلامة",
    elementId: "CAFE-D-EXIT-02",
    elementGuid: "3CfE$DOOR$EXIT02",
    elementName: "باب المخرج",
    actual: "0.84 م",
    expected: "≥ 0.90 م (حد تجريبي)",
    explanation:
      "العرض الصافي المسجل لعنصر الباب أقل من القيمة المضبوطة لأغراض العرض.",
    recommendation:
      "راجع فتحة الباب وارفع العرض الصافي بعد التحقق من المختص والمرجع المعتمد.",
    source: "حزمة قواعد مسارات الخروج (مرجع تجريبي)",
    effort: "تعديل هندسي متوسط",
  }),
  makeIssue(cafeVersion, "unknown", {
    ruleId: "CAFE-DRAIN-001",
    title: "لا يمكن إثبات خدمة صرف منطقة التحضير",
    shortTitle: "بيانات صرف التحضير ناقصة",
    category: "السباكة",
    elementId: "CAFE-SPACE-BAR",
    elementGuid: "3CfE$SPACE$BAR001",
    elementName: "منطقة التحضير والبار",
    actual: "لا توجد علاقة صرف أو مصرف أرضي في النموذج المرفق",
    expected: "دليل سباكة مرتبط بمنطقة التحضير",
    explanation:
      "يثبت النموذج المعماري وجود منطقة التحضير، لكنه لا يحتوي بيانات كافية لإصدار نتيجة على خدمة الصرف.",
    recommendation:
      "أرفق نموذج السباكة أو أضف المصرف وخط الصرف وعلاقتهما بمنطقة التحضير.",
    source: "حزمة فحص خدمات المقاهي (مرجع تجريبي)",
  }),
];

const cafeReady: Finding[] = [
  ...cafePasses,
  resolveIssue(cafeIssues[0], {
    title: "ممر حاجز التحضير يحقق حد العرض التجريبي",
    shortTitle: "ممر حاجز التحضير مستمر",
    actual: "1.10 م عند أضيق نقطة",
    explanation:
      "تمثل أسطح الحركة ممرًا مستمرًا بين حاجز التحضير ومنطقة الجلوس دون نقطة تضيق.",
  }),
  resolveIssue(cafeIssues[1], {
    title: "عرض باب المخرج يحقق حد العرض التجريبي",
    shortTitle: "عرض باب المخرج مستوفٍ",
    actual: "1.00 م",
    explanation:
      "العرض الصافي للباب يساوي أو يتجاوز القيمة المضبوطة في حزمة العرض.",
  }),
  resolveIssue(cafeIssues[2], {
    title: "منطقة التحضير مرتبطة بخدمة صرف في النموذج",
    shortTitle: "دليل صرف التحضير موجود",
    actual: "مصرف أرضي وخط صرف مرتبطان بمنطقة التحضير",
    explanation:
      "وجد النظام علاقة خدمة صريحة بين منطقة التحضير والمصرف وخط الصرف في نموذج العرض.",
    recommendation:
      "تظل السعة والمواصفات بحاجة إلى مرجع هندسي معتمد.",
  }),
];

const clinicVersion = "MIYAR-CLIN-2026.2";
const clinicPack = "حزمة قواعد نشاط العيادات (مرجع تجريبي)";
const clinicPasses: Finding[] = [
  ...createBasePasses({
    version: clinicVersion,
    activityLabel: "العيادات الخارجية",
    rulePack: clinicPack,
    spaces: 8,
    spaceElementId: "CLINIC-SPACE-WAITING",
    spaceElementGuid: "4ClN$SPACE$WAIT01",
    spaceElementName: "منطقة الانتظار",
  }),
  makePass(clinicVersion, {
    ruleId: "CLINIC-SPACE-001",
    title: "توفر مناطق تشغيل العيادة الأساسية",
    shortTitle: "مناطق العيادة الأساسية موجودة",
    category: "المساحات",
    elementId: "CLINIC-SPACE-EXAM-01",
    elementGuid: "4ClN$SPACE$EXAM01",
    elementName: "غرفة الفحص 1",
    actual: "انتظار، غرف فحص، علاج، تخزين، منافع ودورة مياه",
    expected: "تمثيل المناطق المطلوبة في نموذج العرض",
    explanation:
      "تعرف النظام على مناطق الاستقبال والفحص والدعم كمساحات مستقلة ومصنفة.",
    source: clinicPack,
  }),
  makePass(clinicVersion, {
    ruleId: "CLINIC-PRIVACY-001",
    title: "تمثيل الخصوصية لغرف الفحص",
    shortTitle: "غرف الفحص مغلقة",
    category: "الخصوصية",
    elementId: "CLINIC-D-EXAM-01",
    elementGuid: "4ClN$DOOR$EXAM01",
    elementName: "باب غرفة الفحص 1",
    actual: "حدود كاملة وباب قابل للإغلاق",
    expected: "فصل هندسي واضح لمساحة الفحص",
    explanation:
      "غرفة الفحص الأولى محاطة بعناصر فصل ومتصلة بباب مستقل في نموذج العرض.",
    source: clinicPack,
  }),
  makePass(clinicVersion, {
    ruleId: "CLINIC-SAN-001",
    title: "تمثيل المرافق الصحية",
    shortTitle: "دورة المياه ممثلة",
    category: "المرافق",
    elementId: "CLINIC-SPACE-WC",
    elementGuid: "4ClN$SPACE$WC0001",
    elementName: "دورة المياه",
    actual: "مساحة صحية وتجهيز مرتبط",
    expected: "وجود مساحة وتجهيز صحي في نموذج العرض",
    explanation:
      "يحتوي النموذج على دورة مياه مصنفة وتجهيز صحي داخل حدودها.",
    recommendation:
      "تحتاج الأبعاد التفصيلية إلى مرجع معتمد في النسخة الإنتاجية.",
    source: clinicPack,
  }),
  makePass(clinicVersion, {
    ruleId: "CLINIC-EGRESS-001",
    title: "اتصال مسار الخروج بالخارج",
    shortTitle: "مسار الخروج متصل",
    category: "السلامة",
    elementId: "CLINIC-D-EXIT-01",
    elementGuid: "4ClN$DOOR$EXIT01",
    elementName: "باب المخرج",
    actual: "مسار متصل من غرف الفحص والانتظار إلى حد خارجي",
    expected: "مسار مستمر إلى باب خارجي",
    explanation:
      "أثبت تحليل العلاقات وجود مسار خروج متصل من المساحات المشغولة إلى الباب الخارجي.",
    source: "حزمة قواعد مسارات الخروج (مرجع تجريبي)",
  }),
];

const clinicIssues: Finding[] = [
  makeIssue(clinicVersion, "fail", {
    ruleId: "CLINIC-DOOR-001",
    title: "عرض باب غرفة الفحص الثانية أقل من الحد التجريبي",
    shortTitle: "عرض باب غرفة الفحص 2",
    category: "الوصول الشامل",
    elementId: "CLINIC-D-EXAM-02",
    elementGuid: "4ClN$DOOR$EXAM02",
    elementName: "باب غرفة الفحص 2",
    actual: "0.78 م",
    expected: "≥ 0.90 م (حد تجريبي)",
    explanation:
      "العرض الصافي المسجل لباب غرفة الفحص الثانية أقل من القيمة المضبوطة في حزمة العرض.",
    recommendation:
      "راجع فتحة الباب وارفع العرض الصافي بعد التحقق من المختص والمرجع المعتمد.",
    source: "حزمة قواعد الوصول الشامل (مرجع تجريبي)",
    effort: "تعديل هندسي متوسط",
  }),
  makeIssue(clinicVersion, "fail", {
    ruleId: "CLINIC-HANDWASH-001",
    title: "نقطة غسل اليدين غير ممثلة في غرفة الفحص الثانية",
    shortTitle: "حوض غسل اليدين مفقود",
    category: "التجهيزات",
    elementId: "CLINIC-SINK-EXAM-02",
    elementGuid: "4ClN$SINK$EXAM02",
    elementName: "نقطة غسل اليدين، غرفة الفحص 2",
    actual: "لا يوجد حوض مصنف داخل الغرفة في نموذج العرض",
    expected: "حوض مصنف ومرتبط بالغرفة (متطلب تجريبي)",
    explanation:
      "لم يعثر الفحص على عنصر حوض أو علاقة تجهيز داخل حدود غرفة الفحص الثانية.",
    recommendation:
      "أضف حوضًا في الموقع المخصص واربطه بالغرفة وخدمات السباكة، ثم أعد الفحص.",
    source: "حزمة فحص تجهيزات النظافة (مرجع تجريبي)",
    effort: "إضافة تجهيز وخدمات",
  }),
  makeIssue(clinicVersion, "unknown", {
    ruleId: "CLINIC-HVAC-001",
    title: "لا يمكن إثبات خدمة التهوية لغرفة الفحص الثانية",
    shortTitle: "بيانات تهوية غرفة الفحص ناقصة",
    category: "الميكانيكا",
    elementId: "CLINIC-VENT-EXAM-02",
    elementGuid: "4ClN$VENT$EXAM02",
    elementName: "نقطة تهوية غرفة الفحص 2",
    actual: "لا توجد علاقة تغذية أو راجع في النموذج المرفق",
    expected: "دليل ميكانيكي مرتبط بغرفة الفحص",
    explanation:
      "النموذج المعماري يثبت وجود الغرفة، لكنه لا يتضمن بيانات كافية لاتخاذ حكم على خدمتها ميكانيكيًا.",
    recommendation:
      "أرفق نموذج MEP أو أضف عناصر التغذية والراجع وعلاقتها بغرفة الفحص.",
    source: "حزمة فحص تهوية العيادات (مرجع تجريبي)",
  }),
];

const clinicReady: Finding[] = [
  ...clinicPasses,
  resolveIssue(clinicIssues[0], {
    title: "باب غرفة الفحص الثانية يحقق حد العرض التجريبي",
    shortTitle: "عرض باب غرفة الفحص 2 مستوفٍ",
    actual: "1.00 م",
    explanation:
      "العرض الصافي للباب يساوي أو يتجاوز القيمة المضبوطة في حزمة العرض.",
  }),
  resolveIssue(clinicIssues[1], {
    title: "نقطة غسل اليدين ممثلة في غرفة الفحص الثانية",
    shortTitle: "حوض غسل اليدين موجود",
    actual: "حوض مصنف ومرتبط بالغرفة وخدمات السباكة",
    explanation:
      "وجد الفحص حوضًا مصنفًا داخل الغرفة وعلاقات الخدمة اللازمة في نموذج العرض.",
  }),
  resolveIssue(clinicIssues[2], {
    title: "غرفة الفحص الثانية مرتبطة بخدمة تهوية في النموذج",
    shortTitle: "دليل تهوية غرفة الفحص موجود",
    actual: "ناشر هواء وراجع مرتبطان بغرفة الفحص",
    explanation:
      "وجد النظام علاقة خدمة صريحة بين غرفة الفحص وعناصر التغذية والراجع.",
    recommendation:
      "تظل السعة والمواصفات بحاجة إلى مرجع هندسي معتمد.",
  }),
];

const salonVersion = "MIYAR-SALON-2026.2";
const salonPack = "حزمة قواعد نشاط صالونات التجميل (مرجع تجريبي)";
const salonPasses: Finding[] = [
  ...createBasePasses({
    version: salonVersion,
    activityLabel: "صالونات التجميل",
    rulePack: salonPack,
    spaces: 7,
    spaceElementId: "SALON-SPACE-STYLING",
    spaceElementGuid: "5SaL$SPACE$STYLE1",
    spaceElementName: "منطقة التصفيف",
  }),
  makePass(salonVersion, {
    ruleId: "SALON-SPACE-001",
    title: "توفر مناطق تشغيل الصالون الأساسية",
    shortTitle: "مناطق الصالون الأساسية موجودة",
    category: "المساحات",
    elementId: "SALON-SPACE-TREATMENT",
    elementGuid: "5SaL$SPACE$TREAT1",
    elementName: "غرفة العناية",
    actual: "استقبال، تصفيف، غسيل، أظافر، عناية، تخزين ودورة مياه",
    expected: "تمثيل المناطق المطلوبة في نموذج العرض",
    explanation:
      "تعرف النظام على مناطق العملاء والخدمات والتخزين كمساحات مستقلة ومصنفة.",
    source: salonPack,
  }),
  makePass(salonVersion, {
    ruleId: "SALON-PRIVACY-001",
    title: "تمثيل الخصوصية لغرفة العناية",
    shortTitle: "غرفة العناية مغلقة",
    category: "الخصوصية",
    elementId: "SALON-D-TREATMENT-01",
    elementGuid: "5SaL$DOOR$TREAT1",
    elementName: "باب غرفة العناية",
    actual: "حدود كاملة وباب قابل للإغلاق",
    expected: "فصل هندسي واضح لمساحة العناية",
    explanation:
      "غرفة العناية محاطة بعناصر فصل ومتصلة بباب مستقل في نموذج العرض.",
    source: salonPack,
  }),
  makePass(salonVersion, {
    ruleId: "SALON-WASH-001",
    title: "تمثيل تجهيزات الغسيل",
    shortTitle: "وحدات الغسيل ممثلة",
    category: "التجهيزات",
    elementId: "SALON-SINK-WASH-01",
    elementGuid: "5SaL$SINK$WASH001",
    elementName: "وحدة غسل الشعر",
    actual: "وحدتا غسيل مصنفتان داخل منطقة الغسيل",
    expected: "تجهيز غسيل مرتبط بالمساحة في نموذج العرض",
    explanation:
      "وجد الفحص وحدات غسيل مصنفة ومتموضعة داخل حدود منطقة الغسيل.",
    source: salonPack,
  }),
  makePass(salonVersion, {
    ruleId: "SALON-EGRESS-001",
    title: "اتصال مسار الخروج بالخارج",
    shortTitle: "مسار الخروج متصل",
    category: "السلامة",
    elementId: "SALON-D-EXIT-01",
    elementGuid: "5SaL$DOOR$EXIT01",
    elementName: "باب المخرج",
    actual: "مسار متصل من مناطق الخدمة إلى حد خارجي",
    expected: "مسار مستمر إلى باب خارجي",
    explanation:
      "أثبت تحليل العلاقات وجود مسار خروج متصل من المساحات المشغولة إلى الباب الخارجي.",
    source: "حزمة قواعد مسارات الخروج (مرجع تجريبي)",
  }),
];

const salonIssues: Finding[] = [
  makeIssue(salonVersion, "fail", {
    ruleId: "SALON-AISLE-001",
    title: "نقطة تضيق بين محطات التصفيف",
    shortTitle: "تضيق ممر التصفيف",
    category: "الوصول الشامل",
    elementId: "SALON-COR-STYLING-01",
    elementGuid: "5SaL$ROUTE$STYLE1",
    elementName: "ممر محطات التصفيف",
    actual: "0.74 م عند أضيق نقطة",
    expected: "≥ 0.90 م (حد تجريبي)",
    explanation:
      "تنخفض المسافة الحرة بين كرسي التصفيف وعربة الخدمة عن القيمة المضبوطة في حزمة العرض.",
    recommendation:
      "أعد توزيع الكراسي وعربات الخدمة لتوفير عرض مستمر، ثم أعد تصدير النموذج.",
    source: "حزمة قواعد الوصول الشامل (مرجع تجريبي)",
    effort: "تعديل بسيط",
  }),
  makeIssue(salonVersion, "fail", {
    ruleId: "SALON-CHEM-STORE-001",
    title: "مواد التشغيل ممثلة على رف مفتوح",
    shortTitle: "تخزين مواد التشغيل غير مغلق",
    category: "السلامة التشغيلية",
    elementId: "SALON-STORAGE-CHEM-01",
    elementGuid: "5SaL$STORE$CHEM01",
    elementName: "تخزين مواد التشغيل",
    actual: "رف مفتوح داخل منطقة العمل",
    expected: "خزانة مخصصة مغلقة ومصنفة (متطلب تجريبي)",
    explanation:
      "يصنف نموذج العرض عنصر التخزين كرف مفتوح داخل نطاق تشغيل متاح للحركة.",
    recommendation:
      "استبدل الرف بخزانة مغلقة ومصنفة، ثم راجع متطلبات التخزين المعتمدة مع المختص.",
    source: "حزمة فحص تشغيل صالونات التجميل (مرجع تجريبي)",
    effort: "تعديل تجهيز",
  }),
  makeIssue(salonVersion, "unknown", {
    ruleId: "SALON-VENT-001",
    title: "لا يمكن إثبات خدمة تهوية منطقة الأظافر",
    shortTitle: "بيانات تهوية منطقة الأظافر ناقصة",
    category: "الميكانيكا",
    elementId: "SALON-VENT-NAIL-01",
    elementGuid: "5SaL$VENT$NAIL001",
    elementName: "نقطة تهوية منطقة الأظافر",
    actual: "لا توجد مروحة أو علاقة مجرى في النموذج المرفق",
    expected: "دليل ميكانيكي مرتبط بمنطقة الأظافر",
    explanation:
      "النموذج المعماري يثبت وجود المنطقة، لكنه لا يتضمن بيانات كافية لاتخاذ حكم على خدمتها ميكانيكيًا.",
    recommendation:
      "أرفق نموذج MEP أو أضف عنصر السحب والمجرى وعلاقتهما بمنطقة الأظافر.",
    source: "حزمة فحص تهوية صالونات التجميل (مرجع تجريبي)",
  }),
];

const salonReady: Finding[] = [
  ...salonPasses,
  resolveIssue(salonIssues[0], {
    title: "ممر محطات التصفيف يحقق حد العرض التجريبي",
    shortTitle: "ممر التصفيف مستمر",
    actual: "1.10 م عند أضيق نقطة",
    explanation:
      "تمثل أسطح الحركة ممرًا مستمرًا بين محطات التصفيف دون نقطة تضيق.",
  }),
  resolveIssue(salonIssues[1], {
    title: "مواد التشغيل ممثلة داخل خزانة مغلقة",
    shortTitle: "تخزين مواد التشغيل مغلق",
    actual: "خزانة مغلقة ومصنفة خارج مسار الحركة",
    explanation:
      "يصنف نموذج العرض عنصر التخزين كخزانة مغلقة داخل مساحة الخدمة.",
  }),
  resolveIssue(salonIssues[2], {
    title: "منطقة الأظافر مرتبطة بخدمة تهوية في النموذج",
    shortTitle: "دليل تهوية منطقة الأظافر موجود",
    actual: "عنصر سحب ومجرى مرتبطان بمنطقة الأظافر",
    explanation:
      "وجد النظام علاقة خدمة صريحة بين منطقة الأظافر وعنصر السحب والمجرى.",
    recommendation:
      "تظل السعة والمواصفات بحاجة إلى مرجع هندسي معتمد.",
  }),
];

const findingsByActivity: Record<
  ActivityId,
  Record<Scenario, Finding[]>
> = {
  restaurant: {
    review: reviewFindings,
    ready: [...sharedPasses, ...readyAdditions],
  },
  cafe: {
    review: [...cafePasses, ...cafeIssues],
    ready: cafeReady,
  },
  clinic: {
    review: [...clinicPasses, ...clinicIssues],
    ready: clinicReady,
  },
  salon: {
    review: [...salonPasses, ...salonIssues],
    ready: salonReady,
  },
};

export const getFindings = (
  scenario: Scenario,
  activityId: ActivityId = "restaurant",
): Finding[] =>
  findingsByActivity[activityId][scenario].map((finding) => ({ ...finding }));

export const calculateSummary = (
  findings: Finding[],
  _scenario?: Scenario,
): Summary => {
  const passed = findings.filter((item) => item.status === "pass").length;
  const failed = findings.filter((item) => item.status === "fail").length;
  const unknown = findings.filter((item) => item.status === "unknown").length;

  return {
    passed,
    failed,
    unknown,
    score: findings.length
      ? Math.round((passed / findings.length) * 100)
      : 0,
  };
};

export const statusLabels: Record<ResultStatus, string> = {
  pass: "مطابق ضمن نطاق الفحص",
  fail: "ملاحظة مثبتة",
  unknown: "معلومات غير مكتملة",
};

export const statusShortLabels: Record<ResultStatus, string> = {
  pass: "مطابق",
  fail: "غير مطابق",
  unknown: "يحتاج مراجعة",
};

export const elementTargets: Record<
  string,
  { target: [number, number, number]; camera: [number, number, number] }
> = {
  "D-EXIT-02": {
    target: [7.78, 1.15, 1.8],
    camera: [12.5, 5.2, 5.8],
  },
  "COR-ACCESS-01": {
    target: [-1.2, 0.08, 1.15],
    camera: [-4.4, 6.4, 8.8],
  },
  "SPACE-KITCHEN": {
    target: [4.6, 0.9, 1.0],
    camera: [10.4, 7.2, 7.8],
  },
  "SPACE-DINING": {
    target: [-2.3, 0.5, 0],
    camera: [-7.8, 7.4, 9.5],
  },
  "SPACE-WC": {
    target: [1.8, 0.5, -4.1],
    camera: [-0.8, 5.4, -8.6],
  },
  "FACADE-MAIN": {
    target: [-1.5, 1.3, 5.45],
    camera: [-1.5, 4.4, 12],
  },
};

const analysisRuleStage: Record<ActivityId, string> = {
  restaurant: "تطبيق قواعد نشاط المطاعم",
  cafe: "تطبيق قواعد نشاط المقاهي",
  clinic: "تطبيق قواعد نشاط العيادات الخارجية",
  salon: "تطبيق قواعد نشاط صالونات التجميل",
};

export const getAnalysisStages = (activityId: ActivityId): string[] => [
  "التحقق من بنية ملف IFC",
  "استخراج المساحات والعناصر",
  "فحص اكتمال البيانات",
  analysisRuleStage[activityId],
  "ربط النتائج بعناصر النموذج",
  "إعداد تقرير الجاهزية",
];

// Backward-compatible restaurant stages for older consumers.
export const analysisStages = getAnalysisStages("restaurant");

export const primaryDisclaimer =
  "هذه نتيجة فحص استباقي آلي لرفع جاهزية الطلب، ولا تمثل موافقة أو شهادة أو ترخيصًا رسميًا. الاعتماد النهائي من اختصاص الجهة المختصة والمكتب الهندسي المعتمد.";

export const modelDisclaimer =
  "تعتمد النتائج على البيانات الموجودة في النموذج المرفوع (As‑Designed)، ولا تثبت مطابقة التنفيذ الفعلي في الموقع (As‑Built).";
