/**
 * PAY-136 (found in unit 1.8): "hireApplicantSchema (unused) offers HOURLY and
 * no WEEKLY; EmployeeForm.tsx is dead code with an HOURLY option. SalaryType
 * has no HOURLY. Delete or align."
 *
 *   T1  no application code names an HOURLY salary type (fails on main).
 *   T2  the dead form and the unused schema are gone.
 *   T3  the Employees list labels a weekly salary "Weekly".
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" || name === "generated" ? [] : sources(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe("PAY-136 the dead HOURLY salary type", () => {
  it("T1 no application code names an HOURLY salary type", () => {
    const hits = sources("src").filter((p) => /\bHOURLY\b/.test(readFileSync(p, "utf8")));
    expect(hits).toEqual([]);
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(schema.slice(schema.indexOf("enum SalaryType"), schema.indexOf("enum SalaryType") + 80)).not.toContain("HOURLY");
  });

  it("T2 the dead form and the unused schema are gone", () => {
    expect(existsSync("src/components/employees/EmployeeForm.tsx")).toBe(false);
    expect(readFileSync("src/lib/validations/ats.ts", "utf8")).not.toContain("hireApplicantSchema");
  });

  it("T3 a weekly salary is labelled Weekly", () => {
    const columns = readFileSync("src/components/employees/columns.tsx", "utf8");
    expect(columns).toContain('WEEKLY: "Weekly"');
  });
});
