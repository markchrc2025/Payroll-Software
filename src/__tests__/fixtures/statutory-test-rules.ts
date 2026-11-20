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
import { buildSSS2026 } from "@/lib/statutory/baseline-2026";

// PAY-65: the real 2026 table, from the one place it is written down.
function buildSSSTable(): SssSchedulePayload {
  return buildSSS2026();
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
