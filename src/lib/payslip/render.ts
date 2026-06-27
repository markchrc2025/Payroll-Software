/**
 * Phase D4 — Pure payslip renderer.
 *
 * `renderPayslip(input)` is a pure function: no DB access, no side effects.
 * It transforms a PayrollSheet + contextual metadata into a structured JSON
 * object (`Payslip`) that can be returned from the API directly or used as
 * the basis for a future PDF/HTML template.
 *
 * Schema version: "v1" — if the shape changes in a non-additive way, bump to "v2".
 */
import type { PayFrequency, PayrollRunType, PayrollSheet, TaxClassification } from "@prisma/client";
import { centavosToJson } from "@/lib/money";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface PayslipEmployeeData {
  id: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  taxClassification: TaxClassification;
  department: string | null;
  branch: string | null;
  position: string | null;
}

export interface RenderPayslipInput {
  sheet: PayrollSheet;
  employee: PayslipEmployeeData;
  periodStart: Date;
  periodEnd: Date;
  cycle: PayFrequency;
  runType: PayrollRunType;
  tenantId: string;
  tenantName: string;
}

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export interface Payslip {
  version: "v1";
  generatedAt: string; // ISO datetime
  period: {
    start: string;
    end: string;
    cycle: PayFrequency;
    runType: PayrollRunType;
  };
  employee: {
    id: string;
    employeeNumber: string;
    name: string; // "LastName, FirstName MI."
    taxClassification: TaxClassification;
    department: string | null;
    branch: string | null;
    position: string | null;
  };
  tenant: {
    id: string;
    name: string;
  };
  /** All monetary amounts in centavos serialised as string (centavosToJson). */
  earnings: {
    basePay: string;
    lateUndertimeDeduction: string; // shown as deduction (positive value)
    otPay: string;
    nsdPay: string;
    holidayPay: string;
    restDayPay: string;
    hazardPay: string;
    taxableAllowances: string;
    grossCompensation: string;
  };
  nonTaxable: {
    mweExemptCompensation: string;
    nontaxableBasic: string;
    nontaxableCompensation: string;
    nontaxable13MonthAndBenefits: string;
    nontaxableAdditions: string;
  };
  statutory: {
    sssEe: string;
    sssEr: string;
    sssEc: string;
    philhealthEe: string;
    philhealthEr: string;
    pagibigEe: string;
    pagibigEr: string;
  };
  tax: {
    grossTaxableIncome: string;
    withholdingTax: string;
  };
  loans: {
    loanDeductions: string;
    /** Installment deferred this period by the net-pay floor (carried forward). */
    loanDeferred: string;
  };
  net: {
    netPay: string;
  };
  /** Frozen computation parameters for auditability. */
  snapshots: {
    payFrequency: PayFrequency;
    salaryType: string;
    basicSalaryCents: string;
    workingDaysDenominator: number;
    statutoryDeducted: boolean;
    region: string | null;
  };
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

/**
 * Formats an employee's display name as "LastName, FirstName [M.][Suffix]".
 * Middle name is abbreviated to initial if present.
 */
function formatName(emp: PayslipEmployeeData): string {
  const mi = emp.middleName ? ` ${emp.middleName.charAt(0).toUpperCase()}.` : "";
  const sfx = emp.suffix ? `, ${emp.suffix}` : "";
  return `${emp.lastName}, ${emp.firstName}${mi}${sfx}`;
}

/** Serialize BigInt field — callers use this shape throughout the API. */
function c(v: bigint): string {
  return centavosToJson(v)!;
}

export function renderPayslip(input: RenderPayslipInput): Payslip {
  const { sheet, employee, periodStart, periodEnd, cycle, runType, tenantId, tenantName } = input;

  return {
    version: "v1",
    generatedAt: new Date().toISOString(),
    period: {
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
      cycle,
      runType,
    },
    employee: {
      id: employee.id,
      employeeNumber: employee.employeeNumber,
      name: formatName(employee),
      taxClassification: employee.taxClassification,
      department: employee.department,
      branch: employee.branch,
      position: employee.position,
    },
    tenant: {
      id: tenantId,
      name: tenantName,
    },
    earnings: {
      basePay: c(sheet.basePayCents),
      lateUndertimeDeduction: c(sheet.lateUndertimeDeductionCents),
      otPay: c(sheet.otPayCents),
      nsdPay: c(sheet.nsdPayCents),
      holidayPay: c(sheet.holidayPayCents),
      restDayPay: c(sheet.restDayPayCents),
      hazardPay: c(sheet.hazardPayCents),
      taxableAllowances: c(sheet.taxableAllowancesCents),
      grossCompensation: c(sheet.grossCompensationCents),
    },
    nonTaxable: {
      mweExemptCompensation: c(sheet.mweExemptCompensationCents),
      nontaxableBasic: c(sheet.nontaxableBasicCents),
      nontaxableCompensation: c(sheet.nontaxableCompensationCents),
      nontaxable13MonthAndBenefits: c(sheet.nontaxable13MonthAndBenefitsCents),
      nontaxableAdditions: c(sheet.nontaxableAdditionsCents),
    },
    statutory: {
      sssEe: c(sheet.sssEeCents),
      sssEr: c(sheet.sssErCents),
      sssEc: c(sheet.sssEcCents),
      philhealthEe: c(sheet.philhealthEeCents),
      philhealthEr: c(sheet.philhealthErCents),
      pagibigEe: c(sheet.pagibigEeCents),
      pagibigEr: c(sheet.pagibigErCents),
    },
    tax: {
      grossTaxableIncome: c(sheet.grossTaxableIncomeCents),
      withholdingTax: c(sheet.withholdingTaxCents),
    },
    loans: {
      loanDeductions: c(sheet.loanDeductionsCents),
      loanDeferred: c(sheet.loanDeferredCents),
    },
    net: {
      netPay: c(sheet.netPayCents),
    },
    snapshots: {
      payFrequency: sheet.payFrequencySnapshot,
      salaryType: sheet.salaryTypeSnapshot,
      basicSalaryCents: c(sheet.basicSalaryCentsSnapshot),
      workingDaysDenominator: sheet.workingDaysDenominatorSnapshot,
      statutoryDeducted: sheet.statutoryDeductedSnapshot,
      region: sheet.regionSnapshot,
    },
  };
}
