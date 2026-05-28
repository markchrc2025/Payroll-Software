# Sentire Payroll — Engine Test Specification

**Companion to `Master_Blueprint.md`. This document specifies the regression test suite for the payroll computation engine (Blueprint §4). It is a source of truth for the AI coding tool: build tests to this spec. The engine must not produce any real payroll output until it passes this suite.**

This is the "post-engine" regression net referenced in the build sequence — written *alongside* the engine, never lagging a phase behind it.

---

## 0. Non-Negotiable Testing Principles

1. **No self-referential tests.** A test's expected value is **never** produced by running the engine and capturing its output. Doing so makes the test pass by construction even when the engine is wrong. Every expected value is derived independently of the engine code.
2. **Two sources of expected values, only these two:**
   - **Formula-derived:** computed directly from the formulas and multipliers in this spec (arithmetic that does not depend on a statutory lookup table). These values are given exactly below.
   - **Accountant-supplied:** for any value that depends on a statutory lookup table (SSS MSC brackets, BIR withholding tables, de minimis category ceilings), the expected number is **computed by hand from the official seeded table by the accountant and pasted into the test as a literal constant with a comment citing the source row.** The AI tool must NOT generate these from memory or from the engine.
3. **Golden cases, not smoke tests.** Each test asserts an exact expected amount (in centavos), not merely "returns a number" or "does not throw."
4. **Integer centavos everywhere.** All monetary assertions are in integer centavos. A test fails if any monetary value is a floating-point number at rest.
5. **Determinism & effective-dating.** Re-running the same inputs yields byte-identical output. A computation for a past period uses that period's effective-dated tables regardless of the current system date.
6. **Tests travel with the engine.** Each engine module ships with its tests in the same change. CI blocks merge on any failing or missing-coverage engine test.

**Framework:** Vitest. **Assumed rounding policy:** round half up to the centavo (the policy set in the `src/lib/money/` module, Blueprint §4). If a different mode is chosen, the rounded expected values below shift accordingly; the unrounded arithmetic does not.

---

## 1. Money / Centavo Module (Blueprint §4, `src/lib/money/`)

All values are centavos (integers). Test the primitives in isolation before any engine logic.

| Operation | Input | Expected (round half up) |
|---|---|---|
| Round half up | 1379.305 | 1379.31 |
| Round half up | 1379.304 | 1379.30 |
| Round half down boundary | 0.005 | 0.01 |
| Multiply by rate | 10000 × 0.05 | 500.00 |
| Divide | 360000 / 261 | 1379.31 (rounded) / store unrounded only if policy is "carry precision" |
| Split equal shares (even) | 100.00 into 2 | [50.00, 50.00] |
| Split equal shares (odd centavo) | 100.01 into 2 | [50.01, 50.00] (document which share takes the residual) |

**Invariants:** for any split, the parts sum exactly to the input (no centavo created or lost). For any multiply-then-round, the result is deterministic.

---

## 2. Salary Type Conversions (Blueprint §4.1)

Formula-derived; exact.

| Case | Input | Formula | Expected |
|---|---|---|---|
| Monthly → daily | ₱30,000/mo, denom 261 | (30000×12)/261 | ₱1,379.31 (rounded) |
| Daily → hourly | daily ₱1,379.31, 8 hrs | daily/8 | ₱172.41 (rounded) |
| Daily-paid gross | daily ₱1,000, 11 days | rate × days | ₱11,000.00 |

**Decision under test:** whether intermediate rates are rounded or carried at full precision until final pay. The chosen behavior must be consistent and asserted (pick one and lock it in the money module).

---

## 3. Tardiness / Undertime (Blueprint §4.1)

Formula-derived; exact. Using hourly ₱172.41.

| Case | Input | Formula | Expected |
|---|---|---|---|
| Late 30 min | 30 min | (172.41/60)×30 | ₱86.21 (rounded) |
| Undertime 90 min | 90 min | (172.41/60)×90 | ₱258.62 (rounded) |
| Zero | 0 min | — | ₱0.00 |

---

## 4. Premium Stacking Matrix (Blueprint §4.3) — CORE

This is the highest-risk area. Test **per hour** against a clean base hourly rate of **₱100.00**, then test multi-hour and decomposition. All multipliers compose: day-type factor, then OT factor, then ×1.10 for night-window hours.

| Condition | Composed factor | Expected pay / hr (base ₱100) |
|---|---|---|
| Regular work OT | 1.25 | 125.00 |
| Regular hour, night (NSD) | 1.10 | 110.00 |
| Regular OT, night | 1.25 × 1.10 = 1.375 | 137.50 |
| Rest day worked | 1.30 | 130.00 |
| Rest day, night | 1.30 × 1.10 = 1.43 | 143.00 |
| Rest day OT | 1.69 | 169.00 |
| Rest day OT, night | 1.69 × 1.10 = 1.859 | 185.90 |
| Special Non-Working Holiday worked | 1.30 | 130.00 |
| Special Holiday OT | 1.69 | 169.00 |
| Regular Holiday worked | 2.00 | 200.00 |
| Regular Holiday, night | 2.00 × 1.10 = 2.20 | 220.00 |
| Regular Holiday OT | 2.60 | 260.00 |
| Regular Holiday OT, night | 2.60 × 1.10 = 2.86 | 286.00 |
| Regular Holiday on rest day, worked | 2.60 | 260.00 |
| Double Holiday worked | 3.00 | 300.00 |

