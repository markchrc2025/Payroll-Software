/**
 * PAY-68 (1.13, Q1b): a correction is a new document, never an edit.
 *
 * The payslip: basic 15,000.00, overtime 1,200.00, lates 500.00, net
 * 12,000.00.
 *
 *   T1  the cumulative guard: corrections together may not take back more of
 *       an item than was paid (fails on main: no corrections).
 *   T2  nor refund more lates than were deducted, nor take net below zero;
 *       OTHER has no item limit, only the net one.
 *   T3  the lines are validated: whole centavos, never zero.
 *   T4  the API routes, the page and the sidebar link.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { correctionLineSchema, guardProblems, type CorrectionLine } from "@/lib/payroll/corrections";

const SHEET = { basePayCents: 1500000n, otPayCents: 120000n, lateUndertimeDeductionCents: 50000n, netPayCents: 1200000n };
const line = (item: CorrectionLine["item"], amountCents: string): CorrectionLine => ({ item, amountCents, taxable: true });

describe("PAY-68 corrections", () => {
  it("T1 never more than was paid, across corrections", () => {
    expect(guardProblems(SHEET, [line("OVERTIME", "-120000")])).toEqual([]);
    expect(guardProblems(SHEET, [line("OVERTIME", "-100000"), line("OVERTIME", "-30000")]))
      .toEqual(["Overtime: corrections take back 1,300.00, but the payslip paid 1,200.00."]);
    expect(guardProblems(SHEET, [line("BASIC", "-1000000"), line("BASIC", "300000"), line("BASIC", "-500000")])).toEqual([]);
    expect(guardProblems(SHEET, [line("HOLIDAY", "-1")])).toEqual(["Holiday pay: corrections take back 0.01, but the payslip paid 0.00."]);
  });

  it("T2 lates and net", () => {
    expect(guardProblems(SHEET, [line("LATES", "50000")])).toEqual([]);
    expect(guardProblems(SHEET, [line("LATES", "50001")])).toEqual(["Lates and undertime: corrections refund 500.01, but only 500.00 was deducted."]);
    expect(guardProblems(SHEET, [line("OTHER", "-1200001")])).toEqual(["Net pay: corrections take back 12,000.01, more than the payslip's net of 12,000.00."]);
    expect(guardProblems(SHEET, [line("OTHER", "-1200000")])).toEqual([]);
  });

  it("T3 lines", () => {
    expect(correctionLineSchema.safeParse({ item: "BASIC", amountCents: "-500" }).success).toBe(true);
    expect(correctionLineSchema.parse({ item: "BASIC", amountCents: "1" }).taxable).toBe(true);
    expect(correctionLineSchema.safeParse({ item: "BASIC", amountCents: "0" }).success).toBe(false);
    expect(correctionLineSchema.safeParse({ item: "BASIC", amountCents: "1.5" }).success).toBe(false);
    expect(correctionLineSchema.safeParse({ item: "BONUS", amountCents: "1" }).success).toBe(false);
  });

  it("T4 routes, page, link", () => {
    for (const a of ["approve", "land", "cancel"]) expect(existsSync(`src/app/api/payroll/corrections/[id]/${a}/route.ts`)).toBe(true);
    expect(readFileSync("src/app/api/payroll/corrections/[id]/approve/route.ts", "utf8")).toContain('forbidUnless(auth, ["PAYROLL", "APPROVE"])');
    expect(readFileSync("src/app/(dashboard)/payroll/corrections/page.tsx", "utf8")).toContain("/api/payroll/corrections");
    expect(readFileSync("src/components/sidebar-nav.tsx", "utf8")).toContain('{ href: "/payroll/corrections", label: "Corrections"');
  });
});
