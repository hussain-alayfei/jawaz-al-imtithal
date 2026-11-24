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
    "حاسوب محمول على مكتب هندسي يعرض نموذجًا ثلاثي الأبعاد لمطعم، وبجانبه مخطط معماري مطبوع",
    "شاشة تعرض مقطعًا في مطبخ مطعم مع خط قياس لارتفاع تكسية الجدار",
    "وثيقة اشتراطات مفتوحة بجانب مخطط مطعم عليه ملاحظات بالقلم الأحمر وشريط قياس",
    "شاشة تعرض نموذج مطعم بشبكاته الهندسية الملوّنة، وبجانبها تقرير مطبوع",
  ],
  modelCaption: "صور توضيحية لمراحل الفحص.",
  twinAlt: "مشهد ثلاثي الأبعاد من استوديو التوأم الرقمي تظهر فيه شبكات المبنى بألوانها",
  measured: "يُقاس من الملف",
  notProvable: "لا يمكن التحقق منه من الملف",
  newTab: "، يُفتح في صفحة جديدة",
} as const;
