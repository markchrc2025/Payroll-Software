"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface PayslipSummary {
  id: string;
  periodStart: string;
  periodEnd: string;
  grossCompensationCents: string;
  totalWithholdingTaxCents: string;
  netPayCents: string;
}

interface PayslipLine {
  id: string;
  componentCode: string;
  componentName: string;
  type: string;
  amountCents: string;
}

interface PayslipDetail {
  id: string;
  periodStart: string;
  periodEnd: string;
  grossCompensationCents: string;
  totalWithholdingTaxCents: string;
  netPayCents: string;
  lines: PayslipLine[];
}

function fmt(cents: string) {
  return (Number(cents) / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

export default function EssPayslipsPage() {
  const router = useRouter();
  const [payslips, setPayslips] = useState<PayslipSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [detailTarget, setDetailTarget] = useState<string | null>(null);
  const [detail, setDetail] = useState<PayslipDetail | null>(null);
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
      .then((d) => setDetail(d?.data ?? null))
      .catch(() => toast.error("Failed to load payslip detail"))
      .finally(() => setDetailLoading(false));
  }, [detailTarget]);

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold">My Payslips</h1>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Gross Pay</TableHead>
              <TableHead className="text-right">WHT</TableHead>
              <TableHead className="text-right">Net Pay</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payslips.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No payslips available</TableCell></TableRow>
            )}
            {payslips.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-sm">
                  {new Date(p.periodStart).toLocaleDateString()} – {new Date(p.periodEnd).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right text-sm">{fmt(p.grossCompensationCents)}</TableCell>
                <TableCell className="text-right text-sm text-red-500">{fmt(p.totalWithholdingTaxCents)}</TableCell>
                <TableCell className="text-right font-medium">{fmt(p.netPayCents)}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => setDetailTarget(p.id)}>View</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Payslip detail sheet */}
      <Sheet open={detailTarget !== null} onOpenChange={(o) => { if (!o) setDetailTarget(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Payslip Detail</SheetTitle>
          </SheetHeader>

          {detailLoading ? (
            <div className="space-y-2 mt-4">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : detail ? (
            <div className="mt-4 space-y-4 print:block" id="payslip-print">
              <div className="text-sm text-muted-foreground">
                Period: {new Date(detail.periodStart).toLocaleDateString()} – {new Date(detail.periodEnd).toLocaleDateString()}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.lines?.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm">{l.componentName}</TableCell>
                      <TableCell><Badge variant="outline">{l.type}</Badge></TableCell>
                      <TableCell className="text-right text-sm">{fmt(l.amountCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t pt-3 space-y-1 text-sm">
                <div className="flex justify-between"><span>Gross Pay</span><span>{fmt(detail.grossCompensationCents)}</span></div>
                <div className="flex justify-between text-red-500"><span>Withholding Tax</span><span>-{fmt(detail.totalWithholdingTaxCents)}</span></div>
                <div className="flex justify-between font-bold text-base border-t pt-1 mt-1"><span>Net Pay</span><span>{fmt(detail.netPayCents)}</span></div>
              </div>
              <Button variant="outline" className="w-full print:hidden" onClick={() => window.print()}>Print Payslip</Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-4">Payslip not available</p>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
