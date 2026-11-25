import type { DeclarationAnswer, DeclarationId, FacilityDeclarations } from "../../data";
import { requirementById } from "../../ifc/standard/requirements";

/*
 * «متطلبات المنشأة»: the visitor's own answers for the clauses a file cannot prove. The clause number and
 * subject come from the requirements (src/ifc/standard/requirements.ts); only the question is written here.
 * The answers are a declaration: they are shown in the summary and the report under «إقرار المستخدم» and never
 * change a clause's status.
 */

export interface DeclarationItem {
  id: DeclarationId;
  requirementId: string;
  /** Clause number only, e.g. "4.7.1" (the requirement's clause may add "→ SBC-201"). */
  clause: string;
  subject: string;
  question: string;
}

const QUESTIONS: { id: DeclarationId; requirementId: string; question: string }[] = [
  {
    id: "facade",
    requirementId: "MOMAH-REST-4.3.2-FACADE",
    question: "هل تُخفى التمديدات ووحدات التكييف الخارجية فلا تظهر على الواجهة أو السطح؟",
  },
  {
    id: "ventilation",
    requirementId: "MOMAH-REST-4.7.1-VENT",
    question: "هل صُمّم نظام تهوية المطبخ وفق كود البناء السعودي؟",
  },
  {
    id: "access",
    requirementId: "MOMAH-REST-4.4.1-ACCESS",
    question: "هل تحقق المداخل والمسارات متطلبات الأشخاص ذوي الإعاقة وفق SBC-201؟",
  },
];

export const DECLARATIONS: readonly DeclarationItem[] = QUESTIONS.map((item) => {
  const requirement = requirementById.get(item.requirementId);
  return {
    ...item,
    clause: requirement ? requirement.clause.split(" ")[0] : "",
    subject: requirement?.subject ?? "",
  };
});

export const ANSWERS: readonly { value: DeclarationAnswer; label: string }[] = [
  { value: "yes", label: "نعم" },
  { value: "no", label: "لا" },
  { value: "unsure", label: "غير متأكد" },
];

export const DECLARATION_TITLE = "إقرار المستخدم";
export const DECLARATION_NOTE = "هذه الإجابات إقرار من المستخدم، ولم يتحقق منها موائم، ولا تُحتسب بنودًا متحققًا منها ولا تغيّر نتيجة أي بند.";
export const NOT_ANSWERED = "لم يُجب";

export function answerLabel(answer: DeclarationAnswer | undefined): string {
  return ANSWERS.find((item) => item.value === answer)?.label ?? NOT_ANSWERED;
}

/** True when every question has an answer (the step's validation). */
export function declarationsComplete(declarations: FacilityDeclarations | undefined): boolean {
  return DECLARATIONS.every((item) => ANSWERS.some((answer) => answer.value === declarations?.[item.id]));
}
