"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Branch = {
  id: string;
  name: string;
  city: string | null;
  province: string | null;
  isHeadOffice: boolean;
  _count: { employees: number };
};

const EMPTY_FORM = {
  name: "",
  address: "",
  city: "",
  province: "",
  zipCode: "",
  isHeadOffice: false,
};

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  async function load() {
    setIsLoading(true);
    const res = await fetch("/api/branches");
    const json = await res.json();
    setBranches(json.data ?? []);
    setIsLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  function openEdit(branch: Branch) {
    setEditing(branch);
    setForm({
      name: branch.name,
      address: "",
      city: branch.city ?? "",
      province: branch.province ?? "",
      zipCode: "",
      isHeadOffice: branch.isHeadOffice,
    });
    setSheetOpen(true);
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const url = editing ? `/api/branches/${editing.id}` : "/api/branches";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          address: form.address.trim() || null,
          city: form.city.trim() || null,
          province: form.province.trim() || null,
          zipCode: form.zipCode.trim() || null,
          isHeadOffice: form.isHeadOffice,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to save branch");
        return;
      }
      toast.success(editing ? "Branch updated" : "Branch created");
      setSheetOpen(false);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(branch: Branch) {
    if (branch._count.employees > 0) {
      toast.error(`Cannot delete — ${branch._count.employees} employee(s) assigned`);
      return;
    }
    const res = await fetch(`/api/branches/${branch.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Branch deleted");
      load();
    } else {
      const json = await res.json().catch(() => null);
      toast.error(json?.error ?? "Failed to delete branch");
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Branches</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${branches.length} branch${branches.length !== 1 ? "es" : ""}`}
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Branch
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Province</TableHead>
              <TableHead className="text-center">HQ</TableHead>
              <TableHead className="text-center">Employees</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : branches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  <GitBranch className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  No branches yet. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              branches.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell className="font-medium">{branch.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {branch.city ?? <span className="italic opacity-40">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {branch.province ?? <span className="italic opacity-40">—</span>}
                  </TableCell>
                  <TableCell className="text-center">
                    {branch.isHeadOffice && (
                      <Badge variant="default" className="text-xs">HQ</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{branch._count.employees}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openEdit(branch)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(branch)}
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
            <SheetTitle>{editing ? "Edit Branch" : "Add Branch"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="branch-name">Name <span className="text-destructive">*</span></Label>
              <Input
                id="branch-name"
                ref={nameRef}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Makati Head Office"
                required
                maxLength={150}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-address">Address</Label>
              <Input
                id="branch-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Street address"
                maxLength={500}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="branch-city">City</Label>
                <Input
                  id="branch-city"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Makati"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="branch-province">Province</Label>
                <Input
                  id="branch-province"
                  value={form.province}
                  onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
                  placeholder="Metro Manila"
                  maxLength={100}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-zip">ZIP Code</Label>
              <Input
                id="branch-zip"
                value={form.zipCode}
                onChange={(e) => setForm((f) => ({ ...f, zipCode: e.target.value }))}
                placeholder="1200"
                maxLength={10}
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="branch-hq"
                checked={form.isHeadOffice}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isHeadOffice: Boolean(v) }))}
              />
              <Label htmlFor="branch-hq" className="cursor-pointer font-normal">
                This is the Head Office
              </Label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? "Saving…" : editing ? "Save Changes" : "Create Branch"}
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
