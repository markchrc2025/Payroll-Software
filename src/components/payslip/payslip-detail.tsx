"use client";

/**
 * The rendered payslip: the employee's own view in ESS (/ess/payslips) and the
 * admin's view from a finalized payroll run (/payroll/[id]) use the same body
 * and the same PDF, so both always show the same figures.
 */
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface Payslip {
  version: "v1";
  period: { start: string; end: string; cycle: string; runType: string };
  employee: {
    employeeNumber: string;
    name: string;
    taxClassification: string;
    department: string | null;
    branch: string | null;
    position: string | null;
  };
  tenant: { name: string };
  earnings: {
    basePay: string;
    lateUndertimeDeduction: string;
    otPay: string;
    nsdPay: string;
    holidayPay: string;
    restDayPay: string;
    hazardPay: string;
    taxableAllowances: string;
    grossCompensation: string;
  };
  nonTaxable: {
    nontaxableCompensation: string;
    nontaxable13MonthAndBenefits: string;
  };
  statutory: {
    sssEe: string;
    philhealthEe: string;
    pagibigEe: string;
  };
  tax: { grossTaxableIncome: string; withholdingTax: string };
  loans: { loanDeductions: string };
  net: { netPay: string };
  ytd: {
    grossCents: string;
    wtaxCents: string;
    basicCents: string;
    released13thMonthCents: string;
    accrued13thMonthCents: string;
  };
  tardinessMinutes: number;
  leaveBalances: { code: string; name: string; available: string }[];
}

