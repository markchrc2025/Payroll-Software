"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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

type ProfileUpdateRequest = {
  id: string;
  employeeId: string;
  field: string;
  oldValue: string | null;
  newValue: string;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  employee: { id: string; employeeNumber: string; firstName: string; lastName: string };
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Human-readable labels for common Employee field names */
const FIELD_LABELS: Record<string, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  middleName: "Middle Name",
  suffix: "Suffix",
  birthDate: "Birth Date",
  gender: "Gender",
  civilStatus: "Civil Status",
  nationality: "Nationality",
  personalEmail: "Personal Email",
  mobileNumber: "Mobile Number",
  permanentAddress: "Permanent Address",
  presentAddress: "Present Address",
  emergencyContactName: "Emergency Contact Name",
  emergencyContactRelationship: "Emergency Contact Relationship",
  emergencyContactPhone: "Emergency Contact Phone",
  bankName: "Bank Name",
  bankAccountNumber: "Bank Account Number",
  bankAccountName: "Bank Account Name",
  sssNumber: "SSS Number",
  philhealthNumber: "PhilHealth Number",
  pagibigNumber: "Pag-IBIG Number",
  tinNumber: "TIN Number",
};

/** Fields that should mask all but the last 4 characters */
const MASKED_FIELDS = new Set(["bankAccountNumber", "bankAccountName"]);

function fieldLabel(field: string) {
  return FIELD_LABELS[field] ?? field.replace(/([A-Z])/g, " $1").trim();
}

function maskValue(field: string, value: string | null) {
  if (!value) return "—";
  if (MASKED_FIELDS.has(field) && value.length > 4) {
    return "•".repeat(value.length - 4) + value.slice(-4);
  }
  return value;
}

const REQUEST_STATUSES = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

function statusBadgeVariant(s: string): "default" | "secondary" | "outline" | "destructive" {
  if (s === "PENDING") return "secondary";
  if (s === "APPROVED") return "outline";
  if (s === "REJECTED") return "destructive";
  return "secondary";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProfileUpdateRequestsPage() {
  const [requests, setRequests] = useState<ProfileUpdateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filters
  const [filterStatus, setFilterStatus] = useState("PENDING");

  // Reject sheet
  const [rejectTarget, setRejectTarget] = useState<ProfileUpdateRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (filterStatus) params.set("status", filterStatus);
    const res = await fetch(`/api/profile-update-requests?${params}`);
    const json = await res.json();
    setRequests(json.data ?? []);
    setTotal(json.meta?.total ?? 0);
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleApprove(req: ProfileUpdateRequest) {
    const res = await fetch(`/api/profile-update-requests/${req.id}/approve`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? "Failed to approve"); return; }
    toast.success(`${fieldLabel(req.field)} update approved`);
    loadRequests();
  }

  async function handleReject() {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) { toast.error("Rejection reason is required"); return; }
    setSaving(true);
    const res = await fetch(`/api/profile-update-requests/${rejectTarget.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejectionReason: rejectReason.trim() }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to reject"); return; }
    toast.success("Request rejected");
    setRejectTarget(null);
    setRejectReason("");
    loadRequests();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Profile Update Requests</h1>
        <p className="text-sm text-muted-foreground">Employee-submitted field changes pending HR approval</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterStatus || "all"} onValueChange={(v) => { const val = v ?? "all"; setFilterStatus(val === "all" ? "" : val); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {REQUEST_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

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
              <TableHead>Field</TableHead>
              <TableHead>Old Value</TableHead>
              <TableHead>Requested Value</TableHead>
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
                  No profile update requests found.
                </TableCell>
              </TableRow>
            ) : (
              requests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="text-sm font-medium">
                    {req.employee.lastName}, {req.employee.firstName}
                    <span className="block text-xs text-muted-foreground">{req.employee.employeeNumber}</span>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{fieldLabel(req.field)}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {maskValue(req.field, req.oldValue)}
                  </TableCell>
                  <TableCell className="font-mono text-sm font-medium">
                    {maskValue(req.field, req.newValue)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(req.status)}>
                      {REQUEST_STATUSES.find((s) => s.value === req.status)?.label ?? req.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(req.createdAt).toLocaleDateString("en-PH")}
                  </TableCell>
                  <TableCell>
                    {req.status === "PENDING" && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-green-600 hover:text-green-700"
                          onClick={() => handleApprove(req)}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => { setRejectTarget(req); setRejectReason(""); }}
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
            <SheetTitle>Reject Profile Update</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {rejectTarget && (
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                <p className="font-medium">{rejectTarget.employee.lastName}, {rejectTarget.employee.firstName}</p>
                <p className="text-muted-foreground">
                  Field: <span className="font-medium text-foreground">{fieldLabel(rejectTarget.field)}</span>
                </p>
                <p className="text-muted-foreground">
                  Requested: <span className="font-mono font-medium text-foreground">
                    {maskValue(rejectTarget.field, rejectTarget.newValue)}
                  </span>
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Rejection Reason <span className="text-destructive">*</span></Label>
              <Textarea rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={saving}>
                {saving ? "Rejecting…" : "Reject Request"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setRejectTarget(null)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
