"use client";

import { useState } from "react";
import { toast } from "sonner";

type AdminUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  systemRole: string;
  isActive: boolean;
  lastLoginAt: string | null;
};

type Action = "reset_link" | "invite" | "activate" | "deactivate";

const btn: React.CSSProperties = {
  fontFamily: "var(--font, inherit)", fontSize: 11.5, fontWeight: 600, lineHeight: 1,
  padding: "6px 10px", borderRadius: 8, border: "1px solid #ECE6DD", background: "#fff",
  color: "#2A2420", cursor: "pointer", whiteSpace: "nowrap",
};

export function TenantAdminUsers({ tenantId, users: initial }: { tenantId: string; users: AdminUser[] }) {
  const [users, setUsers] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null); // `${id}:${action}`

  async function run(u: AdminUser, action: Action) {
    setBusy(`${u.id}:${action}`);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/users/${u.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Action failed");
      toast.success(json?.message ?? "Done");
      if (action === "activate" || action === "deactivate") {
        setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, isActive: action === "activate" } : x)));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  if (users.length === 0) {
    return <p className="text-xs py-3" style={{ color: "#978C80" }}>No admin users on this tenant yet.</p>;
  }

  return (
    <div>
      {users.map((u, i) => {
        const neverLoggedIn = !u.lastLoginAt;
        const label = (a: Action) => {
          const key = `${u.id}:${a}`;
          return busy === key;
        };
        return (
          <div
            key={u.id}
            className="flex items-center gap-2.5 py-2.5 flex-wrap"
            style={{ borderBottom: i < users.length - 1 ? "1px solid #F1ECE4" : "none" }}
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0"
              style={{ background: "rgba(232,105,58,0.1)", color: "#E8693A" }}>
              {(u.firstName[0] ?? "") + (u.lastName[0] ?? "")}
            </div>
            <div className="flex-1 min-w-0" style={{ minWidth: 160 }}>
              <div className="text-xs font-medium" style={{ color: "#2A2420" }}>{u.firstName} {u.lastName}</div>
              <div className="text-[11px]" style={{ color: "#6B6259" }}>{u.email}</div>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ border: "1px solid #ECE6DD", color: "#6B6259" }}>{u.systemRole}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={u.isActive ? { background: "#e7f4ec", color: "#1f7a4d" } : { background: "#efeae3", color: "#978C80" }}>
              {u.isActive ? "Active" : "Inactive"}
            </span>

            {/* Recovery actions only — no profile/role editing from the platform. */}
            <div className="flex items-center gap-1.5">
              <button style={btn} disabled={!!busy} onClick={() => run(u, "reset_link")}>
                {label("reset_link") ? "Sending…" : "Reset link"}
              </button>
              {neverLoggedIn && (
                <button style={btn} disabled={!!busy} onClick={() => run(u, "invite")}>
                  {label("invite") ? "Sending…" : "Resend invite"}
                </button>
              )}
              {u.isActive ? (
                <button style={{ ...btn, color: "#b23b34", borderColor: "#f3d6d2" }} disabled={!!busy} onClick={() => run(u, "deactivate")}>
                  {label("deactivate") ? "…" : "Deactivate"}
                </button>
              ) : (
                <button style={{ ...btn, color: "#1f7a4d", borderColor: "#cde8d5" }} disabled={!!busy} onClick={() => run(u, "activate")}>
                  {label("activate") ? "…" : "Activate"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
