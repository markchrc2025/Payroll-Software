"use client";

/**
 * /employees/[id]/offboard
 *
 * 3-step wizard for initiating employee offboarding:
 *   Step 1 — Separation details (reason + last working day)
 *   Step 2 — Asset clearance check (warns if unreturned assets exist)
 *   Step 3 — Final pay + confirmation
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  PackageSearch,
  CheckCircle2,
  Circle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  employmentStatus: string;
  hireDate: string;
  department: { name: string } | null;
  branch: { name: string } | null;
  position: { title: string } | null;
}

interface AssetAssignment {
  id: string;
  assignedAt: string;
  returnedAt: string | null;
  asset: {
    assetCode: string;
    name: string;
    category: string;
  };
}

const SEPARATION_REASONS: Array<{
  value: string;
  label: string;
  description: string;
  dole: string;
}> = [
  {
    value: "RESIGNATION",
    label: "Voluntary Resignation",
    description: "Employee-initiated resignation",
    dole: "No statutory separation pay",
  },
  {
    value: "MUTUAL_AGREEMENT",
    label: "Mutual Agreement",
    description: "Mutually agreed separation",
    dole: "No statutory separation pay",
  },
  {
    value: "END_OF_CONTRACT",
    label: "End of Contract",
    description: "Fixed-term or project-based contract ended",
    dole: "No statutory separation pay",
  },
  {
    value: "REDUNDANCY",
    label: "Redundancy",
    description: "Position declared redundant (Art. 298)",
    dole: "1 month per year of service",
  },
  {
    value: "RETRENCHMENT",
    label: "Retrenchment",
    description: "Cost-cutting retrenchment (Art. 298)",
    dole: "0.5 month per year (min 1 month) — WHT exempt",
  },
  {
    value: "CLOSURE_OF_BUSINESS",
    label: "Business Closure",
    description: "Closure not due to serious losses (Art. 298)",
    dole: "1 month per year — WHT exempt",
  },
  {
    value: "DISEASE",
    label: "Disease (Art. 299)",
    description: "Employee suffering from incurable disease",
    dole: "1 month per year — WHT exempt",
  },
  {
    value: "JUST_CAUSE",
    label: "Just Cause / Dismissal",
    description: "Termination for authorized cause (Art. 297)",
    dole: "No separation pay",
  },
];

const PAY_FREQUENCIES = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "SEMI_MONTHLY", label: "Semi-Monthly" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "DAILY", label: "Daily" },
];

const TERMINAL_STATUSES = new Set([
  "RESIGNED",
  "TERMINATED",
  "RETIRED",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function StepIndicator({
  step,
  current,
  label,
}: {
  step: number;
  current: number;
  label: string;
}) {
  const done = step < current;
  const active = step === current;
  return (
    <div className="flex flex-col items-center gap-1">
      {done ? (
        <CheckCircle2 className="h-6 w-6 text-green-500" />
      ) : active ? (
        <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
          {step}
        </div>
      ) : (
        <Circle className="h-6 w-6 text-muted-foreground" />
      )}
      <span
        className={`text-xs font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function OffboardPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const employeeId = params.id;

  const [step, setStep] = useState(1);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [empLoading, setEmpLoading] = useState(true);
  const [assets, setAssets] = useState<AssetAssignment[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 form
  const [separationReason, setSeparationReason] = useState("");
  const [lastWorkingDay, setLastWorkingDay] = useState(todayIso());
  const [notes, setNotes] = useState("");

  // Step 3 form
  const [createRun, setCreateRun] = useState(true);
  const [payPeriodStart, setPayPeriodStart] = useState("");
  const [payFrequency, setPayFrequency] = useState("MONTHLY");

  // ── Fetch employee ──
  useEffect(() => {
    setEmpLoading(true);
    fetch(`/api/employees/${employeeId}`)
      .then((r) => r.json())
      .then((d) => setEmployee(d?.data ?? null))
      .finally(() => setEmpLoading(false));
  }, [employeeId]);

  // ── Fetch assets when going to step 2 ──
  const fetchAssets = useCallback(() => {
    setAssetsLoading(true);
    fetch(`/api/employees/${employeeId}/assets`)
      .then((r) => r.json())
      .then((d) => setAssets(d?.data ?? []))
      .finally(() => setAssetsLoading(false));
  }, [employeeId]);

  useEffect(() => {
    if (step === 2) fetchAssets();
  }, [step, fetchAssets]);

  const unreturned = assets.filter((a) => !a.returnedAt);

  const selectedReason = SEPARATION_REASONS.find(
    (r) => r.value === separationReason,
  );

  // ── Submit ──
  async function handleSubmit() {
    setSubmitting(true);
    const body: Record<string, unknown> = {
      separationReason,
      lastWorkingDay,
      createFinalPayRun: createRun,
      payFrequency,
      notes: notes.trim() || undefined,
    };
    if (createRun && payPeriodStart) body.payPeriodStart = payPeriodStart;

    const res = await fetch(`/api/employees/${employeeId}/offboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      toast.error(data?.error ?? "Offboarding failed");
      return;
    }

    const bookId = data?.data?.payrollBookId;
    if (bookId) {
      toast.success("Employee offboarded. Final Pay run created — redirecting…");
      router.push(`/payroll/${bookId}`);
    } else {
      toast.success("Employee offboarded successfully.");
      router.push(`/employees`);
    }
  }

  // ─── Guard: already in terminal status ────────────────────────────────────
  if (!empLoading && employee && TERMINAL_STATUSES.has(employee.employmentStatus)) {
    return (
      <div className="max-w-lg mx-auto p-8 space-y-4">
        <Link href="/employees">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back to Employees
          </Button>
        </Link>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center space-y-2">
          <AlertTriangle className="h-8 w-8 mx-auto text-destructive" />
          <p className="font-semibold">Already Offboarded</p>
          <p className="text-sm text-muted-foreground">
            {employee.firstName} {employee.lastName} has status{" "}
            <Badge variant="secondary">{employee.employmentStatus}</Badge> and
            cannot be offboarded again.
          </p>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Back link */}
      <Link href="/employees">
        <Button variant="ghost" size="sm" className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Employees
        </Button>
      </Link>

      {/* Header */}
      {empLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      ) : (
        <div>
          <h1 className="text-2xl font-bold">Initiate Offboarding</h1>
          <p className="text-muted-foreground">
            {employee?.firstName} {employee?.lastName}{" "}
            <span className="font-mono text-xs">
              ({employee?.employeeNumber})
            </span>{" "}
            · {employee?.department?.name ?? "No Dept"} ·{" "}
            {employee?.branch?.name ?? "No Branch"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Hired: {fmtDate(employee?.hireDate)} ·{" "}
            <Badge variant="outline" className="text-xs">
              {employee?.employmentStatus}
            </Badge>
          </p>
        </div>
      )}

      {/* Step indicator */}
      <div className="flex items-center gap-4">
        <StepIndicator step={1} current={step} label="Separation" />
        <div className="flex-1 h-px bg-border" />
        <StepIndicator step={2} current={step} label="Assets" />
        <div className="flex-1 h-px bg-border" />
        <StepIndicator step={3} current={step} label="Final Pay" />
      </div>

      <Separator />

      {/* ═══════ STEP 1 — Separation Details ══════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-5">
          <h2 className="font-semibold text-lg">Step 1 — Separation Details</h2>

          <div className="space-y-1.5">
            <Label htmlFor="sep-reason">
              Separation Reason <span className="text-destructive">*</span>
            </Label>
            <Select
              value={separationReason}
              onValueChange={(v) => setSeparationReason(v ?? "")}
            >
              <SelectTrigger id="sep-reason">
                <SelectValue placeholder="Select a reason…" />
              </SelectTrigger>
              <SelectContent>
                {SEPARATION_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedReason && (
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-0.5">
                <p className="text-muted-foreground">{selectedReason.description}</p>
                <p className="font-medium text-xs">
                  DOLE Separation Pay: {selectedReason.dole}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="last-day">
              Last Working Day <span className="text-destructive">*</span>
            </Label>
            <Input
              id="last-day"
              type="date"
              max={new Date(
                new Date().setFullYear(new Date().getFullYear() + 1),
              )
                .toISOString()
                .slice(0, 10)}
              value={lastWorkingDay}
              onChange={(e) => setLastWorkingDay(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ob-notes">Notes (optional)</Label>
            <Textarea
              id="ob-notes"
              rows={2}
              placeholder="e.g. Resignation letter received, 30-day notice served."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
            />
          </div>

          <div className="flex justify-end">
            <Button
              disabled={!separationReason || !lastWorkingDay}
              onClick={() => setStep(2)}
              className="gap-2"
            >
              Next: Asset Clearance <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ═══════ STEP 2 — Asset Clearance ═════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-5">
          <h2 className="font-semibold text-lg">Step 2 — Asset Clearance</h2>

          {assetsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : unreturned.length === 0 ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">All assets cleared</p>
                <p className="text-xs text-muted-foreground">
                  No unreturned assets on record. You may proceed.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-sm">
                    {unreturned.length} unreturned asset
                    {unreturned.length > 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    HR should collect or process deductions before finalising
                    the final pay run.
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                {unreturned.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 text-sm bg-white rounded border px-3 py-2"
                  >
                    <PackageSearch className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium font-mono text-xs">
                      {a.asset.assetCode}
                    </span>
                    <span>{a.asset.name}</span>
                    <Badge variant="outline" className="ml-auto text-xs">
                      {a.asset.category}
                    </Badge>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                You can still proceed — record asset deductions as payroll
                adjustments in the Final Pay run.
              </p>
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button onClick={() => setStep(3)} className="gap-2">
              Next: Final Pay Setup <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ═══════ STEP 3 — Final Pay & Confirm ═════════════════════════════ */}
      {step === 3 && (
        <div className="space-y-5">
          <h2 className="font-semibold text-lg">Step 3 — Final Pay & Confirm</h2>

          {/* Create run toggle */}
          <div className="flex items-start gap-3 rounded-lg border p-4">
            <input
              type="checkbox"
              id="create-run"
              checked={createRun}
              onChange={(e) => setCreateRun(e.target.checked)}
              className="mt-1 h-4 w-4 cursor-pointer"
            />
            <div>
              <label htmlFor="create-run" className="font-medium text-sm cursor-pointer">
                Create a Final Pay run immediately
              </label>
              <p className="text-xs text-muted-foreground mt-0.5">
                A DRAFT payroll run will be created and scoped only to this
                employee. You can recompute, add adjustments, and finalize it
                from the Payroll page.
              </p>
            </div>
          </div>

          {createRun && (
            <div className="grid grid-cols-2 gap-4 pl-1">
              <div className="space-y-1.5">
                <Label htmlFor="period-start">
                  Pay Period Start <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="period-start"
                  type="date"
                  value={payPeriodStart}
                  max={lastWorkingDay}
                  onChange={(e) => setPayPeriodStart(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Usually the first day of the final pay period.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Pay Frequency</Label>
                <Select
                  value={payFrequency}
                  onValueChange={(v) => setPayFrequency(v ?? "MONTHLY")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAY_FREQUENCIES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
            <p className="font-semibold">Summary of actions</p>
            <ul className="space-y-1 text-muted-foreground list-disc list-inside">
              <li>
                Employee status will be set to{" "}
                <span className="font-medium text-foreground">
                  {separationReason === "RESIGNATION" ||
                  separationReason === "MUTUAL_AGREEMENT" ||
                  separationReason === "END_OF_CONTRACT"
                    ? "RESIGNED"
                    : "TERMINATED"}
                </span>
              </li>
              <li>
                Separation reason:{" "}
                <span className="font-medium text-foreground">
                  {selectedReason?.label ?? separationReason}
                </span>
              </li>
              <li>
                Last working day:{" "}
                <span className="font-medium text-foreground">
                  {fmtDate(lastWorkingDay)}
                </span>
              </li>
              {createRun && payPeriodStart ? (
                <li>
                  A DRAFT{" "}
                  <span className="font-medium text-foreground">
                    FINAL PAY
                  </span>{" "}
                  payroll run will be created (
                  {fmtDate(payPeriodStart)} – {fmtDate(lastWorkingDay)})
                </li>
              ) : (
                <li className="text-amber-600">
                  No payroll run will be created — you can create one manually
                  later from the Payroll page.
                </li>
              )}
              {unreturned.length > 0 && (
                <li className="text-amber-600">
                  {unreturned.length} unreturned asset
                  {unreturned.length > 1 ? "s" : ""} — add deductions to the
                  Final Pay run.
                </li>
              )}
            </ul>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button
              variant="destructive"
              disabled={
                submitting ||
                (createRun && !payPeriodStart)
              }
              onClick={handleSubmit}
            >
              {submitting ? "Processing…" : "Confirm Offboarding"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
