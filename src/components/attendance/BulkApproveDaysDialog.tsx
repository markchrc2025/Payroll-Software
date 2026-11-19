"use client";

/**
 * PAY-178: approve every pending DTR day in a date range in one step. This is
 * how HR approves days that come from the biometric import or the kiosk, which
 * have no ESS submission. Days with a missing punch are skipped and listed, so
 * HR can enter the missing time and approve them after.
 */
import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Result {
  approved: number;
  skippedMissingPunch: { employeeId: string; employeeNumber: string; name: string; date: string }[];
  skippedOwn: number;
}

export function BulkApproveDaysDialog({
  defaultFrom,
  defaultTo,
  onApproved,
}: {
  defaultFrom?: string;
  defaultTo?: string;
  onApproved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultFrom ?? "");
  const [to, setTo] = useState(defaultTo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  function start() {
    setFrom(defaultFrom ?? from);
    setTo(defaultTo ?? to);
    setError(null);
    setResult(null);
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/dtr/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const fieldErrors = body?.details?.fieldErrors as Record<string, string[]> | undefined;
        setError(fieldErrors?.to?.[0] ?? body?.error ?? `Approval failed (${res.status})`);
        return;
      }
      setResult(body.data as Result);
      onApproved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={start}>
        <CheckCheck className="h-4 w-4 mr-1.5" />
        Approve days
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Approve DTR days</DialogTitle>
            <DialogDescription>
              Approves every pending DTR day in the dates below, for all employees, including days from the
              biometric import and the kiosk. Days with a missing punch are skipped and listed: enter the missing
              time, then approve again. Your own days are never approved by you.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="bulk-from">From</Label>
              <Input id="bulk-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bulk-to">To</Label>
              <Input id="bulk-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">
              {error}
            </p>
          )}
          {result && (
            <div role="status" className="space-y-2 text-sm">
              <p className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-emerald-900">
                {result.approved} day{result.approved === 1 ? "" : "s"} approved.
                {result.skippedOwn > 0 && ` ${result.skippedOwn} of your own day(s) skipped.`}
              </p>
              {result.skippedMissingPunch.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
                  <p className="font-medium">
                    {result.skippedMissingPunch.length} day{result.skippedMissingPunch.length === 1 ? "" : "s"} not
                    approved: missing punch
                  </p>
                  <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-xs">
                    {result.skippedMissingPunch.map((d) => (
                      <li key={`${d.employeeId}-${d.date}`}>
                        {d.date}: {d.name} ({d.employeeNumber})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <Button onClick={submit} disabled={busy || !from || !to}>
              {busy ? "Approving…" : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
