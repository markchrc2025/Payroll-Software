"use client";

/** PAY-197: the separated employees' exit questionnaire answers, filed from the Offboarding portal. */
import { useState } from "react";
import { Header, REASON_LABEL, useOffboardingForms } from "@/components/offboarding/useForms";

type Row = { caseId: string; employeeNumber: string; name: string; separationReason: string; lastWorkingDay: string; submittedAt: string;
  reasonForLeaving: string | null; likedMost: string | null; couldImprove: string | null; wouldRecommend: string | null; wouldReturn: string | null; comments: string | null };
type Data = { summary: { responses: number; wouldRecommend: Record<string, number>; wouldReturn: Record<string, number> }; rows: Row[] };

export default function ExitQuestionnairesPage() {
  const { data, loading } = useOffboardingForms<Data>("questionnaires");
  const [open, setOpen] = useState<string | null>(null);
  const s = data?.summary;
  return (
    <div className="space-y-5">
      <Header title="Exit Questionnaires" text="Answers the leaving employees gave in the Offboarding portal. The portal link is sent from the case." />
      {s && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Responses" value={String(s.responses)} />
          <Stat label="Would recommend the company" value={`${s.wouldRecommend.YES ?? 0} yes · ${s.wouldRecommend.MAYBE ?? 0} maybe · ${s.wouldRecommend.NO ?? 0} no`} />
          <Stat label="Would come back" value={`${s.wouldReturn.YES ?? 0} yes · ${s.wouldReturn.MAYBE ?? 0} maybe · ${s.wouldReturn.NO ?? 0} no`} />
        </div>
      )}
      <div className="rounded-lg border">
        {loading && <p className="p-4 text-[13px] text-[#6B6B6B]">Loading…</p>}
        {!loading && !data?.rows.length && <p className="p-4 text-[13px] text-[#6B6B6B]">No questionnaire answered yet.</p>}
        {data?.rows.map((r) => (
          <div key={r.caseId} className="border-t first:border-t-0">
            <button type="button" className="w-full text-left p-3 flex flex-wrap gap-x-4 text-[13px] hover:bg-[var(--fill)]" onClick={() => setOpen(open === r.caseId ? null : r.caseId)}>
              <span className="font-medium">{r.name}</span><span className="text-[#6B6B6B]">{r.employeeNumber}</span>
              <span>{REASON_LABEL[r.separationReason] ?? r.separationReason}</span><span>Last day {r.lastWorkingDay}</span><span>Answered {r.submittedAt}</span>
            </button>
            {open === r.caseId && (
              <dl className="grid gap-2 px-4 pb-4 text-[13px] sm:grid-cols-2">
                <QA q="Reason for leaving" a={r.reasonForLeaving} /><QA q="What they liked most" a={r.likedMost} />
                <QA q="What we could improve" a={r.couldImprove} /><QA q="Would recommend us" a={r.wouldRecommend} />
                <QA q="Would come back" a={r.wouldReturn} /><QA q="Other comments" a={r.comments} />
              </dl>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border p-3"><p className="text-[12px] text-[#6B6B6B]">{label}</p><p className="text-[15px] font-medium mt-0.5">{value}</p></div>
);
const QA = ({ q, a }: { q: string; a: string | null }) => (
  <div><dt className="text-[12px] text-[#6B6B6B]">{q}</dt><dd className="whitespace-pre-wrap">{a || "None"}</dd></div>
);
