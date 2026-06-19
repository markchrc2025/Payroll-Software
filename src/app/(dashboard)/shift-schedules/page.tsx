"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw, Clock, Infinity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ShiftScheduleFormModal,
  type ApiShiftSchedule,
} from "@/components/shifts/ShiftScheduleFormModal";

const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const DAY_LABELS: Record<string, string> = {
  MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu",
  FRI: "Fri", SAT: "Sat", SUN: "Sun",
};

export default function ShiftSchedulesPage() {
  const [rows, setRows]       = useState<ApiShiftSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState<ApiShiftSchedule | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/shifts?limit=200");
    const json = await res.json();
    setRows(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditRow(null);
    setModalOpen(true);
  }

  function openEdit(row: ApiShiftSchedule) {
    setEditRow(row);
    setModalOpen(true);
  }

  async function handleDelete(row: ApiShiftSchedule) {
    if (!confirm(`Delete shift "${row.name}"?`)) return;
    const res = await fetch(`/api/shifts/${row.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to delete"); return; }
    toast.success(`"${row.name}" deleted`);
    load();
  }

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.4px] text-[#111827] leading-tight">
            Shift Schedules
          </h1>
          <p className="text-[13px] text-[#6B7A8D] mt-0.5">
            Named shift templates that define work hours, break rules, and DTR enforcement.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9 text-[13px]">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate} className="h-9 text-[13px] bg-[#E8693A] hover:bg-[#C2552F] text-white">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Shift
          </Button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F5F6FA] hover:bg-[#F5F6FA]">
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Name</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Type</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Hours</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Work Days</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Break</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">OT</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-[#6B7A8D] py-10">
                  No shift schedules yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-[#FAFBFF]">
                  <TableCell className="font-medium text-[13.5px] text-[#111827]">
                    <div className="flex flex-col gap-0.5">
                      <span>{row.name}</span>
                      {row.code && (
                        <span className="text-[11px] text-[#6B7A8D] font-mono">{row.code}</span>
                      )}
                    </div>
                    {row.crossesMidnight && (
                      <Badge variant="secondary" className="ml-2 text-xs">Night</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {row.type === "FLEXIBLE" ? "Flexible" : row.type === "OPEN" ? "Open" : "Fixed"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[13px] text-[#4A586B]">
                    {row.type === "OPEN" ? (
                      <span className="flex items-center gap-1">
                        <Infinity className="h-3 w-3" /> Open hours
                      </span>
                    ) : row.type === "FLEXIBLE" ? (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />{row.requiredHours ?? 8}h req&apos;d
                      </span>
                    ) : (
                      <>{row.timeIn} – {row.timeOut}</>
                    )}
                    {row.gracePeriodMinutes > 0 && (
                      <div className="text-[11px] text-emerald-600 mt-0.5">{row.gracePeriodMinutes}min grace</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-0.5 flex-wrap">
                      {ALL_DAYS.map((d) => (
                        <span
                          key={d}
                          className="text-xs px-1 rounded"
                          style={
                            (Array.isArray(row.workDays) ? row.workDays : []).includes(d)
                              ? { background: "#fdeee6", color: "#E8693A", fontWeight: 600 }
                              : { color: "#C5CDD7" }
                          }
                        >
                          {DAY_LABELS[d]}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-[13px] text-[#6B7A8D]">
                    {row.breakMinutes}m
                    {(row.breakPolicy === "TRACK_ACTUAL" || row.breakPolicy === "PUNCH_IN_OUT") && (
                      <span className="ml-1.5 text-[11px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1 py-0.5 font-medium">Tracked</span>
                    )}
                    {row.breakPolicy === "PAID_BREAK" && (
                      <span className="ml-1.5 text-[11px] bg-green-50 text-green-700 border border-green-200 rounded px-1 py-0.5 font-medium">Paid</span>
                    )}
                  </TableCell>
                  <TableCell className="text-[13px] text-[#6B7A8D]">
                    {row.otThresholdMinutes !== null
                      ? <span className="text-[11px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 font-medium">Auto &gt;{Math.round(row.otThresholdMinutes / 60)}h</span>
                      : <span className="text-[#C5CDD7]">Manual</span>
                    }
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(row)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ShiftScheduleFormModal
        mode={editRow ? "edit" : "add"}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSaved={load}
        initialData={editRow ?? undefined}
        assignedCount={editRow?._count?.employees ?? 0}
      />
    </div>
  );
}
