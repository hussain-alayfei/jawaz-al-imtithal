import { describe, expect, it } from "vitest";
import { RESTAURANT_REQUIREMENTS } from "../../ifc/standard/requirements";
import { CLAUSE_ROWS, NOT_PROVABLE, clauseNumber } from "./clauses";

describe("home page clause list", () => {
  it("lists every ministry clause and none of Mowaem's own data checks", () => {
    const ministry = RESTAURANT_REQUIREMENTS.filter((requirement) => requirement.kind !== "platform");
    expect(CLAUSE_ROWS.map((row) => row.id).sort()).toEqual(ministry.map((requirement) => requirement.id).sort());
    expect(CLAUSE_ROWS.some((row) => row.id.startsWith("MOWAEM-"))).toBe(false);
  });

  it("marks only the clauses the file cannot prove", () => {
    for (const id of NOT_PROVABLE) expect(RESTAURANT_REQUIREMENTS.some((requirement) => requirement.id === id)).toBe(true);
    expect(CLAUSE_ROWS.filter((row) => !row.measured).map((row) => row.id).sort()).toEqual([...NOT_PROVABLE].sort());
  });

  it("reads clause numbers the way the results screen does, in document order", () => {
    expect(clauseNumber("4.9.1 → SBC-801")).toBe("4.9.1");
    expect(clauseNumber("4.10.1 (2)")).toBe("4.10.1 (2)");
    expect(clauseNumber("4.7.1 → كود البناء السعودي")).toBe("4.7.1");
    expect(CLAUSE_ROWS[0].number).toBe("3.1");
    expect(CLAUSE_ROWS.at(-1)?.number).toBe("4.10.1 (2)");
  });
});
