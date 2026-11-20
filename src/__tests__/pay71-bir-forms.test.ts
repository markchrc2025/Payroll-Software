/**
 * PAY-71 part 1 (Mark, build plan v3: "the platform must generate 1601-C,
 * 1604-C and 2316 from its data. Mandated structure, no added columns,
 * footnotes only").
 *
 * 1601-C (January 2018 ENCS) and 2316 (September 2021 ENCS) are written out
 * item by item with the form's own numbers and labels. Figures below are
 * worked by hand from three payslips of November 2026:
 *
 *   Ana (not an MWE), 1 to 15 Nov: basic 25,000.00 less lates 500.00,
 *     overtime 1,200.00, night shift 300.00, holiday 800.00, taxable
 *     allowance 1,000.00, rice 2,500.00 (2,000.00 within the ceiling, 500.00
 *     over), commission 3,000.00; contributions 1,825.00.
 *     Gross 33,300.00, exempt 3,825.00, taxable 29,475.00, tax 2,864.50.
 *   Ana, 16 to 30 Nov: basic 25,000.00 and a 13th month of 100,000.00
 *     (90,000.00 exempt, 10,000.00 over). Gross 125,000.00, taxable
 *     35,000.00, tax 5,000.00.
 *   Ben (MWE): wage 13,420.00, holiday 610.00, overtime 381.25, night shift
 *     61.00, rest day 793.00, taxable allowance 2,000.00; contributions
 *     1,250.00. Gross 17,265.25, taxable 1,543.00, no tax.
 *   Cora (not an MWE): basic 9,000.00, no tax withheld.
 *
 *   T1  the 1601-C return has Part II Items 14 to 25 from the payslips, and
 *       Item 14 less Item 21 is Item 22 (fails on main: no return).
 *   T2  Part I carries the agent's TIN, name, address and ATC WW010; items
 *       that are not payroll figures are left for the filer.
 *   T3  a payslip's parts add up to its own gross and taxable pay, for a
 *       regular employee, an MWE with taxable pay, and an MWE with none
 *       (the wage is then shown net of contributions).
 *   T4  the 2316 has Items 19 to 52: exempt Items 29 to 38 and taxable Items
 *       39 to 52 add up, and Item 19 is Item 38 plus Item 52.
 *   T5  the 2316 of a transferee: previous employer in Items 16, 17, 22 and
 *       25B, tax due in Item 24, and a footnote when it differs from tax
 *       withheld.
 *   T6  an MWE's 2316: Items 9 to 11 and 29 to 33.
 *   T7  pay before Sentire (an opening) is in the 2316, as basic salary.
 *   T8  only the form's own items appear, in the form's order; TINs and
 *       amounts are printed the way the forms print them; no em dashes.
 *   T9  Gov't Reports shows the forms: a "View form" button opens the
 *       viewer, which prints and downloads Excel from the same structure.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildBir1601cReport } from "@/lib/payroll/reports/bir-1601c";
import { buildBir2316Report } from "@/lib/payroll/reports/bir-2316";
import { splitOpening, splitSheet, factsFromSheet, type BirComp, type BirSheetRow } from "@/lib/payroll/reports/bir-comp";
import { formViewToRows, formatCentavos, formatTin, type BirFormView } from "@/lib/payroll/reports/bir-form";

const c = (pesos: string) => BigInt(pesos.replace(/[,.]/g, ""));
const row = (o: Partial<Record<keyof BirSheetRow, unknown>>): BirSheetRow => ({
  grossCompensationCents: 0n, mweExemptCompensationCents: 0n, nontaxableBasicCents: 0n,
  nontaxableCompensationCents: 0n, nontaxable13MonthAndBenefitsCents: 0n, grossTaxableIncomeCents: 0n,
  withholdingTaxCents: 0n, sssEeCents: 0n, philhealthEeCents: 0n, pagibigEeCents: 0n,
  basePayCents: 0n, lateUndertimeDeductionCents: 0n, otPayCents: 0n, nsdPayCents: 0n,
  holidayPayCents: 0n, hazardPayCents: 0n, restDayPayCents: 0n,
  payComponentsApplied: [], statutoryBreakdown: {}, thirteenthMonthBreakdown: null, finalPayBreakdown: null,
  ...o,
} as BirSheetRow);

const applied = (kind: string, taxability: string, exempt: string, taxable: string) => ({
  id: "x", code: "X", name: "x", kind, taxability,
  amountCents: (c(exempt) + c(taxable)).toString(),
  nonTaxablePortionCents: c(exempt).toString(), taxablePortionCents: c(taxable).toString(),
});

const ANA_1 = row({
  grossCompensationCents: c("33,300.00"), nontaxableCompensationCents: c("3,825.00"),
  grossTaxableIncomeCents: c("29,475.00"), withholdingTaxCents: c("2,864.50"),
  sssEeCents: c("1,000.00"), philhealthEeCents: c("625.00"), pagibigEeCents: c("200.00"),
  basePayCents: c("25,000.00"), lateUndertimeDeductionCents: c("500.00"),
  otPayCents: c("1,200.00"), nsdPayCents: c("300.00"), holidayPayCents: c("800.00"),
  payComponentsApplied: [
    applied("ALLOWANCE", "TAXABLE", "0.00", "1,000.00"),
    applied("ALLOWANCE", "DE_MINIMIS", "2,000.00", "500.00"),
    applied("COMMISSION", "TAXABLE", "0.00", "3,000.00"),
  ],
});
const ANA_2 = row({
  grossCompensationCents: c("125,000.00"), nontaxable13MonthAndBenefitsCents: c("90,000.00"),
  grossTaxableIncomeCents: c("35,000.00"), withholdingTaxCents: c("5,000.00"),
  basePayCents: c("25,000.00"),
  statutoryBreakdown: { benefits: { totalCents: "10000000", exemptCents: "9000000", excessCents: "1000000" } },
});
const BEN = row({
  grossCompensationCents: c("17,265.25"), mweExemptCompensationCents: c("14,472.25"),
  nontaxableCompensationCents: c("1,250.00"), grossTaxableIncomeCents: c("1,543.00"),
  sssEeCents: c("700.00"), philhealthEeCents: c("350.00"), pagibigEeCents: c("200.00"),
  basePayCents: c("13,420.00"), otPayCents: c("381.25"), nsdPayCents: c("61.00"),
  holidayPayCents: c("610.00"), restDayPayCents: c("793.00"),
  payComponentsApplied: [applied("ALLOWANCE", "TAXABLE", "0.00", "2,000.00")],
});
const CORA = row({
  grossCompensationCents: c("9,000.00"), grossTaxableIncomeCents: c("9,000.00"), basePayCents: c("9,000.00"),
});

const sheet = (r: BirSheetRow) => ({ ...r, comp: splitSheet(factsFromSheet(r)) });
const person = (first: string, last: string, cls: "REGULAR" | "MWE", rows: BirSheetRow[]) => ({
  employeeId: first.toLowerCase(), employeeNumber: `E-${first}`, firstName: first, middleName: "Reyes" as string | null,
  lastName: last, suffix: null, taxClassification: cls, sheets: rows.map(sheet),
});
const AGENT = {
  tin: "123456789", rdoCode: null, name: "Tala Trading Inc.", address: "12 Shoe Avenue, Marikina City",
  zipCode: "1800", contactNumber: "0281234567", email: "accounts@tala.test",
};

const line = (view: BirFormView, no: string) => {
  for (const s of view.sections) for (const l of s.lines) if (l.no === no) return l;
  throw new Error(`no item ${no}`);
};
const amount = (view: BirFormView, no: string) => {
  const v = line(view, no).value;
  return v === null ? null : formatCentavos(v);
};
const partsOf = (x: BirComp) => ({
  exempt: x.mweBasic + x.mweHoliday + x.mweOvertime + x.mweNsd + x.mweHazard + x.nt13th + x.deMinimis + x.contributions + x.otherNontaxable,
  taxable: x.taxBasic + x.taxAllowances + x.taxCommission + x.tax13th + x.taxHazard + x.taxOvertime + x.taxPremiums + x.taxOther,
});

const november = () =>
  buildBir1601cReport({
    year: 2026, month: 11, tenantId: "t", tenantName: "Tala Trading Inc.", agent: AGENT,
    employees: [
      { ...person("Ana", "Santos", "REGULAR", [ANA_1, ANA_2]), tin: "111222333" },
      { ...person("Ben", "Cruz", "MWE", [BEN]), tin: null },
      { ...person("Cora", "Lim", "REGULAR", [CORA]), tin: "444-555-666-001" },
    ],
  });

describe("PAY-71 BIR 1601-C in its mandated structure", () => {
  it("T1 Part II Items 14 to 25 come from the payslips", () => {
    const { form } = november();
    expect(form.formNo).toBe("1601-C");
    expect(form.version).toBe("January 2018 (ENCS)");
    expect(amount(form, "14")).toBe("184,565.25");
    expect(amount(form, "15")).toBe("13,420.00");
    expect(amount(form, "16")).toBe("1,052.25");
    expect(amount(form, "17")).toBe("90,000.00");
    expect(amount(form, "18")).toBe("2,000.00");
    expect(amount(form, "19")).toBe("3,075.00");
    expect(amount(form, "20")).toBe("0.00");
    expect(amount(form, "21")).toBe("109,547.25");
    expect(amount(form, "22")).toBe("75,018.00");
    expect(amount(form, "23")).toBe("9,000.00");
    expect(amount(form, "24")).toBe("66,018.00");
    expect(amount(form, "25")).toBe("7,864.50");
    // Item 14 less Item 21 is Item 22, and Item 22 is the payslips' taxable pay.
    expect(BigInt(line(form, "14").value!) - BigInt(line(form, "21").value!)).toBe(BigInt(line(form, "22").value!));
    expect(november().totalTaxableCompensationCents).toBe(line(form, "22").value);
    expect(november().totalWithholdingTaxCents).toBe(line(form, "25").value);
  });

  it("T2 Part I names the withholding agent; what is not payroll is left blank", () => {
    const report = november();
    const { form } = report;
    expect(line(form, "1").value).toBe("11/2026");
    expect(line(form, "3").value).toBe("Yes");
    expect(line(form, "5").value).toBe("WW010");
    expect(line(form, "6").value).toBe("123-456-789-00000");
    expect(line(form, "8").value).toBe("Tala Trading Inc.");
    expect(line(form, "9").value).toBe("12 Shoe Avenue, Marikina City");
    expect(line(form, "9A").value).toBe("1800");
    expect(line(form, "11").value).toBe("Private");
    for (const no of ["2", "4", "7", "13", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36"]) {
      expect(line(form, no).value, `item ${no}`).toBeNull();
    }
    expect(form.footnotes.join(" ")).toContain("RDO Code");
    // The employees' TINs are on the working list, printed the BIR way.
    expect(report.entries.map((e) => [e.firstName, e.tin])).toEqual([
      ["Ben", null], ["Cora", "444-555-666-00001"], ["Ana", "111-222-333-00000"],
    ]);
  });
});

describe("PAY-71 a payslip split into the forms' items", () => {
  it("T3 the parts add up to the payslip's own gross and taxable pay", () => {
    const ana = splitSheet(factsFromSheet(ANA_1));
    expect(ana).toMatchObject({
      deMinimis: c("2,000.00"), contributions: c("1,825.00"), otherNontaxable: 0n, totalNontaxable: c("3,825.00"),
      taxBasic: c("22,675.00"), taxAllowances: c("1,500.00"), taxCommission: c("3,000.00"),
      taxOvertime: c("1,200.00"), taxPremiums: c("1,100.00"), taxOther: 0n, totalTaxable: c("29,475.00"),
    });
    const thirteenth = splitSheet(factsFromSheet(ANA_2));
    expect(thirteenth).toMatchObject({ nt13th: c("90,000.00"), tax13th: c("10,000.00"), taxBasic: c("25,000.00"), taxOther: 0n });
    // An MWE with taxable pay: the wage is whole, contributions come off taxable pay.
    const ben = splitSheet(factsFromSheet(BEN));
    expect(ben).toMatchObject({
      mweBasic: c("13,420.00"), mweHoliday: c("610.00"), mweOvertime: c("381.25"), mweNsd: c("61.00"),
      contributions: c("1,250.00"), totalNontaxable: c("15,722.25"), taxAllowances: c("1,543.00"), totalTaxable: c("1,543.00"),
    });
    // An MWE with no taxable pay: the wage is shown net of contributions.
    const wageOnly = splitSheet(factsFromSheet(row({
      grossCompensationCents: c("13,420.00"), mweExemptCompensationCents: c("13,420.00"),
      nontaxableCompensationCents: c("1,250.00"), grossTaxableIncomeCents: 0n,
      sssEeCents: c("700.00"), philhealthEeCents: c("350.00"), pagibigEeCents: c("200.00"), basePayCents: c("13,420.00"),
    })));
    expect(wageOnly).toMatchObject({ mweBasic: c("12,170.00"), contributions: c("1,250.00"), totalNontaxable: c("13,420.00"), totalTaxable: 0n });
    for (const x of [ana, thirteenth, ben, wageOnly]) {
      expect(partsOf(x).exempt).toBe(x.totalNontaxable);
      expect(partsOf(x).taxable).toBe(x.totalTaxable);
      expect(x.totalNontaxable + x.totalTaxable).toBe(x.gross);
    }
  });
});

describe("PAY-71 BIR 2316 in its mandated structure", () => {
  const taxDue = (x: bigint) => (x > c("250,000.00") ? ((x - c("250,000.00")) * 15n) / 100n : 0n);
  const certs = () =>
    buildBir2316Report({
      year: 2026, tenantId: "t", tenantName: "Tala Trading Inc.", employer: AGENT, taxDue,
      employees: [
        {
          ...person("Ana", "Santos", "REGULAR", [ANA_1, ANA_2]),
          person: {
            tin: "111222333", address: "5 Bayan Street, Marikina City", zipCode: "1801",
            birthDate: new Date("1990-03-09T00:00:00Z"), contactNumber: "09171234567",
            periodFrom: new Date("2026-06-15T00:00:00Z"), periodTo: new Date("2026-12-31T00:00:00Z"),
            smwDailyCents: c("610.00"), smwMonthlyCents: c("13,267.50"),
          },
          previousEmployer: { name: "Dating Amo Corp.", tin: "987654321000", taxableCompensationCents: c("200,000.00"), withholdingTaxCents: c("1,000.00") },
        },
        {
          ...person("Ben", "Cruz", "MWE", [BEN]),
          person: {
            tin: null, address: null, zipCode: null, birthDate: null, contactNumber: null,
            periodFrom: new Date("2026-01-01T00:00:00Z"), periodTo: new Date("2026-12-31T00:00:00Z"),
            smwDailyCents: c("610.00"), smwMonthlyCents: c("13,267.50"),
          },
        },
      ],
    }).certificates;
  const of = (first: string) => certs().find((x) => x.firstName === first)!.form;

  it("T4 Items 19 to 52 add up", () => {
    const f = of("Ana");
    expect(f.formNo).toBe("2316");
    expect(f.version).toBe("September 2021 (ENCS)");
    expect(amount(f, "19")).toBe("158,300.00");
    expect(amount(f, "20")).toBe("93,825.00");
    expect(amount(f, "21")).toBe("64,475.00");
    expect(amount(f, "29")).toBe("0.00");
    expect(amount(f, "34")).toBe("90,000.00");
    expect(amount(f, "35")).toBe("2,000.00");
    expect(amount(f, "36")).toBe("1,825.00");
    expect(amount(f, "37")).toBe("0.00");
    expect(amount(f, "38")).toBe("93,825.00");
    expect(amount(f, "39")).toBe("47,675.00");
    expect(amount(f, "44A")).toBe("1,500.00");
    expect(amount(f, "45")).toBe("3,000.00");
    expect(amount(f, "48")).toBe("10,000.00");
    expect(amount(f, "50")).toBe("1,200.00");
    expect(amount(f, "51A")).toBe("1,100.00");
    expect(amount(f, "51B")).toBe("0.00");
    expect(amount(f, "52")).toBe("64,475.00");
    const sum = (from: string[]) => from.reduce((t, no) => t + BigInt(line(f, no).value ?? "0"), 0n);
    expect(sum(["29", "30", "31", "32", "33", "34", "35", "36", "37"])).toBe(BigInt(line(f, "38").value!));
    expect(sum(["39", "40", "41", "42", "43", "44A", "44B", "45", "46", "47", "48", "49", "50", "51A", "51B"])).toBe(BigInt(line(f, "52").value!));
    expect(sum(["38", "52"])).toBe(BigInt(line(f, "19").value!));
  });

  it("T5 a transferee: previous employer, tax due and the difference", () => {
    const f = of("Ana");
    expect(line(f, "2").value).toBe("06/15 to 12/31");
    expect(line(f, "3").value).toBe("111-222-333-00000");
    expect(line(f, "4").value).toBe("Santos, Ana, Reyes");
    expect(line(f, "7").value).toBe("03/09/1990");
    expect(line(f, "12").value).toBe("123-456-789-00000");
    expect(line(f, "13").value).toBe("Tala Trading Inc.");
    expect(line(f, "16").value).toBe("987-654-321-00000");
    expect(line(f, "17").value).toBe("Dating Amo Corp.");
    expect(amount(f, "22")).toBe("200,000.00");
    expect(amount(f, "23")).toBe("264,475.00");
    expect(amount(f, "24")).toBe("2,171.25"); // 15% of 14,475.00
    expect(amount(f, "25A")).toBe("7,864.50");
    expect(amount(f, "25B")).toBe("1,000.00");
    expect(amount(f, "26")).toBe("8,864.50");
    expect(amount(f, "27")).toBe("0.00");
    expect(amount(f, "28")).toBe("8,864.50");
    expect(f.footnotes.join(" ")).toContain("Tax withheld (Item 26) is more than tax due (Item 24) by 6,693.25.");
    // Not an MWE: Items 9 to 11 are blank.
    for (const no of ["9", "10", "11"]) expect(line(f, no).value).toBeNull();
  });

  it("T6 an MWE's certificate", () => {
    const f = of("Ben");
    expect(amount(f, "9")).toBe("610.00");
    expect(amount(f, "10")).toBe("13,267.50");
    expect(line(f, "11").value).toBe("X");
    expect(amount(f, "29")).toBe("13,420.00");
    expect(amount(f, "30")).toBe("610.00");
    expect(amount(f, "31")).toBe("381.25");
    expect(amount(f, "32")).toBe("61.00");
    expect(amount(f, "33")).toBe("0.00");
    expect(amount(f, "36")).toBe("1,250.00");
    expect(amount(f, "38")).toBe("15,722.25");
    expect(amount(f, "52")).toBe("1,543.00");
    expect(amount(f, "24")).toBe("0.00");
    expect(f.footnotes.join(" ")).toContain("no TIN on file");
  });

  it("T7 pay before Sentire is in the certificate as basic salary", () => {
    const opening = {
      grossCompensationCents: c("120,000.00"), mweExemptCompensationCents: 0n, nontaxableBasicCents: 0n,
      nontaxableCompensationCents: c("5,000.00"), nontaxable13MonthAndBenefitsCents: 0n,
      grossTaxableIncomeCents: c("115,000.00"), sssEeCents: c("2,000.00"), philhealthEeCents: c("1,500.00"),
      pagibigEeCents: c("500.00"), withholdingTaxCents: c("3,000.00"),
    };
    expect(splitOpening(opening)).toMatchObject({
      taxBasic: c("115,000.00"), contributions: c("4,000.00"), otherNontaxable: c("1,000.00"), taxOther: 0n,
    });
    const [cert] = buildBir2316Report({
      year: 2026, tenantId: "t", tenantName: "Tala", taxDue,
      employees: [{ ...person("Cora", "Lim", "REGULAR", [CORA]), priorPayrollOpening: opening }],
    }).certificates;
    expect(amount(cert!.form, "19")).toBe("129,000.00");
    expect(amount(cert!.form, "39")).toBe("124,000.00");
    expect(amount(cert!.form, "25A")).toBe("3,000.00");
    expect(cert!.form.footnotes.join(" ")).toContain("before Sentire Payroll");
  });
});

describe("PAY-71 mandated structure, no added columns", () => {
  it("T8 only the forms' own items, in order, printed the BIR way", () => {
    const numbers = (v: BirFormView) => v.sections.flatMap((s) => s.lines.map((l) => l.no));
    expect(numbers(november().form)).toEqual([
      "1", "2", "3", "4", "5", "6", "7", "8", "9", "9A", "10", "11", "12", "13",
      ...Array.from({ length: 23 }, (_, i) => `${14 + i}`),
    ]);
    const [cert] = buildBir2316Report({
      year: 2026, tenantId: "t", tenantName: "Tala",
      employees: [person("Cora", "Lim", "REGULAR", [CORA])],
    }).certificates;
    expect(numbers(cert!.form)).toEqual([
      "1", "2", "3", "4", "5", "6", "6A", "6B", "6C", "6D", "7", "8", "9", "10", "11",
      "12", "13", "14", "14A", "15", "16", "17", "18", "18A",
      "19", "20", "21", "22", "23", "24", "25A", "25B", "26", "27", "28",
      "29", "30", "31", "32", "33", "34", "35", "36", "37", "38",
      "39", "40", "41", "42", "43", "44A", "44B", "45", "46", "47", "48", "49", "50", "51A", "51B", "52",
    ]);
    expect(november().form.schedules).toEqual([]);
    expect(formatTin("123-456-789")).toBe("123-456-789-00000");
    expect(formatTin("123456789001")).toBe("123-456-789-00001");
    expect(formatTin(null)).toBeNull();
    expect(formatCentavos(-150050n)).toBe("(1,500.50)");
    const rows = formViewToRows(november().form);
    expect(rows[0]).toEqual(["BIR Form No. 1601-C", "January 2018 (ENCS)"]);
    expect(rows).toContainEqual(["14", "Total Amount of Compensation", "184,565.25"]);
    expect(rows).toContainEqual(["26", "Add/(Less): Adjustment of Taxes Withheld from Previous Month/s (From Part IV-Schedule 1, Item 4)", ""]);
    const text = JSON.stringify([november().form, cert!.form]);
    expect(text).not.toContain("—");
    expect(text).not.toContain("–");
  });
});

describe("PAY-71 the forms on the Gov't Reports page", () => {
  it("T9 the page opens the form viewer", () => {
    const page = readFileSync("src/app/(dashboard)/reports/page.tsx", "utf8");
    const viewer = readFileSync("src/components/reports/BirFormViewer.tsx", "utf8");
    expect(page).toContain("View form");
    expect(page).toContain("<BirFormViewer");
    expect(page).toContain("BIR 1601-C: Monthly Remittance Return");
    expect(page).toContain("BIR 2316: Annual Tax Certificates");
    expect(viewer).toContain("formViewToRows");
    expect(viewer).toContain("XLSX.writeFile");
    expect(viewer).toContain("to fill in");
    expect(viewer).not.toContain("\u2014");
  });
});
