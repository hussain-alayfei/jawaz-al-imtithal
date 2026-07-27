export type Scenario = "review" | "ready";
export type ResultStatus = "pass" | "fail" | "unknown";
export type ResultFilter = "all" | ResultStatus;

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

export const defaultFacility: FacilityDetails = {
  projectName: "مطعم النخيل — فرع الياسمين",
  activity: "مطعم",
  city: "الرياض",
  district: "حي الياسمين",
  buildingType: "محل ضمن مبنى تجاري",
  establishmentState: "new",
  area: 284,
  floors: 1,
  capacity: 72,
};

export const modelMetadata: Record<Scenario, ModelMetadata> = {
  review: {
    fileName: "restaurant-review.ifc",
    size: "2.8 MB",
    schema: "IFC4",
    units: "متر",
    storeys: 1,
    spaces: 6,
    doors: 7,
    elements: 148,
    scenario: "review",
  },
  ready: {
    fileName: "restaurant-ready.ifc",
    size: "3.1 MB",
    schema: "IFC4",
    units: "متر",
    storeys: 1,
    spaces: 6,
    doors: 7,
    elements: 156,
    scenario: "ready",
  },
};

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
    source: "متطلبات جودة النموذج — مرجع تجريبي",
    clause: "قاعدة نموذجية لأغراض العرض",
    version: "DEMO-REST-2026.1",
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
    source: "قاموس بيانات جواز الامتثال",
    clause: "تعريف الحقول الأساسية",
    version: "DEMO-REST-2026.1",
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
    source: "متطلبات تسليم نموذج BIM — مرجع تجريبي",
    clause: "قاعدة نموذجية لأغراض العرض",
    version: "DEMO-REST-2026.1",
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
    source: "حزمة قواعد نشاط المطاعم — مرجع تجريبي",
    clause: "قاعدة نموذجية لأغراض العرض",
    version: "DEMO-REST-2026.1",
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
    source: "حزمة قواعد نشاط المطاعم — مرجع تجريبي",
    clause: "قاعدة نموذجية لأغراض العرض",
    version: "DEMO-REST-2026.1",
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
    source: "حزمة قواعد مسارات الخروج — مرجع تجريبي",
    clause: "قاعدة نموذجية لأغراض العرض",
    version: "DEMO-REST-2026.1",
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
    source: "فحص الواجهة — مرجع تجريبي",
    clause: "قاعدة نموذجية لأغراض العرض",
    version: "DEMO-REST-2026.1",
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
    source: "حزمة قواعد مسارات الخروج — مرجع تجريبي",
    clause: "حد تجريبي بانتظار اعتماد المرجع",
    version: "DEMO-REST-2026.1",
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
    source: "حزمة قواعد الوصول الشامل — مرجع تجريبي",
    clause: "حد تجريبي بانتظار اعتماد المرجع",
    version: "DEMO-REST-2026.1",
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
    source: "حزمة قواعد تهوية المطاعم — مرجع تجريبي",
    clause: "تحتاج مراجعة مختص ميكانيكي",
    version: "DEMO-REST-2026.1",
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

export const getFindings = (scenario: Scenario): Finding[] =>
  scenario === "review" ? reviewFindings : [...sharedPasses, ...readyAdditions];

export const calculateSummary = (
  findings: Finding[],
  scenario?: Scenario,
): Summary => {
  const passed = findings.filter((item) => item.status === "pass").length;
  const failed = findings.filter((item) => item.status === "fail").length;
  const unknown = findings.filter((item) => item.status === "unknown").length;

  return {
    passed,
    failed,
    unknown,
    score: scenario === "review" ? 78 : failed === 0 && unknown === 0 ? 100 : passed * 10,
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

export const analysisStages = [
  "التحقق من بنية ملف IFC",
  "استخراج المساحات والعناصر",
  "فحص اكتمال البيانات",
  "تطبيق قواعد نشاط المطاعم",
  "ربط النتائج بعناصر النموذج",
  "إعداد تقرير الجاهزية",
];

export const primaryDisclaimer =
  "هذه نتيجة فحص استباقي آلي لرفع جاهزية الطلب، ولا تمثل موافقة أو شهادة أو ترخيصًا رسميًا. الاعتماد النهائي من اختصاص الجهة المختصة والمكتب الهندسي المعتمد.";

export const modelDisclaimer =
  "تعتمد النتائج على البيانات الموجودة في النموذج المرفوع (As‑Designed)، ولا تثبت مطابقة التنفيذ الفعلي في الموقع (As‑Built).";

