"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type ShiftSchedule = {
  id: string;
  name: string;
  type: "FIXED" | "FLEXIBLE";
  timeIn: string;
  timeOut: string;
  breakMinutes: number;
  crossesMidnight: boolean;
  workDays: string[];
  isActive: boolean;
};

type ListResponse = {
  data: ShiftSchedule[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const WEEKDAY_LABELS: Record<string, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

const EMPTY_FORM = {
  name: "",
  type: "FIXED" as "FIXED" | "FLEXIBLE",
  timeIn: "08:00",
  timeOut: "17:00",
  breakMinutes: 60,
  crossesMidnight: false,
  workDays: ["MON", "TUE", "WED", "THU", "FRI"] as string[],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShiftSchedulesTab() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ShiftSchedule | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const fetch_ = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    const res = await fetch(`/api/shifts?${params}`);
    const json = await res.json();
    setData(json);
    setIsLoading(false);
  }, [page]);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(shift: ShiftSchedule) {
    setEditTarget(shift);
    setForm({
      name: shift.name,
      type: shift.type,
      timeIn: shift.timeIn,
      timeOut: shift.timeOut,
      breakMinutes: shift.breakMinutes,
      crossesMidnight: shift.crossesMidnight,
      workDays: [...shift.workDays],
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const url = editTarget ? `/api/shifts/${editTarget.id}` : "/api/shifts";
      const method = editTarget ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.message ?? "Failed to save shift schedule");
        return;
      }
      toast.success(editTarget ? "Shift schedule updated" : "Shift schedule created");
      setDialogOpen(false);
      fetch_();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(shift: ShiftSchedule) {
    if (!confirm(`Delete shift "${shift.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/shifts/${shift.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json.message ?? "Failed to delete shift schedule");
      return;
    }
    toast.success("Shift schedule deleted");
    fetch_();
  }

  function toggleDay(day: string) {
    setForm((f) => ({
      ...f,
      workDays: f.workDays.includes(day)
        ? f.workDays.filter((d) => d !== day)
        : [...f.workDays, day],
    }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} shift schedule${data.total !== 1 ? "s" : ""}` : ""}
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          New Shift
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Break</TableHead>
              <TableHead>Work Days</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
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
                  No shift schedules found.
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell className="font-medium">{shift.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{shift.type}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {shift.timeIn} – {shift.timeOut}
                    {shift.crossesMidnight && (
                      <span className="ml-1 text-xs text-muted-foreground">(+1)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{shift.breakMinutes} min</TableCell>
                  <TableCell>
                    <div className="flex gap-0.5 flex-wrap">
                      {WEEKDAYS.map((d) => (
                        <span
                          key={d}
                          className={`text-xs px-1 py-0.5 rounded ${
                            shift.workDays.includes(d)
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {WEEKDAY_LABELS[d]}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={shift.isActive ? "default" : "secondary"}>
                      {shift.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(shift)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(shift)}
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

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {page} of {data.totalPages}
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

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Shift Schedule" : "New Shift Schedule"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="shift-name">Name</Label>
              <Input
                id="shift-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Day Shift"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, type: v as "FIXED" | "FLEXIBLE" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED">Fixed</SelectItem>
                    <SelectItem value="FLEXIBLE">Flexible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="break-minutes">Break (minutes)</Label>
                <Input
                  id="break-minutes"
                  type="number"
                  min={0}
                  max={480}
                  value={form.breakMinutes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, breakMinutes: Number(e.target.value) }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="time-in">Time In</Label>
                <Input
                  id="time-in"
                  type="time"
                  value={form.timeIn}
                  onChange={(e) => setForm((f) => ({ ...f, timeIn: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time-out">Time Out</Label>
                <Input
                  id="time-out"
                  type="time"
                  value={form.timeOut}
                  onChange={(e) => setForm((f) => ({ ...f, timeOut: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="crosses-midnight"
                checked={form.crossesMidnight}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, crossesMidnight: Boolean(v) }))
                }
              />
              <Label htmlFor="crosses-midnight" className="cursor-pointer">
                Crosses midnight (night shift)
              </Label>
            </div>

            <div className="space-y-2">
              <Label>Work Days</Label>
              <div className="flex gap-2 flex-wrap">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                      form.workDays.includes(day)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-primary"
                    }`}
                  >
                    {WEEKDAY_LABELS[day]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : editTarget ? "Save Changes" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
