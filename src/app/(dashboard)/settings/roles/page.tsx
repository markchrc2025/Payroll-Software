"use client";

/**
 * /settings/roles — Custom Roles & Module Access
 *
 * Create custom roles (e.g. "Payroll Manager", "HR Administrator") and choose
 * exactly which modules + actions each one can access via a permission matrix.
 * System roles (the built-in Administrator) are read-only. Assigning a role to
 * a user is done from that user's account.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw, SlidersHorizontal, ShieldCheck, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

type Role = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
  createdAt: string;
};

type CatalogPermission = {
  id: string;
  module: string;
  action: string;
  label: string;
};

const EMPTY_FORM = { name: "", description: "" };

// Column order for the matrix. Only pairs that exist in the catalog render a
// checkbox; the rest show a muted dash.
const ACTION_ORDER = ["READ", "CREATE", "UPDATE", "DELETE", "APPROVE", "EXPORT"] as const;
const ACTION_LABEL: Record<string, string> = {
  READ: "View",
  CREATE: "Create",
  UPDATE: "Edit",
  DELETE: "Delete",
  APPROVE: "Approve",
  EXPORT: "Export",
};

// Preferred row order; any module not listed falls to the end alphabetically.
const MODULE_ORDER = [
  "EMPLOYEES", "MOVEMENTS", "DEPARTMENTS", "BRANCHES", "DOCUMENTS",
  "TIMESHEETS", "LEAVES", "PAYROLL", "REPORTS", "COMPLIANCE",
  "INCIDENTS", "SETTINGS", "ROLES", "AUDIT",
];
const MODULE_LABEL: Record<string, string> = {
  EMPLOYEES: "Employees",
  MOVEMENTS: "Movements",
  DEPARTMENTS: "Departments",
  BRANCHES: "Branches",
  DOCUMENTS: "Documents",
  TIMESHEETS: "Time & Attendance",
  LEAVES: "Leaves",
  PAYROLL: "Payroll",
  REPORTS: "Reports",
  COMPLIANCE: "Compliance",
  INCIDENTS: "Incidents",
  SETTINGS: "Settings",
  ROLES: "Roles & Access",
  AUDIT: "Audit Logs",
};

export default function RolesPage() {
  const [rows, setRows] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Permission catalog (loaded once)
  const [catalog, setCatalog] = useState<CatalogPermission[]>([]);

  // Permission matrix editor
  const [permRole, setPermRole] = useState<Role | null>(null);
  const [permSelected, setPermSelected] = useState<Set<string>>(new Set());
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/roles");
    const json = await res.json();
    setRows(json.data ?? []);
    setLoading(false);
  }, []);

  const loadCatalog = useCallback(async () => {
    const res = await fetch("/api/permissions");
    const json = await res.json();
    setCatalog(json.data ?? []);
  }, []);

  useEffect(() => { load(); loadCatalog(); }, [load, loadCatalog]);

  // Modules present in the catalog, ordered.
  const modules = Array.from(new Set(catalog.map((p) => p.module))).sort((a, b) => {
    const ai = MODULE_ORDER.indexOf(a);
    const bi = MODULE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  function permId(module: string, action: string): string | undefined {
    return catalog.find((p) => p.module === module && p.action === action)?.id;
  }

  function modulePermIds(module: string): string[] {
    return catalog.filter((p) => p.module === module).map((p) => p.id);
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
  }

  function openEdit(row: Role) {
    if (row.isSystem) return;
    setEditing(row);
    setForm({ name: row.name, description: row.description ?? "" });
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Role name is required"); return; }
    setSaving(true);
    const body = { name: form.name, description: form.description || null };
    const url = editing ? `/api/roles/${editing.id}` : "/api/roles";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to save"); return; }
    toast.success(editing ? "Role updated" : "Role created");
    setSheetOpen(false);
    await load();
    // After creating a brand-new role, jump straight to its permissions so it
    // doesn't sit empty (a role with zero permissions can't do anything).
    if (!editing && json.data?.id) {
      openPermissions({
        id: json.data.id,
        name: json.data.name,
        description: json.data.description ?? null,
        isSystem: false,
        permissionCount: 0,
        createdAt: json.data.createdAt,
      });
    }
  }

  async function handleDelete(row: Role) {
    if (row.isSystem) return;
    if (!confirm(`Delete role "${row.name}"? Users assigned this role will lose access.`)) return;
    const res = await fetch(`/api/roles/${row.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? "Failed to delete"); return; }
    toast.success(`"${row.name}" deleted`);
    load();
  }

  async function openPermissions(row: Role) {
    setPermRole(row);
    setPermLoading(true);
    setPermSelected(new Set());
    try {
      const res = await fetch(`/api/roles/${row.id}/permissions`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load permissions");
      setPermSelected(new Set((json.data as CatalogPermission[]).map((p) => p.id)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load permissions");
      setPermRole(null);
    } finally {
      setPermLoading(false);
    }
  }

  function togglePerm(id: string | undefined) {
    if (!id) return;
    setPermSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleModule(module: string) {
    const ids = modulePermIds(module);
    const allOn = ids.every((id) => permSelected.has(id));
    setPermSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    const allIds = catalog.map((p) => p.id);
    const allOn = allIds.length > 0 && allIds.every((id) => permSelected.has(id));
    setPermSelected(allOn ? new Set() : new Set(allIds));
  }

  async function savePermissions() {
    if (!permRole) return;
    setPermSaving(true);
    try {
      const res = await fetch(`/api/roles/${permRole.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionIds: Array.from(permSelected) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save permissions");
      const count = permSelected.size;
      setRows((prev) => prev.map((x) => (x.id === permRole.id ? { ...x, permissionCount: count } : x)));
      toast.success("Permissions updated");
      setPermRole(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save permissions");
    } finally {
      setPermSaving(false);
    }
  }

  const editorReadOnly = !!permRole?.isSystem;

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.4px] text-[#111827] leading-tight">
            Custom Roles &amp; Module Access
          </h1>
          <p className="text-[13px] text-[#6B7A8D] mt-0.5">
            Create roles and choose exactly which modules each one can access. The built-in
            Administrator role has full access and is read-only.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9 text-[13px]">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate} className="h-9 text-[13px] bg-[#E8693A] hover:bg-[#C2552F] text-white">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Role
          </Button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F5F6FA] hover:bg-[#F5F6FA]">
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Name</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Description</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Permissions</TableHead>
              <TableHead className="text-[12px] font-semibold text-[#4A586B] uppercase tracking-wide">Type</TableHead>
              <TableHead className="w-[260px]" />
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
                  No roles found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-[#FAFBFF]">
                  <TableCell className="font-medium text-[13.5px] text-[#111827]">{row.name}</TableCell>
                  <TableCell className="text-[13px] text-[#6B7A8D] max-w-[240px] truncate">
                    {row.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#fdeee6", color: "#E8693A" }}>
                      {row.permissionCount}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.isSystem ? "default" : "outline"} className="text-xs">
                      {row.isSystem ? "System" : "Custom"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-[12.5px] text-[#4A586B]"
                        onClick={() => openPermissions(row)}
                        title={row.isSystem ? "View permissions (read-only)" : "Manage permissions"}
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                        Permissions
                      </Button>
                      {!row.isSystem && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)} title="Rename">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(row)}
                            title="Delete role"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Add / Edit role sheet ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Role" : "Add Role"}</SheetTitle>
            <SheetDescription>
              {editing
                ? "Update the role name or description."
                : "Name the role, then pick its module permissions in the next step."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Payroll Manager"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description of this role…"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1 bg-[#E8693A] hover:bg-[#C2552F] text-white" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Create & Set Permissions"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setSheetOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Permission matrix editor ── */}
      <Sheet open={!!permRole} onOpenChange={(o) => { if (!o) setPermRole(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#E8693A]" />
              Permissions — {permRole?.name}
            </SheetTitle>
            <SheetDescription>
              {editorReadOnly
                ? "This is a system role with full access and cannot be edited."
                : "Tick the actions this role may perform in each module."}
            </SheetDescription>
          </SheetHeader>

          {permLoading ? (
            <div className="mt-6 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            <div className="mt-4">
              {!editorReadOnly && (
                <div className="flex items-center justify-between pb-3">
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-[12.5px] font-semibold text-[#E8693A] hover:underline"
                  >
                    Toggle full access
                  </button>
                  <span className="text-[12px] text-[#8E9AAC]">
                    {permSelected.size} selected
                  </span>
                </div>
              )}
              <div className="rounded-xl border border-[#E8EBF1] overflow-x-auto">
                <table className="w-full border-collapse min-w-[520px]">
                  <thead>
                    <tr className="bg-[#F5F6FA] text-[11px] uppercase tracking-wide text-[#4A586B]">
                      <th className="text-left font-semibold px-3 py-2.5">Module</th>
                      {ACTION_ORDER.map((a) => (
                        <th key={a} className="font-semibold px-2 py-2.5 text-center">{ACTION_LABEL[a]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((mod) => {
                      const ids = modulePermIds(mod);
                      const allOn = ids.length > 0 && ids.every((id) => permSelected.has(id));
                      return (
                        <tr key={mod} className="border-t border-[#EEF1F6] text-[13px] text-[#0E1B2E]">
                          <td className="px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() => !editorReadOnly && toggleModule(mod)}
                              disabled={editorReadOnly}
                              className="font-medium text-left hover:text-[#E8693A] disabled:hover:text-[#0E1B2E] disabled:cursor-default"
                              title={editorReadOnly ? undefined : "Toggle all actions in this module"}
                            >
                              {MODULE_LABEL[mod] ?? mod}
                              {allOn && !editorReadOnly && (
                                <span className="ml-1.5 text-[10px] text-[#E8693A] font-bold">ALL</span>
                              )}
                            </button>
                          </td>
                          {ACTION_ORDER.map((action) => {
                            const id = permId(mod, action);
                            return (
                              <td key={action} className="px-2 py-2.5 text-center">
                                {id ? (
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-[#E8693A] cursor-pointer disabled:cursor-not-allowed"
                                    checked={permSelected.has(id)}
                                    disabled={editorReadOnly}
                                    onChange={() => togglePerm(id)}
                                  />
                                ) : (
                                  <span className="text-[#D4DAE3]">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3 pt-5">
                {!editorReadOnly && (
                  <Button
                    className="flex-1 bg-[#E8693A] hover:bg-[#C2552F] text-white"
                    onClick={savePermissions}
                    disabled={permSaving}
                  >
                    {permSaving ? "Saving…" : <><Check className="h-4 w-4 mr-1.5" /> Save Permissions</>}
                  </Button>
                )}
                <Button variant="outline" className="flex-1" onClick={() => setPermRole(null)}>
                  {editorReadOnly ? "Close" : "Cancel"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
