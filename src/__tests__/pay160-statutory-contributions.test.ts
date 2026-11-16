/**
 * PAY-160 (Mark, 16 Nov 2026 23:22): the sidebar's "Statutory Contribution"
 * was a "Soon" placeholder. It is now a page: each employee's SSS, PhilHealth
 * and Pag-IBIG shares per month from finalized runs.
 *
 *   C1  one row per employee per month: shares summed over the month's
 *       sheets (the first cutoff deducts, the second records zero); SSS split
 *       into regular SS, EC and MPF; each base is the one recorded that month;
 *       the SSS basis (PAY-133) is the deducting sheet's; rows ordered by
 *       month, then name.
 *   C2  the totals agree with the SSS R-3, PhilHealth RF-1 and Pag-IBIG MCRF
 *       built from the same sheets, and every row's MSC with the R-3's.
 *   C3  the CSV: header, one line per row, a TOTAL line, amounts as plain
 *       decimals, commas and quotes escaped, and a name typed as a formula
 *       is not run by a spreadsheet.
 *   C4  the sidebar's Statutory Contribution is a real link to the page (no
 *       longer "Soon"), and the page and API only read.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildStatutoryContributions,
  CONTRIBUTION_CSV_HEADER,
  contributionsCsv,
  csvAmount,
  sssBasisLabel,
  type ContributionSheetInput,
} from "@/lib/payroll/reports/statutory-contributions";
import { buildSssR3Report } from "@/lib/payroll/reports/sss-r3";
import { buildPhilhealthRf1Report } from "@/lib/payroll/reports/philhealth-rf1";
import { buildPagibigMcrfReport } from "@/lib/payroll/reports/pagibig-mcrf";

type Opt = Partial<Omit<ContributionSheetInput, "employeeId" | "month">>;
function sheet(employeeId: string, month: string, o: Opt = {}): ContributionSheetInput {
  return {
    employeeId,
    month,
    sssEeCents: 0n,
    sssErCents: 0n,
    sssEcCents: 0n,
    philhealthEeCents: 0n,
    philhealthErCents: 0n,
    pagibigEeCents: 0n,
    pagibigErCents: 0n,
    statutoryBreakdown: { deducted: false, bases: { sssMscCents: "0", philHealthMscCents: "0", pagibigMfsCents: "0" } },
    ...o,
  };
}
/** A first-cutoff sheet that deducted everything for the month. */
function deducted(employeeId: string, month: string, msc: number, ph: number, basis: { kind: string; month: string }) {
  const mpfBase = Math.max(0, msc - 2_000_000);
  const regBase = Math.min(msc, 2_000_000);
  const eeMpf = Math.round(mpfBase * 0.05), erMpf = Math.round(mpfBase * 0.1);
  const ee = Math.round(regBase * 0.05) + eeMpf, er = Math.round(regBase * 0.1) + erMpf;
  return sheet(employeeId, month, {
    sssEeCents: BigInt(ee),
    sssErCents: BigInt(er),
    sssEcCents: msc > 1_475_000 ? 3_000n : 1_000n,
    philhealthEeCents: BigInt(Math.round(ph * 0.025)),
    philhealthErCents: BigInt(Math.round(ph * 0.025)),
    pagibigEeCents: 20_000n,
    pagibigErCents: 20_000n,
    statutoryBreakdown: {
      deducted: true,
      bases: { sssMscCents: String(msc), philHealthMscCents: String(ph), pagibigMfsCents: "1000000" },
      sss: { eeMpfCents: String(eeMpf), erMpfCents: String(erMpf) },
      sssBasis: { kind: basis.kind, month: basis.month },
    },
  });
}

const EMPLOYEES = [
  { employeeId: "a", employeeNumber: "EMP-0001", name: "Santos, Ana" },
  { employeeId: "b", employeeNumber: "EMP-0002", name: "Dela Cruz, Jose" },
  { employeeId: "c", employeeNumber: "EMP-0005", name: "Mendoza, Liza" },
];

