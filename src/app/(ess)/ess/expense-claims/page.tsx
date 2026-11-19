"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
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

type ClaimStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "ATTACHED" | "PAID";

interface ExpenseClaim {
  id: string;
  category: string;
  description: string;
  amountCents: string;
  claimDate: string;
  status: ClaimStatus;
  rejectionReason: string | null;
  receiptKey: string | null;
  createdAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "TRANSPORTATION", label: "Transportation" },
  { value: "MEALS", label: "Meals" },
  { value: "ACCOMMODATION", label: "Accommodation" },
  { value: "COMMUNICATION", label: "Communication" },
  { value: "OFFICE_SUPPLIES", label: "Office Supplies" },
  { value: "MEDICAL", label: "Medical" },
  { value: "TRAINING", label: "Training" },
  { value: "ENTERTAINMENT", label: "Entertainment" },
  { value: "OTHER", label: "Other" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: ClaimStatus) {
  const variants: Record<ClaimStatus, string> = {
    DRAFT: "secondary",
    SUBMITTED: "outline",
    APPROVED: "default",
    REJECTED: "destructive",
    ATTACHED: "outline",
    PAID: "default",
  };
  return (
    <Badge variant={(variants[status] ?? "secondary") as never}>{status}</Badge>
  );
}

function fmtPeso(cents: string) {
  const amount = Number(cents) / 100;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  category: "OTHER",
  description: "",
  amount: "",
  claimDate: todayIso(),
};

export default function EssExpenseClaimsPage() {
  const router = useRouter();
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  // PAY-190: the receipt (OR) photo or PDF, uploaded before the claim is filed.
  const [receipt, setReceipt] = useState<File | null>(null);

  function authHeaders() {
    const token = localStorage.getItem("ess_token");
    return { Authorization: `Bearer ${token ?? ""}` };
  }

  const fetchClaims = useCallback(() => {
    const token = localStorage.getItem("ess_token");
    if (!token) {
      router.replace("/ess/login");
      return;
    }
    setLoading(true);
    fetch("/api/ess/expense-claims", { headers: authHeaders() })
      .then((r) => {
        if (r.status === 401) {
          localStorage.removeItem("ess_token");
          router.replace("/ess/login");
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d) setClaims(d?.data ?? []);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  async function fileClaim() {
    const amountPesos = parseFloat(form.amount);
    if (!form.description.trim() || isNaN(amountPesos) || amountPesos <= 0) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setSaving(true);

    // Convert pesos → centavos (integer)
    const amountCents = Math.round(amountPesos * 100);

    // Step 0 (PAY-190): upload the receipt, if one is attached
    let receiptKey: string | undefined;
    if (receipt) {
      const fd = new FormData();
      fd.append("file", receipt);
      const upRes = await fetch("/api/ess/expense-claims/upload", { method: "POST", headers: authHeaders(), body: fd });
      const upData = await upRes.json().catch(() => null);
      if (!upRes.ok) {
        toast.error(upData?.error ?? "The receipt could not be uploaded.");
        setSaving(false);
        return;
      }
      receiptKey = upData?.data?.storageKey;
    }

    // Step 1: Create claim (as DRAFT)
    const createRes = await fetch("/api/ess/expense-claims", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        category: form.category,
        description: form.description.trim(),
        amountCents,
        claimDate: form.claimDate,
        ...(receiptKey ? { receiptKey } : {}),
      }),
    });
    const createData = await createRes.json();
    if (!createRes.ok) {
      toast.error(createData?.error ?? "Failed to create claim");
      setSaving(false);
      return;
    }

    // Step 2: Auto-submit the claim for Finance review
    const claimId = createData?.data?.id;
    const submitRes = await fetch(
      `/api/ess/expense-claims/${claimId}/submit`,
      { method: "POST", headers: authHeaders() },
    );
    const submitData = await submitRes.json();
    setSaving(false);

    if (!submitRes.ok) {
      toast.error(submitData?.error ?? "Claim created but submit failed");
      fetchClaims();
      return;
    }

    toast.success("Expense claim submitted for Finance review!");
    setSheetOpen(false);
    setForm({ ...EMPTY_FORM, claimDate: todayIso() });
    setReceipt(null);
    fetchClaims();
  }

  async function viewReceipt(id: string) {
    const res = await fetch(`/api/ess/expense-claims/${id}/receipt`, { headers: authHeaders() });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.data?.url) {
      toast.error(data?.error ?? "The receipt could not be opened.");
      return;
    }
    window.open(data.data.url, "_blank", "noopener");
  }

  const canSubmitForm =
    !!form.description.trim() &&
    !!form.amount &&
    parseFloat(form.amount) > 0 &&
    !!form.claimDate;

  return (
    <div className="p-4 lg:p-8 space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Expense Claims</h1>
          <p className="text-sm text-muted-foreground">
            Submit and track reimbursement requests
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setForm({ ...EMPTY_FORM, claimDate: todayIso() });
            setReceipt(null);
            setSheetOpen(true);
          }}
        >
          + File Claim
        </Button>
      </div>

      {/* Claims table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Receipt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-10"
                  >
                    No expense claims yet
                  </TableCell>
                </TableRow>
              )}
              {claims.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap">
                    {fmtDate(c.claimDate)}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs">
                      {CATEGORIES.find((x) => x.value === c.category)?.label ??
                        c.category}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[160px]">
                    <p className="text-sm truncate" title={c.description}>
                      {c.description}
                    </p>
                    {c.status === "REJECTED" && c.rejectionReason && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {c.rejectionReason}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium whitespace-nowrap">
                    {fmtPeso(c.amountCents)}
                  </TableCell>
                  <TableCell>{statusBadge(c.status)}</TableCell>
                  <TableCell>
                    {c.receiptKey ? (
                      <Button variant="link" size="sm" className="h-auto p-0" onClick={() => viewReceipt(c.id)}>
                        View
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Note about receipts */}
      <p className="text-xs text-muted-foreground px-1">
        Attach a photo or PDF of your official receipt (OR) when you file a claim.
        Claims without a valid OR may be rejected.
      </p>

      {/* File Claim Sheet */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(o) => {
          if (!o) setSheetOpen(false);
        }}
      >
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>File Expense Claim</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <Label>
                Category <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, category: v ?? f.category }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="claim-date">
                Expense Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="claim-date"
                type="date"
                max={todayIso()}
                value={form.claimDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, claimDate: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="claim-amount">
                Amount (₱) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="claim-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="e.g. 350.00"
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="claim-desc">
                Description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="claim-desc"
                rows={3}
                placeholder="e.g. Grab ride to client meeting at Makati"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="claim-receipt">Official receipt (photo or PDF, up to 10 MB)</Label>
              <Input
                id="claim-receipt"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={fileClaim} disabled={saving || !canSubmitForm}>
              {saving ? "Submitting…" : "Submit Claim"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
