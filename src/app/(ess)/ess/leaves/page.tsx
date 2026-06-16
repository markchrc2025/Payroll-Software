"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface LeaveBalance {
  id: string;
  leaveTypeId: string;
  openingBalance: string;
  earned: string;
  used: string;
  forfeited: string;
  convertedToCash: string;
  leaveType: { name: string; code: string; isPaid: boolean; unit: string };
}

interface LeaveType {
  id: string;
  name: string;
  code: string;
  unit: string;
}

interface LeaveRequest {
  id: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  amount: number;
  reason: string | null;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  createdAt: string;
  leaveType?: { name: string };
}

function availableBalance(b: LeaveBalance) {
  return (
    parseFloat(b.earned) -
    parseFloat(b.used) -
    parseFloat(b.forfeited)
  );
}

function statusBadge(status: LeaveRequest["approvalStatus"]) {
  const map: Record<string, string> = {
    PENDING: "outline",
    APPROVED: "default",
    REJECTED: "destructive",
    CANCELLED: "secondary",
  };
  return <Badge variant={(map[status] ?? "secondary") as never}>{status}</Badge>;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function EssLeavesPage() {
  const router = useRouter();
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);

  // File leave form
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState({ leaveTypeId: "", startDate: "", endDate: "", amount: "1", reason: "" });
  const [saving, setSaving] = useState(false);

  function authHeaders() {
    const token = localStorage.getItem("ess_token");
    return { Authorization: `Bearer ${token ?? ""}` };
  }

  const fetchBalances = useCallback(() => {
    const token = localStorage.getItem("ess_token");
    if (!token) { router.replace("/ess/login"); return; }
    setBalancesLoading(true);
    fetch("/api/ess/leave-balances", { headers: authHeaders() })
      .then((r) => {
        if (r.status === 401) { localStorage.removeItem("ess_token"); router.replace("/ess/login"); return null; }
        return r.json();
      })
      .then((d) => {
        if (d) {
          const bals: LeaveBalance[] = d?.data ?? [];
          setBalances(bals);
          setLeaveTypes(bals.map((b) => ({ id: b.leaveTypeId, name: b.leaveType.name, code: b.leaveType.code, unit: b.leaveType.unit })));
        }
      })
      .finally(() => setBalancesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const fetchRequests = useCallback(() => {
    setRequestsLoading(true);
    fetch("/api/ess/leaves", { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setRequests(d?.data ?? []))
      .finally(() => setRequestsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchBalances(); fetchRequests(); }, [fetchBalances, fetchRequests]);

  async function fileLeave() {
    setSaving(true);
    const body = {
      leaveTypeId: form.leaveTypeId,
      startDate: form.startDate,
      endDate: form.endDate,
      amount: parseFloat(form.amount),
      reason: form.reason || undefined,
    };
    const res = await fetch("/api/ess/leaves", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(data?.message ?? "Failed to file leave"); return; }
    toast.success("Leave request filed!");
    setSheetOpen(false);
    setForm({ leaveTypeId: "", startDate: "", endDate: "", amount: "1", reason: "" });
    fetchRequests();
    fetchBalances();
  }

  return (
    <div className="p-4 lg:p-8 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl lg:text-2xl font-bold">Leave</h1>
        <Button size="sm" onClick={() => setSheetOpen(true)}>+ File Leave</Button>
      </div>

      <Tabs defaultValue="balances">
        <TabsList>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="requests">My Requests</TabsTrigger>
        </TabsList>

        {/* Balances */}
        <TabsContent value="balances" className="mt-4">
          {balancesLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
            </div>
          ) : balances.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">No leave balances</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {balances.map((b) => {
                const avail = availableBalance(b);
                return (
                  <div key={b.id} className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-base leading-tight">{b.leaveType.name}</p>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">{b.leaveType.code} · {b.leaveType.unit}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-bold ${avail > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                          {avail.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">Available</p>
                      </div>
                    </div>
                    {/* Stats row */}
                    <div className="grid grid-cols-4 divide-x rounded-lg bg-muted/50 text-center text-xs">
                      <div className="py-2 px-1">
                        <p className="font-medium text-sm">{parseFloat(b.openingBalance).toFixed(1)}</p>
                        <p className="text-muted-foreground">Opening</p>
                      </div>
                      <div className="py-2 px-1">
                        <p className="font-medium text-sm">{parseFloat(b.earned).toFixed(1)}</p>
                        <p className="text-muted-foreground">Earned</p>
                      </div>
                      <div className="py-2 px-1">
                        <p className="font-medium text-sm text-red-500">{parseFloat(b.used).toFixed(1)}</p>
                        <p className="text-muted-foreground">Used</p>
                      </div>
                      <div className="py-2 px-1">
                        <p className="font-medium text-sm text-orange-500">{parseFloat(b.forfeited).toFixed(1)}</p>
                        <p className="text-muted-foreground">Forfeited</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Requests */}
        <TabsContent value="requests" className="mt-4">
          {requestsLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No leave requests</TableCell></TableRow>
                )}
                {requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.leaveType?.name ?? r.leaveTypeId}</TableCell>
                    <TableCell>{new Date(r.startDate).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(r.endDate).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">{r.amount}</TableCell>
                    <TableCell>{statusBadge(r.approvalStatus)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      {/* File Leave Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) setSheetOpen(false); }}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>File Leave Request</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <Label>Leave Type *</Label>
              <Select value={form.leaveTypeId || "none"} onValueChange={(v) => { const val = v ?? "none"; setForm((f) => ({ ...f, leaveTypeId: val === "none" ? "" : val })); }}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select type</SelectItem>
                  {leaveTypes.map((lt) => <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Start Date *</Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>End Date *</Label>
              <Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Days *</Label>
              <Input type="number" min="0.5" step="0.5" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Textarea rows={3} placeholder="Optional reason..." value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
            </div>
          </div>
          <SheetFooter>
            <Button onClick={fileLeave} disabled={saving || !form.leaveTypeId || !form.startDate || !form.endDate || !form.amount}>
              {saving ? "Filing…" : "Submit Request"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
