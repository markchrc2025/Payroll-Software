"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import {
  type Payslip,
  PayslipDetailBody,
  downloadPayslipPdf,
  fmt,
  fmtDate,
} from "@/components/payslip/payslip-detail";

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
    if (!detail || !detailTarget) return;
    const token = localStorage.getItem("ess_token");
    if (!token) { router.replace("/ess/login"); return; }
    setDownloading(true);
    try {
      await downloadPayslipPdf(`/api/ess/payslips/${detailTarget}/pdf`, { Authorization: `Bearer ${token}` });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to download the payslip. Please try again.");
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
            <PayslipDetailBody detail={detail} onDownload={handleDownload} downloading={downloading} />
          ) : (
            <p className="text-sm text-muted-foreground mt-4 text-center">Payslip not available.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
