/**
 * PAY-160: Statutory Contribution (Payroll sidebar). Each employee's SSS,
 * PhilHealth and Pag-IBIG employee and employer shares per month, from
 * FINALIZED runs, with the base each was computed on and the totals to remit
 * per agency.
 *
 * A run belongs to the month its period ends in, the same rule as the SSS
 * R-3, PhilHealth RF-1 and Pag-IBIG MCRF, so the totals here agree with
 * those forms for the same month.
 *
 * Pure: no database, no clock. The route loads the sheets.
 */

export interface ContributionSheetInput {
  employeeId: string;
  /** YYYY-MM of the run's period end. */
  month: string;
  sssEeCents: bigint;
  sssErCents: bigint;
  sssEcCents: bigint;
  philhealthEeCents: bigint;
  philhealthErCents: bigint;
  pagibigEeCents: bigint;
  pagibigErCents: bigint;
  /** PayrollSheet.statutoryBreakdown (bases, MPF split, SSS basis). */
  statutoryBreakdown: unknown;
}

export interface ContributionEmployee {
  employeeId: string;
  employeeNumber: string;
  name: string;
}

export type SssBasisNote = { kind: string; month: string } | null;

/** Amounts are centavos as strings. */
export interface ContributionRow {
  month: string;
  employeeId: string;
  employeeNumber: string;
  name: string;
  sss: {
    mscCents: string;
    eeRegularCents: string;
    erRegularCents: string;
    ecCents: string;
    eeMpfCents: string;
    erMpfCents: string;
    /** Regular SS plus MPF. */
    eeCents: string;
    /** Regular SS plus MPF (EC not included). */
    erCents: string;
    /** EE + ER + EC: what is remitted to SSS. */
    totalCents: string;
  };
  philhealth: { baseCents: string; eeCents: string; erCents: string; totalCents: string };
  pagibig: { baseCents: string; eeCents: string; erCents: string; totalCents: string };
  /** What the SSS contribution was based on (PAY-133), when recorded. */
  sssBasis: SssBasisNote;
  /** All three agencies. */
  eeCents: string;
  /** All three agencies, EC included. */
  erCents: string;
  totalCents: string;
}

export interface ContributionTotals {
  sss: { eeCents: string; erCents: string; ecCents: string; eeMpfCents: string; erMpfCents: string; totalCents: string };
  philhealth: { eeCents: string; erCents: string; totalCents: string };
  pagibig: { eeCents: string; erCents: string; totalCents: string };
  eeCents: string;
  erCents: string;
  totalCents: string;
}

export interface StatutoryContributionsReport {
  rows: ContributionRow[];
  totals: ContributionTotals;
}

type Breakdown = {
  deducted?: boolean;
  bases?: { sssMscCents?: string; philHealthMscCents?: string; pagibigMfsCents?: string };
  sss?: { eeMpfCents?: string; erMpfCents?: string };
  sssBasis?: { kind?: string; month?: string };
};

const big = (v: string | undefined) => {
  try {
    return BigInt(v ?? "0");
  } catch {
    return 0n;
  }
};
const max = (a: bigint, b: bigint) => (b > a ? b : a);

type Acc = {
  month: string;
  employeeId: string;
  sssMsc: bigint;
  sssEe: bigint;
  sssEr: bigint;
  sssEc: bigint;
  eeMpf: bigint;
  erMpf: bigint;
  phBase: bigint;
  phEe: bigint;
  phEr: bigint;
  piBase: bigint;
  piEe: bigint;
  piEr: bigint;
  basis: SssBasisNote;
};

/**
 * One row per employee per month: shares summed over the month's finalized
 * sheets; each base is the largest recorded that month (the sheet that
 * deducted; the other cutoff records zero), as the R-3 does for the MSC.
 * Rows are ordered by month, then employee name.
 */
