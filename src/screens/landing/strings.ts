/* Home page strings that copy.ts does not carry: image descriptions, the model caption and the clause
   legend, in the same formal register as copy.web. Everything a visitor reads as copy comes from copy.web. */
export const HOME = {
  howAlts: [
    "مخطط مطعم مطبوع على مكتب بجوار حاسوب يعرض نموذجه",
    "حاسوب محمول يعرض نموذجًا ثلاثي الأبعاد لمطعم",
    "تقرير فحص مطبوع بجوار جهاز لوحي يعرض نموذج المطعم",
  ],
  /* The story renders are replaced in place, so each description names the step's subject only. */
  modelAlts: [
    "النموذج ثلاثي الأبعاد للمطعم التجريبي كما يُنشأ من ملف المخطط",
    "مقطع في النموذج يُظهر عناصر المبنى من الداخل",
    "جدار المطبخ في النموذج بارتفاع تكسية 1.50 م مقابل الحد الأدنى 1.80 م",
    "شبكات المبنى الهندسية في النموذج مميزة بألوانها",
  ],
  modelCaption: "الصور من النموذج ثلاثي الأبعاد الذي يُنشئه موائم من ملف المطعم التجريبي، ويُعرض محيط المبنى للتوضيح.",
  twinAlt: "مشهد ثلاثي الأبعاد من استوديو التوأم الرقمي تظهر فيه شبكات المبنى بألوانها",
  measured: "يُقاس من الملف",
  notProvable: "لا يمكن التحقق منه من الملف",
  newTab: "، يُفتح في صفحة جديدة",
} as const;
