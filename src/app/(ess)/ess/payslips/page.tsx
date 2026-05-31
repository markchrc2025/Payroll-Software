"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Printer } from "lucide-react";

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
}

function fmt(cents: string) {
  const n = Number(cents) / 100;
  return n.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function PayslipRow({ label, value, bold, red, indent }: { label: string; value: string; bold?: boolean; red?: boolean; indent?: boolean }) {
  const show = Number(value) !== 0;
  if (!show) return null;
  return (
    <div className={`flex justify-between text-sm py-0.5 ${indent ? "pl-4" : ""}`}>
      <span className={`${bold ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
      <span className={`${bold ? "font-semibold" : ""} ${red ? "text-red-500" : ""}`}>{fmt(value)}</span>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mt-4 mb-1 border-b pb-1">{title}</p>;
}

export default function EssPayslipsPage() {
  const router = useRouter();
  const [payslips, setPayslips] = useState<PayslipSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailTarget, setDetailTarget] = useState<string | null>(null);
  const [detail, setDetail] = useState<Payslip | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  return (
    <div className="p-4 space-y-3 max-w-lg mx-auto">
      <h1 className="text-xl font-bold">My Payslips</h1>

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

      {/* Payslip detail sheet */}
      <Sheet open={detailTarget !== null} onOpenChange={(o) => { if (!o) setDetailTarget(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto" side="bottom" style={{ maxHeight: "92dvh" }}>
          <SheetHeader className="mb-2">
            <SheetTitle>Payslip</SheetTitle>
          </SheetHeader>

          {detailLoading ? (
            <div className="space-y-2 mt-2">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          ) : detail ? (
            <div className="space-y-1 text-sm" id="payslip-print">
              {/* Header */}
              <div className="bg-sky-50 rounded-lg p-3 mb-2">
                <p className="font-bold text-base">{detail.tenant.name}</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {fmtDate(detail.period.start)} – {fmtDate(detail.period.end)} · {detail.period.cycle} · {detail.period.runType}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 mb-1">
                <p className="font-semibold">{detail.employee.name}</p>
                <p className="text-xs text-muted-foreground">{detail.employee.employeeNumber}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {detail.employee.position && <Badge variant="outline" className="text-xs">{detail.employee.position}</Badge>}
                  {detail.employee.department && <Badge variant="outline" className="text-xs">{detail.employee.department}</Badge>}
                  {detail.employee.branch && <Badge variant="outline" className="text-xs">{detail.employee.branch}</Badge>}
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
              <PayslipRow label="13th Month & Benefits" value={detail.nonTaxable.nontaxable13MonthAndBenefits} indent />

              {/* Statutory deductions (EE share) */}
              <SectionTitle title="Mandatory Deductions" />
              <PayslipRow label="SSS (EE)" value={detail.statutory.sssEe} red indent />
              <PayslipRow label="PhilHealth (EE)" value={detail.statutory.philhealthEe} red indent />
              <PayslipRow label="Pag-IBIG (EE)" value={detail.statutory.pagibigEe} red indent />
              <PayslipRow label="Withholding Tax" value={detail.tax.withholdingTax} red indent />
              <PayslipRow label="Loan Deductions" value={detail.loans.loanDeductions} red indent />

              {/* Net pay */}
              <div className="border-t mt-3 pt-3 flex justify-between font-bold text-base">
                <span>Net Pay</span>
                <span className="text-sky-600">{fmt(detail.net.netPay)}</span>
              </div>

              <Button
                variant="outline"
                className="w-full mt-4"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print Payslip
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-4 text-center">Payslip not available.</p>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
