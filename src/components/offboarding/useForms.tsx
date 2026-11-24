"use client";
/** PAY-197: loads one Offboarding submenu's rows from /api/offboarding/forms/[kind]. */
import { useCallback, useEffect, useState } from "react";

export function useOffboardingForms<T>(kind: "questionnaires" | "personal-info" | "final-pay") {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const j = await fetch(`/api/offboarding/forms/${kind}`).then((r) => r.json()).catch(() => null);
    setData(j?.data ?? null);
    setLoading(false);
  }, [kind]);
  useEffect(() => { void load(); }, [load]);
  return { data, loading, reload: load };
}

export const REASON_LABEL: Record<string, string> = {
  RESIGNATION: "Resignation", MUTUAL_AGREEMENT: "Mutual agreement", END_OF_CONTRACT: "End of contract", REDUNDANCY: "Redundancy",
  RETRENCHMENT: "Retrenchment", CLOSURE_OF_BUSINESS: "Closure of business", DISEASE: "Disease", JUST_CAUSE: "Dismissal (just cause)",
};

export const Header = ({ title, text }: { title: string; text: string }) => (
  <div>
    <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">{title}</h1>
    <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[820px]">{text}</p>
  </div>
);
