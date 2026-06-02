"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OTApplication = {
  id: string;
  employeeId: string;
  date: string;
  hours: number;
  justification: string;
  status: string;
  createdAt: string;
  employee: { id: string; employeeNumber: string; firstName: string; lastName: string };
};

type Employee = { id: string; employeeNumber: string; firstName: string; lastName: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OT_STATUSES = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

function statusBadgeVariant(s: string): "default" | "secondary" | "outline" | "destructive" {
  if (s === "PENDING") return "secondary";
  if (s === "APPROVED") return "outline";
  if (s === "REJECTED" || s === "CANCELLED") return "destructive";
  return "secondary";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OTApplicationsPage() {
  const [applications, setApplications] = useState<OTApplication[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Sheets
  const [createOpen, setCreateOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<OTApplication | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Create form
  const [form, setForm] = useState({
    employeeId: "",
    date: "",
    hoursRequested: "",
    justification: "",
  });
  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadEmployees = useCallback(async () => {
    const res = await fetch("/api/employees?limit=500&status=ACTIVE");
    const json = await res.json();
    setEmployees(json.data ?? []);
  }, []);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (filterStatus) params.set("status", filterStatus);
    if (filterDateFrom) params.set("dateFrom", filterDateFrom);
    if (filterDateTo) params.set("dateTo", filterDateTo);
    const res = await fetch(`/api/ot-applications?${params}`);
    const json = await res.json();
    setApplications(json.data ?? []);
    setTotal(json.meta?.total ?? 0);
    setLoading(false);
  }, [filterStatus, filterDateFrom, filterDateTo]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);
  useEffect(() => { loadApplications(); }, [loadApplications]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleCreate() {
    if (!form.employeeId) { toast.error("Select an employee"); return; }
    if (!form.date) { toast.error("Date is required"); return; }
    if (!form.hoursRequested || Number(form.hoursRequested) <= 0) { toast.error("Hours requested must be > 0"); return; }
    if (!form.justification.trim()) { toast.error("Justification is required"); return; }

    setSaving(true);
    const res = await fetch(`/api/employees/${form.employeeId}/ot-applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date,
        hours: parseFloat(form.hoursRequested),
        justification: form.justification.trim(),
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to create OT application"); return; }
    toast.success("OT application created");
    setCreateOpen(false);
    loadApplications();
  }

  async function handleApprove(app: OTApplication) {
    const res = await fetch(`/api/ot-applications/${app.id}/approve`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? "Failed to approve"); return; }
    toast.success("OT application approved");
    loadApplications();
  }

  async function handleReject() {
    if (!rejectTarget) return;
    setSaving(true);
    const body: Record<string, unknown> = {};
    if (rejectReason.trim()) body.rejectionReason = rejectReason.trim();
    const res = await fetch(`/api/ot-applications/${rejectTarget.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to reject"); return; }
    toast.success("OT application rejected");
    setRejectTarget(null);
    setRejectReason("");
    loadApplications();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">OT Applications</h1>
        <p className="text-sm text-muted-foreground">Overtime requests and approvals</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterStatus || "all"} onValueChange={(v) => { const val = v ?? "all"; setFilterStatus(val === "all" ? "" : val); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {OT_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-36"
            placeholder="From"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            className="w-36"
            placeholder="To"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
          />
        </div>

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={loadApplications} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => { setForm({ employeeId: "", date: "", hoursRequested: "", justification: "" }); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> New Application
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead>Justification</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="w-[120px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : applications.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  No OT applications found.
                </TableCell>
              </TableRow>
            ) : (
              applications.map((app) => (
                <TableRow key={app.id}>
                  <TableCell className="text-sm font-medium">
                    {app.employee.lastName}, {app.employee.firstName}
                    <span className="block text-xs text-muted-foreground">{app.employee.employeeNumber}</span>
                  </TableCell>
                  <TableCell className="text-sm">{app.date.slice(0, 10)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{Number(app.hours).toFixed(1)}h</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate" title={app.justification}>
                    {app.justification.slice(0, 80)}{app.justification.length > 80 ? "…" : ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(app.status)}>
                      {OT_STATUSES.find((s) => s.value === app.status)?.label ?? app.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(app.createdAt).toLocaleDateString("en-PH")}
                  </TableCell>
                  <TableCell>
                    {app.status === "PENDING" && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-green-600 hover:text-green-700"
                          onClick={() => handleApprove(app)}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => { setRejectTarget(app); setRejectReason(""); }}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {total > 50 && (
        <p className="text-xs text-muted-foreground text-right">Showing 50 of {total} applications.</p>
      )}

      {/* Create Sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full sm:max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New OT Application</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <Label>Employee <span className="text-destructive">*</span></Label>
              <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v ?? "" })}>
                <SelectTrigger><SelectValue placeholder="Select employee…" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.lastName}, {e.firstName} ({e.employeeNumber})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Hours Requested <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                placeholder="2.0"
                value={form.hoursRequested}
                onChange={(e) => setForm({ ...form, hoursRequested: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Justification <span className="text-destructive">*</span></Label>
              <Textarea rows={4} value={form.justification} onChange={(e) => setForm({ ...form, justification: e.target.value })} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleCreate} disabled={saving}>
                {saving ? "Submitting…" : "Submit Application"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Reject Sheet */}
      <Sheet open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <SheetContent className="w-full sm:max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Reject OT Application</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {rejectTarget && (
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="font-medium">{rejectTarget.employee.lastName}, {rejectTarget.employee.firstName}</p>
                <p className="text-muted-foreground">{rejectTarget.date.slice(0, 10)} · {Number(rejectTarget.hours).toFixed(1)}h</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Rejection Reason <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={saving}>
                {saving ? "Rejecting…" : "Reject"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setRejectTarget(null)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
