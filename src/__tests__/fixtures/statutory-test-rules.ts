/**
 * Statutory rule payloads for tests: the same shapes as engine.test.ts builds
 * (an SSS table in ₱500 steps to ₱35,000, PhilHealth 5%, Pag-IBIG to a
 * ₱10,000 fund salary, a simple BIR table). Not real rates; shapes only.
 */
import type {
  BirWithholdingPayload,
  DeMinimisCeilingPayload,
  MinimumWagePayload,
  PagibigSchedulePayload,
  PhilHealthSchedulePayload,
  SssSchedulePayload,
} from "@/lib/statutory/types";

function buildSSSTable(): SssSchedulePayload {
  const rows = [];
  for (let msc = 500_000; msc <= 3_500_000; msc += 50_000) {
    const n = (msc - 500_000) / 50_000;
    const isLast = msc === 3_500_000;
    const regularBase = Math.min(msc, 2_000_000);
    const mpfBase = Math.max(0, msc - 2_000_000);
    const regularSSEmployer = Math.round(regularBase * 0.1);
    const regularSSEmployee = Math.round(regularBase * 0.05);
    const ecEmployer = msc > 1_475_000 ? 3_000 : 1_000;
    const mpfEmployer = Math.round(mpfBase * 0.1);
    const mpfEmployee = Math.round(mpfBase * 0.05);
    rows.push({
      compensationFrom: n === 0 ? 0 : 475_000 + n * 50_000,
      compensationTo: isLast ? 99_999_999 : 500_000 + n * 50_000 + 25_000 - 1,
      msc,
      regularSSEmployer, regularSSEmployee, regularSSTotal: regularSSEmployer + regularSSEmployee,
      ecEmployer, mpfEmployer, mpfEmployee, mpfTotal: mpfEmployer + mpfEmployee,
      totalEmployer: regularSSEmployer + ecEmployer + mpfEmployer,
      totalEmployee: regularSSEmployee + mpfEmployee,
      totalTotal: regularSSEmployer + ecEmployer + mpfEmployer + regularSSEmployee + mpfEmployee,
    });
  }
  return { rows };
}
export const SSS: SssSchedulePayload = buildSSSTable();
export const PHIC: PhilHealthSchedulePayload = {
  rate: 0.05, split: { ee: 0.5, er: 0.5 },
  msc: { floor: 1_000_000, ceiling: 10_000_000 }, premium: { min: 50_000, max: 500_000 },
};
export const PAGIBIG: PagibigSchedulePayload = {
  mfsCap: 1_000_000,
  brackets: [{ upTo: 150_000, eeRate: 0.01, erRate: 0.02 }, { upTo: null, eeRate: 0.02, erRate: 0.02 }],
};
export const BIR: BirWithholdingPayload = {
  frequencies: {
    WEEKLY: [{ floor: 0, fixedTax: 0, plusRate: 0 }, { floor: 480_800, fixedTax: 0, plusRate: 0.15 }],
    SEMI_MONTHLY: [{ floor: 0, fixedTax: 0, plusRate: 0 }, { floor: 1_041_700, fixedTax: 0, plusRate: 0.15 }],
    MONTHLY: [{ floor: 0, fixedTax: 0, plusRate: 0 }, { floor: 2_083_300, fixedTax: 0, plusRate: 0.15 }],
  },
};
export const MIN_WAGE: MinimumWagePayload = { regions: { NCR: { label: "NCR", dailyRate: 61_000, basis: "test" } } };
export const DE_MINIMIS: DeMinimisCeilingPayload = { items: [] };
