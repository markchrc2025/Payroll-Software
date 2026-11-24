"use client";

/**
 * PAY-197 part 2 (ruling 4): the offboarding portal for a separated employee,
 * apart from ESS. Reached by a single-use link to the personal email; shows
 * only the employee's own offboarding forms and final documents; closes 90
 * days after final pay.
 */
import { useCallback, useEffect, useState } from "react";

type Summary = {
  company: string; employee: { firstName: string; lastName: string; employeeNumber: string }; lastWorkingDay: string;
  clearance: { status: string; items: { name: string; status: string }[] };
  exitQuestionnaireAt: string | null; personalInfoAt: string | null; coeRequestedAt: string | null; coeIssuedAt?: string | null;
  personalInfo: Record<string, string | null> | null; finalPayslipBookId: string | null; closesAt: string | null;
};
const box = "rounded-xl border border-[#E8E8E8] bg-white p-4 space-y-2";
const input = "h-9 w-full rounded-md border px-2 text-[13px]";

export default function OffboardPortalPage() {
  const [me, setMe] = useState<Summary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [q, setQ] = useState({ reasonForLeaving: "", likedMost: "", couldImprove: "", wouldRecommend: "YES", wouldReturn: "YES", comments: "" });
  const [info, setInfo] = useState({ forwardingAddress: "", personalEmail: "", mobileNumber: "", bankName: "", bankAccountName: "", bankAccountNumber: "" });

  const load = useCallback(async () => {
    const res = await fetch("/api/offboard-portal/me");
    if (!res.ok) { setMe(null); setMessage((m) => m ?? "Open the link HR sent to your personal email to sign in."); return; }
    setMe((await res.json()).data);
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    void (async () => {
      if (token) {
        const res = await fetch("/api/offboard-portal/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
        window.history.replaceState(null, "", "/offboard-portal");
        if (!res.ok) setMessage((await res.json().catch(() => ({}))).error ?? "This link is not valid.");
      }
      await load();
    })();
  }, [load]);

  async function send(path: string, method: string, body?: unknown) {
    const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    setMessage(res.ok ? "Saved. Thank you." : json.error ?? "Could not save");
    if (res.ok) void load();
  }

  if (!me) return <main className="max-w-xl mx-auto p-6 text-[14px]"><h1 className="text-[20px] font-semibold mb-2">Offboarding portal</h1><p>{message ?? "Loading"}</p></main>;
  const clean = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== ""));
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4 text-[13px]">
      <div>
        <h1 className="text-[20px] font-semibold">{me.company}: offboarding</h1>
        <p className="text-[#6B6B6B]">{me.employee.firstName} {me.employee.lastName} ({me.employee.employeeNumber}), last working day {me.lastWorkingDay.slice(0, 10)}{me.closesAt ? `. This portal closes on ${me.closesAt.slice(0, 10)}.` : "."}</p>
        {message && <p className="mt-2 text-[#1E3A5F]" role="status">{message}</p>}
      </div>

      <section className={box}>
        <h2 className="font-semibold">Clearance</h2>
        {me.clearance.items.length === 0 ? <p>Nothing to clear.</p> : me.clearance.items.map((i) => <p key={i.name}>{i.status === "CLEARED" ? "Cleared" : "Pending"}: {i.name}</p>)}
      </section>

      <section className={box}>
        <h2 className="font-semibold">Final documents</h2>
        {me.finalPayslipBookId ? <a className="underline" href="/api/offboard-portal/payslip" data-testid="final-payslip">Download your final payslip</a> : <p>Your final payslip will be here once your final pay is released.</p>}
        {me.finalPayslipBookId ? <a className="underline" href="/api/offboard-portal/bir-2316" data-testid="bir-2316">Download your BIR Form 2316</a> : <p>Your BIR Form 2316 will be here once your final pay is released.</p>}
        <div>{me.coeIssuedAt ? <a className="underline" href="/api/offboard-portal/coe" data-testid="coe-download">Download your certificate of employment</a> : me.coeRequestedAt ? <p>Certificate of employment requested on {me.coeRequestedAt.slice(0, 10)}.</p> : <button type="button" className="underline" onClick={() => send("/api/offboard-portal/coe-request", "POST")}>Request a certificate of employment</button>}</div>
      </section>

      <section className={box}>
        <h2 className="font-semibold">Exit questionnaire {me.exitQuestionnaireAt ? `(sent ${me.exitQuestionnaireAt.slice(0, 10)})` : ""}</h2>
        <label className="block">Why are you leaving?<input className={input} value={q.reasonForLeaving} onChange={(e) => setQ({ ...q, reasonForLeaving: e.target.value })} /></label>
        <label className="block">What did you like most?<input className={input} value={q.likedMost} onChange={(e) => setQ({ ...q, likedMost: e.target.value })} /></label>
        <label className="block">What could we do better?<input className={input} value={q.couldImprove} onChange={(e) => setQ({ ...q, couldImprove: e.target.value })} /></label>
        <label className="block">Would you recommend us as an employer?
          <select className={input} value={q.wouldRecommend} onChange={(e) => setQ({ ...q, wouldRecommend: e.target.value })}><option value="YES">Yes</option><option value="MAYBE">Maybe</option><option value="NO">No</option></select></label>
        <label className="block">Would you work here again?
          <select className={input} value={q.wouldReturn} onChange={(e) => setQ({ ...q, wouldReturn: e.target.value })}><option value="YES">Yes</option><option value="MAYBE">Maybe</option><option value="NO">No</option></select></label>
        <label className="block">Anything else?<input className={input} value={q.comments} onChange={(e) => setQ({ ...q, comments: e.target.value })} /></label>
        <button type="button" className="h-9 px-4 rounded-md bg-[#1E3A5F] text-white" onClick={() => send("/api/offboard-portal/questionnaire", "PUT", clean(q))}>Send</button>
      </section>

      <section className={box}>
        <h2 className="font-semibold">Personal information {me.personalInfoAt ? `(sent ${me.personalInfoAt.slice(0, 10)})` : ""}</h2>
        <label className="block">Forwarding address<input className={input} value={info.forwardingAddress} onChange={(e) => setInfo({ ...info, forwardingAddress: e.target.value })} /></label>
        <label className="block">Personal email<input className={input} value={info.personalEmail} onChange={(e) => setInfo({ ...info, personalEmail: e.target.value })} /></label>
        <label className="block">Mobile number<input className={input} value={info.mobileNumber} onChange={(e) => setInfo({ ...info, mobileNumber: e.target.value })} /></label>
        <label className="block">Bank for your final pay<input className={input} value={info.bankName} onChange={(e) => setInfo({ ...info, bankName: e.target.value })} /></label>
        <label className="block">Account name<input className={input} value={info.bankAccountName} onChange={(e) => setInfo({ ...info, bankAccountName: e.target.value })} /></label>
        <label className="block">Account number{me.personalInfo?.bankAccount ? ` (on file: ${me.personalInfo.bankAccount})` : ""}<input className={input} value={info.bankAccountNumber} onChange={(e) => setInfo({ ...info, bankAccountNumber: e.target.value })} /></label>
        <button type="button" className="h-9 px-4 rounded-md bg-[#1E3A5F] text-white" onClick={() => send("/api/offboard-portal/personal-info", "PUT", clean(info))}>Send</button>
      </section>

      <button type="button" className="underline text-[#6B6B6B]" onClick={async () => { await fetch("/api/offboard-portal/session", { method: "DELETE" }); setMe(null); setMessage("Signed out."); }}>Sign out</button>
    </main>
  );
}
