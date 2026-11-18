/*
 * Restaurant requirements used by the standard-IFC rules, with the clause text quoted from the
 * official document. Every rule cites its clause; where the document refers to another code
 * without stating a number (fire exits -> SBC-801), the limit used is marked provisional.
 *
 * Source read on 2026-11-18 from the ministry's page (issue date 25/10/2026, status "ساري"):
 *   https://momah.gov.sa/ar/node/14955
 * which links the PDF:
 *   https://momah.gov.sa/sites/default/files/2025-04/ashtratat%20almta%60m.pdf
 */

export const RESTAURANT_REQUIREMENTS_SOURCE = {
  title: "اشتراطات المطاعم",
  authority: "وزارة البلديات والإسكان",
  decision: "قرار وزاري رقم 4600653138/1 وتاريخ 1446/10/15هـ",
  edition: "1446هـ - 2025م",
  pageIssueDate: "25/10/2026",
  status: "ساري",
  pageUrl: "https://momah.gov.sa/ar/node/14955",
  pdfUrl: "https://momah.gov.sa/sites/default/files/2025-04/ashtratat%20almta%60m.pdf",
  retrievedOn: "2026-11-18",
} as const;

export const MOMAH_SOURCE_LABEL = `${RESTAURANT_REQUIREMENTS_SOURCE.title}، ${RESTAURANT_REQUIREMENTS_SOURCE.authority} (${RESTAURANT_REQUIREMENTS_SOURCE.decision})`;
export const MOMAH_VERSION = `${RESTAURANT_REQUIREMENTS_SOURCE.edition} • صفحة الوزارة بتاريخ ${RESTAURANT_REQUIREMENTS_SOURCE.pageIssueDate}`;

/**
 * mandatory: "يجب" in the document. recommendation: "يوصى". reference: the clause refers to
 * another code and the number used here is provisional. platform: a Mowaem data-quality check,
 * not a ministry requirement.
 */
export type RequirementKind = "mandatory" | "recommendation" | "reference" | "platform";

export interface Requirement {
  id: string;
  kind: RequirementKind;
  /** Clause number in the document, e.g. "4.8.1". */
  clause: string;
  page?: number;
  category: string;
  subject: string;
  /** Verbatim text of the clause (or the part this rule checks). */
  text: string;
  expected: string;
  /** How the engine measures it from an IFC file. */
  method: string;
  recommendation: string;
  effort: string;
}