**Additional cases:**
- **Cross-midnight shift:** a shift spanning 22:00–06:00 must attribute the in-window hours to NSD and split correctly across the date boundary (Blueprint §2.4 `crosses_midnight`).
- **Holiday, no work (Regular Holiday):** employee with no log on a Regular Holiday receives 100% holiday pay (1.00 × daily rate), distinct from the "worked" 2.00 case (Blueprint §6.9).
- **Decomposition invariant:** for any hour, `base_portion + ot_pay + nsd_pay + holiday_pay` (as allocated by the engine) must equal the composed per-hour total above. The allocation rule must be documented and asserted.

---

## 5. 13th-Month Pay (Blueprint §4.4)

Formula-derived; exact. Strict DOLE basis (Basic Pay).

| Case | Input | Formula | Expected |
|---|---|---|---|
| Full year | total basic ₱360,000 | /12 | ₱30,000.00 |
| With unpaid absences | total basic ₱350,000 | /12 | ₱29,166.67 (rounded) |
| Mid-year hire (proration is inherent) | total basic ₱150,000 | /12 | ₱12,500.00 |

**Assertion:** OT, premium pay, and allowances are excluded from the basis under Strict DOLE. A case with OT/allowances present must yield the same 13th month as the equivalent case without them.

---

## 6. Statutory Contributions (Blueprint §3, §4.6)

### 6.1 PhilHealth — formula-derived; exact (5%, split 2.5/2.5, floor ₱10,000, ceiling ₱100,000, min ₱500, max ₱5,000)

| Basic salary | Premium | EE share | ER share |
|---|---|---|---|
| ₱8,000 (below floor) | 500.00 | 250.00 | 250.00 |
| ₱10,000 (at floor) | 500.00 | 250.00 | 250.00 |
| ₱30,000 | 1,500.00 | 750.00 | 750.00 |
| ₱100,000 (at ceiling) | 5,000.00 | 2,500.00 | 2,500.00 |
| ₱150,000 (above ceiling) | 5,000.00 | 2,500.00 | 2,500.00 |

### 6.2 Pag-IBIG — formula-derived; exact (2%/2%, MFS cap ₱10,000, EE 1% if ≤₱1,500)

| Compensation | EE share | ER share |
|---|---|---|
| ₱1,500 (1% threshold) | 15.00 | 30.00 |
| ₱1,501 | 30.02 | 30.02 |
| ₱5,000 | 100.00 | 100.00 |
| ₱10,000 (at cap) | 200.00 | 200.00 |
| ₱30,000 (above cap) | 200.00 | 200.00 |

### 6.3 SSS — structure tested by formula; bracket values accountant-supplied
SSS is a bracketed MSC table with an MPF component above MSC ₱20,000 and an employer EC charge. The salary→MSC lookup is **not** reproduced here.
- **Structure assertions (formula):** EE share = 5% × MSC; ER regular share = 10% × MSC; EC = ₱10 if MSC < ₱15,000 else ₱30; for MSC > ₱20,000 the contribution allocates an MPF portion while total remains 15% × MSC.
- **Bracket cases (accountant-supplied):** for at least these MSC points — floor (₱5,000), a mid bracket, the MPF boundary (₱20,000), and the ceiling (₱35,000) — paste the exact EE, ER, EC, and MPF figures **from the official SSS 2026 schedule** as literal constants, each with a comment citing the schedule row. Do not derive from memory or from engine output.

### 6.4 Cutoff timing
With `payroll_cycle = semi_monthly` and `statutory_cutoff_rule = second_cutoff`, the full monthly contribution is deducted on the second (month-end) cutoff and ₱0 on the first. Assert this allocation.

---

## 7. Withholding Tax (Blueprint §3.2, §4.7)

Structure tested by formula; bracket values accountant-supplied.
- **Structure (formula):** the engine selects the BIR table matching `payroll_cycle`; tax is computed on `gross_taxable_income`; an income at or below the period's exemption threshold yields ₱0.
- **Bracket cases (accountant-supplied):** for one income in each bracket of the seeded semi-monthly table, paste the expected tax as a literal constant **computed by hand from the official BIR withholding table**, with a comment citing the bracket. Do not fabricate.
- **Effective-dating:** the same gross taxable income in a 2025 period vs. a 2026 period must use the respective year's table version.

---

## 8. MWE & Non-Taxable Compensation (Blueprint §4.5)

Structural; no statutory table value required for the core assertions.

