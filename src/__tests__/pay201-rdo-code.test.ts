/**
 * PAY-201 (Mark, 20 Nov 22:57: "RDO: Yes, get it from the attached files").
 *
 * The RDO Code list is BIR's own (Offline eBIRForms v7.9.6.2.1, rdo.xml):
 * 138 codes, three characters, some with a letter (17A, 43B). The company's
 * code prints on 1601-C Item 7 and 1604-C Item 5; the employee's on 2316
 * Item 5.
 *
 *   T1  the list is BIR's 138 codes; input is stored in BIR's spelling
 *       ("5" is 005, "17a" is 17A) and a code BIR does not list is refused
 *       (fails on main: no list).
 *   T2  the request field: undefined leaves the code alone, "" clears it,
 *       a bad code is a validation error.
 *   T3  1601-C Item 7 and 1604-C Item 5 print the company's code, and the
 *       "not on file" footnote goes away once it is set.
 *   T4  2316 Item 5 prints the employee's code; without one, the footnote
 *       says where to add it.
 */
import { describe, expect, it } from "vitest";
import { RDO_CODES, normaliseRdoCode, rdoCodeField } from "@/lib/bir/rdo-codes";
import { buildBir1601cReport } from "@/lib/payroll/reports/bir-1601c";
import { buildBir1604cReport } from "@/lib/payroll/reports/bir-1604c";
import { buildBir2316Report } from "@/lib/payroll/reports/bir-2316";
import type { BirFormView } from "@/lib/payroll/reports/bir-form";
import { factsFromSheet, splitSheet, type BirSheetRow } from "@/lib/payroll/reports/bir-comp";

// One payslip of 9,000.00 basic, no tax: enough for a certificate to exist.
const PAYSLIP = {
  grossCompensationCents: 900000n, mweExemptCompensationCents: 0n, nontaxableBasicCents: 0n,
  nontaxableCompensationCents: 0n, nontaxable13MonthAndBenefitsCents: 0n, grossTaxableIncomeCents: 900000n,
  withholdingTaxCents: 0n, sssEeCents: 0n, philhealthEeCents: 0n, pagibigEeCents: 0n,
  basePayCents: 900000n, lateUndertimeDeductionCents: 0n, otPayCents: 0n, nsdPayCents: 0n,
  holidayPayCents: 0n, hazardPayCents: 0n, restDayPayCents: 0n,
  payComponentsApplied: [], statutoryBreakdown: {}, thirteenthMonthBreakdown: null, finalPayBreakdown: null,
} as unknown as BirSheetRow;

const line = (view: BirFormView, no: string, heading?: RegExp) => {
  for (const s of view.sections) {
    if (heading && !heading.test(s.heading)) continue;
    for (const l of s.lines) if (l.no === no) return l;
  }
  throw new Error(`no item ${no}`);
};
const AGENT = (rdoCode: string | null) => ({
  tin: "123456789", rdoCode, name: "Tala Trading Inc.", address: "12 Shoe Avenue, Marikina City",
  zipCode: "1800", contactNumber: null, email: null,
});

describe("PAY-201 BIR RDO Code", () => {
  it("T1 BIR's list, in BIR's spelling", () => {
    expect(RDO_CODES).toHaveLength(138);
    expect(RDO_CODES[0]).toBe("001");
    expect(RDO_CODES).toContain("17A");
    expect(RDO_CODES).toContain("132");
    expect(normaliseRdoCode("5")).toBe("005");
    expect(normaliseRdoCode(" 17a ")).toBe("17A");
    expect(normaliseRdoCode("043")).toBe("043");
    expect(normaliseRdoCode("17")).toBeNull();
    expect(normaliseRdoCode("128")).toBeNull();
    expect(normaliseRdoCode("")).toBeNull();
    expect(normaliseRdoCode(null)).toBeNull();
  });

  it("T2 the request field", () => {
    expect(rdoCodeField.parse(undefined)).toBeUndefined();
    expect(rdoCodeField.parse("")).toBeNull();
    expect(rdoCodeField.parse(null)).toBeNull();
    expect(rdoCodeField.parse("43a")).toBe("43A");
    expect(rdoCodeField.safeParse("999").success).toBe(false);
  });

  it("T3 1601-C Item 7 and 1604-C Item 5", () => {
    const set = buildBir1601cReport({ year: 2026, month: 11, tenantId: "t", tenantName: "Tala", agent: AGENT("043"), employees: [] });
    expect(line(set.form, "7").value).toBe("043");
    expect(set.form.footnotes.some((f) => f.startsWith("Item 7"))).toBe(false);

    const unset = buildBir1601cReport({ year: 2026, month: 11, tenantId: "t", tenantName: "Tala", agent: AGENT(null), employees: [] });
    expect(line(unset.form, "7").value).toBeNull();
    expect(unset.form.footnotes).toContain("Item 7: the company has no RDO Code on file. Add it in Settings, Company.");

    const annual = buildBir1604cReport({ year: 2026, tenantId: "t", tenantName: "Tala", agent: AGENT("17A"), employees: [] });
    expect(line(annual.form, "5").value).toBe("17A");
  });

  it("T4 2316 Item 5", () => {
    const person = (rdoCode: string | null) => ({
      tin: "111222333", rdoCode, address: null, zipCode: null, birthDate: null, contactNumber: null,
      periodFrom: new Date("2026-01-01T00:00:00Z"), periodTo: new Date("2026-12-31T00:00:00Z"),
      smwDailyCents: null, smwMonthlyCents: null,
    });
    const emp = (first: string, rdoCode: string | null) => ({
      employeeId: first, employeeNumber: first, firstName: first, middleName: null, lastName: "Santos", suffix: null,
      taxClassification: "REGULAR" as const, sheets: [{ ...PAYSLIP, comp: splitSheet(factsFromSheet(PAYSLIP)) }], person: person(rdoCode),
    });
    const certs = buildBir2316Report({
      year: 2026, tenantId: "t", tenantName: "Tala", employer: AGENT(null), taxDue: () => 0n,
      employees: [emp("Ana", "043"), emp("Ben", null)],
    }).certificates;
    const ana = certs.find((c) => c.firstName === "Ana")!.form;
    const ben = certs.find((c) => c.firstName === "Ben")!.form;
    expect(line(ana, "5").value).toBe("043");
    expect(ana.footnotes.some((f) => f.startsWith("Item 5"))).toBe(false);
    expect(line(ben, "5").value).toBeNull();
    expect(ben.footnotes).toContain("Item 5: the employee has no RDO Code on file. Add it on the employee's profile.");
  });
});
