/**
 * PAY-71 part 2: BIR 1604-C with its alphalist (RMC 160-2022 Annex A), in
 * the mandated structure. Worked by hand from these payslips of 2026:
 *
 *   Ana (not an MWE; a previous employer paid 200,000.00 taxable and
 *     20,000.00 exempt 13th month, and withheld 1,000.00):
 *     Nov: gross 33,300.00, taxable 29,475.00, tax 2,864.50
 *     Nov: gross 125,000.00 (13th month 100,000.00), taxable 35,000.00, tax 5,000.00
 *     Dec: gross 25,000.00, taxable 25,000.00, tax refunded 1,500.00
 *   Ben (MWE), Nov: gross 17,265.25, taxable 1,543.00, no tax.
 *   Cora (not an MWE, left on 20 Nov): Oct 30,000.00 with tax 100.00, Nov
 *     9,000.00 with tax 250.00.
 *
 *   T1  Schedule 1 has one row per employee who is not an MWE, with columns
 *       1 to 19 as coded on the format; 7a = 7f + 7j (fails on main: no
 *       1604-C).
 *   T2  the previous employer is in columns 8 and 12a to 12j, and columns
 *       13 to 19 follow the format's formulas.
 *   T3  an employee who left: status, period, reason, and the last salary's
 *       tax in 17a.
 *   T4  Schedule 2 has the minimum wage earners with their own columns.
 *   T5  Part II lists the tax withheld per month; the totals rows add up.
 *   T6  only the format's columns, in order; the alphalist agrees with each
 *       employee's 2316.
 *   T7  Gov't Reports offers the 1604-C and no longer offers the old .DAT.
 *   T8  the form viewer draws the return: parts, schedules with their column
 *       codes and group headers, the TOTALS row, blanks to fill in, notes.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BirFormSheet } from "@/components/reports/BirFormViewer";
import { buildBir1604cReport, SCHEDULE_1_COLUMNS, SCHEDULE_2_COLUMNS, type Bir1604cEmployeeInput } from "@/lib/payroll/reports/bir-1604c";
import { buildBir2316Report } from "@/lib/payroll/reports/bir-2316";
import { splitSheet, factsFromSheet, type BirSheetRow } from "@/lib/payroll/reports/bir-comp";
import { formatCentavos, type BirSchedule } from "@/lib/payroll/reports/bir-form";

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
  kind, taxability, nonTaxablePortionCents: c(exempt).toString(), taxablePortionCents: c(taxable).toString(),
});
const sheet = (r: BirSheetRow, month: number) => ({ ...r, comp: splitSheet(factsFromSheet(r)), month });

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
  grossTaxableIncomeCents: c("35,000.00"), withholdingTaxCents: c("5,000.00"), basePayCents: c("25,000.00"),
  statutoryBreakdown: { benefits: { excessCents: "1000000" } },
});
const ANA_DEC = row({
  grossCompensationCents: c("25,000.00"), grossTaxableIncomeCents: c("25,000.00"),
  withholdingTaxCents: -c("1,500.00"), basePayCents: c("25,000.00"),
});
const BEN = row({
  grossCompensationCents: c("17,265.25"), mweExemptCompensationCents: c("14,472.25"),
  nontaxableCompensationCents: c("1,250.00"), grossTaxableIncomeCents: c("1,543.00"),
  sssEeCents: c("700.00"), philhealthEeCents: c("350.00"), pagibigEeCents: c("200.00"),
  basePayCents: c("13,420.00"), otPayCents: c("381.25"), nsdPayCents: c("61.00"),
  holidayPayCents: c("610.00"), restDayPayCents: c("793.00"),
  payComponentsApplied: [applied("ALLOWANCE", "TAXABLE", "0.00", "2,000.00")],
});
const CORA_OCT = row({ grossCompensationCents: c("30,000.00"), grossTaxableIncomeCents: c("30,000.00"), basePayCents: c("30,000.00"), withholdingTaxCents: c("100.00") });
const CORA_NOV = row({ grossCompensationCents: c("9,000.00"), grossTaxableIncomeCents: c("9,000.00"), basePayCents: c("9,000.00"), withholdingTaxCents: c("250.00") });

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const who = (first: string, last: string, from: string, to: string) => ({
  employeeId: first.toLowerCase(), employeeNumber: `E-${first}`, firstName: first, middleName: "Reyes" as string | null,
  lastName: last, suffix: null,
  person: {
    tin: null, address: null, zipCode: null, birthDate: null, contactNumber: null,
    periodFrom: d(from), periodTo: d(to), smwDailyCents: c("610.00"), smwMonthlyCents: c("13,267.50"),
  },
});
const EMPLOYEES: Bir1604cEmployeeInput[] = [
  {
    ...who("Ana", "Santos", "2026-06-15", "2026-12-31"), taxClassification: "REGULAR",
    sheets: [sheet(ANA_1, 11), sheet(ANA_2, 11), sheet(ANA_DEC, 12)],
    previousEmployer: {
      name: "Dating Amo Corp.", tin: "987654321", taxableCompensationCents: c("200,000.00"),
      withholdingTaxCents: c("1,000.00"), nontaxable13MonthAndBenefitsCents: c("20,000.00"),
    },
    nationality: "Filipino", employmentStatusCode: "R", separationReasonCode: null, separatedInYear: false,
  },
  {
    ...who("Ben", "Cruz", "2026-01-01", "2026-12-31"), taxClassification: "MWE",
    sheets: [sheet(BEN, 11)], nationality: "Filipino", employmentStatusCode: "R",
    region: "NCR", daysPerYear: 261, separatedInYear: false,
  },
  {
    ...who("Cora", "Lim", "2026-01-01", "2026-11-20"), taxClassification: "REGULAR",
    sheets: [sheet(CORA_OCT, 10), sheet(CORA_NOV, 11)], nationality: "Japanese",
    employmentStatusCode: "P", separationReasonCode: "T", separatedInYear: true,
  },
];
const taxDue = (x: bigint) => (x > c("250,000.00") ? ((x - c("250,000.00")) * 15n) / 100n : 0n);
const AGENT = { tin: "123456789", rdoCode: null, name: "Tala Trading Inc.", address: "12 Shoe Avenue, Marikina City", zipCode: "1800", contactNumber: null, email: null };
const report = () => buildBir1604cReport({ year: 2026, tenantId: "t", tenantName: "Tala Trading Inc.", agent: AGENT, taxDue, employees: EMPLOYEES });

const schedule = (n: 0 | 1 | 2) => report().form.schedules[n]!;
/** A cell by its column code: money as printed, text as is. */
const cell = (sch: BirSchedule, r: (string | null)[], no: string) => {
  const i = sch.columns.findIndex((col) => col.no === no);
  if (i < 0) throw new Error(`no column ${no}`);
  const v = r[i]!;
  return v === null ? null : sch.columns[i]!.kind === "money" ? formatCentavos(v) : v;
};
const raw = (sch: BirSchedule, r: (string | null)[], no: string) => BigInt(r[sch.columns.findIndex((col) => col.no === no)] ?? "0");

