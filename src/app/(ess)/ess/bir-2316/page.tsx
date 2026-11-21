"use client";

/**
 * PAY-199: my BIR Form 2316 (on the official layout) and my e-signature, which
 * is written on it (Item 54, and Item 56 under substituted filing).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function EssBir2316Page() {
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const headers = useCallback((): Record<string, string> => ({ Authorization: `Bearer ${localStorage.getItem("ess_token") ?? ""}` }), []);
  const loadSig = useCallback(async () => {
    const res = await fetch("/api/ess/signature", { headers: headers() });
    setSigUrl(res.ok ? URL.createObjectURL(await res.blob()) : null);
  }, [headers]);
  useEffect(() => { void loadSig(); }, [loadSig]);

  async function upload(f: File | undefined) {
    if (!f) return;
    const fd = new FormData(); fd.set("file", f);
    const res = await fetch("/api/ess/signature", { method: "PUT", headers: headers(), body: fd });
    const j = await res.json().catch(() => null);
    if (!res.ok) { toast.error(j?.error ?? "It was not saved"); return; }
    toast.success("Signature saved"); void loadSig();
  }
  async function remove() {
    await fetch("/api/ess/signature", { method: "DELETE", headers: headers() });
    void loadSig();
  }
  async function download() {
    const res = await fetch(`/api/ess/bir-2316?year=${year}`, { headers: headers() });
    if (!res.ok) { const j = await res.json().catch(() => null); toast.error(j?.error ?? "Could not download it"); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a"); a.href = url; a.download = `BIR_2316_${year}.pdf`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-3xl mx-auto">
      <Link href="/ess?tab=pay" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Pay</Link>
      <h1 className="text-xl lg:text-2xl font-bold">BIR Form 2316</h1>
      <section className="rounded-lg border p-4 space-y-3">
        <p className="text-sm text-muted-foreground">Your Certificate of Compensation Payment/Tax Withheld for the year, on the official BIR form, from finalized payroll. Your employer gives it to you by 31 January of the next year.</p>
        <div className="flex items-center gap-2">
          <select className="h-9 rounded-md border px-2 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[0, 1, 2, 3].map((d) => new Date().getFullYear() - d).map((y) => <option key={y} value={y}>{y}</option>)}</select>
          <Button size="sm" onClick={download}><Download className="h-3.5 w-3.5 mr-1.5" /> Download PDF</Button>
        </div>
      </section>
      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold">My e-signature</h2>
        <p className="text-sm text-muted-foreground">It is written on your 2316 over your printed name (Conforme, Item 54, and Item 56 when you qualify for substituted filing). Sign on white paper, take a photo or scan, and upload it as PNG or JPEG, up to 1 MB. A PNG with a clear background looks best.</p>
        {sigUrl ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sigUrl} alt="My signature" className="h-14 max-w-[240px] rounded border bg-white object-contain p-1" />
            <Button size="sm" variant="outline" onClick={remove}>Remove</Button>
          </div>
        ) : <p className="text-sm">No signature yet.</p>}
        <input type="file" accept="image/png,image/jpeg" onChange={(e) => void upload(e.target.files?.[0])} className="text-sm" />
      </section>
    </div>
  );
}
