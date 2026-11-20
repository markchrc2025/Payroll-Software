"use client";

/**
 * PAY-70: the cross-foot checks of a document, shown on it. Green when every
 * check ties out; red, with the two figures, for each one that does not.
 */
import { useEffect, useState } from "react";
import { formatCentavos } from "@/lib/payroll/reports/bir-form";
import type { CrossFootCheck } from "@/lib/payroll/reports/cross-foot";

export function isCrossFootList(v: unknown): v is CrossFootCheck[] {
  return Array.isArray(v) && v.every((c) => c && typeof c === "object" && "expectedCents" in c && "ok" in c);
}

export function CrossFootPanel({ checks, empty = false }: { checks: CrossFootCheck[]; empty?: boolean }) {
  const [open, setOpen] = useState(false);
  // PAY-203 (ruling 3): nothing to check is not "ties out".
  if (empty) {
    return (
      <div data-testid="cross-foot" data-ties-out="empty" className="rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ background: "#F2F2F2", color: "#525252" }}>
        No payslips: nothing to cross-foot.
      </div>
    );
  }
  if (checks.length === 0) return null;
  const failed = checks.filter((c) => !c.ok);
  const ok = failed.length === 0;
  const shown = ok && !open ? [] : ok ? checks : failed;
  return (
    <div
      data-testid="cross-foot"
      data-ties-out={ok ? "yes" : "no"}
      className="rounded-lg px-3 py-2 text-[12.5px]"
      style={ok ? { background: "#E5F6EE", color: "#0B7A50" } : { background: "#FDECEC", color: "#B42318" }}
    >
      <div className="flex items-center justify-between gap-2 font-semibold">
        <span>
          {ok
            ? `Ties out: ${checks.length} cross-foot check${checks.length === 1 ? "" : "s"} passed`
            : `Does not tie out: ${failed.length} of ${checks.length} cross-foot check${checks.length === 1 ? "" : "s"} failed`}
        </span>
        {ok && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="font-medium underline underline-offset-2">
            {open ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {shown.length > 0 && (
        <ul className="mt-1.5 space-y-1 font-normal">
          {shown.map((c) => (
            <li key={c.id}>
              {c.label}: payslips {formatCentavos(c.expectedCents)}, document {formatCentavos(c.actualCents)}
              {c.ok ? "" : `, difference ${formatCentavos(BigInt(c.actualCents) - BigInt(c.expectedCents))}`}
              {c.detail ? ` ${c.detail}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The run page: loads the run's checks (1) to (3). */
export function RunCrossFoot({ runId, version }: { runId: string; version: string }) {
  const [checks, setChecks] = useState<CrossFootCheck[]>([]);
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/payroll/runs/${runId}/cross-foot`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const list = j?.data?.checks;
        if (!live) return;
        setEmpty(j?.data?.empty === true);
        if (isCrossFootList(list)) setChecks(list);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [runId, version]);
  return <CrossFootPanel checks={checks} empty={empty} />;
}
