/**
 * Central Portal shared UI primitives (warm Sentire design system).
 * Presentational only — safe to render from both server and client components.
 * Styling lives in src/app/centralportal/central.css (cp-* classes).
 */

import type { ReactNode } from "react";

// ─── Nexus brand mark ───────────────────────────────────────────────────────
// The platform logo mesh — light nodes + orange core, for the dark sidebar tile.
export function NexusMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <g stroke="#F7F3EF" strokeWidth="3.4" strokeLinecap="round" opacity="0.5">
        <line x1="24" y1="24" x2="24" y2="11.5" />
        <line x1="24" y1="24" x2="38.5" y2="24" />
        <line x1="24" y1="24" x2="19.55" y2="36.22" />
        <line x1="24" y1="24" x2="10.84" y2="19.21" />
      </g>
      <g stroke="#F7F3EF" strokeWidth="2.55" strokeLinecap="round" opacity="0.18">
        <line x1="24" y1="11.5" x2="38.5" y2="24" />
        <line x1="38.5" y1="24" x2="19.55" y2="36.22" />
        <line x1="19.55" y1="36.22" x2="10.84" y2="19.21" />
        <line x1="10.84" y1="19.21" x2="24" y2="11.5" />
      </g>
      <circle cx="24" cy="11.5" r="3.68" fill="#F7F3EF" />
      <circle cx="38.5" cy="24" r="4.13" fill="#F7F3EF" />
      <circle cx="19.55" cy="36.22" r="3.85" fill="#F7F3EF" />
      <circle cx="10.84" cy="19.21" r="3.43" fill="#F7F3EF" />
      <circle cx="24" cy="24" r="5" fill="rgb(238,147,113)" />
    </svg>
  );
}

// ─── Line icon set (stroke 1.7, 24-grid) ────────────────────────────────────
export const CP_ICONS = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  tenants: "M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 21V9h4a1 1 0 0 1 1 1v11M3 21h18M7.5 8h.01M7.5 12h.01M11 8h.01M11 12h.01",
  billing: "M5 3h14a1 1 0 0 1 1 1v17l-3-2-2 2-2-2-2 2-2-2-3 2V4a1 1 0 0 1 1-1zM8 8h8M8 12h8M8 16h5",
  support: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 8 2.6h.1A1.7 1.7 0 0 0 9 1.1V1a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 14.9 2.6a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1A1.7 1.7 0 0 0 22.9 9H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  analytics: "M3 3v18h18M7 14l3-3 3 3 5-6",
  audit: "M12 2l8 3v6c0 4.5-3 8.3-8 9.5C7 19.3 4 15.5 4 11V5l8-3zM9 11.5l2 2 4-4.5",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  chevR: "M9 6l6 6-6 6",
  refresh: "M21 12a9 9 0 1 1-3-6.7M21 4v4h-4",
} as const;

export type CpIconName = keyof typeof CP_ICONS;

export function CpIcon({ name, size = 18, sw = 1.7 }: { name: CpIconName; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "none" }}>
      <path d={CP_ICONS[name]} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Badges ─────────────────────────────────────────────────────────────────
// Tone → [text color, bg]. Covers statuses, invoice/payment states, priorities,
// and role types — mirrors the handoff's BADGE map.
const BADGE_TONES: Record<string, [string, string]> = {
  Active: ["#1f7a4d", "#e7f4ec"], Trialing: ["#9a6a12", "#fbf1dc"],
  "Past due": ["#b23b34", "#fbe9e7"], Cancelled: ["#6b6259", "#efeae3"],
  Paid: ["#1f7a4d", "#e7f4ec"], Overdue: ["#b23b34", "#fbe9e7"], Pending: ["#9a6a12", "#fbf1dc"],
  Open: ["#b23b34", "#fbe9e7"], Draft: ["#5e5048", "#efeae3"], Void: ["#6b6259", "#efeae3"],
  Invited: ["#9a6a12", "#fbf1dc"], System: ["#5e5048", "#efeae3"],
  Urgent: ["#b23b34", "#fbe9e7"], High: ["#c2552f", "#fdeee6"], Normal: ["#3e63a0", "#e9eff7"], Low: ["#6b6259", "#efeae3"],
  Custom: ["#7a5230", "#f6ece3"],
};

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const key = tone ?? (typeof children === "string" ? children : "");
  const [c, bg] = BADGE_TONES[key] ?? ["#6b6259", "#efeae3"];
  return <span className="cp-badge" style={{ color: c, background: bg }}>{children}</span>;
}

const PLAN_TONES: Record<string, [string, string]> = {
  STARTER: ["#5e5048", "#efeae3"],
  GROWTH: ["#3e63a0", "#e9eff7"],
  PRO: ["#c2552f", "#fdeee6"],
};

