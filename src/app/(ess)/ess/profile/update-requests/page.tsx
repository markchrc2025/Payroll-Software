"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

// ─── Types ───────────────────────────────────────────────────────────────────

type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";

interface ProfileUpdateRequest {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string;
  status: RequestStatus;
  rejectionReason: string | null;
  createdAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  firstName: "First Name",
  middleName: "Middle Name",
  lastName: "Last Name",
  suffix: "Suffix",
  preferredName: "Preferred Name",
  birthDate: "Birth Date",
  gender: "Gender",
  civilStatus: "Civil Status",
  nationality: "Nationality",
  mobileNumber: "Mobile Number",
  personalEmail: "Personal Email",
  addressLine1: "Address Line 1",
  addressLine2: "Address Line 2",
  city: "City",
  province: "Province",
  zipCode: "ZIP Code",
  bankAccountNumber: "Bank Account Number",
  bankAccountName: "Bank Account Name",
  bankCode: "Bank Code",
};

const FIELD_OPTIONS = Object.entries(FIELD_LABELS).map(([value, label]) => ({
  value,
  label,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: RequestStatus) {
  const variants: Record<RequestStatus, string> = {
    PENDING: "outline",
    APPROVED: "default",
    REJECTED: "destructive",
  };
  return (
    <Badge variant={(variants[status] ?? "secondary") as never}>{status}</Badge>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const EMPTY_FORM = { field: "", newValue: "" };

export default function EssProfileUpdateRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<ProfileUpdateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function authHeaders() {
    const token = localStorage.getItem("ess_token");
    return { Authorization: `Bearer ${token ?? ""}` };
  }

  const fetchRequests = useCallback(() => {
    const token = localStorage.getItem("ess_token");
    if (!token) {
      router.replace("/ess/login");
      return;
    }
    setLoading(true);
    fetch("/api/ess/profile/update-requests", { headers: authHeaders() })
      .then((r) => {
        if (r.status === 401) {
          localStorage.removeItem("ess_token");
          router.replace("/ess/login");
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d) setRequests(d?.data ?? []);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  async function submitRequest() {
    if (!form.field || !form.newValue.trim()) {
      toast.error("Please select a field and enter the new value.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/ess/profile/update-requests", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ field: form.field, newValue: form.newValue.trim() }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast.error(data?.error ?? "Failed to submit request");
      return;
    }
    toast.success("Request filed! HR will review and apply the change.");
    setSheetOpen(false);
    setForm(EMPTY_FORM);
    fetchRequests();
  }

  return (
    <div className="p-4 lg:p-8 space-y-4 max-w-4xl mx-auto">
      {/* Back navigation */}
      <Link
        href="/ess/profile"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Profile
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Profile Update Requests</h1>
          <p className="text-sm text-muted-foreground">
            Request changes to your personal information
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setForm(EMPTY_FORM);
            setSheetOpen(true);
          }}
        >
          + Request Change
        </Button>
      </div>

      {/* Requests table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                <TableHead>Old Value</TableHead>
                <TableHead>Requested Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-10"
                  >
                    No update requests yet
                  </TableCell>
                </TableRow>
              )}
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {FIELD_LABELS[r.field] ?? r.field}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {r.oldValue || "—"}
                  </TableCell>
                  <TableCell className="text-sm max-w-[140px]">
                    <p className="truncate" title={r.newValue}>
                      {r.newValue}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {statusBadge(r.status)}
                      {r.status === "REJECTED" && r.rejectionReason && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {r.rejectionReason}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {fmtDate(r.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        For bank account changes, HR will verify your identity before applying.
        Changes are <strong>not reflected</strong> until HR approves.
      </p>

      {/* Request Change Sheet */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(o) => {
          if (!o) setSheetOpen(false);
        }}
      >
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Request Profile Change</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Select the field you want to update. HR will review and apply the
              change after verifying your request.
            </p>
            <div className="space-y-1">
              <Label>
                Field to Change <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.field || "none"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, field: !v || v === "none" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select field</SelectItem>
                  {FIELD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-value">
                New Value <span className="text-destructive">*</span>
              </Label>
              <Input
                id="new-value"
                placeholder="Enter the new value"
                value={form.newValue}
                onChange={(e) =>
                  setForm((f) => ({ ...f, newValue: e.target.value }))
                }
              />
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitRequest}
              disabled={saving || !form.field || !form.newValue.trim()}
            >
              {saving ? "Submitting…" : "Submit Request"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
