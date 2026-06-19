"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
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

type UndertimeRequest = {
  id: string;
  employeeId: string;
  date: string;
  undertimeMinutes: number;
  reason: string;
  status: string;
  createdAt: string;
  employee: { id: string; employeeNumber: string; firstName: string; lastName: string };
};

const STATUSES = [
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

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h && min) return `${h}h ${min}m`;
  if (h) return `${h}h`;
  return `${min}m`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UndertimeRequestsPage() {
  const [requests, setRequests] = useState<UndertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const [filterStatus, setFilterStatus] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const [rejectTarget, setRejectTarget] = useState<UndertimeRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [saving, setSaving] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (filterStatus) params.set("status", filterStatus);
    if (filterDateFrom) params.set("dateFrom", filterDateFrom);
    if (filterDateTo) params.set("dateTo", filterDateTo);
    const res = await fetch(`/api/undertime-requests?${params}`);
    const json = await res.json();
    setRequests(json.data ?? []);
    setTotal(json.meta?.total ?? 0);
    setLoading(false);
  }, [filterStatus, filterDateFrom, filterDateTo]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  async function handleApprove(r: UndertimeRequest) {
    const res = await fetch(`/api/undertime-requests/${r.id}/approve`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? "Failed to approve"); return; }
    toast.success("Undertime request approved — excused from deduction");
    loadRequests();
  }

  async function handleReject() {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) { toast.error("Rejection reason is required"); return; }
    setSaving(true);
    const res = await fetch(`/api/undertime-requests/${rejectTarget.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejectionReason: rejectReason.trim() }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to reject"); return; }
    toast.success("Undertime request rejected");
    setRejectTarget(null);
    setRejectReason("");
    loadRequests();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Undertime Requests</h1>
        <p className="text-sm text-muted-foreground">
          Approved undertime is excused from pay deductions.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterStatus || "all"} onValueChange={(v) => { const val = v ?? "all"; setFilterStatus(val === "all" ? "" : val); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input type="date" className="w-36" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" className="w-36" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
        </div>

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={loadRequests} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
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
              <TableHead className="text-right">Undertime</TableHead>
              <TableHead>Reason</TableHead>
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
            ) : requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  No undertime requests found.
                </TableCell>
              </TableRow>
            ) : (
              requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm font-medium">
                    {r.employee.lastName}, {r.employee.firstName}
                    <span className="block text-xs text-muted-foreground">{r.employee.employeeNumber}</span>
                  </TableCell>
                  <TableCell className="text-sm">{r.date.slice(0, 10)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtMinutes(r.undertimeMinutes)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate" title={r.reason}>
                    {r.reason.slice(0, 80)}{r.reason.length > 80 ? "…" : ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(r.status)}>
                      {STATUSES.find((s) => s.value === r.status)?.label ?? r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString("en-PH")}
                  </TableCell>
                  <TableCell>
                    {r.status === "PENDING" && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-green-600 hover:text-green-700"
                          onClick={() => handleApprove(r)}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => { setRejectTarget(r); setRejectReason(""); }}
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
        <p className="text-xs text-muted-foreground text-right">Showing 50 of {total} requests.</p>
      )}

      {/* Reject Sheet */}
      <Sheet open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <SheetContent className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Reject Undertime Request</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {rejectTarget && (
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="font-medium">{rejectTarget.employee.lastName}, {rejectTarget.employee.firstName}</p>
                <p className="text-muted-foreground">{rejectTarget.date.slice(0, 10)} · {fmtMinutes(rejectTarget.undertimeMinutes)}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Rejection Reason <span className="text-destructive">*</span></Label>
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
