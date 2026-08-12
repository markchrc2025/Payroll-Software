/**
 * Unit 0.17 T3 — a DELIBERATELY failing test.
 *
 * Proves a genuinely broken PR is blocked by CI. This file is never merged;
 * it exists only to turn one CI run red on a scratch branch.
 */
import { describe, expect, it } from "vitest";

describe("u0.17 T3 — deliberate failure", () => {
  it("fails on purpose so CI must go red", () => {
    const netPay = 26_835_55n; // centavos
    // Wrong on purpose: a payroll bug of exactly one centavo.
    expect(netPay).toBe(26_835_56n);
  });
});
