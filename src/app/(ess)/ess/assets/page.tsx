"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AssetAssignment {
  id: string;
  assignedAt: string;
  returnedAt: string | null;
  condition: string | null;
  notes: string | null;
  asset: {
    id: string;
    assetCode: string;
    name: string;
    category: string;
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
    purchaseCostCents: string | null;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusBadge(returnedAt: string | null) {
  if (!returnedAt) {
    return <Badge variant="default">Active</Badge>;
  }
  return <Badge variant="secondary">Returned</Badge>;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function EssAssetsPage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<AssetAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  function authHeaders() {
    const token = localStorage.getItem("ess_token");
    return { Authorization: `Bearer ${token ?? ""}` };
  }

  const fetchAssets = useCallback(() => {
    const token = localStorage.getItem("ess_token");
    if (!token) {
      router.replace("/ess/login");
      return;
    }
    setLoading(true);
    fetch("/api/ess/assets", { headers: authHeaders() })
      .then((r) => {
        if (r.status === 401) {
          localStorage.removeItem("ess_token");
          router.replace("/ess/login");
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d) setAssignments(d?.data ?? []);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const active = assignments.filter((a) => !a.returnedAt);
  const returned = assignments.filter((a) => a.returnedAt);

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">My Assets</h1>
        <p className="text-sm text-muted-foreground">
          Equipment and items assigned to you by the company
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <>
          {/* Active assignments */}
          <div>
            <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
              Currently Assigned ({active.length})
            </h2>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Serial No.</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {active.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-muted-foreground py-8"
                      >
                        No active asset assignments
                      </TableCell>
                    </TableRow>
                  )}
                  {active.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{a.asset.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.asset.assetCode}
                          {a.asset.brand ? ` · ${a.asset.brand}` : ""}
                          {a.asset.model ? ` ${a.asset.model}` : ""}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm">{a.asset.category}</TableCell>
                      <TableCell className="text-sm font-mono">
                        {a.asset.serialNumber || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {fmtDate(a.assignedAt)}
                      </TableCell>
                      <TableCell>{statusBadge(a.returnedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Historical / returned */}
          {returned.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                Previously Assigned ({returned.length})
              </h2>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Returned</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returned.map((a) => (
                      <TableRow key={a.id} className="opacity-70">
                        <TableCell>
                          <p className="font-medium text-sm">{a.asset.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.asset.assetCode}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">{a.asset.category}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {fmtDate(a.assignedAt)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {fmtDate(a.returnedAt)}
                        </TableCell>
                        <TableCell>{statusBadge(a.returnedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Use this list as a reference checklist during clearance or offboarding.
        Contact HR if any item appears missing or incorrect.
      </p>
    </div>
  );
}
