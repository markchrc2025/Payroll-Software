"use client";

/**
 * ESS shared primitives — cards, sections, chips, status pills, progress rings,
 * avatars, buttons, the live-clock hook, and the in-app navigation context.
 * Ported from the design handoff (ess-ui.jsx) as typed React components.
 */

import { createContext, useEffect, useState, type ReactNode } from "react";
import { EIcon, type EIconName } from "./icons";

// ---- in-app stack navigation context ----
export type EssView =
  | "pay" | "leave" | "time" | "profile"
  | "payslip" | "leaveRequest" | "request" | "settings" | "announcement" | "clock";

export interface EssNavValue {
  go: (view: EssView, param?: string | null) => void;
  back: () => void;
  tab: (id: string) => void;
  clockedIn: boolean;
  setClockedIn: (v: boolean) => void;
  logout: () => void;
}

export const ESSNav = createContext<EssNavValue>({
  go: () => {},
  back: () => {},
  tab: () => {},
  clockedIn: false,
  setClockedIn: () => {},
  logout: () => {},
});

// ---- card ----
export function ECard({
  children,
  className = "",
  onClick,
  style,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={"e-card" + (onClick ? " e-card-tap" : "") + (className ? " " + className : "")}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  );
}

// ---- section heading ----
export function ESection({
  children,
  action,
  onAction,
}: {
  children: ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="e-sectionhead">
      <span>{children}</span>
      {action && (
        <button className="e-seclink" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

// ---- chips / status ----
type Tone = "green" | "amber" | "red" | "slate" | "sage";
const E_TONES: Record<Tone, [string, string]> = {
  green: ["#1f7a4d", "#e7f4ec"],
  amber: ["#9a6a12", "#fbf1dc"],
  red: ["#b23b34", "#fbe9e7"],
  slate: ["#6b6259", "#efeae3"],
  sage: ["#3E7A5E", "#e9f2ed"],
};
export function EChip({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  const [c, bg] = E_TONES[tone] ?? E_TONES.slate;
  return (
    <span className="e-chip" style={{ color: c, background: bg }}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  Approved: "green",
  Paid: "green",
  "On time": "green",
  Present: "green",
  Pending: "amber",
  Late: "amber",
  Rejected: "red",
  Absent: "red",
  Cancelled: "slate",
};
export function EStatus({ children }: { children: string }) {
  return <EChip tone={STATUS_TONE[children] ?? "slate"}>{children}</EChip>;
}

// ---- progress ring ----
export function ERing({
  value,
  total,
  color,
  size = 54,
}: {
  value: number;
  total: number;
  color: string;
  size?: number;
}) {
  const r = (size - 7) / 2;
  const C = 2 * Math.PI * r;
  const pct = total ? Math.max(0, Math.min(1, (total - value) / total)) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: "none" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ece6dd" strokeWidth="5" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeDasharray={`${pct * C} ${C}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

// ---- avatar ----
export function EAvatar({
  initials,
  size = 40,
  color,
}: {
  initials: string;
  size?: number;
  color?: string;
}) {
  return (
    <span
      className="e-avatar"
      style={{ width: size, height: size, fontSize: size * 0.4, background: color || "var(--e-acc)" }}
    >
      {initials}
    </span>
  );
}

// ---- button ----
export function EBtn({
  children,
  kind = "primary",
  onClick,
  icon,
  full,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  kind?: "primary" | "ghost";
  onClick?: () => void;
  icon?: EIconName;
  full?: boolean;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={"e-btn e-btn-" + kind + (full ? " e-btn-full" : "")}
      onClick={onClick}
    >
      {icon && <EIcon name={icon} size={18} />}
      {children}
    </button>
  );
}

// ---- live clock ----
export function useNow() {
  const [n, setN] = useState<Date | null>(null);
  useEffect(() => {
    setN(new Date());
    const id = setInterval(() => setN(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return n;
}

export interface ClockParts {
  h: number;
  m: string;
  s: string;
  ap: string;
  hm: string;
  full: string;
}
export function fmtTime(d: Date): ClockParts {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ap = h < 12 ? "AM" : "PM";
  h = h % 12 || 12;
  return { h, m, s, ap, hm: h + ":" + m, full: h + ":" + m + " " + ap };
}
