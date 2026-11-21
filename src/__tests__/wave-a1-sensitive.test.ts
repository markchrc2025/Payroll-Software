/**
 * Wave A1 (PAY-208, decision 5): ethnicity and religion.
 *
 *   T1  the record is blanked for a role without SENSITIVE_DATA:READ, all four
 *       fields (the spouse's too), and marked so the form can say why
 *       (fails on main: no src/lib/employees/sensitive.ts).
 *   T2  never used in pay: no payroll, payslip, report or export source reads
 *       them.
 *   T3  the roles screen offers the new permission module.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/authz/route-permission", () => ({ holdsAny: vi.fn() }));
vi.mock("@/lib/lookups/store", () => ({ listItems: vi.fn() }));
import { redactSensitive, SENSITIVE_FIELDS } from "@/lib/employees/sensitive";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe("Wave A1 sensitive personal information", () => {
  it("T1 blanked without the permission", () => {
    const row = { id: "e1", firstName: "Ana", ethnicity: "Ilocano", religion: "Islam", spouseEthnicity: "Tagalog", spouseReligion: "Roman Catholic" };
    expect(redactSensitive(row, { read: false, write: false })).toEqual({ id: "e1", firstName: "Ana", ethnicity: null, religion: null, spouseEthnicity: null, spouseReligion: null, sensitiveHidden: true });
    expect(redactSensitive(row, { read: true, write: false })).toEqual({ ...row, sensitiveHidden: false });
    expect([...SENSITIVE_FIELDS]).toEqual(["ethnicity", "religion", "spouseEthnicity", "spouseReligion"]);
  });

  it("T2 never used in pay", () => {
    const sources = [
      ...files("src/lib/payroll"), ...files("src/lib/payslip"),
      "src/app/api/employees/export/route.ts",
    ];
    const readers = sources.filter((f) => /\b(ethnicity|religion|spouseEthnicity|spouseReligion)\b/i.test(readFileSync(f, "utf8")));
    expect(readers).toEqual([]);
  });

  it("T3 the roles screen offers the module", () => {
    const page = readFileSync("src/app/(dashboard)/settings/roles/page.tsx", "utf8");
    expect(page).toContain('SENSITIVE_DATA: "Ethnicity & Religion (sensitive)"');
  });
});
