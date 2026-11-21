/**
 * PAY-152: formatting and CSV for the 13th Month Accrual page.
 */
export type AccrualRowView = {
  employeeId: string; employeeNumber: string; name: string; runs: number;
  basisFromRunsCents: string; basisFromOpeningCents: string; accruedToDateCents: string;
  monthlyBasicCents: string; projectedPayoutCents: string; paidCents: string; differenceCents: string | null;
};
export type AccrualReportView = {
  year: number; asOf: string | null; monthsLeft: number; rows: AccrualRowView[];
  totals: { basisFromRunsCents: string; basisFromOpeningCents: string; accruedToDateCents: string; projectedPayoutCents: string; paidCents: string; differenceCents: string };
  journal: { month: number; accrualCents: string; payoutCents: string }[];
  notes: string[];
};

export function peso(cents: string | null | undefined): string {
  if (cents == null) return "";
  const n = BigInt(cents);
  const neg = n < 0n;
  const a = neg ? -n : n;
  const whole = (a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const s = `${whole}.${(a % 100n).toString().padStart(2, "0")}`;
  return neg ? `(${s})` : s;
}

const plain = (cents: string | null) => {
  if (cents == null) return "";
  const n = BigInt(cents); const a = n < 0n ? -n : n;
  return `${n < 0n ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
};

export function accrualCsv(r: AccrualReportView): string {
  const head = ["employee_number", "name", "runs", "basis_from_runs", "basis_from_opening", "accrued_to_date", "monthly_basic", "projected_payout", "paid", "difference"];
  const lines = [head.join(",")];
  for (const x of r.rows) {
    lines.push([x.employeeNumber, `"${x.name.replace(/"/g, '""')}"`, x.runs, plain(x.basisFromRunsCents), plain(x.basisFromOpeningCents), plain(x.accruedToDateCents), plain(x.monthlyBasicCents), plain(x.projectedPayoutCents), plain(x.paidCents), plain(x.differenceCents)].join(","));
  }
  const t = r.totals;
  lines.push(["TOTAL", "", "", plain(t.basisFromRunsCents), plain(t.basisFromOpeningCents), plain(t.accruedToDateCents), "", plain(t.projectedPayoutCents), plain(t.paidCents), plain(t.differenceCents)].join(","));
  return `${lines.join("\n")}\n`;
}

