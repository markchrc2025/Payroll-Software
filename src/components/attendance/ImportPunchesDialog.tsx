"use client";

/**
 * PAY-170: import punches from a biometric device export. Accepts a CSV file
 * (or pasted text) with a header naming the employee number, the date and
 * time, and IN or OUT, or a ZKTeco ATTLOG file (1_attlog.dat) as it comes off
 * the device. Nothing is imported unless every row is right.
 */
import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Problem = { row: number; message: string };
type Result = { imported: number; duplicates: number; breaksSkipped: number; daysRecomputed: number; employees: number };

const SAMPLE = "employee_number,date_time,type\nEMP-0001,2027-01-18 07:55,IN\nEMP-0001,2027-01-18 17:02,OUT";

export function ImportPunchesDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  function reset() {
    setCsv(""); setProblems([]); setError(null); setResult(null);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setCsv(await file.text());
    setProblems([]); setError(null); setResult(null);
  }

  async function submit() {
    setBusy(true); setProblems([]); setError(null); setResult(null);
    try {
      const res = await fetch("/api/attendance-logs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? `Import failed (${res.status})`);
        setProblems(body?.details?.problems ?? []);
        return;
      }
      setResult(body.data as Result);
      onImported();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => { reset(); setOpen(true); }}>
        <Upload className="h-4 w-4 mr-1.5" />
        Import punches
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Import punches</DialogTitle>
            <DialogDescription>
              A CSV export from the biometric device, with a header naming the employee number, the date and
              time (YYYY-MM-DD HH:mm, company time) and the punch type (IN or OUT; C/In and C/Out also work),
              or the attendance file a ZKTeco device saves to a USB stick (1_attlog.dat). Each day&apos;s DTR
              is worked out from the punches. Break punches are skipped, because the shift&apos;s break is
              already deducted. Nothing is imported unless every row is right, and punches already in Sentire
              are skipped.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <input
              type="file"
              accept=".csv,.txt,.dat,text/csv"
              aria-label="Punch file"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="block w-full text-sm"
            />
            <Textarea
              aria-label="Punches"
              rows={8}
              placeholder={SAMPLE}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          {error && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">
              <p className="font-medium">{error}</p>
              {problems.length > 0 && (
                <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-xs">
                  {problems.map((p, i) => (
                    <li key={i}>{p.row > 0 ? `Row ${p.row}: ` : ""}{p.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {result && (
            <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-900">
              Imported {result.imported} punch{result.imported === 1 ? "" : "es"} for {result.employees} employee
              {result.employees === 1 ? "" : "s"}; {result.daysRecomputed} DTR day{result.daysRecomputed === 1 ? "" : "s"} worked out.
              {result.duplicates > 0 && ` ${result.duplicates} already in Sentire, skipped.`}
              {result.breaksSkipped > 0 && ` ${result.breaksSkipped} break punch${result.breaksSkipped === 1 ? "" : "es"} skipped.`}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <Button onClick={submit} disabled={busy || csv.trim() === ""}>
              {busy ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