export function fmt(cents: string) {
  const n = Number(cents) / 100;
  return n.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function PayslipRow({ label, value, bold, red, indent }: { label: string; value: string; bold?: boolean; red?: boolean; indent?: boolean }) {
  if (Number(value) === 0) return null;
  return (
    <div className={`flex justify-between text-sm py-0.5 ${indent ? "pl-4" : ""}`}>
      <span className={bold ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={`${bold ? "font-semibold" : ""} ${red ? "text-red-500" : ""}`}>{fmt(value)}</span>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mt-4 mb-1 border-b pb-1">{title}</p>;
}

// ── PDF download ─────────────────────────────────────────────────────────────
// PAY-139: the PDF is rendered on the server (src/lib/payslip/pdf-document.tsx)
// so the admin download, the employee's download and the stored copy are the
// same document. This only fetches it and saves it.

export async function downloadPayslipPdf(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const name =
    /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "payslip.pdf";
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function PayslipDetailBody({
  detail,
  onDownload,
  downloading,
}: {
  detail: Payslip;
  onDownload: () => void;
  downloading: boolean;
}) {
  return (
    <div className="space-y-1 text-sm">

      {/* Tenant + period header */}
      <div className="bg-[#1E3A5F] rounded-xl p-4 text-white">
        <p className="font-bold text-base">{detail.tenant.name}</p>
        <p className="text-white/60 text-xs mt-0.5">
          {fmtDate(detail.period.start)} – {fmtDate(detail.period.end)} · {detail.period.cycle} · {detail.period.runType}
        </p>
      </div>

      {/* Employee info */}
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
        <p className="font-semibold text-[15px]">{detail.employee.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{detail.employee.employeeNumber}</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {detail.employee.position && <Badge variant="outline" className="text-xs">{detail.employee.position}</Badge>}
          {detail.employee.department && <Badge variant="outline" className="text-xs">{detail.employee.department}</Badge>}
          {detail.employee.branch && <Badge variant="outline" className="text-xs">{detail.employee.branch}</Badge>}
          <Badge variant="secondary" className="text-xs">{detail.employee.taxClassification.replace(/_/g, " ")}</Badge>
        </div>
      </div>

      {/* Earnings */}
      <SectionTitle title="Earnings" />
      <PayslipRow label="Basic Pay" value={detail.earnings.basePay} indent />
      <PayslipRow label="OT Pay" value={detail.earnings.otPay} indent />
      <PayslipRow label="Night Shift Differential" value={detail.earnings.nsdPay} indent />
      <PayslipRow label="Holiday Pay" value={detail.earnings.holidayPay} indent />
      <PayslipRow label="Rest Day Pay" value={detail.earnings.restDayPay} indent />
      <PayslipRow label="Hazard Pay" value={detail.earnings.hazardPay} indent />
      <PayslipRow label="Taxable Allowances" value={detail.earnings.taxableAllowances} indent />
      <PayslipRow label="Late / Undertime Deduction" value={detail.earnings.lateUndertimeDeduction} red indent />
      <PayslipRow label="Gross Compensation" value={detail.earnings.grossCompensation} bold />

      {/* Non-taxable benefits actually paid. The employee's own SSS, PhilHealth
          and Pag-IBIG are deductions, never shown here (PAY-138). */}
      {Number(detail.nonTaxable.nontaxable13MonthAndBenefits) !== 0 && (
        <>
          <SectionTitle title="Non-Taxable Benefits" />
          <PayslipRow label="13th Month (this period)" value={detail.nonTaxable.nontaxable13MonthAndBenefits} indent />
        </>
      )}

      {/* Deductions */}
      <SectionTitle title="Mandatory Deductions" />
      <PayslipRow label="SSS (EE)" value={detail.statutory.sssEe} red indent />
      <PayslipRow label="PhilHealth (EE)" value={detail.statutory.philhealthEe} red indent />
      <PayslipRow label="Pag-IBIG (EE)" value={detail.statutory.pagibigEe} red indent />
      <PayslipRow label="Withholding Tax" value={detail.tax.withholdingTax} red indent />
      <PayslipRow label="Loan Deductions" value={detail.loans.loanDeductions} red indent />

      {/* Net pay */}
      <div className="border-t mt-3 pt-3 flex justify-between font-bold text-base">
        <span>Net Pay</span>
        <span className="text-[#1E3A5F]">{fmt(detail.net.netPay)}</span>
      </div>

      {/* YTD + 13th Month */}
      <SectionTitle title="Year-to-Date Summary" />
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-1.5">
        {(
          [
            ["YTD Gross", detail.ytd.grossCents, true],
            ["YTD Basic Pay", detail.ytd.basicCents, true],
            ["YTD Withholding Tax", detail.ytd.wtaxCents, true],
            ["13th Month Released (YTD)", detail.ytd.released13thMonthCents, true],
            ["13th Month Accrued (YTD)", detail.ytd.accrued13thMonthCents, true],
          ] as [string, string, boolean][]
        ).map(([label, value]) => (
          <div key={label} className="flex justify-between text-sm">
            <span className="text-blue-800/70">{label}</span>
            <span className="font-semibold text-blue-900">{fmt(value)}</span>
          </div>
        ))}
        <div className="flex justify-between text-sm pt-1 border-t border-blue-200">
          <span className="text-blue-800/70">Tardiness (this period)</span>
          <span className="font-semibold text-blue-900">{detail.tardinessMinutes} min</span>
        </div>
      </div>

      {/* Leave Balances */}
      {detail.leaveBalances.length > 0 && (
        <>
          <SectionTitle title="Leave Balances" />
          <div className="bg-green-50 border border-green-100 rounded-xl p-3 space-y-1.5">
            {detail.leaveBalances.map((b) => (
              <div key={b.code} className="flex justify-between text-sm">
                <span className="text-green-900/70">
                  {b.name} <span className="text-green-700/50 text-xs">({b.code})</span>
                </span>
                <span className="font-semibold text-green-900">{b.available} days</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Download button */}
      <Button
        className="w-full mt-5 bg-[#1E3A5F] hover:bg-[#2D5A8E] text-white"
        onClick={onDownload}
        disabled={downloading}
      >
        <Download className="h-4 w-4 mr-2" />
        {downloading ? "Generating PDF…" : "Download Payslip (PDF)"}
      </Button>
    </div>
  );
}
