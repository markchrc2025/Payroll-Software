/**
 * PAY-166 (Mark, 17 Nov 2026, Q5b): a retroactive salary increase.
 *
 *   T1  an item paid at the old rate, re-priced at the new rate for the same
 *       days: 15,000.00 at 30,000.00 becomes 16,500.00 at 33,000.00, a
 *       difference of 1,500.00; half-up to the centavo (fails on main).
 *   T2  the Corrections page offers it and approves a batch.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { retroDifference } from "@/lib/payroll/retro-pay";

describe("PAY-166 retroactive increase", () => {
  it("T1 re-pricing", () => {
    expect(retroDifference(1500000n, 3000000n, 3300000n)).toBe(150000n);
    expect(retroDifference(100n, 3n, 4n)).toBe(33n);   // 133.33 rounds to 133
    expect(retroDifference(5n, 2n, 3n)).toBe(3n);      // 7.5 rounds up to 8
    expect(retroDifference(0n, 3000000n, 3300000n)).toBe(0n);
    expect(retroDifference(1500000n, 0n, 3300000n)).toBe(0n);
  });

  it("T2 the page", () => {
    const page = readFileSync("src/app/(dashboard)/payroll/corrections/page.tsx", "utf8");
    expect(page).toContain('data-testid="new-retro-pay"');
    expect(page).toContain("/api/payroll/retro-pay");
    expect(page).toContain("Approve batch");
  });
});