/** Plan badge for our real tiers (STARTER / GROWTH / PRO). */
export function PlanBadge({ tier }: { tier: string }) {
  const [c, bg] = PLAN_TONES[tier] ?? PLAN_TONES.STARTER;
  return <span className="cp-badge" style={{ color: c, background: bg }}>{titleCase(tier)}</span>;
}

/**
 * Plan pill showing an arbitrary package name, coloured by an optional coarse
 * tier tag (falls back to a neutral tone when the package has no tier).
 */
export function PlanPill({ label, tier }: { label: string; tier?: string | null }) {
  const [c, bg] = (tier && PLAN_TONES[tier]) || ["#6b6259", "#efeae3"];
  return <span className="cp-badge" style={{ color: c, background: bg }}>{label}</span>;
}

export function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

// ─── Status label maps (enum → human) ───────────────────────────────────────
export const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active", TRIALING: "Trialing", PAST_DUE: "Past due", CANCELLED: "Cancelled",
};
export const INVOICE_LABEL: Record<string, string> = {
  DRAFT: "Draft", OPEN: "Open", PAID: "Paid", OVERDUE: "Overdue", VOID: "Void",
};

// ─── StatCard ───────────────────────────────────────────────────────────────
export type StatTone = "orange" | "green" | "blue" | "amber" | "red";

export function StatCard({
  label, value, icon, tone, delta, sub,
}: {
  label: string; value: ReactNode; icon: CpIconName; tone: StatTone; delta?: number; sub?: string;
}) {
  return (
    <div className="cp-stat">
      <div className="cp-stat-top">
        <span className="cp-stat-label">{label}</span>
        <span className="cp-stat-ic" data-tone={tone}><CpIcon name={icon} size={16} /></span>
      </div>
      <div className="cp-stat-val">{value}</div>
      {(delta !== undefined || sub) && (
        <div className="cp-stat-sub">
          {delta !== undefined && (
            <span className="cp-delta" data-dir={delta >= 0 ? "up" : "down"}>
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
            </span>
          )}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Card ───────────────────────────────────────────────────────────────────
export function Card({
  title, action, children, pad = true,
}: {
  title?: ReactNode; action?: ReactNode; children: ReactNode; pad?: boolean;
}) {
  return (
    <section className="cp-card">
      {(title || action) && (
        <header className="cp-card-head">
          <h3>{title}</h3>
          {action}
        </header>
      )}
      <div className={pad ? "cp-card-body" : ""}>{children}</div>
    </section>
  );
}

// ─── PageHead ───────────────────────────────────────────────────────────────
export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="cp-pagehead">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="cp-pagehead-act">{actions}</div>}
    </div>
  );
}

// ─── Health bar ─────────────────────────────────────────────────────────────
export function HealthBar({ value }: { value: number }) {
  const c = value >= 80 ? "#1f7a4d" : value >= 50 ? "#c2552f" : "#b23b34";
  return (
    <span className="cp-health">
      <span className="cp-health-track"><i style={{ width: value + "%", background: c }} /></span>
      <em style={{ color: c }}>{value}</em>
    </span>
  );
}

// ─── Bar chart ──────────────────────────────────────────────────────────────
export function BarChart({ data }: { data: { label: string; value: number; tip?: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="cp-chart">
      {data.map((d, i) => (
        <div className="cp-bar-wrap" key={d.label + i}>
          <div className="cp-bar" style={{ height: (d.value / max) * 100 + "%" }} data-last={i === data.length - 1}>
            {d.tip && <span className="cp-bar-tip">{d.tip}</span>}
          </div>
          <span className="cp-bar-lbl">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Donut ──────────────────────────────────────────────────────────────────
export function Donut({ data, centerLabel }: { data: { value: number; color: string }[]; centerLabel?: string }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  const R = 54;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <svg width="150" height="150" viewBox="0 0 150 150">
      <circle cx="75" cy="75" r={R} fill="none" stroke="#efeae3" strokeWidth="18" />
      {total > 0 && data.map((d, i) => {
        const len = (d.value / total) * C;
        const off = acc;
        acc += len;
        return (
          <circle key={i} cx="75" cy="75" r={R} fill="none" stroke={d.color} strokeWidth="18"
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off}
            transform="rotate(-90 75 75)" strokeLinecap="butt" />
        );
      })}
      <text x="75" y="71" textAnchor="middle" className="cp-donut-n">{total}</text>
      <text x="75" y="90" textAnchor="middle" className="cp-donut-l">{centerLabel ?? "total"}</text>
    </svg>
  );
}