describe("PAY-71 BIR 1604-C alphalist, Schedule 1", () => {
  it("T1 one row per employee who is not an MWE, columns 1 to 19", () => {
    const s1 = schedule(1);
    expect(s1.title).toContain("Schedule 1");
    expect(s1.rows.map((r) => [cell(s1, r, "1"), cell(s1, r, "2a"), cell(s1, r, "2b"), cell(s1, r, "2c")])).toEqual([
      ["1", "Lim", "Cora", "Reyes"], ["2", "Santos", "Ana", "Reyes"],
    ]);
    const ana = s1.rows[1]!;
    expect(cell(s1, ana, "3")).toBeNull();
    expect(cell(s1, ana, "4")).toBe("R");
    expect(cell(s1, ana, "5a")).toBe("06/15");
    expect(cell(s1, ana, "5b")).toBe("12/31");
    expect(cell(s1, ana, "6")).toBeNull();
    expect(cell(s1, ana, "7a")).toBe("183,300.00");
    expect(cell(s1, ana, "7b")).toBe("90,000.00");
    expect(cell(s1, ana, "7c")).toBe("2,000.00");
    expect(cell(s1, ana, "7d")).toBe("1,825.00");
    expect(cell(s1, ana, "7e")).toBe("0.00");
    expect(cell(s1, ana, "7f")).toBe("93,825.00");
    expect(cell(s1, ana, "7g")).toBe("72,675.00");
    expect(cell(s1, ana, "7h")).toBe("10,000.00");
    expect(cell(s1, ana, "7i")).toBe("6,800.00");
    expect(cell(s1, ana, "7j")).toBe("89,475.00");
    for (const r of s1.rows) {
      expect(raw(s1, r, "7f") + raw(s1, r, "7j")).toBe(raw(s1, r, "7a"));
      expect(raw(s1, r, "7b") + raw(s1, r, "7c") + raw(s1, r, "7d") + raw(s1, r, "7e")).toBe(raw(s1, r, "7f"));
      expect(raw(s1, r, "7g") + raw(s1, r, "7h") + raw(s1, r, "7i")).toBe(raw(s1, r, "7j"));
    }
  });

  it("T2 previous employer and the tax columns", () => {
    const s1 = schedule(1);
    const ana = s1.rows[1]!;
    expect(cell(s1, ana, "8")).toBe("987-654-321-00000");
    expect(cell(s1, ana, "12a")).toBe("220,000.00");
    expect(cell(s1, ana, "12b")).toBe("20,000.00");
    expect(cell(s1, ana, "12f")).toBe("20,000.00");
    expect(cell(s1, ana, "12i")).toBe("200,000.00");
    expect(cell(s1, ana, "12j")).toBe("200,000.00");
    expect(cell(s1, ana, "13")).toBe("289,475.00");
    expect(cell(s1, ana, "14")).toBe("5,921.25"); // 15% of 39,475.00
    expect(cell(s1, ana, "15a")).toBe("1,000.00");
    expect(cell(s1, ana, "15b")).toBe("7,864.50");
    expect(cell(s1, ana, "16")).toBe("0.00");
    expect(cell(s1, ana, "17a")).toBe("0.00");
    expect(cell(s1, ana, "17b")).toBe("1,500.00");
    expect(cell(s1, ana, "18")).toBe("7,364.50");
    expect(cell(s1, ana, "19")).toBe("No");
    // 18 = 15a + 15b + 16 + 17a, or less 17b.
    for (const r of s1.rows) {
      expect(raw(s1, r, "15a") + raw(s1, r, "15b") + raw(s1, r, "16") + raw(s1, r, "17a") - raw(s1, r, "17b")).toBe(raw(s1, r, "18"));
      expect(raw(s1, r, "7j") + raw(s1, r, "12j")).toBe(raw(s1, r, "13"));
    }
    // No previous employer: its columns are blank, not zero.
    const cora = s1.rows[0]!;
    for (const no of ["8", "12a", "12f", "12j"]) expect(cell(s1, cora, no)).toBeNull();
    expect(report().form.footnotes.join(" ")).toContain("2 employee(s) have tax due (14) different from tax withheld (18).");
  });

  it("T3 an employee who left in the year", () => {
    const s1 = schedule(1);
    const cora = s1.rows[0]!;
    expect(cell(s1, cora, "3")).toBe("Japanese");
    expect(cell(s1, cora, "4")).toBe("P");
    expect(cell(s1, cora, "5a")).toBe("01/01");
    expect(cell(s1, cora, "5b")).toBe("11/20");
    expect(cell(s1, cora, "6")).toBe("T");
    expect(cell(s1, cora, "7a")).toBe("39,000.00");
    expect(cell(s1, cora, "7g")).toBe("39,000.00");
    expect(cell(s1, cora, "14")).toBe("0.00");
    expect(cell(s1, cora, "15b")).toBe("100.00");
    expect(cell(s1, cora, "17a")).toBe("250.00");
    expect(cell(s1, cora, "18")).toBe("350.00");
    expect(cell(s1, cora, "19")).toBe("No");
  });
});

