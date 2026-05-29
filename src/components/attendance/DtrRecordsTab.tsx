"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle, XCircle, Search, RefreshCw } from "lucide-react";
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

type DTRRecord = {
  id: string;
  employeeId: string;
  date: string;
  dayStatus: string;
  workedMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
  otMinutes: number;
  nsdMinutes: number;
  hazardMinutes: number;
  holidayType: string | null;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  isLocked: boolean;
  notes: string | null;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string;
  };
};

type ListResponse = {
  data: DTRRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMinutes(min: number) {
  if (min === 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

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
};

const DAY_STATUS_LABELS: Record<string, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  PAID_LEAVE: "Paid Leave",
  UNPAID_LEAVE: "Unpaid Leave",
  HOLIDAY: "Holiday",
  REST_DAY: "Rest Day",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DtrRecordsTab() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const debouncedSearch = useDebounce(employeeSearch, 400);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "25",
      ...(statusFilter !== "all" && { approvalStatus: statusFilter }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
    });
    const res = await fetch(`/api/dtr?${params}`);
    const json = await res.json();
    // Client-side filter by employee name/number if search is set
    if (debouncedSearch && json.data) {
      const q = debouncedSearch.toLowerCase();
      json.data = json.data.filter((r: DTRRecord) => {
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

  async function handleApprove(id: string) {
    setActionLoading(id + "-approve");
    try {
      const res = await fetch(`/api/dtr/${id}/approve`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.message ?? "Failed to approve DTR");
        return;
      }
      toast.success("DTR record approved");
      fetchData();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(id: string) {
    const reason = prompt("Reason for rejection (optional):");
    if (reason === null) return; // cancelled
    setActionLoading(id + "-reject");
    try {
      const res = await fetch(`/api/dtr/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || null }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.message ?? "Failed to reject DTR");
        return;
      }
      toast.success("DTR record rejected");
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

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="date"
          className="w-[150px]"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          placeholder="From"
        />
        <Input
          type="date"
          className="w-[150px]"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          placeholder="To"
        />

        <Button variant="outline" size="icon" onClick={fetchData}>
          <RefreshCw className="h-4 w-4" />
        </Button>

        <p className="text-sm text-muted-foreground ml-auto">
          {data ? `${data.total} record${data.total !== 1 ? "s" : ""}` : ""}
        </p>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Day Status</TableHead>
              <TableHead>Worked</TableHead>
              <TableHead>Late</TableHead>
              <TableHead>OT</TableHead>
              <TableHead>NSD</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[110px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data?.data.length ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                  No DTR records found.
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((r) => (
                <TableRow key={r.id} className={r.isLocked ? "opacity-60" : ""}>
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
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {DAY_STATUS_LABELS[r.dayStatus] ?? r.dayStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{fmtMinutes(r.workedMinutes)}</TableCell>
                  <TableCell className="text-sm text-destructive">
                    {fmtMinutes(r.lateMinutes)}
                  </TableCell>
                  <TableCell className="text-sm">{fmtMinutes(r.otMinutes)}</TableCell>
                  <TableCell className="text-sm">{fmtMinutes(r.nsdMinutes)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.approvalStatus] ?? "outline"}>
                      {r.approvalStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.approvalStatus === "PENDING" && !r.isLocked ? (
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-green-600 hover:text-green-700"
                          disabled={actionLoading === r.id + "-approve"}
                          onClick={() => handleApprove(r.id)}
                          title="Approve"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          disabled={actionLoading === r.id + "-reject"}
                          onClick={() => handleReject(r.id)}
                          title="Reject"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : r.isLocked ? (
                      <span className="text-xs text-muted-foreground">Locked</span>
                    ) : null}
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
            Page {page} of {data.totalPages} &mdash; {data.total} records
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
