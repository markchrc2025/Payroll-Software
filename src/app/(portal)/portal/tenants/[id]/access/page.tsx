"use client";

import { use, useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus, ShieldCheck, Clock } from "lucide-react";

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

  useEffect(() => {
    fetch(`/api/admin/tenants/${id}/users`)
      .then((r) => r.json())
      .then((j) => setUsers(j.data ?? []))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div style={{ fontFamily: "var(--font-plus-jakarta-sans, sans-serif)" }}>
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
              <th className="text-left px-2 py-2.5 text-[10px] font-medium w-[28%]" style={{ color: "#6B7280" }}>Email</th>
              <th className="text-left px-2 py-2.5 text-[10px] font-medium w-[14%]" style={{ color: "#6B7280" }}>Role</th>
              <th className="text-left px-2 py-2.5 text-[10px] font-medium w-[12%]" style={{ color: "#6B7280" }}>Status</th>
              <th className="text-left px-2 py-2.5 text-[10px] font-medium w-[12%]" style={{ color: "#6B7280" }}>Last login</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: "0.5px solid #F3F4F6" }}>
                  {[1, 2, 3, 4, 5].map((c) => (
                    <td key={c} className="px-4 py-3"><Skeleton className="h-4 w-full rounded" /></td>
                  ))}
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-[12px]" style={{ color: "#9CA3AF" }}>
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