export const RESTAURANT_REQUIREMENTS: Requirement[] = [
  {
    id: "MOMAH-REST-3.1-AREA",
    kind: "mandatory",
    clause: "3.1",
    page: 15,
    category: "الموقع والمساحة",
    subject: "الحد الأدنى لمساحة الموقع",
    text: "يجب الالتزام بالمتطلبات والمعايير التخطيطية الموضحة أدناه. … الحد الأدنى لمساحة الموقع: (16م²).",
    expected: "≥ 16 م²",
    method: "مجموع المساحات الصافية لكل IfcSpace في الملف (من Qto_SpaceBaseQuantities أو من هندسة أرضية الغرفة).",
    recommendation: "راجع حدود المساحات في النموذج أو مساحة الموقع المقترح.",
    effort: "مراجعة تصميمية",
  },
  {
    id: "MOMAH-REST-4.2.2-SPACES",
    kind: "mandatory",
    clause: "4.2.2",
    page: 20,
    category: "المتطلبات المعمارية",
    subject: "مساحات التحضير والتخزين وصالة التقديم",
    text: "يجب أن يراعي تصميم المنشأة على سبيل المثال لا الحصر المناطق والمساحات المخصصة لتداول الأغذية وطهيها وتخزينها وتخطيط أماكن المعدات، وصالة التقديم.",
    expected: "مطبخ (تحضير وطهي) ومخزن وصالة تقديم في النموذج",
    method: "تصنيف IfcSpace من الاسم (Name وLongName وObjectType) بالعربية أو الإنجليزية.",
    recommendation: "أضف المساحات الناقصة أو سمّها بوضوح في النموذج (مثل: Kitchen / المطبخ).",
    effort: "تعديل معماري",
  },
  {
    id: "MOMAH-REST-4.5.2-CLADDING",
    kind: "mandatory",
    clause: "4.5.2",
    page: 24,
    category: "الحوائط والأرضيات",
    subject: "ارتفاع تكسية حوائط المطبخ",
    text: "يجب أن تكون الحوائط فاتحة اللون لسهولة رؤية بقايا الأغذية المتراكمة عليها (داخل مناطق تحضير وإعداد وتخزين الأغذية)، … ويجب تكسية الحوائط بمواد متينة وقابلة للتنظيف، على ألا يقل ارتفاعها عن (1.80) متر من منسوب الأرضية.",
    expected: "≥ 1.80 م من منسوب الأرضية",
    method: "أدنى ارتفاع لعناصر IfcCovering من نوع CLADDING داخل المطبخ، مقاسًا من هندستها فوق أرضية المطبخ.",
    recommendation: "ارفع تكسية حوائط المطبخ (سيراميك أو ما يماثله) إلى 1.80 م على الأقل، ثم صدّر النموذج وأعد الفحص.",
    effort: "تعديل تشطيبات",
  },
  {
    id: "MOMAH-REST-4.8.1-STORE",
    kind: "mandatory",
    clause: "4.8.1",
    page: 27,
    category: "المخزن",
    subject: "مساحة المستودع",
    text: "يسمح بتوفير مستودع لتخزين المواد والمرتبطة بالنشاط على ألا تتجاوز مساحة المستودع 25% من المساحة الاجمالية الواردة في الترخيص أو (150)م2 أيهما أقل.",
    expected: "≤ 25% من مساحة الترخيص أو 150 م² أيهما أقل",
    method: "مجموع مساحات IfcSpace المصنفة مخزنًا، مقارنة بالمساحة الإجمالية المدخلة في بيانات المنشأة.",
    recommendation: "قلّص مساحة المستودع أو راجع المساحة الإجمالية المسجلة في الترخيص.",
    effort: "تعديل معماري",
  },
  {
    id: "MOMAH-REST-4.10.1-WC",
    kind: "recommendation",
    clause: "4.10.1 (1)",
    page: 28,
    category: "دورات المياه",
    subject: "دورة مياه للعملاء",
    text: "يوصى بتوفير دورة مياه بحد أدنى (1) تخدم العملاء.",
    expected: "دورة مياه واحدة على الأقل (توصية)",
    method: "عدد IfcSpace المصنفة دورة مياه.",
    recommendation: "أضف دورة مياه تخدم العملاء في النموذج.",
    effort: "تعديل معماري",
  },
  {
    id: "MOMAH-REST-4.10.1-DOOR",
    kind: "mandatory",
    clause: "4.10.1 (2)",
    page: 28,
    category: "دورات المياه",
    subject: "باب دورة المياه وغرف تداول الأغذية",
    text: "يجب في دورات المياه الواقعة داخل المنشأة الغذائية ما يلي: … ألّا تفتح مباشرة على غرفة يجري فيها تداول الأغذية.",
    expected: "لا يربط أي باب بين دورة المياه والمطبخ مباشرة",
    method: "لكل باب يقع على حد دورة مياه، تُحدد المساحة الأخرى التي يقع على حدها من هندسة الملف.",
    recommendation: "انقل باب دورة المياه ليفتح على ممر أو صالة، لا على المطبخ.",
    effort: "تعديل معماري",
  },
  {
    id: "MOMAH-REST-4.10.1-SEPARATION",
    kind: "mandatory",
    clause: "4.10.1 (2)",
    page: 28,
    category: "دورات المياه",
    subject: "فصل دورة المياه عن مناطق تداول الأغذية",
    text: "أن تكون بعيدة عن أي مناطق لتداول الأغذية، وفي حال تعذر ذلك يجب أن يُفصل بين دورات المياه ومناطق تداول الأغذية بمساحات متداخلة جيدة التهوية.",
    expected: "لا تشترك دورة المياه بجدار مع المطبخ",
    method: "أقصر مسافة أفقية بين حدّي دورة المياه والمطبخ من هندسة الملف؛ أقل من 0.30 م تعني جدارًا مشتركًا.",
    recommendation: "افصل دورة المياه عن المطبخ بممر أو مساحة وسيطة جيدة التهوية.",
    effort: "تعديل معماري",
  },
  {
    id: "MOMAH-REST-4.10.1-HANDWASH",
    kind: "mandatory",
    clause: "4.10.1 (2)",
    page: 28,
    category: "دورات المياه",
    subject: "أحواض غسل الأيدي",
    text: "أن تكون مجهزة بأحواض لغسل الأيدي، مع الصابون والمناشف الورقية أو مجفف اليدين بالقرب من دورات المياه.",
    expected: "حوض غسل أيدي داخل دورة المياه أو على بعد 1 م منها",
    method: "IfcSanitaryTerminal من نوع WASHHANDBASIN محتوى في دورة المياه أو قريب من حدها.",
    recommendation: "أضف حوض غسل أيدي (WASHHANDBASIN) في دورة المياه أو بجوارها.",
    effort: "تعديل تجهيزات صحية",
  },
  {
    id: "MOMAH-REST-4.9.1-EXIT",
    kind: "reference",
    clause: "4.9.1 → SBC-801",
    page: 27,
    category: "الوقاية والحماية من الحريق",
    subject: "مخرج طوارئ من صالة الطعام",
    text: "يجب الرجوع لكافة المتطلبات الواردة في كود البناء السعودي للحماية من الحرائق (SBC-801).",
    expected: "باب طوارئ خارجي على حد صالة الطعام (معيار تجريبي حتى مطابقته مع SBC-801)",
    method: "باب Pset_DoorCommon.FireExit = TRUE وIsExternal = TRUE يقع على حد صالة الطعام.",
    recommendation: "حدد مخرج الطوارئ في النموذج وتأكد أنه يؤدي إلى الخارج من صالة الطعام وفق SBC-801.",
    effort: "تعديل معماري",
  },
  {
    id: "MOMAH-REST-4.9.1-WIDTH",
    kind: "reference",
    clause: "4.9.1 → SBC-801",
    page: 27,
    category: "الوقاية والحماية من الحريق",
    subject: "عرض مخرج الطوارئ",
    text: "يجب الرجوع لكافة المتطلبات الواردة في كود البناء السعودي للحماية من الحرائق (SBC-801).",
    expected: "≥ 0.90 م (حد تجريبي: الاشتراطات تحيل إلى SBC-801 ولا تذكر رقمًا)",
    method: "أضيق باب FireExit، عرضه من IfcDoor.OverallWidth بعد تحويل الوحدات.",
    recommendation: "راجع عرض مخرج الطوارئ مع متطلبات SBC-801 وعدّل الفتحة عند الحاجة.",
    effort: "تعديل هندسي متوسط",
  },
  {
    id: "MOMAH-REST-4.1.3-DRAIN",
    kind: "mandatory",
    clause: "4.1.3",
    page: 20,
    category: "المتطلبات الفنية العامة",
    subject: "اتصال التجهيزات بالصرف الصحي",
    text: "عند توصيل تجهيزات ثابتة وتركيبات ومعدات معينة بمصدر الماء أو بمعدات وخدمات التصريف أو التنظيف، يجب وجود اتصال مناسب بخطوط الصرف الصحي.",
    expected: "كل تجهيز يصرف ماءً (الأحواض والمغاسل والمراحيض والصفايات الأرضية وغسالات الصحون) موصول بشبكة الصرف الصحي",
    method:
      "تُتتبع وصلات المنافذ (IfcDistributionPort وIfcRelConnectsPorts) من كل تجهيز يصرف ماءً حتى عنصر في شبكة صرف صحي (IfcDistributionSystem من نوع DRAINAGE أو WASTEWATER أو SEWAGE)، دون العبور بشبكات المياه أو غيرها من الخدمات. ولا يُحكم بالبند إذا خلا الملف من شبكة صرف بمنافذ موصولة.",
    recommendation: "صِل منفذ الصرف في التجهيز بشبكة الصرف في نموذج السباكة (MEP)، ثم صدّر النموذج وأعد الفحص.",
    effort: "تعديل نموذج السباكة",
  },
  {
    id: "MOMAH-REST-4.3.2-FACADE",
    kind: "mandatory",
    clause: "4.3.2",
    page: 23,
    category: "الواجهات",
    subject: "تمديدات الخدمة على الواجهة",
    text: "يمنع تركيب الأسلاك الكهربائية والأنابيب الصحية وغيرها من تمديدات الخدمة ووحدات التكييف الخارجية على واجهة المبنى أو بشكل ظاهر على السطح.",
    expected: "لا تمديدات خدمة أو وحدات تكييف خارجية ظاهرة على الواجهة أو السطح",
    method:
      "يقرأ المحرك أنظمة الخدمات وعناصرها من الملف، لكن الحكم بظهورها على الواجهة أو السطح يحتاج تحليل خطوط الرؤية الذي لم يُفعّل بعد.",
    recommendation: "تأكد من إخفاء وحدات التكييف والتمديدات خلف الدروة أو داخل المبنى، وأرفق نموذج الخدمات (MEP) إن لم يكن في الملف.",
    effort: "تنسيق معماري وخدمات",
  },
  {
    id: "MOMAH-REST-4.7.1-VENT",
    kind: "reference",
    clause: "4.7.1 → كود البناء السعودي",
    page: 26,
    category: "التهوية",
    subject: "نظام التهوية",
    text: "يجب أن يكون تصميم نظام التهوية مطابقاً لكود البناء السعودي.",
    expected: "نظام تهوية للمطبخ مطابق لكود البناء السعودي",
    method:
      "يقرأ المحرك أنظمة التهوية والتكييف (IfcDistributionSystem) ووصلات منافذها من الملف، لكن مطابقتها لكود البناء السعودي تحتاج معدلات تدفق الهواء ومتطلبات الكود التي لم تُطابق بعد.",
    recommendation: "راجع تصميم التهوية مع مهندس ميكانيكا وفق كود البناء السعودي، وأرفق نموذج التهوية (MEP) إن لم يكن في الملف.",
    effort: "استكمال نموذج الميكانيكا",
  },
  {
    id: "MOMAH-REST-4.4.1-ACCESS",
    kind: "reference",
    clause: "4.4.1 → SBC-201",
    page: 23,
    category: "الوصول الشامل",
    subject: "متطلبات الأشخاص ذوي الإعاقة",
    text: "يجب الالتزام بتحقيق متطلبات الأشخاص ذوي الإعاقة طبقاً للفصل (1009) والباب (11) من كود البناء السعودي (SBC-201) وحسب الدليل المبسط لمعايير الوصول الشامل للمنشآت.",
    expected: "مسارات ومداخل وفق SBC-201 الفصل 1009 والباب 11",
    method: "يحتاج تحليل مسارات ومناسيب الموقع، ولم يُفعّل بعد.",
    recommendation: "يُفعّل هذا القياس في مرحلة قادمة من المحرك.",
    effort: "مراجعة مختص",
  },
  {
    id: "MOWAEM-DATA-IFC",
    kind: "platform",
    clause: "فحص جودة بيانات",
    category: "جودة الملف",
    subject: "سلامة ملف IFC",
    text: "فحص من موائم وليس بندًا من الاشتراطات: يُقرأ الملف كاملًا ولكل عنصر معرّف GUID دائم.",
    expected: "ملف مقروء ومعرّفات GUID صالحة",
    method: "قراءة web-ifc وفحص طول GlobalId لكل عنصر.",
    recommendation: "صدّر الملف من برنامج BIM مرة أخرى بإعدادات IFC قياسية.",
    effort: "إعادة تصدير",
  },
  {
    id: "MOWAEM-DATA-FACILITY",
    kind: "platform",
    clause: "فحص جودة بيانات",
    category: "بيانات المنشأة",
    subject: "بيانات المنشأة",
    text: "فحص من موائم وليس بندًا من الاشتراطات: بيانات المنشأة المطلوبة لتطبيق البنود (مثل المساحة الإجمالية في البند 4.8.1) مكتملة.",
    expected: "اسم المشروع والموقع والنشاط والمساحة والطوابق والطاقة",
    method: "بيانات النموذج المدخلة في الخطوة الأولى.",
    recommendation: "أكمل بيانات المنشأة في الخطوة الأولى.",
    effort: "استكمال معلومات",
  },
  {
    id: "MOWAEM-DATA-SPACES",
    kind: "platform",
    clause: "فحص جودة بيانات",
    category: "المساحات",
    subject: "تصنيف المساحات",
    text: "فحص من موائم وليس بندًا من الاشتراطات: كل مساحة في الملف لها اسم يحدد استخدامها، حتى تُطبق عليها البنود.",
    expected: "كل IfcSpace مصنفة من اسمها",
    method: "مطابقة أسماء IfcSpace مع قاموس الاستخدامات.",
    recommendation: "سمّ المساحات غير المصنفة بأسماء واضحة في برنامج BIM.",
    effort: "استكمال معلومات",
  },
];

export const requirementById = new Map(RESTAURANT_REQUIREMENTS.map((r) => [r.id, r]));
