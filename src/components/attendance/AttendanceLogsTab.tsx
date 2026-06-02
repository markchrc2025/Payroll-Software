"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { AttendanceLogDetailSheet } from "@/components/attendance/AttendanceLogDetailSheet";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AttendanceLog = {
  id: string;
  employeeId: string;
  punchType: "IN" | "OUT";
  source: "KIOSK" | "ESS" | "IMPORT" | "MANUAL";
  punchedAt: string;
  outsideGeofence: boolean;
  distanceMeters: number | null;
  ipAddress: string | null;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string;
  };
  kiosk?: { id: string; name: string } | null;
};

type ListResponse = {
  data: AttendanceLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

const SOURCE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  KIOSK: "default",
  ESS: "secondary",
  IMPORT: "outline",
  MANUAL: "outline",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AttendanceLogsTab() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [geofenceFilter, setGeofenceFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "50",
      ...(sourceFilter !== "all" && { source: sourceFilter }),
      ...(geofenceFilter === "outside" && { outsideGeofence: "true" }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
    });
    const res = await fetch(`/api/attendance-logs?${params}`);
    const json = await res.json();
    setData(json);
    setIsLoading(false);
  }, [page, sourceFilter, geofenceFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [sourceFilter, geofenceFilter, dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v ?? "all")}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="KIOSK">Kiosk</SelectItem>
            <SelectItem value="ESS">ESS</SelectItem>
            <SelectItem value="IMPORT">Import</SelectItem>
            <SelectItem value="MANUAL">Manual</SelectItem>
          </SelectContent>
        </Select>

        <Select value={geofenceFilter} onValueChange={(v) => setGeofenceFilter(v ?? "all")}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Geofence" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Punches</SelectItem>
            <SelectItem value="outside">Outside Geofence</SelectItem>
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
          {data ? `${data.total} punch${data.total !== 1 ? "es" : ""}` : ""}
        </p>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Punch</TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Kiosk</TableHead>
              <TableHead>Geofence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data?.data.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  No attendance logs found.
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((log) => (
                <TableRow
                  key={log.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => { setSelectedLogId(log.id); setSheetOpen(true); }}
                >
                  <TableCell className="font-medium text-sm">
                    {log.employee
                      ? `${log.employee.firstName} ${log.employee.lastName}`
                      : log.employeeId.slice(0, 8)}
                    {log.employee && (
                      <span className="block text-xs text-muted-foreground">
                        {log.employee.employeeNumber}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={log.punchType === "IN" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {log.punchType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{fmtDateTime(log.punchedAt)}</TableCell>
                  <TableCell>
                    <Badge variant={SOURCE_VARIANT[log.source] ?? "outline"} className="text-xs">
                      {log.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.kiosk?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    {log.outsideGeofence ? (
                      <span className="flex items-center gap-1 text-amber-600 text-xs font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Outside
                        {log.distanceMeters != null && (
                          <span className="text-muted-foreground font-normal">
                            ({log.distanceMeters}m)
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Inside</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AttendanceLogDetailSheet
        logId={selectedLogId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {page} of {data.totalPages} &mdash; {data.total} punches
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
