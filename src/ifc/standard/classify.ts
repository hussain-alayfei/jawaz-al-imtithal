import type { SpaceRole } from "./model";

/*
 * Room roles from the names a designer gives spaces (Name, LongName, ObjectType), in
 * English and Arabic. A space that matches nothing stays unclassified: the engine never
 * guesses a role, and an unclassified space is reported as such.
 */
const ROLE_KEYWORDS: [SpaceRole, string[]][] = [
  ["KITCHEN", ["kitchen", "مطبخ"]],
  ["WC", ["wc", "toilet", "restroom", "bathroom", "lavatory", "دورة مياه", "دورة المياه", "حمام", "دورات المياه"]],
  ["STORAGE", ["storage", "store room", "storeroom", "مخزن", "مستودع"]],
  ["DINING", ["dining", "seating area", "صالة الطعام", "صالة طعام", "منطقة الجلوس", "صالة الجلوس"]],
  ["SERVICE", ["service", "cashier", "خدمة", "الخدمة", "كاشير"]],
];

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "") // Arabic diacritics and tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/\s+/g, " ");
}

function matches(text: string, keyword: string): boolean {
  const t = normalise(text);
  const k = normalise(keyword);
  if (/^[a-z ]+$/.test(k)) {
    return new RegExp(`(^|[^a-z])${k}([^a-z]|$)`).test(t);
  }
  return t.includes(k);
}

export function classifySpace(
  ...labels: (string | undefined)[]
): { role: SpaceRole; matchedOn: string } | undefined {
  for (const [role, keywords] of ROLE_KEYWORDS) {
    for (const label of labels) {
      if (!label?.trim()) continue;
      if (keywords.some((keyword) => matches(label, keyword))) {
        return { role, matchedOn: label.trim() };
      }
    }
  }
  return undefined;
}
