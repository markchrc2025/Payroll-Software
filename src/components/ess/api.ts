"use client";

/**
 * ESS client data layer — authenticated fetch + PH currency/date formatters
 * and the typed shapes returned by /api/ess/*. The raw bearer token lives in
 * localStorage("ess_token"); a 401 clears it and bounces to the login screen.
 */

const TOKEN_KEY = "ess_token";

export function essToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export class EssUnauthorized extends Error {}

/** Authenticated JSON fetch against the ESS API. Throws EssUnauthorized on 401. */
export async function essFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = essToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
      window.location.replace("/ess/login");
    }
    throw new EssUnauthorized("Session expired");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((json && (json.error || json.message)) || `Request failed (${res.status})`);
  }
  return json as T;
}

// ---- currency (PH peso) ----
export const peso = (n: number) =>
  "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const peso0 = (n: number) => "₱" + Math.round(n).toLocaleString("en-PH");
/** Cents come from the API as JSON-serialized decimal strings. */
export const centsToPeso = (cents: string | number) => peso(Number(cents) / 100);
export const centsToPeso0 = (cents: string | number) => peso0(Number(cents) / 100);
export const centsNum = (cents: string | number) => Number(cents) / 100;

// ---- dates ----
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDay(iso: string): string {
  const d = new Date(iso);
  return `${MON[d.getMonth()]} ${d.getDate()}`;
}
export function fmtDayYear(iso: string): string {
  const d = new Date(iso);
  return `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
/** "May 16 – 31, 2026" style period label from two ISO dates. */
export function fmtPeriod(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const sameYear = s.getFullYear() === e.getFullYear();
  if (sameMonth) return `${MON[s.getMonth()]} ${s.getDate()} – ${e.getDate()}, ${e.getFullYear()}`;
  if (sameYear) return `${MON[s.getMonth()]} ${s.getDate()} – ${MON[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  return `${fmtDayYear(startIso)} – ${fmtDayYear(endIso)}`;
}
export function minutesToHrs(min: number): string {
  return (min / 60).toLocaleString("en-PH", { maximumFractionDigits: 1 });
}

// ---- API response types ----
export interface ApiList<T> {
  data: T[];
  pagination?: { page: number; limit: number; total: number; pages: number };
}
export interface ApiOne<T> {
  data: T;
  message?: string;
}

export interface PayslipSummary {
  bookId: string;
  periodStart: string;
  periodEnd: string;
  cycle: string;
  runType: string;
  finalizedAt: string;
  netPayCents: string;
  grossCompensationCents: string;
  withholdingTaxCents: string;
}

export interface PayslipDetailData {
  version: "v1";
  period: { start: string; end: string; cycle: string; runType: string };
  employee: {
    employeeNumber: string;
    name: string;
    taxClassification: string;
    department: string | null;
    branch: string | null;
    position: string | null;
  };
  tenant: { name: string };
  earnings: {
    basePay: string;
    lateUndertimeDeduction: string;
    otPay: string;
    nsdPay: string;
    holidayPay: string;
    restDayPay: string;
    hazardPay: string;
    taxableAllowances: string;
    grossCompensation: string;
  };
  nonTaxable: { nontaxableCompensation: string; nontaxable13MonthAndBenefits: string };
  statutory: { sssEe: string; philhealthEe: string; pagibigEe: string };
  tax: { grossTaxableIncome: string; withholdingTax: string };
  loans: { loanDeductions: string; loanDeferred: string };
  net: { netPay: string };
  ytd: {
    grossCents: string;
    wtaxCents: string;
    basicCents: string;
    released13thMonthCents: string;
    accrued13thMonthCents: string;
  };
  tardinessMinutes: number;
  leaveBalances: { code: string; name: string; available: string }[];
}

export interface LeaveBalanceRow {
  id: string;
  leaveTypeId: string;
  year: number;
  openingBalance: string;
  earned: string;
  used: string;
  forfeited: string;
  convertedToCash: string;
  leaveType: { name: string; code: string; isPaid: boolean; unit: "DAYS" | "HOURS" };
}

export interface LeaveTxn {
  id: string;
  leaveTypeId: string;
  type: string;
  amount: number;
  startDate: string | null;
  endDate: string | null;
  reason: string | null;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  createdAt: string;
  leaveType: { name: string; code: string; unit: "DAYS" | "HOURS" };
}

export interface DtrRecord {
  id: string;
  date: string;
  dayStatus: string;
  approvalStatus: string;
  workedMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
  otMinutes: number;
  timeIn: string | null;
  timeOut: string | null;
  isLocked: boolean;
  notes: string | null;
}
export interface DtrPeriod {
  periodStart: string;
  periodEnd: string;
  totalWorkedMinutes: number;
  totalLateMinutes: number;
  totalOTMinutes: number;
  totalUndertimeMinutes: number;
  presentDays: number;
  absentDays: number;
  recordCount: number;
  records: DtrRecord[];
}

export interface ClockPunch {
  id: string;
  punchType: "IN" | "OUT";
  punchedAt: string;
  source: string;
  latitude: string | null;
  longitude: string | null;
  outsideGeofence: boolean;
  distanceMeters: number | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: string | null;
  publishedAt: string;
}

export interface EssProfile {
  id: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  preferredName: string | null;
  birthDate: string | null;
  gender: string | null;
  civilStatus: string | null;
  nationality: string | null;
  personalEmail: string | null;
  mobileNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  zipCode: string | null;
  region: string | null;
  employmentStatus: string;
  employmentType: string;
  hireDate: string;
  regularizationDate: string | null;
  payFrequency: string;
  taxClassification: string;
  department: { name: string } | null;
  branch: { name: string } | null;
  position: { title: string; level: string | null } | null;
  company: string | null;
  manager: string | null;
  bank: { name: string | null; accountMasked: string | null };
  government: { SSS: string | null; PHILHEALTH: string | null; PAGIBIG: string | null; TIN: string | null; GSIS: string | null };
}
