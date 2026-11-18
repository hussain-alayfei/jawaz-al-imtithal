/* Ready sample files shipped under public/samples. Labels drafted by GPT, facts checked
   against scripts/ifc/build_restaurant_ifc.py and public/samples/external/README.md. */

export type SampleId = "tiles" | "exit95" | "exit75" | "drain" | "duplex";

export interface SampleFile {
  id: SampleId;
  url: string;
  fileName: string;
  label: string;
  note: string;
}

export const SAMPLE_FILES: readonly SampleFile[] = [
  {
    id: "tiles",
    url: "/samples/restaurant/restaurant-kitchen-tiles-1.5m.ifc",
    fileName: "restaurant-kitchen-tiles-1.5m.ifc",
    label: "مطعم بتكسية مطبخ 1.50 م",
    note: "بند واحد غير مطابق",
  },
  {
    id: "exit95",
    url: "/samples/restaurant/restaurant-exit-0.95m.ifc",
    fileName: "restaurant-exit-0.95m.ifc",
    label: "مطعم بعرض مخرج 0.95 م",
    note: "مطابق في البنود المقيسة",
  },
  {
    id: "exit75",
    url: "/samples/restaurant/restaurant-exit-0.75m.ifc",
    fileName: "restaurant-exit-0.75m.ifc",
    label: "مطعم بعرض مخرج 0.75 م",
    note: "عرض المخرج غير مطابق",
  },
  {
    id: "drain",
    url: "/samples/restaurant/restaurant-sink-not-drained.ifc",
    fileName: "restaurant-sink-not-drained.ifc",
    label: "مطعم بمغسلة غير موصولة بالصرف",
    note: "البند 4.1.3 غير مطابق",
  },
  {
    id: "duplex",
    url: "/samples/external/Duplex_A_20110907.ifc",
    fileName: "Duplex_A_20110907.ifc",
    label: "دوبلكس من Revit",
    note: "ملف حقيقي من buildingSMART، وليس مطعمًا",
  },
];

export const sampleById = (id: SampleId): SampleFile =>
  SAMPLE_FILES.find((sample) => sample.id === id) ?? SAMPLE_FILES[0];