- **Exempt components:** for an employee with `tax_classification = MWE` whose basic equals the applicable regional minimum, `withholding_tax = 0` on basic + holiday + OT + NSD + hazard pay, and `mwe_exempt_compensation` equals the sum of those components.
- **Other taxable income on an MWE:** a taxable allowance or above-cap bonus paid to an MWE is still taxed; the minimum-wage and statutory-premium portions remain exempt. Assert that the exemption is **not** stripped by the presence of other taxable income.
- **Classification boundary:** an employee whose basic exactly equals the regional minimum is MWE; an employee whose basic is the regional minimum **+ ₱0.01/day** is `Regular` for that period (exercises the §4.5 validation against `MinimumWageRate`).
- **₱90,000 cap:** cumulative 13th-month + other benefits up to ₱90,000 are non-taxable; the centavo above ₱90,000 is taxable. Assert at exactly ₱90,000 (fully exempt) and ₱90,000.01 (excess taxable).
- **De minimis ceilings (accountant-supplied):** for each category, assert within-ceiling is non-taxable and over-ceiling excess is taxable, using the seeded RR 29-2025 ceiling values pasted as constants with source comments.
- **Employer-designated non-taxable basic:** `nontaxable_basic_amount` is excluded from `gross_taxable_income` and recorded in `nontaxable_basic`.

---

## 9. Full Gross-to-Net Integration (Blueprint §4.2)

End-to-end employee scenarios. Provide formula-derived parts exactly; mark SSS/WHT expected values as accountant-supplied.

**Case A — Regular monthly-paid, clean period.** ₱30,000/mo, semi-monthly, no lates/OT. Assert: base pay, PhilHealth EE ₱750.00, Pag-IBIG EE ₱200.00, SSS EE [accountant-supplied], WHT [accountant-supplied], and the net via the §4.2 waterfall.

**Case B — Premiums + lates.** Monthly-paid, base hourly ₱100, with 90 min undertime and 2 OT hours on a Regular Holiday in the night window. Assert: undertime deduction ₱258.62 (from §3), holiday-OT-night premium 2 × ₱286.00 = ₱572.00 (from §4), and waterfall ordering (premiums added before tax base; non-taxable determined before WHT).

**Case C — MWE.** Daily-paid at the regional minimum, with holiday and OT. Assert: `withholding_tax = 0` on exempt components, `mwe_exempt_compensation` populated, and any taxable allowance still taxed.

**Waterfall ordering assertion (all cases):** non-taxable compensation is determined and excluded from the tax base **before** withholding tax is computed (§4.2 steps 6–9), and non-taxable additions are added back **after** tax (step 10).

---

## 10. Corrections, Year-End, Final Pay (Blueprint §4.8–§4.10)

- **Snapshot immutability:** a `Finalized` PayrollBook's PayrollSheet rows are immutable; an attempt to recompute a finalized period is rejected.
- **Off-cycle adjustment:** a correction posts via a new PayrollBook or PayrollAdjustment without mutating the finalized sheet; the next book reflects the adjustment.
- **Retroactive-rate safety:** a salary raise effective today does not alter a previously finalized period's frozen values.
- **Year-end annualization:** YTD taxable vs. YTD withheld produces the correct refund/payable true-up; structure asserted, bracket figures accountant-supplied.
- **Final pay:** asset deduction, leave cash-out, 13th-month proration, and tax annualization sum to the correct net; the Quitclaim and 2316 figures match the Final PayrollSheet.

---

## 11. Invariants (assert across every computation)

These hold for **every** PayrollSheet the engine produces, in addition to the case-specific assertions:

1. `gross_taxable_income + nontaxable_compensation == gross_compensation`.
2. EE + ER statutory shares reconcile to the schedule total for that contribution.
3. `net_pay == gross_compensation − late_undertime_deduction − statutory_ee − withholding_tax − loan_deductions + nontaxable_additions` (per §4.2; no centavo unaccounted).
4. Every monetary field is an integer (centavos); no floats at rest.
5. Sum of share splits equals the source amount (no centavo created or lost).
6. Determinism: identical inputs → identical output.
7. Effective-dating: computation for a period uses the table version valid for that period's dates, independent of the current date.

---

## 12. Definition of Done (CI gates)

The engine may not produce real payroll output until all of the following pass in CI:
- Every §1–§10 case implemented as a golden-case test with the specified expected values (formula-derived inline; accountant-supplied pasted with source comments).
- The full §4 stacking matrix covered (every row), plus cross-midnight and holiday-no-work cases.
- All statutory floor/ceiling/threshold edges covered (PhilHealth floor ₱10,000 & ceiling ₱100,000; Pag-IBIG cap & the ₱1,500 1% threshold; SSS min/MPF-boundary/max MSC; the ₱90,000 cap; the MWE classification boundary at minimum and minimum + ₱0.01).
- All §11 invariants asserted across the case suite.
- Effective-dating test (2025 vs 2026 period) passing.
- No test derives its expected value from engine output.

---

*Companion to the Master Blueprint. Statutory expected values (SSS brackets, BIR withholding, de minimis ceilings) are hand-computed by the accountant from the official seeded tables and pasted as commented constants; all other expected values are formula-derived from this spec.*
