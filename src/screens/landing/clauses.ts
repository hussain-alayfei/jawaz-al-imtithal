import { RESTAURANT_REQUIREMENTS } from "../../ifc/standard/requirements";

/* Clauses an architectural IFC file cannot prove (they show as «لا يمكن التحقق من الملف» in the
   results); every other requirement clause is measured from the file. */
export const NOT_PROVABLE = new Set(["MOMAH-REST-4.3.2-FACADE", "MOMAH-REST-4.7.1-VENT", "MOMAH-REST-4.4.1-ACCESS"]);

export interface ClauseRow {
  id: string;
  number: string;
  subject: string;
  /** False for the clauses the file cannot prove. */
  measured: boolean;
}

/** Same reading as the results screen (results/findings.ts clauseOf): "4.9.1 → SBC-801" is 4.9.1,
    "4.10.1 (2)" keeps its item number so the rows match the results register. */
export function clauseNumber(clause: string): string {
  return /^\d+(?:\.\d+)*(?:\s*\(\d+\))?/.exec(clause)?.[0] ?? clause;
}

function byClauseNumber(a: ClauseRow, b: ClauseRow): number {
  const left = (a.number.match(/\d+/g) ?? []).map(Number);
  const right = (b.number.match(/\d+/g) ?? []).map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/** The ministry clauses (Mowaem's own data checks left out), in document order. */
export const CLAUSE_ROWS: readonly ClauseRow[] = RESTAURANT_REQUIREMENTS.filter(
  (requirement) => requirement.kind !== "platform",
)
  .map((requirement) => ({
    id: requirement.id,
    number: clauseNumber(requirement.clause),
    subject: requirement.subject,
    measured: !NOT_PROVABLE.has(requirement.id),
  }))
  .sort(byClauseNumber);
