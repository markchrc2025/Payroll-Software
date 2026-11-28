import Link from "next/link";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react";
import type { ChecklistStep } from "@/lib/onboarding/checklist";

/** PAY-74: shown on the dashboard until every step is done. */
export function SetupChecklist({ steps }: { steps: ChecklistStep[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <section className="bg-white rounded-2xl border border-[var(--line)] p-5" data-testid="setup-checklist">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold text-[var(--ink)]">Get ready for your first payroll</h2>
        <span className="text-[12.5px] text-[var(--muted-2)]">{done} of {steps.length} done</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-[var(--fill)] overflow-hidden">
        <div className="h-full bg-[var(--ink)]" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-3 divide-y divide-[var(--line)]">
        {steps.map((s) => (
          <li key={s.key} data-testid={`setup-step-${s.key}`} data-done={s.done}>
            <Link href={s.href} className="flex items-start gap-3 py-3 group">
              {s.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" /> : <Circle className="h-5 w-5 shrink-0 text-[var(--muted-clr)]" />}
              <span className="flex-1">
                <span className={`block text-[13.5px] font-medium ${s.done ? "text-[var(--muted-2)] line-through" : "text-[var(--ink)]"}`}>{s.title}</span>
                <span className="block text-[12.5px] text-[var(--muted-2)]">{s.detail}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted-clr)] group-hover:text-[var(--ink)]" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
