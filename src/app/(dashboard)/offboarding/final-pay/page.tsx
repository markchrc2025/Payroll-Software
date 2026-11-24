"use client";

/**
 * PAY-197: Final Pay & Documents. Per case: clearance, the final pay run and
 * its net pay, the DOLE Labor Advisory 06-2020 30-day mark, the certificate of
 * employment (request, issue to the portal, download) and the quitclaim and
 * release (once the final pay run is finalized).
 */
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Header, REASON_LABEL, useOffboardingForms } from "@/components/offboarding/useForms";

type Row = { caseId: string; employeeNumber: string; name: string; separationReason: string; lastWorkingDay: string; caseStatus: string;
  clearance: { pending: number; total: number }; daysSinceSeparation: number; dueInDays: number | null;
  finalPayRun: { bookId: string; status: string; finalizedAt: string | null; netPayCents: string } | null;
  coeRequestedAt: string | null; coeIssuedAt: string | null; quitclaimReady: boolean };

const peso = (c: string) => `₱${(Number(BigInt(c)) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FinalPayPage() {
  const { data, loading, reload } = useOffboardingForms<{ rows: Row[] }>("final-pay");
  async function issueCoe(caseId: string) {
    const res = await fetch(`/api/offboarding/cases/${caseId}/coe-issue`, { method: "POST" });
    const j = await res.json().catch(() => null);
    if (!res.ok) { toast.error(j?.error ?? "It was not issued"); return; }
    toast.success("Certificate issued to the portal"); void reload();
  }
  return (
    <div className="space-y-5">
      <Header title="Final Pay & Documents" text="Every separation: clearance, the final pay run, and the documents. DOLE Labor Advisory 06-2020 expects final pay within 30 days of separation; the final pay run can only be finalized once clearance is complete." />
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[12px] text-[#6B6B6B]"><th className="p-2">Employee</th><th>Separation</th><th>Clearance</th><th>Final pay</th><th>30-day mark</th><th>Certificate of employment</th><th>Quitclaim</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="p-3 text-[#6B6B6B]">Loading…</td></tr>}
            {!loading && !data?.rows.length && <tr><td colSpan={7} className="p-3 text-[#6B6B6B]">No offboarding cases yet.</td></tr>}
            {data?.rows.map((r) => (
              <tr key={r.caseId} className="border-t align-top">
                <td className="p-2 whitespace-nowrap">{r.name}<div className="text-[#6B6B6B]">{r.employeeNumber}</div></td>
                <td className="py-2">{REASON_LABEL[r.separationReason] ?? r.separationReason}<div className="text-[#6B6B6B]">Last day {r.lastWorkingDay}</div></td>
                <td className="py-2 whitespace-nowrap">{r.clearance.total === 0 ? "No checklist" : r.clearance.pending === 0 ? "Complete" : `${r.clearance.pending} of ${r.clearance.total} pending`}</td>
                <td className="py-2 whitespace-nowrap">
                  {r.finalPayRun ? <Link className="underline" href={`/payroll/${r.finalPayRun.bookId}`}>{r.finalPayRun.status === "FINALIZED" ? `Paid ${peso(r.finalPayRun.netPayCents)}` : `Draft ${peso(r.finalPayRun.netPayCents)}`}</Link> : <span className="text-[#6B6B6B]">No run yet</span>}
                  {r.finalPayRun?.finalizedAt && <div className="text-[#6B6B6B]">Finalized {r.finalPayRun.finalizedAt}</div>}
                </td>
                <td className={`py-2 whitespace-nowrap ${r.dueInDays !== null && r.dueInDays < 0 ? "text-red-600" : ""}`}>{r.dueInDays === null ? "Done" : r.dueInDays >= 0 ? `${r.dueInDays} days left` : `${-r.dueInDays} days late`}</td>
                <td className="py-2">
                  <a className="underline" href={`/api/offboarding/cases/${r.caseId}/documents/coe`}>Download</a>
                  <div className="text-[#6B6B6B]">{r.coeIssuedAt ? `Issued ${r.coeIssuedAt}` : r.coeRequestedAt ? `Requested ${r.coeRequestedAt}` : "Not requested"}</div>
                  {!r.coeIssuedAt && <Button size="sm" variant="outline" className="h-7 mt-1" onClick={() => issueCoe(r.caseId)}>Issue to portal</Button>}
                </td>
                <td className="py-2">{r.quitclaimReady ? <a className="underline" href={`/api/offboarding/cases/${r.caseId}/documents/quitclaim`}>Download</a> : <span className="text-[#6B6B6B]">After final pay</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