describe("PAY-71 BIR 1604-C alphalist, Schedule 2 and Part II", () => {
  it("T4 the minimum wage earners", () => {
    const s2 = schedule(2);
    expect(s2.title).toContain("Schedule 2");
    expect(s2.rows).toHaveLength(1);
    const ben = s2.rows[0]!;
    expect(cell(s2, ben, "2a")).toBe("Cruz");
    expect(cell(s2, ben, "3")).toBe("R");
    expect(cell(s2, ben, "4")).toBe("NCR");
    expect(cell(s2, ben, "7a")).toBe("17,265.25");
    expect(cell(s2, ben, "7b")).toBe("610.00");
    expect(cell(s2, ben, "7c")).toBe("13,267.50");
    expect(cell(s2, ben, "7d")).toBe("159,210.00"); // 610.00 x 261 days
    expect(cell(s2, ben, "7e")).toBe("261");
    expect(cell(s2, ben, "7f")).toBe("13,420.00");
    expect(cell(s2, ben, "7g")).toBe("610.00");
    expect(cell(s2, ben, "7h")).toBe("381.25");
    expect(cell(s2, ben, "7i")).toBe("61.00");
    expect(cell(s2, ben, "7j")).toBe("0.00");
    expect(cell(s2, ben, "7m")).toBe("1,250.00");
    expect(cell(s2, ben, "7o")).toBe("15,722.25");
    expect(cell(s2, ben, "7q")).toBe("1,543.00");
    expect(cell(s2, ben, "7r")).toBe("1,543.00");
    expect(raw(s2, ben, "7o") + raw(s2, ben, "7r")).toBe(raw(s2, ben, "7a"));
    expect(cell(s2, ben, "14")).toBe("0.00");
    expect(cell(s2, ben, "18")).toBe("0.00");
    expect(cell(s2, ben, "19")).toBe("Yes");
    // The wage rates are not totalled; the amounts are.
    const totals = s2.totals!;
    expect(cell(s2, totals, "7b")).toBeNull();
    expect(cell(s2, totals, "7d")).toBeNull();
    expect(cell(s2, totals, "7a")).toBe("17,265.25");
  });

  it("T5 Part II and the totals", () => {
    const r = report();
    const part2 = schedule(0);
    expect(part2.title).toBe("Part II: Summary of Remittances per BIR Form No. 1601-C");
    expect(part2.columns.map((x) => x.label)).toEqual([
      "Month", "Date of Remittance (MM/DD/YYYY)", "Drawee Bank/Bank Code/Agency", "TRA/eROR/eAR Number",
      "Taxes Withheld", "Adjustment", "Penalties", "Total Amount Remitted",
    ]);
    expect(part2.rows.map((x) => x[0])).toEqual([
      "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
    ]);
    expect(formatCentavos(part2.rows[9]![4]!)).toBe("100.00");
    expect(formatCentavos(part2.rows[10]![4]!)).toBe("8,114.50");
    expect(formatCentavos(part2.rows[11]![4]!)).toBe("(1,500.00)");
    expect(formatCentavos(part2.totals![4]!)).toBe("6,714.50");
    expect(part2.rows[10]!.slice(1, 4)).toEqual([null, null, null]);
    expect(r.totalWithholdingTaxCents).toBe(c("6,714.50").toString());
    expect(r.employeeCount).toBe(2);
    expect(r.mweCount).toBe(1);
    const s1 = schedule(1);
    expect(cell(s1, s1.totals!, "7a")).toBe("222,300.00");
    expect(cell(s1, s1.totals!, "7j")).toBe("128,475.00");
    expect(cell(s1, s1.totals!, "18")).toBe("7,714.50");
    expect(cell(s1, s1.totals!, "2a")).toBeNull();
    // Part I.
    const part1 = r.form.sections[0]!;
    expect(part1.lines.map((l) => l.no)).toEqual(["1", "2", "3", "4", "5", "6", "7", "7A", "8", "8A", "9", "10", "11", "11A", "12", "13"]);
    expect(part1.lines.find((l) => l.no === "4")!.value).toBe("123-456-789-00000");
    expect(part1.lines.find((l) => l.no === "1")!.value).toBe("2026");
  });

  it("T6 only the format's columns, and the alphalist agrees with the 2316", () => {
    expect(SCHEDULE_1_COLUMNS.map((x) => x.no)).toEqual([
      "1", "2a", "2b", "2c", "3", "4", "5a", "5b", "6",
      "7a", "7b", "7c", "7d", "7e", "7f", "7g", "7h", "7i", "7j",
      "8", "9", "10a", "10b", "11",
      "12a", "12b", "12c", "12d", "12e", "12f", "12g", "12h", "12i", "12j",
      "13", "14", "15a", "15b", "16", "17a", "17b", "18", "19",
    ]);
    expect(SCHEDULE_2_COLUMNS.map((x) => x.no)).toEqual([
      "1", "2a", "2b", "2c", "3", "4", "5a", "5b", "6",
      "7a", "7b", "7c", "7d", "7e", "7f", "7g", "7h", "7i", "7j", "7k", "7l", "7m", "7n", "7o", "7p", "7q", "7r",
      "8", "9", "10a", "10b", "11",
      "12a", "12b", "12c", "12d", "12e", "12f", "12g", "12h", "12i", "12j", "12k", "12l", "12m", "12n",
      "13", "14", "15a", "15b", "16", "17a", "17b", "18", "19",
    ]);
    for (const sch of report().form.schedules) for (const r of sch.rows) expect(r).toHaveLength(sch.columns.length);
    // Each row agrees with that employee's 2316 (Items 19, 38, 52, 24 and 26).
    const certs = buildBir2316Report({ year: 2026, tenantId: "t", tenantName: "Tala", taxDue, employees: EMPLOYEES }).certificates;
    const item = (first: string, no: string) => {
      for (const sec of certs.find((x) => x.firstName === first)!.form.sections) for (const l of sec.lines) if (l.no === no) return BigInt(l.value ?? "0");
      throw new Error(no);
    };
    const s1 = schedule(1);
    for (const [first, i] of [["Cora", 0], ["Ana", 1]] as const) {
      expect(raw(s1, s1.rows[i]!, "7a")).toBe(item(first, "19"));
      expect(raw(s1, s1.rows[i]!, "7f")).toBe(item(first, "38"));
      expect(raw(s1, s1.rows[i]!, "7j")).toBe(item(first, "52"));
      expect(raw(s1, s1.rows[i]!, "14")).toBe(item(first, "24"));
      expect(raw(s1, s1.rows[i]!, "18")).toBe(item(first, "26"));
    }
    expect(JSON.stringify(report().form)).not.toMatch(/[–—]/);
  });

  it("T7 Gov't Reports offers the 1604-C, not the old .DAT file", () => {
    const page = readFileSync("src/app/(dashboard)/reports/page.tsx", "utf8");
    expect(page).toContain("BIR 1604-C: Annual Return and Alphalist");
    expect(page).toContain("/api/payroll/reports/bir/1604c");
    expect(page).not.toContain("datFileContent");
    expect(page).not.toContain("/api/payroll/reports/bir/alphalist");
  });

  it("T8 the viewer draws the return", () => {
    const html = renderToStaticMarkup(createElement(BirFormSheet, { view: report().form }));
    expect(html).toContain("BIR Form No. 1604-C");
    expect(html).toContain("Part I: Background Information");
    expect(html).toContain("Schedule 1: Alphalist of Employees");
    expect(html).toContain("Schedule 2: Alphalist of Minimum Wage Earners");
    expect(html).toContain("Present Employer");
    expect(html).toContain("Previous Employer");
    expect(html).toContain(">17b<");
    expect(html).toContain("TOTALS");
    expect(html).toContain("to fill in");
    expect(html).toContain("183,300.00");
    expect(html).toContain("(1,500.00)");
    expect(html).toContain("Notes");
  });
});
