"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlacementRecord = {
  id: string;
  effectiveDate: string;
  positionId: string | null;
  jobTitle: string | null;
  lineManagerId: string | null;
  immediateSupervisorId: string | null;
  departmentId: string | null;
  branchId: string | null;
  levelId: string | null;
  remark: string | null;
  position:    { id: string; title: string } | null;
  lineManager: { id: string; firstName: string; lastName: string; employeeNumber: string } | null;
  immediateSupervisor: { id: string; firstName: string; lastName: string; employeeNumber: string } | null;
  department:  { id: string; name: string } | null;
  branch:      { id: string; name: string } | null;
  level:       { id: string; name: string } | null;
};

type Employee   = { id: string; employeeNumber: string; firstName: string; lastName: string };
type Position   = { id: string; title: string };
type Department = { id: string; name: string };
type Branch     = { id: string; name: string };
type JobLevel   = { id: string; name: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMPTY_FORM = {
  effectiveDate: "",
  positionId:    "",
  jobTitle:      "",
  lineManagerId: "",
  immediateSupervisorId: "",
  departmentId:  "",
  branchId:      "",
  levelId:       "",
  remark:        "",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PlacementPage() {
  const [employees,   setEmployees]   = useState<Employee[]>([]);
  const [positions,   setPositions]   = useState<Position[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches,    setBranches]    = useState<Branch[]>([]);
  const [jobLevels,   setJobLevels]   = useState<JobLevel[]>([]);

  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [records,  setRecords]  = useState<PlacementRecord[]>([]);
  const [loading,  setLoading]  = useState(false);

  const [sheetOpen,   setSheetOpen]   = useState(false);
  const [editTarget,  setEditTarget]  = useState<PlacementRecord | null>(null);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PlacementRecord | null>(null);
  const [deleting,     setDeleting]    = useState(false);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadRefData = useCallback(async () => {
    const [eRes, pRes, dRes, bRes, lRes] = await Promise.all([
      fetch("/api/employees?limit=500&status=ACTIVE"),
      fetch("/api/positions?limit=200"),
      fetch("/api/departments?limit=200"),
      fetch("/api/branches?limit=200"),
      fetch("/api/job-levels"),
    ]);
    const [eJ, pJ, dJ, bJ, lJ] = await Promise.all([eRes.json(), pRes.json(), dRes.json(), bRes.json(), lRes.json()]);
    setEmployees(eJ.data ?? []);
    setPositions(pJ.data ?? []);
    setDepartments(dJ.data ?? []);
    setBranches(bJ.data ?? []);
    setJobLevels(lJ.data ?? []);
  }, []);

  const loadRecords = useCallback(async () => {
    if (!selectedEmployee) { setRecords([]); return; }
    setLoading(true);
    const res = await fetch(`/api/employees/${selectedEmployee}/placements`);
    const json = await res.json();
    setRecords(json.data ?? []);
    setLoading(false);
  }, [selectedEmployee]);

  useEffect(() => { loadRefData(); }, [loadRefData]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  // ---------------------------------------------------------------------------
  // Sheet helpers
  // ---------------------------------------------------------------------------

  function openCreate() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, effectiveDate: new Date().toISOString().slice(0, 10) });
    setSheetOpen(true);
  }

  function openEdit(r: PlacementRecord) {
    setEditTarget(r);
    setForm({
      effectiveDate: r.effectiveDate.slice(0, 10),
      positionId:    r.positionId    ?? "",
      jobTitle:      r.jobTitle      ?? "",
      lineManagerId: r.lineManagerId ?? "",
      immediateSupervisorId: r.immediateSupervisorId ?? "",
      departmentId:  r.departmentId  ?? "",
      branchId:      r.branchId      ?? "",
      levelId:       r.levelId       ?? "",
      remark:        r.remark        ?? "",
    });
    setSheetOpen(true);
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  async function handleSave() {
    if (!selectedEmployee)      { toast.error("No employee selected"); return; }
    if (!form.effectiveDate)    { toast.error("Effective date is required"); return; }

    const body = {
      effectiveDate: form.effectiveDate,
      positionId:    form.positionId    || null,
      jobTitle:      form.jobTitle      || null,
      lineManagerId: form.lineManagerId || null,
      immediateSupervisorId: form.immediateSupervisorId || null,
      departmentId:  form.departmentId  || null,
      branchId:      form.branchId      || null,
      levelId:       form.levelId       || null,
      remark:        form.remark        || null,
    };

    setSaving(true);
    const url = editTarget
      ? `/api/employees/${selectedEmployee}/placements/${editTarget.id}`
      : `/api/employees/${selectedEmployee}/placements`;
    const method = editTarget ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) { toast.error(json.error ?? "Failed to save"); return; }
    toast.success(editTarget ? "Placement record updated" : "Placement record added");
    setSheetOpen(false);
    loadRecords();
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async function confirmDelete() {
    if (!deleteTarget || !selectedEmployee) return;
    setDeleting(true);
    const res = await fetch(
      `/api/employees/${selectedEmployee}/placements/${deleteTarget.id}`,
      { method: "DELETE" },
    );
    const json = await res.json();
    setDeleting(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to delete"); return; }
    toast.success("Placement record deleted");
    setDeleteTarget(null);
    loadRecords();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const selectedEmp = employees.find((e) => e.id === selectedEmployee);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Placement</h1>
        <p className="text-sm text-muted-foreground">
          Job position, reporting chain, department, branch, and level history per employee
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-72">
          <Select
            value={selectedEmployee || "none"}
            onValueChange={(v) => setSelectedEmployee((v ?? "") === "none" ? "" : (v ?? ""))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select employee…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Select employee —</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.lastName}, {e.firstName} ({e.employeeNumber})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={loadRecords} disabled={loading || !selectedEmployee}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate} disabled={!selectedEmployee}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Placement
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Effective Date</TableHead>
              <TableHead>Job Position</TableHead>
              <TableHead>Job Title</TableHead>
              <TableHead>Reports To</TableHead>
              <TableHead>Line Manager</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Level</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!selectedEmployee ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                  Select an employee to view their placement history.
                </TableCell>
              </TableRow>
            ) : loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                  No placement records for {selectedEmp ? `${selectedEmp.firstName} ${selectedEmp.lastName}` : "this employee"}.
                </TableCell>
              </TableRow>
            ) : (
              records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm font-medium">
                    {r.effectiveDate.slice(0, 10)}
                  </TableCell>
                  <TableCell className="text-sm">{r.position?.title ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.jobTitle ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {r.immediateSupervisor
                      ? `${r.immediateSupervisor.lastName}, ${r.immediateSupervisor.firstName}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.lineManager
                      ? `${r.lineManager.lastName}, ${r.lineManager.firstName}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{r.department?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.branch?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.level?.name ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => openEdit(r)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(r)}
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

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editTarget ? "Edit Placement" : "Add Placement"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <Label>Effective Date <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={form.effectiveDate}
                onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Job Position</Label>
              <Select
                value={form.positionId || "none"}
                onValueChange={(v) => setForm({ ...form, positionId: (v ?? "") === "none" ? "" : (v ?? "") })}
              >
                <SelectTrigger><SelectValue placeholder="Select position…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {positions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Job Title (free text)</Label>
              <Input
                placeholder="e.g. Senior Engineer"
                value={form.jobTitle}
                onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Reports To (Immediate Supervisor)</Label>
              <Select
                value={form.immediateSupervisorId || "none"}
                onValueChange={(v) => setForm({ ...form, immediateSupervisorId: (v ?? "") === "none" ? "" : (v ?? "") })}
              >
                <SelectTrigger><SelectValue placeholder="Select supervisor…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.lastName}, {e.firstName} ({e.employeeNumber})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Line Manager</Label>
              <Select
                value={form.lineManagerId || "none"}
                onValueChange={(v) => setForm({ ...form, lineManagerId: (v ?? "") === "none" ? "" : (v ?? "") })}
              >
                <SelectTrigger><SelectValue placeholder="Select manager…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.lastName}, {e.firstName} ({e.employeeNumber})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select
                value={form.departmentId || "none"}
                onValueChange={(v) => setForm({ ...form, departmentId: (v ?? "") === "none" ? "" : (v ?? "") })}
              >
                <SelectTrigger><SelectValue placeholder="Select department…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Select
                value={form.branchId || "none"}
                onValueChange={(v) => setForm({ ...form, branchId: (v ?? "") === "none" ? "" : (v ?? "") })}
              >
                <SelectTrigger><SelectValue placeholder="Select branch…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Level</Label>
              <Select
                value={form.levelId || "none"}
                onValueChange={(v) => setForm({ ...form, levelId: (v ?? "") === "none" ? "" : (v ?? "") })}
              >
                <SelectTrigger><SelectValue placeholder="Select level…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {jobLevels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Remark</Label>
              <Input
                placeholder="200 characters max"
                maxLength={200}
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editTarget ? "Save Changes" : "Add Record"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setSheetOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation sheet */}
      <Sheet open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <SheetContent className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Delete Placement Record</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {deleteTarget && (
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="font-medium">{deleteTarget.effectiveDate.slice(0, 10)}</p>
                <p className="text-muted-foreground">
                  {deleteTarget.position?.title ?? deleteTarget.jobTitle ?? "No position"} ·{" "}
                  {deleteTarget.department?.name ?? "No department"}
                </p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. The placement record will be permanently removed.
            </p>
            <div className="flex gap-3">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
