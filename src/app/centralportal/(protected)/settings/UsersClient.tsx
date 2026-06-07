"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus, KeyRound, ShieldCheck, Mail, Loader2, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";

type Admin = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  systemRole: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  centralRoleId: string | null;
  centralRoleName: string | null;
};

type RoleOption = { id: string; name: string };

const NAVY = "#1E3A5F";
const GRAY = "#6B7280";
const INK = "#111827";

function fmtDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export default function UsersClient({
  initialAdmins,
  currentUserId,
  roleOptions,
  canManage,
}: {
  initialAdmins: Admin[];
  currentUserId: string;
  roleOptions: RoleOption[];
  canManage: boolean;
}) {
  const [admins, setAdmins] = useState<Admin[]>(initialAdmins);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editEmail, setEditEmail] = useState("");

  function startEdit(a: Admin) {
    setEditId(a.id);
    setEditFirst(a.firstName);
    setEditLast(a.lastName);
    setEditEmail(a.email);
  }

  async function handleSaveEdit(admin: Admin) {
    if (!editFirst.trim() || !editLast.trim() || !editEmail.trim()) {
      toast.error("Fill in all fields");
      return;
    }
    setBusy(admin.id + ":edit");
    try {
      const res = await fetch(`/api/admin/central-users/${admin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: editFirst.trim(), lastName: editLast.trim(), email: editEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Update failed");
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? { ...a, firstName: editFirst.trim(), lastName: editLast.trim(), email: editEmail.trim() } : a)));
      toast.success("Admin updated");
      setEditId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleAssignRole(admin: Admin, roleId: string) {
    const value = roleId === "" ? null : roleId;
    setBusy(admin.id + ":role");
    try {
      const res = await fetch(`/api/admin/central-users/${admin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centralRoleId: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to assign role");
      const newName = roleOptions.find((r) => r.id === value)?.name ?? null;
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? { ...a, centralRoleId: value, centralRoleName: newName } : a)));
      toast.success(value ? "Role assigned" : "Role cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign role");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(admin: Admin) {
    if (!confirm(`Delete ${admin.firstName} ${admin.lastName}? This removes their Central Portal access.`)) return;
    setBusy(admin.id + ":delete");
    try {
      const res = await fetch(`/api/admin/central-users/${admin.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Delete failed");
      setAdmins((prev) => prev.filter((a) => a.id !== admin.id));
      toast.success("Admin deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleInvite() {
    if (!email || !firstName || !lastName) {
      toast.error("Fill in all fields");
      return;
    }
    setBusy("invite");
    try {
      const res = await fetch("/api/admin/central-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, firstName, lastName, centralRoleId: inviteRoleId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Invite failed");
      toast.success(`Invite sent to ${email}`);
      const roleName = roleOptions.find((r) => r.id === inviteRoleId)?.name ?? null;
      setAdmins((prev) => [
        ...prev,
        {
          id: data.id, email, firstName, lastName,
          systemRole: "SUPER_ADMIN", isActive: false,
          lastLoginAt: null, createdAt: new Date().toISOString(),
          centralRoleId: inviteRoleId || null, centralRoleName: roleName,
        },
      ]);
      setEmail(""); setFirstName(""); setLastName(""); setInviteRoleId(""); setInviteOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleReset(admin: Admin) {
    setBusy(admin.id + ":reset");
    try {
      const res = await fetch(`/api/admin/central-users/${admin.id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Reset failed");
      toast.success(`Password reset link sent to ${admin.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleActive(admin: Admin) {
    setBusy(admin.id + ":active");
    const next = !admin.isActive;
    try {
      const res = await fetch(`/api/admin/central-users/${admin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Update failed");
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? { ...a, isActive: next } : a)));
      toast.success(next ? "Admin reactivated" : "Admin deactivated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Section header */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid #E5E7EB",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ShieldCheck size={18} color={NAVY} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>Administrators</div>
            <div style={{ fontSize: 13, color: GRAY }}>Central Portal users and their assigned roles</div>
          </div>
        </div>
        {canManage && (
          <Button
            onClick={() => setInviteOpen((v) => !v)}
            style={{ background: NAVY, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}
          >
            <UserPlus size={16} /> Invite admin
          </Button>
        )}
      </div>

      {inviteOpen && canManage && (
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Field label="First name" value={firstName} onChange={setFirstName} />
            <Field label="Last name" value={lastName} onChange={setLastName} />
            <Field label="Email" value={email} onChange={setEmail} type="email" wide />
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "0 1 170px" }}>
              <span style={{ fontSize: 12, color: GRAY }}>Role</span>
              <select value={inviteRoleId} onChange={(e) => setInviteRoleId(e.target.value)} style={selectStyle}>
                <option value="">No role</option>
                {roleOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <Button
              onClick={handleInvite}
              disabled={busy === "invite"}
              style={{ background: NAVY, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}
            >
              {busy === "invite" ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
              Send invite
            </Button>
          </div>
          <p style={{ fontSize: 12, color: GRAY, marginTop: 8 }}>
            The invitee receives an email link to set their own password. They become active once they do.
          </p>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", fontSize: 12, color: GRAY, textTransform: "uppercase" }}>
            <th style={th}>Name</th>
            <th style={th}>Email</th>
            <th style={th}>Role</th>
            <th style={th}>Status</th>
            <th style={th}>Last login</th>
            <th style={{ ...th, textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {admins.map((a) => {
            const editing = editId === a.id;
            return (
            <tr key={a.id} style={{ borderTop: "1px solid #F3F4F6", fontSize: 14, color: INK }}>
              <td style={td}>
                {editing ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={editFirst} onChange={(e) => setEditFirst(e.target.value)} placeholder="First" style={inlineInput} />
                    <input value={editLast} onChange={(e) => setEditLast(e.target.value)} placeholder="Last" style={inlineInput} />
                  </div>
                ) : (
                  <>
                    {a.firstName} {a.lastName}
                    {a.id === currentUserId && (
                      <span style={{ fontSize: 11, color: NAVY, marginLeft: 6 }}>(you)</span>
                    )}
                  </>
                )}
              </td>
              <td style={{ ...td, color: GRAY }}>
                {editing ? (
                  <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Email" style={{ ...inlineInput, width: 220 }} />
                ) : a.email}
              </td>
              <td style={td}>
                {canManage ? (
                  <select
                    value={a.centralRoleId ?? ""}
                    disabled={busy === a.id + ":role"}
                    onChange={(e) => handleAssignRole(a, e.target.value)}
                    style={selectStyle}
                  >
                    <option value="">No role</option>
                    {roleOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                ) : (
                  <span style={pill("#EEF2FF", NAVY)}>{a.centralRoleName ?? "No role"}</span>
                )}
              </td>
              <td style={td}>
                {a.isActive
                  ? <span style={pill("#ECFDF3", "#0b7a3e")}>Active</span>
                  : <span style={pill("#FEF2F2", "#c0392b")}>Pending / Inactive</span>}
              </td>
              <td style={{ ...td, color: GRAY }}>{fmtDate(a.lastLoginAt)}</td>
              <td style={{ ...td, textAlign: "right" }}>
                {!canManage ? (
                  <span style={{ color: "#9CA3AF", fontSize: 13 }}>—</span>
                ) : (
                <div style={{ display: "inline-flex", gap: 8 }}>
                  {editing ? (
                    <>
                      <button onClick={() => handleSaveEdit(a)} disabled={busy === a.id + ":edit"} style={{ ...ghostBtn, color: "#0b7a3e" }} title="Save changes">
                        {busy === a.id + ":edit" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Save
                      </button>
                      <button onClick={() => setEditId(null)} style={ghostBtn} title="Cancel">
                        <X size={14} />Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(a)} style={ghostBtn} title="Edit name & email">
                        <Pencil size={14} />Edit
                      </button>
                      <button
                        onClick={() => handleReset(a)}
                        disabled={busy === a.id + ":reset"}
                        style={ghostBtn}
                        title="Send password reset link"
                      >
                        {busy === a.id + ":reset" ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                        Reset
                      </button>
                      {a.id !== currentUserId && (
                        <>
                          <button
                            onClick={() => handleToggleActive(a)}
                            disabled={busy === a.id + ":active"}
                            style={{ ...ghostBtn, color: a.isActive ? "#c0392b" : "#0b7a3e" }}
                          >
                            {a.isActive ? "Deactivate" : "Reactivate"}
                          </button>
                          <button
                            onClick={() => handleDelete(a)}
                            disabled={busy === a.id + ":delete"}
                            style={{ ...ghostBtn, color: "#c0392b" }}
                            title="Delete admin"
                          >
                            {busy === a.id + ":delete" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            Delete
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
                )}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", wide = false,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; wide?: boolean;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: wide ? "1 1 220px" : "0 1 150px" }}>
      <span style={{ fontSize: 12, color: GRAY }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          border: "1px solid #E5E7EB", borderRadius: 8, padding: "8px 10px",
          fontSize: 14, color: INK, outline: "none", fontFamily: "inherit",
        }}
      />
    </label>
  );
}

const th: React.CSSProperties = { padding: "10px 20px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "12px 20px", verticalAlign: "middle" };
const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13,
  border: "1px solid #E5E7EB", borderRadius: 8, padding: "6px 10px",
  background: "#fff", color: "#111827", cursor: "pointer", fontFamily: "inherit",
};
const inlineInput: React.CSSProperties = {
  border: "1px solid #E5E7EB", borderRadius: 6, padding: "5px 8px",
  fontSize: 13, color: "#111827", outline: "none", fontFamily: "inherit", width: 90,
};
const selectStyle: React.CSSProperties = {
  border: "1px solid #E5E7EB", borderRadius: 8, padding: "7px 9px",
  fontSize: 13, color: INK, outline: "none", fontFamily: "inherit", background: "#fff",
};
function pill(bg: string, color: string): React.CSSProperties {
  return { background: bg, color, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999 };
}
