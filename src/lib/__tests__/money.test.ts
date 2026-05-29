/**
 * §1 — Money / Centavo Module Tests
 *
 * Source: Engine_Test_Spec.md §1
 *
 * All expected values are formula-derived; none come from engine output.
 * Rounding policy: ROUND HALF UP to the centavo (per blueprint §4 / money.ts).
 * All monetary assertions are in BigInt centavos.
 */
import { describe, expect, it } from "vitest";
import {
  centavosToJson,
  formatCentavos,
  fromCentavos,
  multiply,
  roundHalfUp,
  split,
  toCentavos,
} from "@/lib/money";

// ---------------------------------------------------------------------------
// §1 — Rounding (roundHalfUp)
// ---------------------------------------------------------------------------
describe("roundHalfUp", () => {
  it("rounds 137930.5 → 137931 (half-up, not half-even)", () => {
    // 1379.305 pesos × 100 = 137930.5 centavos → HALF-UP = 137931
    // Source: Engine_Test_Spec.md §1 row 1
    expect(roundHalfUp(137930.5)).toBe(137931n);
  });

  it("rounds 137930.4 → 137930 (below half, rounds down)", () => {
    // 1379.304 pesos × 100 = 137930.4 centavos → 137930
    // Source: Engine_Test_Spec.md §1 row 2
    expect(roundHalfUp(137930.4)).toBe(137930n);
  });

  it("rounds 0.5 → 1 (half-up boundary — the ₱0.005 case)", () => {
    // 0.005 pesos × 100 = 0.5 centavos → HALF-UP = 1
    // Source: Engine_Test_Spec.md §1 row 3
    expect(roundHalfUp(0.5)).toBe(1n);
  });

  it("rounds 0.4 → 0 (below half boundary)", () => {
    expect(roundHalfUp(0.4)).toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// §1 — toCentavos (boundary/string path)
// ---------------------------------------------------------------------------
describe("toCentavos", () => {
  it("converts integer peso string to centavos", () => {
    expect(toCentavos("100")).toBe(10_000n);
  });

  it("converts decimal peso string to centavos", () => {
    expect(toCentavos("1379.31")).toBe(137_931n);
  });

  it("converts number pesos to centavos (number path, rounds half-up)", () => {
    // ₱1,379.305 as number: Math.round(1379.305 * 100) = Math.round(137930.5) = 137931
    // Source: Engine_Test_Spec.md §1 row 1
    expect(toCentavos(1379.305)).toBe(137_931n);
  });

  it("converts ₱0.005 number to 1 centavo (half-up boundary)", () => {
    // Source: Engine_Test_Spec.md §1 row 3
    expect(toCentavos(0.005)).toBe(1n);
  });

  it("throws on non-numeric string", () => {
    expect(() => toCentavos("abc")).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// §1 — multiply (rate application)
// ---------------------------------------------------------------------------
describe("multiply", () => {
  it("₱10,000 × 0.05 = ₱500.00 (formula: multiply by rate)", () => {
    // Source: Engine_Test_Spec.md §1 — Multiply by rate row
    // 1_000_000 centavos × 0.05 = 50_000 centavos = ₱500.00
    expect(multiply(1_000_000n, 0.05)).toBe(50_000n);
  });

  it("multiply result is deterministic (idempotent)", () => {
    const a = multiply(3_000_000n, 0.05);
    const b = multiply(3_000_000n, 0.05);
    expect(a).toBe(b);
  });

  it("multiply with 0 rate returns 0", () => {
    expect(multiply(9_999_999n, 0)).toBe(0n);
  });

  it("multiply with 1 rate returns same amount", () => {
    expect(multiply(12_345n, 1)).toBe(12_345n);
  });

  it("rounds half-up on fractional centavo result", () => {
    // 3 centavos × (1/3) = 1.0 exactly
    expect(multiply(300n, 1 / 3)).toBe(100n); // Math.round(100) = 100
  });
});

// ---------------------------------------------------------------------------
// §1 — split (equal shares, residual to first share)
// ---------------------------------------------------------------------------
describe("split", () => {
  it("splits even amount into 2 equal shares", () => {
    // Source: Engine_Test_Spec.md §1 — Split equal shares (even)
    // ₱100.00 = 10_000n into 2 → [5_000n, 5_000n]
    const shares = split(10_000n, 2);
    expect(shares).toEqual([5_000n, 5_000n]);
  });

  it("splits odd centavo into 2 shares — residual to first share", () => {
    // Source: Engine_Test_Spec.md §1 — Split equal shares (odd centavo)
    // ₱100.01 = 10_001n into 2 → [5_001n, 5_000n]
    // The first share receives the residual centavo.
    const shares = split(10_001n, 2);
    expect(shares).toEqual([5_001n, 5_000n]);
  });

  it("invariant: shares sum exactly to input (no centavo created or lost) — even", () => {
    const total = 99_999n;
    const shares = split(total, 3);
    const sum = shares.reduce((a, b) => a + b, 0n);
    expect(sum).toBe(total);
  });

  it("invariant: shares sum exactly to input — odd residual", () => {
    const total = 100_001n;
    const shares = split(total, 3);
    const sum = shares.reduce((a, b) => a + b, 0n);
    expect(sum).toBe(total);
  });

  it("splits into n=1 returns original amount", () => {
    expect(split(12_345n, 1)).toEqual([12_345n]);
  });

  it("throws on n=0", () => {
    expect(() => split(1_000n, 0)).toThrow(RangeError);
  });

  it("splits zero amount into equal zero shares", () => {
    const shares = split(0n, 3);
    expect(shares).toEqual([0n, 0n, 0n]);
    expect(shares.reduce((a, b) => a + b, 0n)).toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// §1 — fromCentavos / formatCentavos / centavosToJson (boundary)
// ---------------------------------------------------------------------------
describe("fromCentavos", () => {
  it("converts centavos back to peso number", () => {
    expect(fromCentavos(137_931n)).toBeCloseTo(1379.31, 5);
  });
});

describe("formatCentavos", () => {
  it("formats with thousand-separator and 2 decimal places", () => {
    expect(formatCentavos(3_000_000n)).toBe("30,000.00");
  });

  it("formats with peso symbol when requested", () => {
    expect(formatCentavos(50_000n, { withSymbol: true })).toBe("₱500.00");
  });

  it("formats zero", () => {
    expect(formatCentavos(0n)).toBe("0.00");
  });
});

describe("centavosToJson", () => {
  it("serialises BigInt as string", () => {
    expect(centavosToJson(3_000_000n)).toBe("3000000");
  });

  it("returns null for null", () => {
    expect(centavosToJson(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(centavosToJson(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §11 invariant: every monetary field is BigInt (no floats at rest)
// ---------------------------------------------------------------------------
describe("money module — BigInt-only invariant", () => {
  it("toCentavos always returns BigInt", () => {
    expect(typeof toCentavos(30000)).toBe("bigint");
    expect(typeof toCentavos("30000.00")).toBe("bigint");
  });

  it("multiply always returns BigInt", () => {
    expect(typeof multiply(1_000_000n, 0.05)).toBe("bigint");
  });

  it("split always returns BigInt[]", () => {
    const shares = split(10_000n, 2);
    shares.forEach((s) => expect(typeof s).toBe("bigint"));
  });

  it("roundHalfUp always returns BigInt", () => {
    expect(typeof roundHalfUp(137930.5)).toBe("bigint");
  });
});
