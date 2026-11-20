/**
 * PAY-169 (Mark, 17 Nov 2026 22:03): on the payslip PDF the title "PAYSLIP"
 * is centred on the page, just above the accent line, not in the right-hand
 * column beside the company name.
 *
 *   T1  the title is its own centred line placed straight above the rule.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync("src/lib/payslip/pdf-document.tsx", "utf8");

describe("PAY-169 payslip PDF title", () => {
  it("T1 PAYSLIP is centred, directly above the line", () => {
    expect(src).toMatch(/title: \{[^}]*textAlign: "center"/);
    // PAY-157: a final pay reads "FINAL PAY PAYSLIP" in the same place.
    expect(src).toMatch(/<\/View>\s*<Text style=\{s\.title\}>\{data\.finalPay \? "FINAL PAY PAYSLIP" : "PAYSLIP"\}<\/Text>\s*<View style=\{\[s\.rule/);
    expect(src.match(/<Text style=\{s\.title\}>/g)).toHaveLength(1);
  });
});
