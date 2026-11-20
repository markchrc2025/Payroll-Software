/**
 * PAY-149 (Mark, 16 Nov 2026, HR.my review D2): Pay Components splits into
 * Earning Components and Deduction Components.
 *
 * Deduction Components:
 *  - Mandatory Deductions: SSS, PhilHealth, Pag-IBIG and Withholding Tax. They
 *    are worked out by the payroll engine from the statutory tables Sentire
 *    maintains, so they are shown locked and are not rows a company can edit
 *    or delete.
 *  - Other Deductions: Loan Deduction (the loan types; SSS and Pag-IBIG loans
 *    are government loans and shown locked), the seeded Inventory Deduction
 *    (a loss or damage deduction), and deductions the company adds.
 *
 * This file is safe to import from client components (no server imports).
 */

export const MANDATORY_DEDUCTIONS = [
  { code: "SSS", name: "SSS contribution", basis: "Republic Act No. 11199; SSS contribution schedule" },
  { code: "PHILHEALTH", name: "PhilHealth contribution", basis: "Republic Act No. 11223; PhilHealth premium schedule" },
  { code: "PAGIBIG", name: "Pag-IBIG contribution", basis: "Republic Act No. 9679; HDMF contribution schedule" },
  { code: "WITHHOLDING_TAX", name: "Withholding tax", basis: "NIRC as amended by the TRAIN Law; BIR withholding tax table" },
] as const;

export const LOAN_DEDUCTIONS = [
  { loanType: "SSS", name: "SSS loan", locked: true },
  { loanType: "PAGIBIG", name: "Pag-IBIG loan", locked: true },
  { loanType: "COMPANY", name: "Company loan", locked: false },
  { loanType: "CASH_ADVANCE", name: "Cash advance", locked: false },
] as const;

export const INVENTORY_DEDUCTION_CODE = "INVENTORY_DEDUCTION";

/** The Other Deduction every company starts with. */
export const SEEDED_DEDUCTIONS = [
  { code: INVENTORY_DEDUCTION_CODE, name: "Inventory Deduction", isLossOrDamage: true },
] as const;

export function isDeduction(c: { kind: string }): boolean {
  return c.kind === "DEDUCTION";
}

/** Earnings (every kind but DEDUCTION) and Other Deductions, seeded ones first. */
export function groupPayComponents<T extends { kind: string; isSystem?: boolean; code: string }>(rows: T[]) {
  const earnings = rows.filter((r) => !isDeduction(r));
  const deductions = rows
    .filter(isDeduction)
    .sort((a, b) => Number(!!b.isSystem) - Number(!!a.isSystem) || a.code.localeCompare(b.code));
  return { earnings, deductions };
}
