/**
 * PAY-200: the BIR 1604-C alphalist .DAT file in the format of BIR's
 * Alphalist Data Entry and Validation module 7.4 (Mark, ruling 6, 20 Nov:
 * "Get it from BIR validation module"). Format: docs/BIR_ALPHALIST_DAT.md.
 *
 * The file is checked here by a validator written from that document, apart
 * from the builder, so the builder does not grade itself.
 *
 * Worked by hand:
 *   Dina Reyes (not an MWE): Nov payslip gross 300,000.00, all taxable,
 *     tax 7,500.00 = (300,000.00 - 250,000.00) x 15% under the test table.
 *   Ben Peña (MWE, NCR, 610.00 a day, 261 days): Nov gross 17,265.25,
 *     taxable 1,543.00, no tax due.
 *
 *   T1  file name, header, one D1 and one D2 line, C1 and C2, CR LF
 *       endings; the column counts BIR's validator requires (fails on main:
 *       no .DAT builder).
 *   T2  every line passes the validator: amounts, dates, quoted names,
 *       region on every row, and the D1 formulas to the centavo.
 *   T3  the control lines are the column totals of their D lines, with no
 *       PERA total.
 *   T4  names are made plain for BIR (Peña is PENA) with a warning;
 *       Sentire's regions map to BIR's (REGION_IV_A is IV-A, BARMM is ARMM).
 *   T5  BIR would reject it, so the builder says so: tax due different from
 *       tax withheld, no region, no company TIN.
 *   T6  the Gov't Reports card downloads the file, and blocks the download
 *       when the file has errors.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Bir1604cEmployeeInput } from "@/lib/payroll/reports/bir-1604c";
import { birRegionCode, buildAlphalistDat, datAmount, datName } from "@/lib/payroll/reports/bir-1604c-dat";
import { splitSheet, factsFromSheet, type BirSheetRow } from "@/lib/payroll/reports/bir-comp";

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
const sheet = (r: BirSheetRow, month: number) => ({ ...r, comp: splitSheet(factsFromSheet(r)), month });
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

const DINA = row({ grossCompensationCents: c("300,000.00"), grossTaxableIncomeCents: c("300,000.00"), basePayCents: c("300,000.00"), withholdingTaxCents: c("7,500.00") });
const BEN = row({
  grossCompensationCents: c("17,265.25"), mweExemptCompensationCents: c("14,472.25"),
  nontaxableCompensationCents: c("1,250.00"), grossTaxableIncomeCents: c("1,543.00"),
  sssEeCents: c("700.00"), philhealthEeCents: c("350.00"), pagibigEeCents: c("200.00"),
  basePayCents: c("13,420.00"), otPayCents: c("381.25"), nsdPayCents: c("61.00"),
  holidayPayCents: c("610.00"), restDayPayCents: c("793.00"),
  payComponentsApplied: [{ kind: "ALLOWANCE", taxability: "TAXABLE", nonTaxablePortionCents: "0", taxablePortionCents: "200000" }],
});

const person = (tin: string | null, from: string, to: string) => ({
  tin, address: null, zipCode: null, birthDate: null, contactNumber: null,
  periodFrom: d(from), periodTo: d(to), smwDailyCents: c("610.00"), smwMonthlyCents: c("13,267.50"),
});
const base = (first: string, last: string, middle: string | null) => ({
  employeeId: first.toLowerCase(), employeeNumber: `E-${first}`, firstName: first, middleName: middle, lastName: last, suffix: null,
});
const dina = (over: Partial<Bir1604cEmployeeInput> = {}): Bir1604cEmployeeInput => ({
  ...base("Dina", "Reyes", "Cruz"), person: person("111-222-333-00000", "2026-01-05", "2026-12-31"),
  taxClassification: "REGULAR", sheets: [sheet(DINA, 11)], nationality: "Filipino", employmentStatusCode: "R",
  region: "REGION_IV_A", separatedInYear: false, ...over,
});
const ben = (): Bir1604cEmployeeInput => ({
  ...base("Ben", "Peña", null), person: person("444555666", "2026-01-01", "2026-12-31"),
  taxClassification: "MWE", sheets: [sheet(BEN, 11)], nationality: "Filipino", employmentStatusCode: "R",
  region: "NCR", daysPerYear: 261, separatedInYear: false,
});
const taxDue = (x: bigint) => (x > c("250,000.00") ? ((x - c("250,000.00")) * 15n) / 100n : 0n);
const AGENT = { tin: "123-456-789-00000", rdoCode: "043", name: "Tala Trading Inc.", address: "Marikina City", zipCode: "1800", contactNumber: null, email: null };
const build = (employees: Bir1604cEmployeeInput[], agent: typeof AGENT | undefined = AGENT) =>
  buildAlphalistDat({ year: 2026, tenantId: "t", tenantName: "Tala", agent, taxDue, employees });

// ---------------------------------------------------------------------------
// An independent validator, written from docs/BIR_ALPHALIST_DAT.md.
// ---------------------------------------------------------------------------
const AMOUNT = /^-?\d+\.\d{2}$/;
const DATE = /^\d{2}\/\d{2}\/\d{4}$/;
const REGIONS = ["I", "II", "III", "IV-A", "IV-B", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "NCR", "ARMM", "CAR"];
const cents = (s: string) => BigInt(s.replace(".", ""));

function validate(content: string): string[] {
  const errors: string[] = [];
  const lines = content.split("\r\n");
  if (lines.pop() !== "") errors.push("file does not end with CR LF");
  if (lines.some((l) => l.includes("\n") || l.includes("\r"))) errors.push("bare line feed");
  lines.forEach((l, i) => {
    const f = l.split(",");
    const at = (n: number) => f[n - 1] ?? "";
    const err = (m: string) => errors.push(`line ${i + 1}: ${m}`);
    const money = (from: number, to: number) => { for (let n = from; n <= to; n++) if (!AMOUNT.test(at(n))) err(`col ${n} amount "${at(n)}"`); };
    const name = (n: number) => { if (!/^"[\x20-\x7e]*"$/.test(at(n)) || /[&'|]/.test(at(n).slice(1, -1)) || at(n).slice(1, -1).includes('"')) err(`col ${n} name ${at(n)}`); };
    if (f[0] === "H1604C") {
      if (f.length > 7) err("header too long");
      if (!/^\d{9}$/.test(at(2)) || !/^\d{4}$/.test(at(3)) || at(4) !== "12/31/2026") err("header fields");
      return;
    }
    if (f[0] === "D1" || f[0] === "D2") {
      const want = f[0] === "D1" ? 49 : 59;
      if (f.length !== want) err(`${f[0]} has ${f.length} columns, not ${want}`);
      if (at(want) === "") err(`${f[0]} column ${want} is empty`);
      if (at(2) !== "1604C" || !/^\d+$/.test(at(6))) err("form or sequence");
      if (at(7) !== "" && (!/^\d{9}$/.test(at(7)) || !/^\d{4}$/.test(at(8)))) err("payee TIN or branch");
      name(9); name(10); name(11);
      if (!REGIONS.includes(at(12))) err(`region "${at(12)}"`);
      if (f[0] === "D1") {
        money(13, 23); money(26, 44); money(49, 49);
        if (!DATE.test(at(24)) || !DATE.test(at(25))) err("dates");
        const v = (n: number) => cents(at(n));
        const sum = (a: number, b: number) => { let t = 0n; for (let n = a; n <= b; n++) t += v(n); return t; };
        if (v(13) !== 0n && v(13) !== v(19) + v(23)) err("13 = 19 + 23");
        if (v(19) !== sum(14, 18)) err("19 = 14..18");
        if (v(23) !== sum(20, 22)) err("23 = 20..22");
        if (v(26) !== v(32) + v(36)) err("26 = 32 + 36");
        if (v(32) !== sum(27, 31)) err("32 = 27..31");
        if (v(36) !== sum(33, 35)) err("36 = 33..35");
        if (v(37) !== v(23) + v(36) || v(38) !== v(37)) err("37, 38");
        if (v(42) !== 0n && v(42) !== v(39) - v(40) - v(41) - v(49)) err("42");
        if (v(44) !== v(39)) err("44 = 39");
        if (!["R", "C", "CP", "S", "P", "AL"].includes(at(46)) || !["Y", "N"].includes(at(48))) err("status or filing");
      } else {
        money(13, 26); money(29, 32); money(34, 53); money(58, 59);
        if (!/^\d+$/.test(at(33))) err("factor");
        if (!DATE.test(at(27)) || !DATE.test(at(28))) err("dates");
      }
      return;
    }
    if (f[0] === "C1" || f[0] === "C2") {
      const want = f[0] === "C1" ? 35 : 43;
      if (f.length !== want) err(`${f[0]} has ${f.length} columns, not ${want}`);
      money(6, want);
      return;
    }
    err(`unknown line ${f[0]}`);
  });
  return errors;
}

const linesOf = (content: string) => content.split("\r\n").filter(Boolean).map((l) => l.split(","));

describe("PAY-200 BIR 1604-C alphalist .DAT", () => {
  it("T1 file name, lines and column counts", () => {
    const dat = build([dina(), ben()]);
    expect(dat.fileName).toBe("12345678900001231" + "20261604C.DAT");
    expect(dat.content.endsWith("\r\n")).toBe(true);
    const ls = linesOf(dat.content);
    expect(ls.map((l) => l[0])).toEqual(["H1604C", "D1", "D2", "C1", "C2"]);
    expect(ls[0]!.join(",")).toBe("H1604C,123456789,0000,12/31/2026");
    expect(ls.map((l) => l.length)).toEqual([4, 49, 59, 35, 43]);
    expect(dat.valid).toBe(true);
  });

  it("T2 every line passes the validator", () => {
    const dat = build([dina(), ben()]);
    expect(validate(dat.content)).toEqual([]);
    const [, d1, d2] = linesOf(dat.content);
    // D1: identity, then the worked figures.
    expect(d1!.slice(0, 12)).toEqual(["D1", "1604C", "123456789", "0000", "12/31/2026", "1", "111222333", "0000", '"REYES"', '"DINA"', '"CRUZ"', "IV-A"]);
    expect(d1![23]).toBe("01/05/2026"); expect(d1![24]).toBe("12/31/2026");
    expect(d1![25]).toBe("300000.00");  // 26 gross
    expect(d1![35]).toBe("300000.00");  // 36 total taxable
    expect(d1![38]).toBe("7500.00");    // 39 tax due
    expect(d1![40]).toBe("7500.00");    // 41 withheld Jan to Nov
    expect(d1![43]).toBe("7500.00");    // 44 as adjusted
    expect(d1!.slice(44)).toEqual(["FILIPINO", "R", "NA", "Y", "0.00"]);
    // D2: the MWE, with the daily rate, factor and the nontax basic in 59.
    expect(d2!.slice(9, 12)).toEqual(['"BEN"', '""', "NCR"]);
    expect(d2![28]).toBe("17265.25");   // 29 gross
    expect(d2![29]).toBe("610.00");     // 30 SMW per day
    expect(d2![32]).toBe("261");        // 33 factor
    expect(d2![58]).not.toBe("");       // 59 nontax basic
  });

  it("T3 control lines total their D lines, without PERA", () => {
    const two = dina({ ...base("Ely", "Ramos", null), employeeId: "ely" });
    const dat = build([dina(), two, ben()]);
    expect(validate(dat.content)).toEqual([]);
    const ls = linesOf(dat.content);
    const d1s = ls.filter((l) => l[0] === "D1");
    const c1 = ls.find((l) => l[0] === "C1")!;
    const cols1 = [...Array.from({ length: 11 }, (_, k) => 13 + k), ...Array.from({ length: 19 }, (_, k) => 26 + k)];
    cols1.forEach((n, k) => {
      const t = d1s.reduce((a, l) => a + cents(l[n - 1]!), 0n);
      expect(c1[5 + k]).toBe(datAmount(t));
    });
    expect(c1.slice(0, 5)).toEqual(["C1", "1604C", "123456789", "0000", "12/31/2026"]);
    const d2 = ls.find((l) => l[0] === "D2")!;
    const c2 = ls.find((l) => l[0] === "C2")!;
    const cols2 = [...Array.from({ length: 14 }, (_, k) => 13 + k), 29, 30, 31, 32, ...Array.from({ length: 20 }, (_, k) => 34 + k)];
    cols2.forEach((n, k) => expect(c2[5 + k]).toBe(d2[n - 1]));
  });

  it("T4 names made plain, regions mapped", () => {
    expect(datName("Peña").value).toBe("PENA");
    expect(datName("O'Brien & Sons, Jr.")).toEqual({ value: "OBRIEN AND SONS JR.", changed: true });
    expect(birRegionCode("REGION_IV_A")).toBe("IV-A");
    expect(birRegionCode("BARMM")).toBe("ARMM");
    expect(birRegionCode("REGION_XIII")).toBe("XIII");
    expect(birRegionCode("NCR")).toBe("NCR");
    expect(birRegionCode("Mars")).toBeNull();
    const dat = build([dina(), ben()]);
    expect(linesOf(dat.content)[2]![8]).toBe('"PENA"');
    expect(dat.issues).toContainEqual(expect.objectContaining({ severity: "warning", employee: "Peña, Ben", column: 9 }));
    expect(datAmount(-1200n)).toBe("-12.00");
    expect(datAmount(5n)).toBe("0.05");
  });

  it("T5 the builder says when BIR would reject the file", () => {
    const short = row({ grossCompensationCents: c("300,000.00"), grossTaxableIncomeCents: c("300,000.00"), basePayCents: c("300,000.00"), withholdingTaxCents: c("7,000.00") });
    const under = build([dina({ sheets: [sheet(short, 11)] })]);
    expect(under.valid).toBe(false);
    expect(under.issues).toContainEqual(expect.objectContaining({ severity: "error", line: 2, column: 44 }));

    const noRegion = build([dina({ region: null })]);
    expect(noRegion.valid).toBe(false);
    expect(noRegion.issues).toContainEqual(expect.objectContaining({ severity: "error", column: 12 }));

    const noTin = build([dina()], { ...AGENT, tin: "" });
    expect(noTin.valid).toBe(false);
    expect(noTin.issues[0]!.message).toContain("company TIN");
  });

  it("T6 the Gov't Reports card downloads the file and blocks it on errors", () => {
    const route = readFileSync("src/app/api/payroll/reports/bir/1604c/route.ts", "utf8");
    expect(route).toContain("buildAlphalistDat");
    const page = readFileSync("src/app/(dashboard)/reports/page.tsx", "utf8");
    expect(page).toContain('fileField: "alphalistDatText"');
    expect(page).toContain("alphalistDatIssues");
    expect(page).not.toContain("datFileContent");
  });
});
