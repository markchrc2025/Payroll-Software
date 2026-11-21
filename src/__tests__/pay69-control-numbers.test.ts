/**
 * PAY-69 (Q3b, Mark 17 Nov 2026): document control numbers on runs and
 * payslips, gapless per company, document type and year.
 *
 *   T1  the formats: PR-YYYY-NNNN for a run, PS-YYYY-NNNNNN for a payslip
 *       (fails on main: no control numbers).
 *   T2  the run page shows the run's number; the payslip's Reference is its
 *       number once issued.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatControlNumber } from "@/lib/payroll/control-numbers";

describe("PAY-69 control numbers", () => {
  it("T1 formats", () => {
    expect(formatControlNumber("PAYROLL_RUN", 2026, 1)).toBe("PR-2026-0001");
    expect(formatControlNumber("PAYROLL_RUN", 2026, 12345)).toBe("PR-2026-12345");
    expect(formatControlNumber("PAYSLIP", 2027, 42)).toBe("PS-2027-000042");
  });

  it("T2 shown on the run page and the payslip", () => {
    expect(readFileSync("src/app/(dashboard)/payroll/[id]/page.tsx", "utf8")).toContain('data-testid="run-control-number"');
    expect(readFileSync("src/lib/payslip/pdf-data.ts", "utf8")).toContain("reference: sheet.controlNumber ??");
  });
});
