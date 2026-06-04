"use client";

import { use, useState, useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus, ShieldCheck, Clock, KeyRound, X } from "lucide-react";

interface TenantUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  systemRole: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  assignedRole: { name: string } | null;
}

function fmtDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function initials(first: string, last: string) {
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

export default function AccessRolesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Reset password modal state
  const [resetTarget, setResetTarget] = useState<TenantUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);
  const pwInputRef = useRef<HTMLInputElement>(null);

  function openReset(u: TenantUser) {
    setResetTarget(u);
    setNewPassword("");
    setResetError("");
    setResetSuccess(false);
    setTimeout(() => pwInputRef.current?.focus(), 50);
  }

  function closeReset() {
    setResetTarget(null);
    setNewPassword("");
    setResetError("");
    setResetSuccess(false);
  }

  async function submitReset() {
    if (!resetTarget) return;
    if (newPassword.length < 8) { setResetError("Password must be at least 8 characters."); return; }
    setResetLoading(true);
    setResetError("");
    try {
      const r = await fetch(`/api/admin/tenants/${id}/users/${resetTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const j = await r.json();
      if (!r.ok) { setResetError(j.message ?? "Failed to reset password."); return; }
      setResetSuccess(true);
      setTimeout(closeReset, 1500);
    } catch {
      setResetError("Network error — please try again.");
    } finally {
      setResetLoading(false);
    }
  }

  useEffect(() => {
    fetch(`/api/admin/tenants/${id}/users`)
      .then((r) => r.json())
      .then((j) => setUsers(j.data ?? []))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div style={{ fontFamily: "var(--font-plus-jakarta-sans, sans-serif)" }}>

      {/* Reset password modal */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.35)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeReset(); }}
        >
          <div
            className="rounded-[12px] p-6 w-[340px] shadow-xl"
            style={{ background: "white", border: "0.5px solid #E5E7EB" }}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[13px] font-semibold" style={{ color: "#111827" }}>Reset password</p>
                <p className="text-[11px] mt-0.5" style={{ color: "#6B7280" }}>
                  {resetTarget.firstName} {resetTarget.lastName} &middot; {resetTarget.email}
                </p>
              </div>
              <button onClick={closeReset} className="p-1 rounded hover:bg-gray-100">
                <X size={14} style={{ color: "#9CA3AF" }} />
              </button>
            </div>

            {resetSuccess ? (
              <div className="text-center py-4">
                <p className="text-[12px] font-medium" style={{ color: "#065F46" }}>Password updated successfully.</p>
              </div>
            ) : (
              <>
                <label className="block text-[11px] font-medium mb-1" style={{ color: "#374151" }}>
                  New password
                </label>
                <input
                  ref={pwInputRef}
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setResetError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") submitReset(); }}
                  placeholder="Min 8 characters"
                  className="w-full rounded-[7px] px-3 py-2 text-[12px] outline-none"
                  style={{ border: "1px solid #D1D5DB", color: "#111827" }}
                  autoComplete="new-password"
                />
                {resetError && (
                  <p className="text-[11px] mt-1.5" style={{ color: "#DC2626" }}>{resetError}</p>
                )}
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={closeReset}
                    className="text-[11px] px-3 py-1.5 rounded-[7px]"
                    style={{ border: "1px solid #E5E7EB", color: "#6B7280" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitReset}
                    disabled={resetLoading}
                    className="text-[11px] px-3 py-1.5 rounded-[7px] text-white disabled:opacity-60"
                    style={{ background: "#1E3A5F" }}
                  >
                    {resetLoading ? "Saving…" : "Set password"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="rounded-[10px] overflow-hidden mb-4" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "0.5px solid #F3F4F6" }}>
          <p className="text-[12px] font-medium" style={{ color: "#111827" }}>Tenant users</p>
          <button
            className="flex items-center gap-1.5 text-[11px] font-medium rounded-[7px] px-3 py-1.5 text-white"
            style={{ background: "#1E3A5F" }}
            onClick={() => alert("Add admin user — coming soon")}
          >
            <UserPlus size={12} /> Add admin
          </button>
        </div>

        <table className="w-full border-collapse table-fixed">
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "0.5px solid #E5E7EB" }}>
              <th className="text-left px-4 py-2.5 text-[10px] font-medium w-[34%]" style={{ color: "#6B7280" }}>User</th>
              <th className="text-left px-2 py-2.5 text-[10px] font-medium w-[25%]" style={{ color: "#6B7280" }}>Email</th>
              <th className="text-left px-2 py-2.5 text-[10px] font-medium w-[13%]" style={{ color: "#6B7280" }}>Role</th>
              <th className="text-left px-2 py-2.5 text-[10px] font-medium w-[11%]" style={{ color: "#6B7280" }}>Status</th>
              <th className="text-left px-2 py-2.5 text-[10px] font-medium w-[11%]" style={{ color: "#6B7280" }}>Last login</th>
              <th className="px-2 py-2.5 text-[10px] font-medium w-[6%]" style={{ color: "#6B7280" }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: "0.5px solid #F3F4F6" }}>
                  {[1, 2, 3, 4, 5, 6].map((c) => (
                    <td key={c} className="px-4 py-3"><Skeleton className="h-4 w-full rounded" /></td>
                  ))}
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-[12px]" style={{ color: "#9CA3AF" }}>
                  No users found for this tenant.
                </td>
              </tr>
            ) : users.map((u, idx) => (
              <tr key={u.id} style={{ borderBottom: idx < users.length - 1 ? "0.5px solid #F3F4F6" : "none" }}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex items-center justify-center rounded-full text-[10px] font-medium shrink-0"
                      style={{ width: 26, height: 26, background: "#EFF6FF", color: "#1E3A5F" }}
                    >
                      {initials(u.firstName, u.lastName)}
                    </div>
                    <span className="text-[12px] truncate" style={{ color: "#111827" }}>
                      {u.firstName} {u.lastName}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-[11px] truncate" style={{ color: "#6B7280" }}>
                  {u.email}
                </td>
                <td className="px-2 py-2.5">
                  <span
                    className="text-[10px] rounded-full px-2 py-0.5"
                    style={{ background: "#F3F4F6", color: "#374151" }}
                  >
                    {u.assignedRole?.name ?? u.systemRole.replace("_", " ").toLowerCase()}
                  </span>
                </td>
                <td className="px-2 py-2.5">
                  <span
                    className="text-[10px] rounded-full px-2 py-0.5"
                    style={{
                      background: u.isActive ? "#ECFDF5" : "#FEF2F2",
                      color: u.isActive ? "#065F46" : "#991B1B",
                    }}
                  >
                    {u.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-[11px]" style={{ color: "#6B7280" }}>
                  {fmtDate(u.lastLoginAt)}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <button
                    title="Reset password"
                    onClick={() => openReset(u)}
                    className="p-1 rounded hover:bg-gray-100"
                  >
                    <KeyRound size={13} style={{ color: "#6B7280" }} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Security info cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-[10px] p-4" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={14} style={{ color: "#1E3A5F" }} />
            <p className="text-[12px] font-medium" style={{ color: "#111827" }}>Security settings</p>
          </div>
          <div className="space-y-2">
            {[
              ["Password policy", "Min 8 chars, mixed case"],
              ["MFA enforcement", "Optional (tenant-controlled)"],
              ["Session timeout", "8 hours"],
              ["Login rate limit", "5 attempts / 15 min"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-1.5" style={{ borderBottom: "0.5px solid #F9FAFB" }}>
                <span className="text-[11px]" style={{ color: "#6B7280" }}>{k}</span>
                <span className="text-[11px]" style={{ color: "#374151" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[10px] p-4" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} style={{ color: "#1E3A5F" }} />
            <p className="text-[12px] font-medium" style={{ color: "#111827" }}>Login history</p>
          </div>
          <p className="text-[12px]" style={{ color: "#9CA3AF" }}>
            Detailed login history and audit logs are available in the platform audit trail module.
          </p>
          <div className="mt-3 rounded-[6px] px-3 py-2.5 text-[11px]" style={{ background: "#F9FAFB", color: "#6B7280" }}>
            Total active users: <span className="font-medium" style={{ color: "#111827" }}>
              {loading ? "…" : users.filter((u) => u.isActive).length}
            </span>
            <br />
            Total users: <span className="font-medium" style={{ color: "#111827" }}>
              {loading ? "…" : users.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
