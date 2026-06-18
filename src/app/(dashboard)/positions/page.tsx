"use client";

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
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";

type Dept     = { id: string; name: string };
type Level    = { id: string; name: string; rank: number };

type Position = {
  id:           string;
  title:        string;
  levelId:      string | null;
  level:        { id: string; name: string; rank: number } | null;
  description:  string | null;
  departmentId: string | null;
  department:   { id: string; name: string } | null;
  deletedAt:    string | null;
  _count:       { employees: number };
};

const EMPTY_FORM = { title: "", levelId: "none", description: "", departmentId: "none" };

export default function PositionsPage() {
  const [rows, setRows]           = useState<Position[]>([]);
  const [departments, setDepts]   = useState<Dept[]>([]);
  const [levels, setLevels]       = useState<Level[]>([]);
  const [loading, setLoading]     = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing]     = useState<Position | null>(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [posRes, deptRes, lvlRes] = await Promise.all([
      fetch("/api/positions?includeDeleted=false"),
      fetch("/api/departments"),
      fetch("/api/job-levels"),
    ]);
    const [posJson, deptJson, lvlJson] = await Promise.all([
      posRes.json().catch(() => ({})),
      deptRes.json().catch(() => ({})),
      lvlRes.json().catch(() => ({})),
    ]);
    setRows(posJson.data ?? []);
    setDepts(deptJson.data ?? []);
    setLevels((lvlJson.data ?? []).slice().sort((a: Level, b: Level) => a.rank - b.rank));
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
    setForm({
      title:        row.title,
      levelId:      row.levelId ?? "none",
      description:  row.description ?? "",
      departmentId: row.departmentId ?? "none",
    });
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    const body = {
      title:        form.title.trim(),
      levelId:      form.levelId === "none" ? null : form.levelId,
      description:  form.description || null,
      departmentId: form.departmentId === "none" ? null : form.departmentId,
    };
    const url    = editing ? `/api/positions/${editing.id}` : "/api/positions";
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
          <Button size="sm" onClick={openCreate} className="h-9 text-[13px] bg-[#E8693A] hover:bg-[#C2552F] text-white">
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
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Department</TableHead>
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
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-[#6B7A8D] py-10">
                  No positions yet. Add your first one.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-[#FAFBFF]">
                  <TableCell className="font-medium text-[13.5px] text-[#111827]">{row.title}</TableCell>
                  <TableCell className="text-[13px] text-[#6B7A8D]">
                    {row.department?.name ?? <span className="italic opacity-40">—</span>}
                  </TableCell>
                  <TableCell>
                    {row.level
                      ? (
                        <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                          style={{ background: "#fdeee6", color: "#E8693A" }}>
                          {row.level.name}
                        </span>
                      )
                      : <span className="italic opacity-40 text-[13px]">—</span>
                    }
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
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Side sheet ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Position" : "Add Position"}</SheetTitle>
            <SheetDescription>
              {editing ? "Update the position details." : "Create a new job position and link it to a department and level."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Senior Software Engineer"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Level</Label>
              <Select value={form.levelId} onValueChange={(v) => setForm({ ...form, levelId: v })}>
                <SelectTrigger><SelectValue placeholder="Select level…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No Level —</SelectItem>
                  {levels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select
                value={form.departmentId}
                onValueChange={(v) => setForm({ ...form, departmentId: v ?? "none" })}
              >
                <SelectTrigger><SelectValue placeholder="Select department…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No Department —</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description of the role…"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Create Position"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
