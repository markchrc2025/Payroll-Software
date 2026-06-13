"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, Plus, Pencil, Trash2, Check, X, Loader2, SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

type CentralRole = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
  userCount: number;
};

type CatalogPermission = {
  id: string;
  module: string;
  action: string;
  label: string;
};

const NAVY = "#E8693A";
const GRAY = "#6B7280";
const INK = "#111827";

// Fixed display order for the permission grid.
const MODULE_ORDER = ["TENANTS", "BILLING", "SUPPORT", "USERS", "ROLES"] as const;
const MODULE_LABEL: Record<string, string> = {
  TENANTS: "Tenants",
  BILLING: "Billing",
  SUPPORT: "Support",
  USERS: "Admin users",
  ROLES: "Roles",
};

export default function CentralRolesClient({
  initialRoles,
  catalog,
  canManage,
}: {
  initialRoles: CentralRole[];
  catalog: CatalogPermission[];
  canManage: boolean;
}) {
  const [roles, setRoles] = useState<CentralRole[]>(initialRoles);
  const [busy, setBusy] = useState<string | null>(null);

  // Create panel
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Inline rename
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // Permission editor
  const [permRole, setPermRole] = useState<CentralRole | null>(null);
  const [permSelected, setPermSelected] = useState<Set<string>>(new Set());
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);

  // Build (module, action) -> permission id lookup from the catalog.
  function permId(module: string, action: string): string | undefined {
    return catalog.find((p) => p.module === module && p.action === action)?.id;
  }

  async function handleCreate() {
    if (!newName.trim()) {
      toast.error("Role name is required");
      return;
    }
    setBusy("create");
    try {
      const res = await fetch("/api/admin/central-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to create role");
      setRoles((prev) => [...prev, data.data]);
      toast.success("Role created");
      setNewName(""); setNewDesc(""); setCreateOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create role");
    } finally {
      setBusy(null);
    }
  }

  function startEdit(r: CentralRole) {
    setEditId(r.id);
    setEditName(r.name);
    setEditDesc(r.description ?? "");
  }

  async function handleSaveEdit(r: CentralRole) {
    if (!editName.trim()) {
      toast.error("Role name is required");
      return;
    }
    setBusy(r.id + ":edit");
    try {
      const res = await fetch(`/api/admin/central-roles/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to update role");
      setRoles((prev) => prev.map((x) => (x.id === r.id ? { ...x, name: editName.trim(), description: editDesc.trim() || null } : x)));
      toast.success("Role updated");
      setEditId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(r: CentralRole) {
    if (!confirm(`Delete role "${r.name}"?`)) return;
    setBusy(r.id + ":delete");
    try {
      const res = await fetch(`/api/admin/central-roles/${r.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to delete role");
      setRoles((prev) => prev.filter((x) => x.id !== r.id));
      toast.success("Role deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete role");
    } finally {
      setBusy(null);
    }
  }

  async function openPermissions(r: CentralRole) {
    setPermRole(r);
    setPermLoading(true);
    setPermSelected(new Set());
    try {
      const res = await fetch(`/api/admin/central-roles/${r.id}/permissions`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load permissions");
      setPermSelected(new Set((data.data as CatalogPermission[]).map((p) => p.id)));
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

  async function savePermissions() {
    if (!permRole) return;
    setPermSaving(true);
    try {
      const res = await fetch(`/api/admin/central-roles/${permRole.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionIds: Array.from(permSelected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to save permissions");
      const count = permSelected.size;
      setRoles((prev) => prev.map((x) => (x.id === permRole.id ? { ...x, permissionCount: count } : x)));
      toast.success("Permissions updated");
      setPermRole(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save permissions");
    } finally {
      setPermSaving(false);
    }
  }

  const editorReadOnly = !canManage || !!permRole?.isSystem;

  return (
    <div style={card}>
      {/* Header */}
      <div style={sectionHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ShieldCheck size={18} color={NAVY} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>Roles</div>
            <div style={{ fontSize: 13, color: GRAY }}>
              Define what each administrator can see and do
            </div>
          </div>
        </div>
        {canManage && (
          <Button
            onClick={() => setCreateOpen((v) => !v)}
            style={{ background: NAVY, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}
          >
            <Plus size={16} /> Add role
          </Button>
        )}
      </div>

      {/* Create panel */}
      {createOpen && canManage && (
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "0 1 200px" }}>
              <span style={{ fontSize: 12, color: GRAY }}>Role name</span>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Billing Manager" style={fieldInput} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 280px" }}>
              <span style={{ fontSize: 12, color: GRAY }}>Description</span>
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Optional" style={fieldInput} />
            </label>
            <Button onClick={handleCreate} disabled={busy === "create"} style={{ background: NAVY, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
              {busy === "create" ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Create
            </Button>
          </div>
          <p style={{ fontSize: 12, color: GRAY, marginTop: 8 }}>
            After creating a role, click <strong>Permissions</strong> to choose what it can access.
          </p>
        </div>
      )}

      {/* Permission editor */}
      {permRole && (
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <SlidersHorizontal size={16} color={NAVY} />
            <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>
              Permissions — {permRole.name}
            </span>
            {permRole.isSystem && (
              <span style={pill("#fdeee6", NAVY)}>System role (read-only)</span>
            )}
          </div>

          {permLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: GRAY, fontSize: 13, padding: "12px 0" }}>
              <Loader2 size={14} className="animate-spin" /> Loading permissions…
            </div>
          ) : (
            <>
              <table style={{ borderCollapse: "collapse", background: "#fff", borderRadius: 8, overflow: "hidden", border: "1px solid #E5E7EB" }}>
                <thead>
                  <tr style={{ textAlign: "left", fontSize: 12, color: GRAY, textTransform: "uppercase", background: "#F9FAFB" }}>
                    <th style={permTh}>Module</th>
                    <th style={{ ...permTh, textAlign: "center" }}>Read</th>
                    <th style={{ ...permTh, textAlign: "center" }}>Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {MODULE_ORDER.map((mod) => {
                    const readId = permId(mod, "READ");
                    const manageId = permId(mod, "MANAGE");
                    return (
                      <tr key={mod} style={{ borderTop: "1px solid #F3F4F6", fontSize: 13, color: INK }}>
                        <td style={permTd}>{MODULE_LABEL[mod] ?? mod}</td>
                        <td style={{ ...permTd, textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={readId ? permSelected.has(readId) : false}
                            disabled={editorReadOnly}
                            onChange={() => togglePerm(readId)}
                          />
                        </td>
                        <td style={{ ...permTd, textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={manageId ? permSelected.has(manageId) : false}
                            disabled={editorReadOnly}
                            onChange={() => togglePerm(manageId)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p style={{ fontSize: 12, color: GRAY, marginTop: 8 }}>
                <strong>Manage</strong> includes <strong>Read</strong> automatically.
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                {!editorReadOnly && (
                  <Button onClick={savePermissions} disabled={permSaving} style={{ background: NAVY, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                    {permSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    Save permissions
                  </Button>
                )}
                <Button variant="outline" onClick={() => setPermRole(null)}>Close</Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Roles table */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", fontSize: 12, color: GRAY, textTransform: "uppercase" }}>
            <th style={th}>Name</th>
            <th style={th}>Description</th>
            <th style={th}>Permissions</th>
            <th style={th}>Admins</th>
            <th style={th}>Type</th>
            <th style={{ ...th, textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => {
            const editing = editId === r.id;
            return (
              <tr key={r.id} style={{ borderTop: "1px solid #F3F4F6", fontSize: 14, color: INK }}>
                <td style={td}>
                  {editing ? (
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} style={inlineInput} />
                  ) : (
                    <span style={{ fontWeight: 500 }}>{r.name}</span>
                  )}
                </td>
                <td style={{ ...td, color: GRAY }}>
                  {editing ? (
                    <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Optional" style={{ ...inlineInput, width: 220 }} />
                  ) : (
                    r.description ?? "—"
                  )}
                </td>
                <td style={td}><span style={pill("#fdeee6", NAVY)}>{r.permissionCount}</span></td>
                <td style={{ ...td, color: GRAY }}>{r.userCount}</td>
                <td style={td}>
                  {r.isSystem
                    ? <span style={pill("#F3F4F6", "#374151")}>System</span>
                    : <span style={pill("#ECFDF3", "#0b7a3e")}>Custom</span>}
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  <div style={{ display: "inline-flex", gap: 8 }}>
                    {editing ? (
                      <>
                        <button onClick={() => handleSaveEdit(r)} disabled={busy === r.id + ":edit"} style={{ ...ghostBtn, color: "#0b7a3e" }}>
                          {busy === r.id + ":edit" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          Save
                        </button>
                        <button onClick={() => setEditId(null)} style={ghostBtn}><X size={14} />Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => openPermissions(r)} style={ghostBtn} title="Manage permissions">
                          <SlidersHorizontal size={14} />Permissions
                        </button>
                        {canManage && !r.isSystem && (
                          <>
                            <button onClick={() => startEdit(r)} style={ghostBtn} title="Rename">
                              <Pencil size={14} />Edit
                            </button>
                            <button
                              onClick={() => handleDelete(r)}
                              disabled={busy === r.id + ":delete" || r.userCount > 0}
                              style={{ ...ghostBtn, color: r.userCount > 0 ? "#9CA3AF" : "#c0392b" }}
                              title={r.userCount > 0 ? "Reassign admins before deleting" : "Delete role"}
                            >
                              {busy === r.id + ":delete" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              Delete
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden",
};
const sectionHeader: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "16px 20px", borderBottom: "1px solid #E5E7EB",
};
const th: React.CSSProperties = { padding: "10px 20px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "12px 20px", verticalAlign: "middle" };
const permTh: React.CSSProperties = { padding: "8px 16px", fontWeight: 600 };
const permTd: React.CSSProperties = { padding: "8px 16px" };
const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13,
  border: "1px solid #E5E7EB", borderRadius: 8, padding: "6px 10px",
  background: "#fff", color: "#111827", cursor: "pointer", fontFamily: "inherit",
};
const fieldInput: React.CSSProperties = {
  border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 10px",
  fontSize: 14, color: INK, outline: "none", fontFamily: "inherit",
};
const inlineInput: React.CSSProperties = {
  border: "1px solid #E5E7EB", borderRadius: 6, padding: "5px 8px",
  fontSize: 13, color: "#111827", outline: "none", fontFamily: "inherit", width: 140,
};
function pill(bg: string, color: string): React.CSSProperties {
  return { background: bg, color, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999 };
}
