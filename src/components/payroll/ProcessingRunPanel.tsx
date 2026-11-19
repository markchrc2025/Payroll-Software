"use client";

/**
 * PAY-192: what the run page shows while a run is PROCESSING. It refreshes
 * every 5 seconds. After 10 minutes it offers Retry (compute again) and
 * Discard (delete the stuck run so the cutoff can be run again). The server
 * refuses both while the run's job is still waiting or running.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const STUCK_AFTER_MS = 10 * 60 * 1000;

export function ProcessingRunPanel({
  runId,
  createdAt,
  onRefresh,
}: {
  runId: string;
  createdAt: string;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"retry" | "discard" | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      onRefresh();
    }, 5000);
    return () => clearInterval(t);
  }, [onRefresh]);

  const stuck = now - new Date(createdAt).getTime() > STUCK_AFTER_MS;

  async function act(action: "retry" | "discard") {
    setBusy(action);
    try {
      const res = await fetch(`/api/payroll/runs/${runId}/${action}`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "That did not work. Refresh and try again.");
        return;
      }
      toast.success(json.message);
      if (action === "discard") router.push("/payroll");
      else onRefresh();
    } finally {
      setBusy(null);
      setConfirmDiscard(false);
    }
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-3">
      <p className="flex items-center gap-2 font-medium">
        <Loader2 className="h-4 w-4 animate-spin" /> This run is being computed.
      </p>
      {stuck && (
        <>
          <p>
            It has been computing for more than 10 minutes, which usually means the compute was interrupted.
            Retry to compute it again, or discard it to start this cutoff over.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("retry")}>
              {busy === "retry" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              Retry
            </Button>
            {confirmDiscard ? (
              <Button size="sm" variant="destructive" disabled={busy !== null} onClick={() => act("discard")}>
                {busy === "discard" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                Yes, discard this run
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setConfirmDiscard(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Discard
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
