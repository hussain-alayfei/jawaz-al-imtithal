/* Ready sample files shipped under public/samples. Labels drafted by GPT, facts checked
   against scripts/ifc/build_restaurant_ifc.py and public/samples/external/README.md. */

export type SampleId = "tiles" | "exit95" | "exit75" | "drain" | "duplex";

export interface SampleFile {
  id: SampleId;
  url: string;
  fileName: string;
  label: string;
  note: string;
  /** One line on what the file demonstrates (the home page's «ملفات للتجربة»). */
  about: string;
  /** The file's size in bytes, as shipped under public/ (src/screens/landing/files.test.ts keeps it true). */
  bytes: number;
}

export const SAMPLE_FILES: readonly SampleFile[] = [
  {
    id: "tiles",
    url: "/samples/restaurant/restaurant-kitchen-tiles-1.5m.ifc",
    fileName: "restaurant-kitchen-tiles-1.5m.ifc",
    label: "مطعم بتكسية مطبخ 1.50 م",
    note: "بند واحد غير مطابق",
    about: "تكسية جدران المطبخ بارتفاع 1.50 م، والمطلوب 1.80 م على الأقل (البند 4.5.2).",
    bytes: 882390,
  },
  {
    id: "exit95",
    url: "/samples/restaurant/restaurant-exit-0.95m.ifc",
    fileName: "restaurant-exit-0.95m.ifc",
    label: "مطعم بعرض مخرج 0.95 م",
    note: "مطابق في البنود المقيسة",
    about: "مخرج طوارئ بعرض 0.95 م، والنتيجة مطابقة في البنود التي يمكن قياسها من الملف.",
    bytes: 882557,
  },
  {
    id: "exit75",
    url: "/samples/restaurant/restaurant-exit-0.75m.ifc",
    fileName: "restaurant-exit-0.75m.ifc",
    label: "مطعم بعرض مخرج 0.75 م",
    note: "عرض المخرج غير مطابق",
    about: "مخرج طوارئ بعرض 0.75 م، فيظهر عرض المخرج في النتائج غير مطابق.",
    bytes: 882501,
  },
  {
    id: "drain",
    url: "/samples/restaurant/restaurant-sink-not-drained.ifc",
    fileName: "restaurant-sink-not-drained.ifc",
    label: "مطعم بمغسلة غير موصولة بالصرف",
    note: "البند 4.1.3 غير مطابق",
    about: "مغسلة في المطبخ لا تصل إلى شبكة الصرف الصحي، فيظهر البند 4.1.3 غير مطابق.",
    bytes: 882490,
  },
  {
    id: "duplex",
    url: "/samples/external/Duplex_A_20110907.ifc",
    fileName: "Duplex_A_20110907.ifc",
    label: "دوبلكس من Revit",
    note: "ملف حقيقي من buildingSMART، وليس مطعمًا",
    about: "نموذج شقة من طابقين مُصدَّر من Revit، يبيّن ما يمكن وما لا يمكن التحقق منه في ملف مستقل.",
    bytes: 2380763,
  },
];

export const sampleById = (id: SampleId): SampleFile =>
  SAMPLE_FILES.find((sample) => sample.id === id) ?? SAMPLE_FILES[0];
