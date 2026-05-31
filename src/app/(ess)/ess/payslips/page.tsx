"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Download } from "lucide-react";

interface PayslipSummary {
  bookId: string;
  periodStart: string;
  periodEnd: string;
  cycle: string;
  runType: string;
  finalizedAt: string;
  grossCompensationCents: string;
  withholdingTaxCents: string;
  netPayCents: string;
}

interface Payslip {
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

function fmt(cents: string) {
  const n = Number(cents) / 100;
  return n.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

function fmtNum(cents: string) {
  return (Number(cents) / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
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

// ── PDF Generator ─────────────────────────────────────────────────────────────

async function downloadPayslipPdf(detail: Payslip) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const contentW = pageW - margin * 2;
  const colW = contentW / 2;

  // PDF-safe currency formatter — avoids ₱ rendering as ±
  const p = (cents: string) =>
    "P" + (Number(cents) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pn = (cents: string) =>
    (Number(cents) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.setFont("courier", "bold");
  doc.text(detail.tenant.name.toUpperCase(), margin, 30);
  doc.setFontSize(10);
  doc.setFont("courier", "normal");
  doc.text("PAYSLIP", margin, 44);
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text(
    `Period: ${fmtDate(detail.period.start)} - ${fmtDate(detail.period.end)}  |  ${detail.period.cycle}  |  ${detail.period.runType}`,
    margin, 57,
  );
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Generated: ${new Date().toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
    pageW - margin, 57, { align: "right" },
  );
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.8);
  doc.line(margin, 64, margin + contentW, 64);

  // ── Employee Info ─────────────────────────────────────────────────────────
  let y = 78;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.setFont("courier", "bold");
  doc.text("EMPLOYEE INFORMATION", margin, y);
  y += 5;

  const empFields: [string, string][] = [
    ["Employee Name:", detail.employee.name],
    ["Employee No.:", detail.employee.employeeNumber],
    ["Position:", detail.employee.position ?? "-"],
    ["Tax Classification:", detail.employee.taxClassification.replace(/_/g, " ")],
    ["Department:", detail.employee.department ?? "-"],
    ["Branch / HQ:", detail.employee.branch ?? "-"],
  ];

  const empRowH = 14;
  const empBoxH = Math.ceil(empFields.length / 2) * empRowH + 8;
  doc.setLineWidth(0.4);
  doc.setDrawColor(0, 0, 0);
  doc.rect(margin, y, contentW, empBoxH);

  doc.setFontSize(8.5);
  empFields.forEach(([label, val], idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const ex = margin + col * colW + 6;
    const ey = y + 11 + row * empRowH;
    doc.setFont("courier", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text(label, ex, ey);
    doc.setFont("courier", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(val, ex + doc.getTextWidth(label) + 4, ey);
  });
  y += empBoxH + 12;

  // ── Main grid: Earnings | Deductions ─────────────────────────────────────
  const rowH = 14;
  const hdrH = 16;
  doc.setLineWidth(0.4);
  doc.setDrawColor(0, 0, 0);
  doc.setTextColor(0, 0, 0);

  // Header cells
  doc.rect(margin, y, colW - 2, hdrH);
  doc.rect(margin + colW + 2, y, colW - 2, hdrH);
  doc.setFontSize(8.5);
  doc.setFont("courier", "bold");
  doc.text("EARNINGS", margin + 6, y + 11);
  doc.text("AMOUNT", margin + colW - 6, y + 11, { align: "right" });
  doc.text("DEDUCTIONS", margin + colW + 8, y + 11);
  doc.text("AMOUNT", margin + contentW - 4, y + 11, { align: "right" });
  y += hdrH;

  const earningRows: [string, string][] = [];
  const deductionRows: [string, string][] = [];
  const addE = (l: string, v: string) => { if (Number(v) !== 0) earningRows.push([l, pn(v)]); };
  const addD = (l: string, v: string) => { if (Number(v) !== 0) deductionRows.push([l, pn(v)]); };

  addE("Basic Pay", detail.earnings.basePay);
  addE("OT Pay", detail.earnings.otPay);
  addE("Night Shift Diff.", detail.earnings.nsdPay);
  addE("Holiday Pay", detail.earnings.holidayPay);
  addE("Rest Day Pay", detail.earnings.restDayPay);
  addE("Hazard Pay", detail.earnings.hazardPay);
  addE("Taxable Allowances", detail.earnings.taxableAllowances);
  addE("Non-Taxable Comp.", detail.nonTaxable.nontaxableCompensation);
  addE("13th Month (Period)", detail.nonTaxable.nontaxable13MonthAndBenefits);

  addD("Late / Undertime", detail.earnings.lateUndertimeDeduction);
  addD("SSS (EE)", detail.statutory.sssEe);
  addD("PhilHealth (EE)", detail.statutory.philhealthEe);
  addD("Pag-IBIG (EE)", detail.statutory.pagibigEe);
  addD("Withholding Tax", detail.tax.withholdingTax);
  addD("Loan Deductions", detail.loans.loanDeductions);

  const maxRows = Math.max(earningRows.length, deductionRows.length);
  doc.setFont("courier", "normal");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8.5);

  for (let i = 0; i < maxRows; i++) {
    const ry = y + i * rowH;
    doc.rect(margin, ry, colW - 2, rowH);
    doc.rect(margin + colW + 2, ry, colW - 2, rowH);
    if (earningRows[i]) {
      doc.text(earningRows[i][0], margin + 6, ry + 10);
      doc.text(earningRows[i][1], margin + colW - 6, ry + 10, { align: "right" });
    }
    if (deductionRows[i]) {
      doc.text(deductionRows[i][0], margin + colW + 8, ry + 10);
      doc.text(deductionRows[i][1], margin + contentW - 4, ry + 10, { align: "right" });
    }
  }
  y += maxRows * rowH;

  // Totals row
  const totH = 16;
  doc.setLineWidth(0.8);
  doc.rect(margin, y, colW - 2, totH);
  doc.rect(margin + colW + 2, y, colW - 2, totH);
  doc.setLineWidth(0.4);
  doc.setFont("courier", "bold");
  doc.setFontSize(8.5);
  doc.text("TOTAL EARNINGS", margin + 6, y + 11);
  doc.text(pn(detail.earnings.grossCompensation), margin + colW - 6, y + 11, { align: "right" });

  const totalDed = [
    detail.earnings.lateUndertimeDeduction, detail.statutory.sssEe,
    detail.statutory.philhealthEe, detail.statutory.pagibigEe,
    detail.tax.withholdingTax, detail.loans.loanDeductions,
  ].reduce((s, v) => s + Number(v), 0);

  doc.text("TOTAL DEDUCTIONS", margin + colW + 8, y + 11);
  doc.text(
    (totalDed / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 }),
    margin + contentW - 4, y + 11, { align: "right" },
  );
  y += totH + 10;

  // ── Net Pay ────────────────────────────────────────────────────────────────
  doc.setLineWidth(1.2);
  doc.setDrawColor(0, 0, 0);
  doc.rect(margin, y, contentW, 26);
  doc.setLineWidth(0.4);
  doc.setFontSize(11);
  doc.setFont("courier", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("NET PAY (TAKE HOME)", margin + 10, y + 17);
  doc.text(p(detail.net.netPay), margin + contentW - 10, y + 17, { align: "right" });
  y += 26;
  doc.setFontSize(7.5);
  doc.setFont("courier", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`Gross Taxable Income: ${p(detail.tax.grossTaxableIncome)}`, margin + 10, y + 9);
  y += 20;

  // ── YTD + Leave grid ──────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("courier", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("YEAR-TO-DATE SUMMARY", margin, y);
  doc.text("LEAVE BALANCES", margin + colW + 8, y);
  y += 4;
  doc.setLineWidth(0.6);
  doc.line(margin, y, margin + contentW, y);
  doc.setLineWidth(0.4);
  y += 4;

  const ytdRows: [string, string][] = [
    ["YTD Gross", p(detail.ytd.grossCents)],
    ["YTD Basic Pay", p(detail.ytd.basicCents)],
    ["YTD W/Tax", p(detail.ytd.wtaxCents)],
    ["13th Mo. Released", p(detail.ytd.released13thMonthCents)],
    ["13th Mo. Accrued", p(detail.ytd.accrued13thMonthCents)],
    ["Tardiness (period)", `${detail.tardinessMinutes} min`],
  ];

  const leaveRows = detail.leaveBalances.slice(0, 6);

  const gridStyle = {
    font: "courier",
    fontSize: 8.5,
    cellPadding: { top: 3, bottom: 3, left: 5, right: 5 },
    textColor: [0, 0, 0] as [number, number, number],
    lineColor: [0, 0, 0] as [number, number, number],
    lineWidth: 0.3,
    fillColor: [255, 255, 255] as [number, number, number],
  };

  autoTable(doc, {
    startY: y,
    head: [],
    body: ytdRows,
    theme: "grid",
    styles: gridStyle,
    columnStyles: {
      0: { fontStyle: "normal", cellWidth: colW * 0.56 },
      1: { fontStyle: "bold", halign: "right", cellWidth: colW * 0.44 },
    },
    margin: { left: margin, right: pageW - margin - colW + 4 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ytdFinalY = (doc as any).lastAutoTable.finalY;

  if (leaveRows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [],
      body: leaveRows.map((b) => [b.name, b.available + " days"]),
      theme: "grid",
      styles: gridStyle,
      columnStyles: {
        0: { fontStyle: "normal", cellWidth: colW * 0.56 },
        1: { fontStyle: "bold", halign: "right", cellWidth: colW * 0.44 },
      },
      margin: { left: margin + colW + 4, right: margin },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leaveFinalY = leaveRows.length > 0 ? (doc as any).lastAutoTable.finalY : y;
  y = Math.max(ytdFinalY, leaveFinalY) + 18;

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = doc.internal.pageSize.getHeight() - 28;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(margin, footerY, margin + contentW, footerY);
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.setFont("courier", "normal");
  doc.text(
    "This payslip is system-generated. For concerns, contact your HR department.",
    pageW / 2, footerY + 10, { align: "center" },
  );
  doc.text(
    `${detail.tenant.name}  |  ${detail.period.cycle} Payroll  |  ${fmtDate(detail.period.start)} - ${fmtDate(detail.period.end)}`,
    pageW / 2, footerY + 20, { align: "center" },
  );

  const filename = `payslip_${detail.employee.employeeNumber}_${fmtDateShort(detail.period.start)}-${fmtDateShort(detail.period.end)}.pdf`
    .replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "");
  doc.save(filename);
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function EssPayslipsPage() {
  const router = useRouter();
  const [payslips, setPayslips] = useState<PayslipSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailTarget, setDetailTarget] = useState<string | null>(null);
  const [detail, setDetail] = useState<Payslip | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const fetchPayslips = useCallback(() => {
    const token = localStorage.getItem("ess_token");
    if (!token) { router.replace("/ess/login"); return; }
    setLoading(true);
    fetch("/api/ess/payslips", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (r.status === 401) { localStorage.removeItem("ess_token"); router.replace("/ess/login"); return null; }
        return r.json();
      })
      .then((d) => { if (d) setPayslips(d?.data ?? []); })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => { fetchPayslips(); }, [fetchPayslips]);

  useEffect(() => {
    if (!detailTarget) { setDetail(null); return; }
    const token = localStorage.getItem("ess_token");
    if (!token) return;
    setDetailLoading(true);
    fetch(`/api/ess/payslips/${detailTarget}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.data) { toast.error("Payslip not available"); return; }
        setDetail(d.data);
      })
      .catch(() => toast.error("Failed to load payslip"))
      .finally(() => setDetailLoading(false));
  }, [detailTarget]);

  async function handleDownload() {
    if (!detail) return;
    setDownloading(true);
    try {
      await downloadPayslipPdf(detail);
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="p-4 lg:p-8 space-y-3 lg:space-y-4 max-w-3xl mx-auto">
      <h1 className="text-xl lg:text-2xl font-bold">My Payslips</h1>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : payslips.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No finalized payslips yet.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {payslips.map((p) => (
            <Card
              key={p.bookId}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setDetailTarget(p.bookId)}
            >
              <CardContent className="py-3 px-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.cycle} · {p.runType}
                    {p.finalizedAt && <> · Finalized {fmtDate(p.finalizedAt)}</>}
                  </p>
                </div>
                <div className="text-right flex items-center gap-2">
                  <div>
                    <p className="text-sm font-semibold">{fmt(p.netPayCents)}</p>
                    <p className="text-xs text-muted-foreground">net pay</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Payslip detail modal ────────────────────────────────────────── */}
      <Dialog open={detailTarget !== null} onOpenChange={(o) => { if (!o) setDetailTarget(null); }}>
        <DialogContent className="max-w-2xl w-full max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Payslip Preview</DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-2 mt-2">
              {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          ) : detail ? (
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

              {/* Non-taxable */}
              <SectionTitle title="Non-Taxable Benefits" />
              <PayslipRow label="Non-Taxable Compensation" value={detail.nonTaxable.nontaxableCompensation} indent />
              <PayslipRow label="13th Month (this period)" value={detail.nonTaxable.nontaxable13MonthAndBenefits} indent />

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
                onClick={handleDownload}
                disabled={downloading}
              >
                <Download className="h-4 w-4 mr-2" />
                {downloading ? "Generating PDF…" : "Download Payslip (PDF)"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-4 text-center">Payslip not available.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
