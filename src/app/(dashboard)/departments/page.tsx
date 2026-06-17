"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type DeptHead = { id: string; firstName: string; lastName: string; employeeNumber: string } | null;

type Department = {
  id: string;
  name: string;
  description: string | null;
  headId: string | null;
  head: DeptHead;
  _count: { employees: number };
};

type EmpSummary = { id: string; firstName: string; lastName: string; employeeNumber: string };

const NONE = "__none__";
const EMPTY_FORM = { name: "", description: "", headId: NONE };

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<EmpSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  async function load() {
    setIsLoading(true);
    const res = await fetch("/api/departments");
    const json = await res.json();
    setDepartments(json.data ?? []);
    setIsLoading(false);
  }

  async function loadEmployees() {
    const res = await fetch("/api/employees?limit=500");
    const json = await res.json();
    setEmployees(json.data ?? []);
  }

  useEffect(() => { load(); loadEmployees(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  function openEdit(dept: Department) {
    setEditing(dept);
    setForm({
      name: dept.name,
      description: dept.description ?? "",
      headId: dept.headId ?? NONE,
    });
    setSheetOpen(true);
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const url = editing ? `/api/departments/${editing.id}` : "/api/departments";
      const method = editing ? "PATCH" : "POST";
      const headId = form.headId === NONE ? null : form.headId;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          headId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to save department");
        return;
      }
      toast.success(editing ? "Department updated" : "Department created");
      setSheetOpen(false);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(dept: Department) {
    if (dept._count.employees > 0) {
      toast.error(`Cannot delete — ${dept._count.employees} employee(s) assigned`);
      return;
    }
    const res = await fetch(`/api/departments/${dept.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Department deleted");
      load();
    } else {
      const json = await res.json().catch(() => null);
      toast.error(json?.error ?? "Failed to delete department");
    }
  }

  const empName = (e: EmpSummary) =>
    `${[e.firstName, e.lastName].filter(Boolean).join(" ")} (${e.employeeNumber})`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Departments</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${departments.length} department${departments.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Department
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Head</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-center">Employees</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell className="text-center"><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                  <TableCell />
                </TableRow>
              ))
            ) : departments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  <Building2 className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  No departments yet. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              departments.map((dept) => (
                <TableRow key={dept.id}>
                  <TableCell className="font-medium">{dept.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {dept.head
                      ? `${[dept.head.firstName, dept.head.lastName].filter(Boolean).join(" ")}`
                      : <span className="italic opacity-40">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {dept.description ?? <span className="italic opacity-40">—</span>}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{dept._count.employees}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openEdit(dept)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(dept)}
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

      {/* Add / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Department" : "Add Department"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dept-name">Name <span className="text-destructive">*</span></Label>
              <Input
                id="dept-name"
                ref={nameRef}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Finance"
                required
                maxLength={150}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dept-head">Department Head</Label>
              <Select
                value={form.headId}
                onValueChange={(v) => setForm({ ...form, headId: v ?? NONE })}
              >
                <SelectTrigger id="dept-head">
                  <SelectValue placeholder="Select a head…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>
                    <span className="text-muted-foreground italic">— Unassigned —</span>
                  </SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{empName(e)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used as the &ldquo;Dept Head&rdquo; approver in Leave Approval Workflows.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dept-desc">Description</Label>
              <Textarea
                id="dept-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description…"
                rows={3}
                maxLength={500}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? "Saving…" : editing ? "Save Changes" : "Create Department"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheetOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
