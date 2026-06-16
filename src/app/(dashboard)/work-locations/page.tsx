"use client";

/**
 * /work-locations — Work Location CRUD
 * Moved from /settings tab.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const PHILIPPINE_REGIONS: { value: string; label: string }[] = [
  { value: "NCR", label: "NCR — National Capital Region" },
  { value: "CAR", label: "CAR — Cordillera Administrative Region" },
  { value: "REGION_I", label: "Region I — Ilocos Region" },
  { value: "REGION_II", label: "Region II — Cagayan Valley" },
  { value: "REGION_III", label: "Region III — Central Luzon" },
  { value: "REGION_IV_A", label: "Region IV-A — CALABARZON" },
  { value: "REGION_IV_B", label: "Region IV-B — MIMAROPA" },
  { value: "REGION_V", label: "Region V — Bicol Region" },
  { value: "REGION_VI", label: "Region VI — Western Visayas" },
  { value: "REGION_VII", label: "Region VII — Central Visayas" },
  { value: "REGION_VIII", label: "Region VIII — Eastern Visayas" },
  { value: "REGION_IX", label: "Region IX — Zamboanga Peninsula" },
  { value: "REGION_X", label: "Region X — Northern Mindanao" },
  { value: "REGION_XI", label: "Region XI — Davao Region" },
  { value: "REGION_XII", label: "Region XII — SOCCSKSARGEN" },
  { value: "REGION_XIII", label: "Region XIII — Caraga" },
  { value: "BARMM", label: "BARMM — Bangsamoro" },
];

type WorkLocation = {
  id: string;
  name: string;
  region: string;
  city: string | null;
  province: string | null;
  zipCode: string | null;
  deletedAt: string | null;
  _count: { branches: number };
};

const EMPTY_FORM = {
  name: "",
  region: "NCR",
  address: "",
  city: "",
  province: "",
  zipCode: "",
};

export default function WorkLocationsPage() {
  const [rows, setRows] = useState<WorkLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<WorkLocation | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/work-locations");
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

  function openEdit(row: WorkLocation) {
    setEditing(row);
    setForm({
      name: row.name,
      region: row.region,
      address: "",
      city: row.city ?? "",
      province: row.province ?? "",
      zipCode: row.zipCode ?? "",
    });
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.region) { toast.error("Region is required"); return; }
    setSaving(true);
    const body = {
      name: form.name,
      region: form.region,
      address: form.address || null,
      city: form.city || null,
      province: form.province || null,
      zipCode: form.zipCode || null,
    };
    const url = editing ? `/api/work-locations/${editing.id}` : "/api/work-locations";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to save"); return; }
    toast.success(editing ? "Work location updated" : "Work location created");
    setSheetOpen(false);
    load();
  }

  async function handleDelete(row: WorkLocation) {
    if (row._count.branches > 0) {
      toast.error(`Cannot delete: ${row._count.branches} branch(es) linked to this location`);
      return;
    }
    if (!confirm(`Delete "${row.name}"?`)) return;
    const res = await fetch(`/api/work-locations/${row.id}`, { method: "DELETE" });
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
            Work Locations
          </h1>
          <p className="text-[13px] text-[#6B7A8D] mt-0.5">
            Map branches to DOLE regions for minimum-wage computation.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9 text-[13px]">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate} className="h-9 text-[13px] bg-[#E8693A] hover:bg-[#C2552F] text-white">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Location
          </Button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F5F6FA] hover:bg-[#F5F6FA]">
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Name</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Region</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">City / Province</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Branches</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-[#6B7A8D] py-10">
                  No work locations yet. Add your first one.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-[#FAFBFF]">
                  <TableCell className="font-medium text-[13.5px] text-[#111827]">{row.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">{row.region}</Badge>
                  </TableCell>
                  <TableCell className="text-[13px] text-[#6B7A8D]">
                    {[row.city, row.province].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#fdeee6", color: "#E8693A" }}>
                      {row._count.branches}
                    </span>
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
                        disabled={row._count.branches > 0}
                        title={row._count.branches > 0 ? "Cannot delete: has linked branches" : "Delete"}
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
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Work Location" : "Add Work Location"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Head Office"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>DOLE Region <span className="text-destructive">*</span></Label>
              <Select value={form.region} onValueChange={(v) => setForm({ ...form, region: v ?? form.region })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {PHILIPPINE_REGIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Determines which RTWPB wage order applies for minimum-wage checks.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input
                placeholder="Makati City"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Province</Label>
                <Input
                  placeholder="Metro Manila"
                  value={form.province}
                  onChange={(e) => setForm({ ...form, province: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>ZIP Code</Label>
                <Input
                  placeholder="1200"
                  maxLength={10}
                  value={form.zipCode}
                  onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Create Location"}
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