const NOV: ContributionSheetInput[] = [
  deducted("a", "2026-11", 3_000_000, 3_000_000, { kind: "CONTRACTED_FALLBACK", month: "2026-10" }),
  sheet("a", "2026-11", {
    statutoryBreakdown: { deducted: false, bases: {}, sssBasis: { kind: "CONTRACTED_FALLBACK", month: "2026-10" } },
  }),
  deducted("b", "2026-11", 2_500_000, 2_500_000, { kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10" }),
  sheet("b", "2026-11"),
  // A new hire: no SSS this month, PhilHealth and Pag-IBIG still deducted.
  sheet("c", "2026-11", {
    philhealthEeCents: 70_000n,
    philhealthErCents: 70_000n,
    pagibigEeCents: 20_000n,
    pagibigErCents: 20_000n,
    statutoryBreakdown: {
      deducted: true,
      bases: { sssMscCents: "0", philHealthMscCents: "2800000", pagibigMfsCents: "1000000" },
      sss: { eeMpfCents: "0", erMpfCents: "0" },
      sssBasis: { kind: "NEW_HIRE_NO_SSS", month: "2026-10" },
    },
  }),
];
const OCT = [deducted("a", "2026-10", 3_000_000, 3_000_000, { kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-09" })];

describe("PAY-160 statutory contributions", () => {
  it("C1 one row per employee per month, SSS split, bases and basis", () => {
    const r = buildStatutoryContributions([...NOV, ...OCT], EMPLOYEES);
    expect(r.rows.map((x) => [x.month, x.name])).toEqual([
      ["2026-10", "Santos, Ana"],
      ["2026-11", "Dela Cruz, Jose"],
      ["2026-11", "Mendoza, Liza"],
      ["2026-11", "Santos, Ana"],
    ]);
    const a = r.rows.find((x) => x.month === "2026-11" && x.employeeId === "a")!;
    expect(a).toMatchObject({
      employeeNumber: "EMP-0001",
      sss: {
        mscCents: "3000000",
        eeRegularCents: "100000",
        erRegularCents: "200000",
        ecCents: "3000",
        eeMpfCents: "50000",
        erMpfCents: "100000",
        eeCents: "150000",
        erCents: "300000",
        totalCents: "453000",
      },
      philhealth: { baseCents: "3000000", eeCents: "75000", erCents: "75000", totalCents: "150000" },
      pagibig: { baseCents: "1000000", eeCents: "20000", erCents: "20000", totalCents: "40000" },
      sssBasis: { kind: "CONTRACTED_FALLBACK", month: "2026-10" },
      eeCents: "245000",
      erCents: "398000",
      totalCents: "643000",
    });
    const c = r.rows.find((x) => x.employeeId === "c")!;
    expect(c.sss).toMatchObject({ mscCents: "0", totalCents: "0" });
    expect(c.sssBasis).toEqual({ kind: "NEW_HIRE_NO_SSS", month: "2026-10" });
    expect(sssBasisLabel(c.sssBasis)).toBe("No SSS: not yet employed in Oct 2026");
    expect(sssBasisLabel(a.sssBasis)).toBe("Contracted basic (Oct 2026 not fully on Sentire)");
    expect(sssBasisLabel({ kind: "PREVIOUS_MONTH_ACTUAL", month: "2026-10" })).toBe("Oct 2026 actual basic");

    // Totals are the sum of the rows.
    const sum = (f: (x: (typeof r.rows)[number]) => string) => r.rows.reduce((s, x) => s + BigInt(f(x)), 0n).toString();
    expect(r.totals.sss.totalCents).toBe(sum((x) => x.sss.totalCents));
    expect(r.totals.philhealth.totalCents).toBe(sum((x) => x.philhealth.totalCents));
    expect(r.totals.pagibig.totalCents).toBe(sum((x) => x.pagibig.totalCents));
    expect(r.totals.totalCents).toBe(sum((x) => x.totalCents));
    expect(BigInt(r.totals.eeCents) + BigInt(r.totals.erCents)).toBe(BigInt(r.totals.totalCents));
  });

  it("C2 the totals agree with the R-3, RF-1 and MCRF for the same month", () => {
    const r = buildStatutoryContributions(NOV, EMPLOYEES);
    const people = EMPLOYEES.map((e) => ({
      employeeId: e.employeeId,
      employeeNumber: e.employeeNumber,
      firstName: e.name.split(", ")[1]!,
      middleName: null,
      lastName: e.name.split(", ")[0]!,
      suffix: null,
    }));
    const base = (s: ContributionSheetInput, k: string) =>
      BigInt(((s.statutoryBreakdown as { bases?: Record<string, string> }).bases ?? {})[k] ?? "0");
    const of = (id: string) => NOV.filter((s) => s.employeeId === id);
    const common = { year: 2026, month: 11, tenantId: "t", tenantName: "T" };
    const r3 = buildSssR3Report({
      ...common,
      employees: people.map((p) => ({
        ...p,
        sheets: of(p.employeeId).map((s) => ({
          sssEeCents: s.sssEeCents,
          sssErCents: s.sssErCents,
          sssEcCents: s.sssEcCents,
          sssMscCents: base(s, "sssMscCents"),
        })),
      })),
    });
    const rf1 = buildPhilhealthRf1Report({
      ...common,
      employees: people.map((p) => ({
        ...p,
        sheets: of(p.employeeId).map((s) => ({
          philhealthEeCents: s.philhealthEeCents,
          philhealthErCents: s.philhealthErCents,
          philhealthMscCents: base(s, "philHealthMscCents"),
        })),
      })),
    });
    const mcrf = buildPagibigMcrfReport({
      ...common,
      employees: people.map((p) => ({
        ...p,
        sheets: of(p.employeeId).map((s) => ({
          pagibigEeCents: s.pagibigEeCents,
          pagibigErCents: s.pagibigErCents,
          pagibigMfsCents: base(s, "pagibigMfsCents"),
        })),
      })),
    });
    expect(r.totals.sss).toMatchObject({
      eeCents: r3.totalSssEeCents,
      erCents: r3.totalSssErCents,
      ecCents: r3.totalSssEcCents,
      totalCents: r3.totalSssContributionCents,
    });
    expect(r.totals.philhealth).toEqual({
      eeCents: rf1.totalPhilhealthEeCents,
      erCents: rf1.totalPhilhealthErCents,
      totalCents: rf1.totalPremiumCents,
    });
    expect(r.totals.pagibig).toEqual({
      eeCents: mcrf.totalPagibigEeCents,
      erCents: mcrf.totalPagibigErCents,
      totalCents: mcrf.totalContributionCents,
    });
    for (const e of r3.entries) {
      expect(r.rows.find((x) => x.employeeId === e.employeeId)!.sss.mscCents, e.employeeId).toBe(e.sssMscCents);
    }
    expect(BigInt(r.totals.sss.totalCents)).toBeGreaterThan(0n); // vacuity guard
  });

  it("C3 the CSV", () => {
    const tricky = [
      ...EMPLOYEES.slice(0, 2),
      { employeeId: "c", employeeNumber: "EMP-0005", name: '=HYPERLINK("x"), "Liza"' },
    ];
    const csv = contributionsCsv(buildStatutoryContributions(NOV, tricky));
    const lines = csv.split("\r\n");
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(lines[0]).toBe(CONTRIBUTION_CSV_HEADER.join(","));
    expect(lines).toHaveLength(1 + 3 + 1 + 1); // header, rows, TOTAL, trailing empty
    const line = (no: string) => lines.find((l) => l.startsWith(`2026-11,${no},`))!;
    expect(line("EMP-0002")).toBe(
      "2026-11,EMP-0002,\"Dela Cruz, Jose\",25000.00,1000.00,2000.00,30.00,250.00,500.00,3780.00,Oct 2026 actual basic,25000.00,625.00,625.00,1250.00,10000.00,200.00,200.00,400.00,2075.00,3355.00,5430.00",
    );
    // The formula-looking name is quoted as text with a leading apostrophe.
    expect(line("EMP-0005").startsWith('2026-11,EMP-0005,"\'=HYPERLINK(""x""), ""Liza""",')).toBe(true);
    expect(lines[4]!.startsWith("TOTAL,,,,")).toBe(true);
    const cells = lines[4]!.split(",");
    expect(cells).toHaveLength(CONTRIBUTION_CSV_HEADER.length);
    expect(cells.at(-1)).toBe(csvAmount(buildStatutoryContributions(NOV, tricky).totals.totalCents));
    expect(csvAmount("-5")).toBe("-0.05");
    expect(csvAmount(123456n)).toBe("1234.56");
  });

  it("C4 the sidebar links to the page, and the page and API only read", () => {
    const nav = readFileSync("src/components/sidebar-nav.tsx", "utf8");
    expect(nav).toMatch(
      /\{ href: "\/payroll\/statutory-contributions", label: "Statutory Contribution", icon: "premium" \}/,
    );
    expect(nav).not.toMatch(/soon-statutory-contribution/);
    const PAGE = "src/app/(dashboard)/payroll/statutory-contributions/page.tsx";
    const ROUTE = "src/app/api/payroll/statutory-contributions/route.ts";
    expect(existsSync(PAGE)).toBe(true);
    const page = readFileSync(PAGE, "utf8");
    expect(page).toMatch(/fetch\(`\/api\/payroll\/statutory-contributions\?\$\{query\}`\)/);
    expect(page).toMatch(/href=\{`\/api\/payroll\/statutory-contributions\?\$\{query\}&format=csv`\}/);
    expect(page).not.toMatch(/method:\s*"(POST|PUT|PATCH|DELETE)"/);
    const route = readFileSync(ROUTE, "utf8");
    expect(route.match(/export async function (\w+)/g)).toEqual(["export async function GET"]);
    expect(route).toMatch(/forbidUnless\(auth, \["PAYROLL", "READ"\]\)/);
    expect(route).toMatch(/status: "FINALIZED", periodEnd: \{ gte: from, lte: to \}/);
  });
});
