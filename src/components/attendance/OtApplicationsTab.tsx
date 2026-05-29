"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle, XCircle, Ban, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useDebounce } from "@/lib/hooks/useDebounce";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OTApplication = {
  id: string;
  employeeId: string;
  date: string;
  hours: number;
  justification: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  approvedAt: string | null;
  createdAt: string;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string;
  };
};

type ListResponse = {
  data: OTApplication[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  APPROVED: "default",
  PENDING: "secondary",
  REJECTED: "destructive",
  CANCELLED: "outline",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OtApplicationsTab() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const debouncedSearch = useDebounce(employeeSearch, 400);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "25",
      ...(statusFilter !== "all" && { status: statusFilter }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
    });
    const res = await fetch(`/api/ot-applications?${params}`);
    const json = await res.json();
    if (debouncedSearch && json.data) {
      const q = debouncedSearch.toLowerCase();
      json.data = json.data.filter((r: OTApplication) => {
        if (!r.employee) return true;
        const name = `${r.employee.firstName} ${r.employee.lastName}`.toLowerCase();
        return name.includes(q) || r.employee.employeeNumber.toLowerCase().includes(q);
      });
    }
    setData(json);
    setIsLoading(false);
  }, [page, statusFilter, dateFrom, dateTo, debouncedSearch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, dateFrom, dateTo, debouncedSearch]);

  async function handleAction(id: string, action: "approve" | "reject" | "cancel") {
    setActionLoading(id + "-" + action);
    try {
      const res = await fetch(`/api/ot-applications/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.message ?? `Failed to ${action} OT application`);
        return;
      }
      toast.success(`OT application ${action}d`);
      fetchData();
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search employee…"
            value={employeeSearch}
            onChange={(e) => setEmployeeSearch(e.target.value)}
          />
        </div>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "PENDING")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="date"
          className="w-[150px]"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <Input
          type="date"
          className="w-[150px]"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />

        <Button variant="outline" size="icon" onClick={fetchData}>
          <RefreshCw className="h-4 w-4" />
        </Button>

        <p className="text-sm text-muted-foreground ml-auto">
          {data ? `${data.total} application${data.total !== 1 ? "s" : ""}` : ""}
        </p>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Justification</TableHead>
              <TableHead>Filed</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data?.data.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  No OT applications found.
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-sm">
                    {r.employee
                      ? `${r.employee.firstName} ${r.employee.lastName}`
                      : r.employeeId.slice(0, 8)}
                    {r.employee && (
                      <span className="block text-xs text-muted-foreground">
                        {r.employee.employeeNumber}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{fmtDate(r.date)}</TableCell>
                  <TableCell className="text-sm font-medium">
                    {Number(r.hours).toFixed(1)}h
                  </TableCell>
                  <TableCell className="text-sm max-w-[260px] truncate">
                    {r.justification}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(r.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.status === "PENDING" && (
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-green-600 hover:text-green-700"
                          disabled={!!actionLoading}
                          onClick={() => handleAction(r.id, "approve")}
                          title="Approve"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          disabled={!!actionLoading}
                          onClick={() => handleAction(r.id, "reject")}
                          title="Reject"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground"
                          disabled={!!actionLoading}
                          onClick={() => handleAction(r.id, "cancel")}
                          title="Cancel"
                        >
                          <Ban className="h-4 w-4" />
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

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {page} of {data.totalPages} &mdash; {data.total} applications
          </p>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-disabled={page <= 1}
                  className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  aria-disabled={page >= data.totalPages}
                  className={page >= data.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