export function buildStatutoryContributions(
  sheets: ContributionSheetInput[],
  employees: ContributionEmployee[],
): StatutoryContributionsReport {
  const acc = new Map<string, Acc>();
  for (const s of sheets) {
    const key = `${s.month}|${s.employeeId}`;
    const a =
      acc.get(key) ??
      ({
        month: s.month,
        employeeId: s.employeeId,
        sssMsc: 0n, sssEe: 0n, sssEr: 0n, sssEc: 0n, eeMpf: 0n, erMpf: 0n,
        phBase: 0n, phEe: 0n, phEr: 0n, piBase: 0n, piEe: 0n, piEr: 0n,
        basis: null,
      } satisfies Acc);
    const bd = (s.statutoryBreakdown ?? {}) as Breakdown;
    a.sssMsc = max(a.sssMsc, big(bd.bases?.sssMscCents));
    a.phBase = max(a.phBase, big(bd.bases?.philHealthMscCents));
    a.piBase = max(a.piBase, big(bd.bases?.pagibigMfsCents));
    a.sssEe += s.sssEeCents;
    a.sssEr += s.sssErCents;
    a.sssEc += s.sssEcCents;
    a.eeMpf += big(bd.sss?.eeMpfCents);
    a.erMpf += big(bd.sss?.erMpfCents);
    a.phEe += s.philhealthEeCents;
    a.phEr += s.philhealthErCents;
    a.piEe += s.pagibigEeCents;
    a.piEr += s.pagibigErCents;
    // The basis of the sheet that deducted is the one that applied.
    if (bd.sssBasis?.kind && bd.sssBasis.month && (bd.deducted || !a.basis)) {
      a.basis = { kind: bd.sssBasis.kind, month: bd.sssBasis.month };
    }
    acc.set(key, a);
  }

  const who = new Map(employees.map((e) => [e.employeeId, e]));
  const t = { sssEe: 0n, sssEr: 0n, sssEc: 0n, eeMpf: 0n, erMpf: 0n, phEe: 0n, phEr: 0n, piEe: 0n, piEr: 0n };
  const rows: ContributionRow[] = [...acc.values()].map((a) => {
    const e = who.get(a.employeeId);
    t.sssEe += a.sssEe; t.sssEr += a.sssEr; t.sssEc += a.sssEc; t.eeMpf += a.eeMpf; t.erMpf += a.erMpf;
    t.phEe += a.phEe; t.phEr += a.phEr; t.piEe += a.piEe; t.piEr += a.piEr;
    const ee = a.sssEe + a.phEe + a.piEe;
    const er = a.sssEr + a.sssEc + a.phEr + a.piEr;
    return {
      month: a.month,
      employeeId: a.employeeId,
      employeeNumber: e?.employeeNumber ?? "",
      name: e?.name ?? a.employeeId,
      sss: {
        mscCents: a.sssMsc.toString(),
        eeRegularCents: (a.sssEe - a.eeMpf).toString(),
        erRegularCents: (a.sssEr - a.erMpf).toString(),
        ecCents: a.sssEc.toString(),
        eeMpfCents: a.eeMpf.toString(),
        erMpfCents: a.erMpf.toString(),
        eeCents: a.sssEe.toString(),
        erCents: a.sssEr.toString(),
        totalCents: (a.sssEe + a.sssEr + a.sssEc).toString(),
      },
      philhealth: {
        baseCents: a.phBase.toString(),
        eeCents: a.phEe.toString(),
        erCents: a.phEr.toString(),
        totalCents: (a.phEe + a.phEr).toString(),
      },
      pagibig: {
        baseCents: a.piBase.toString(),
        eeCents: a.piEe.toString(),
        erCents: a.piEr.toString(),
        totalCents: (a.piEe + a.piEr).toString(),
      },
      sssBasis: a.basis,
      eeCents: ee.toString(),
      erCents: er.toString(),
      totalCents: (ee + er).toString(),
    };
  });
  rows.sort((x, y) => x.month.localeCompare(y.month) || x.name.localeCompare(y.name) || x.employeeId.localeCompare(y.employeeId));

  const ee = t.sssEe + t.phEe + t.piEe;
  const er = t.sssEr + t.sssEc + t.phEr + t.piEr;
  return {
    rows,
    totals: {
      sss: {
        eeCents: t.sssEe.toString(),
        erCents: t.sssEr.toString(),
        ecCents: t.sssEc.toString(),
        eeMpfCents: t.eeMpf.toString(),
        erMpfCents: t.erMpf.toString(),
        totalCents: (t.sssEe + t.sssEr + t.sssEc).toString(),
      },
      philhealth: { eeCents: t.phEe.toString(), erCents: t.phEr.toString(), totalCents: (t.phEe + t.phEr).toString() },
      pagibig: { eeCents: t.piEe.toString(), erCents: t.piEr.toString(), totalCents: (t.piEe + t.piEr).toString() },
      eeCents: ee.toString(),
      erCents: er.toString(),
      totalCents: (ee + er).toString(),
    },
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10" -> "Oct 2026". */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

/** Plain words for what an SSS contribution was based on (PAY-133). */
export function sssBasisLabel(b: SssBasisNote): string {
  if (!b) return "";
  const m = monthLabel(b.month);
  switch (b.kind) {
    case "PREVIOUS_MONTH_ACTUAL":
      return `${m} actual basic`;
    case "CONTRACTED_FALLBACK":
      return `Contracted basic (${m} not fully on Sentire)`;
    case "NEW_HIRE_NO_SSS":
      return `No SSS: not yet employed in ${m}`;
    default:
      return m;
  }
}

/** Centavos as a plain decimal for spreadsheets: "1234.50", "-5.00". */
export function csvAmount(cents: string | bigint): string {
  const c = BigInt(cents);
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** A text cell a spreadsheet must not read as a formula (a name typed as "=..."). */
function csvText(v: string): string {
  return csvCell(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
}

export const CONTRIBUTION_CSV_HEADER = [
  "Month",
  "Employee No.",
  "Employee",
  "SSS MSC",
  "SSS EE (regular)",
  "SSS ER (regular)",
  "SSS EC",
  "SSS MPF EE",
  "SSS MPF ER",
  "SSS total",
  "SSS based on",
  "PhilHealth base",
  "PhilHealth EE",
  "PhilHealth ER",
  "PhilHealth total",
  "Pag-IBIG base",
  "Pag-IBIG EE",
  "Pag-IBIG ER",
  "Pag-IBIG total",
  "Employee share",
  "Employer share",
  "Total",
] as const;

/** The report as CSV, one line per row and a TOTAL line. */
export function contributionsCsv(r: StatutoryContributionsReport): string {
  const lines = [CONTRIBUTION_CSV_HEADER.join(",")];
  for (const x of r.rows) {
    lines.push(
      [
        x.month,
        csvText(x.employeeNumber),
        csvText(x.name),
        csvAmount(x.sss.mscCents),
        csvAmount(x.sss.eeRegularCents),
        csvAmount(x.sss.erRegularCents),
        csvAmount(x.sss.ecCents),
        csvAmount(x.sss.eeMpfCents),
        csvAmount(x.sss.erMpfCents),
        csvAmount(x.sss.totalCents),
        csvText(sssBasisLabel(x.sssBasis)),
        csvAmount(x.philhealth.baseCents),
        csvAmount(x.philhealth.eeCents),
        csvAmount(x.philhealth.erCents),
        csvAmount(x.philhealth.totalCents),
        csvAmount(x.pagibig.baseCents),
        csvAmount(x.pagibig.eeCents),
        csvAmount(x.pagibig.erCents),
        csvAmount(x.pagibig.totalCents),
        csvAmount(x.eeCents),
        csvAmount(x.erCents),
        csvAmount(x.totalCents),
      ].join(","),
    );
  }
  const t = r.totals;
  const regEe = BigInt(t.sss.eeCents) - BigInt(t.sss.eeMpfCents);
  const regEr = BigInt(t.sss.erCents) - BigInt(t.sss.erMpfCents);
  lines.push(
    [
      "TOTAL", "", "", "",
      csvAmount(regEe), csvAmount(regEr), csvAmount(t.sss.ecCents),
      csvAmount(t.sss.eeMpfCents), csvAmount(t.sss.erMpfCents), csvAmount(t.sss.totalCents), "",
      "", csvAmount(t.philhealth.eeCents), csvAmount(t.philhealth.erCents), csvAmount(t.philhealth.totalCents),
      "", csvAmount(t.pagibig.eeCents), csvAmount(t.pagibig.erCents), csvAmount(t.pagibig.totalCents),
      csvAmount(t.eeCents), csvAmount(t.erCents), csvAmount(t.totalCents),
    ].join(","),
  );
  return `${lines.join("\r\n")}\r\n`;
}
