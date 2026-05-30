"use client";

/**
 * /positions — Job Positions CRUD
 * Moved from /settings tab.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const POSITION_LEVELS = [
  { value: "ENTRY",     label: "Entry",     bg: "#F5F6FA",  color: "#4A586B" },
  { value: "MID",       label: "Mid",       bg: "#EAF1FD",  color: "#2D6BE4" },
  { value: "SENIOR",    label: "Senior",    bg: "#EEF0FD",  color: "#4F46E5" },
  { value: "MANAGER",   label: "Manager",   bg: "#F3EDFD",  color: "#7C3AED" },
  { value: "DIRECTOR",  label: "Director",  bg: "#FBF0DD",  color: "#DB8A28" },
  { value: "EXECUTIVE", label: "Executive", bg: "#FCE9E7",  color: "#E0463B" },
];

type Position = {
  id: string;
  title: string;
  level: string;
  description: string | null;
  deletedAt: string | null;
  _count: { employees: number };
};

const EMPTY_FORM = { title: "", level: "MID", description: "" };

export default function PositionsPage() {
  const [rows, setRows] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/positions?includeDeleted=false");
    const json = await res.json();
    setRows(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
  }

  function openEdit(row: Position) {
    setEditing(row);
    setForm({ title: row.title, level: row.level, description: row.description ?? "" });
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    const body = { title: form.title.trim(), level: form.level, description: form.description || null };
    const url = editing ? `/api/positions/${editing.id}` : "/api/positions";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to save"); return; }
    toast.success(editing ? "Position updated" : "Position created");
    setSheetOpen(false);
    load();
  }

  async function handleDelete(row: Position) {
    if (row._count.employees > 0) {
      toast.error(`Cannot delete — ${row._count.employees} employee(s) assigned to this position`);
      return;
    }
    if (!confirm(`Delete position "${row.title}"?`)) return;
    const res = await fetch(`/api/positions/${row.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to delete"); return; }
    toast.success(`"${row.title}" deleted`);
    load();
  }

  const levelMeta = (v: string) => POSITION_LEVELS.find((l) => l.value === v);

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.4px] text-[#111827] leading-tight">
            Positions
          </h1>
          <p className="text-[13px] text-[#6B7A8D] mt-0.5">
            Job positions and levels used in employee profiles, movements, and recruitment.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9 text-[13px]">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate} className="h-9 text-[13px] bg-[#2D6BE4] hover:bg-[#2460CC] text-white">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Position
          </Button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F5F6FA] hover:bg-[#F5F6FA]">
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Title</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Level</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Description</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Employees</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-[#6B7A8D] py-10">
                  No positions yet. Add your first one.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const meta = levelMeta(row.level);
                return (
                  <TableRow key={row.id} className="hover:bg-[#FAFBFF]">
                    <TableCell className="font-medium text-[13.5px] text-[#111827]">{row.title}</TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                        style={{ background: meta?.bg ?? "#F5F6FA", color: meta?.color ?? "#4A586B" }}
                      >
                        {meta?.label ?? row.level}
                      </span>
                    </TableCell>
                    <TableCell className="text-[13px] text-[#6B7A8D] max-w-xs truncate">
                      {row.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-[13px] text-[#4A586B]">{row._count.employees}</TableCell>
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
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Side sheet ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Position" : "Add Position"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Senior Software Engineer"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Level</Label>
              <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v ?? form.level })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POSITION_LEVELS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description of the role…"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Create Position"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setSheetOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
