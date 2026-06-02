"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Timer, LogOut as LogOutIcon, Umbrella, Clock, FileText, Zap, MapPin,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ────────────────────────────────────────────────────────────────────

interface EssProfile {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  department: { name: string } | null;
  position: { title: string } | null;
}

interface AttendanceLog {
  id: string;
  punchType: "IN" | "OUT";
  punchedAt: string;
  outsideGeofence: boolean;
}

interface LeaveBalance {
  id: string;
  openingBalance: string;
  earned: string;
  used: string;
  leaveType: { name: string; code: string };
}

interface OTApp {
  id: string;
  date: string;
  hours: number;
  status: string;
  createdAt: string;
}

interface PayslipSummary {
  bookId: string;
  periodStart: string;
  periodEnd: string;
  netPayCents: string;
  finalizedAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function initials(p: EssProfile) {
  return `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`.toUpperCase();
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function computeHoursToday(punches: AttendanceLog[]): number {
  let total = 0;
  let lastIn: Date | null = null;
  for (const p of punches) {
    if (p.punchType === "IN") lastIn = new Date(p.punchedAt);
    else if (p.punchType === "OUT" && lastIn) {
      total += (new Date(p.punchedAt).getTime() - lastIn.getTime()) / 3_600_000;
      lastIn = null;
    }
  }
  return Math.round(total * 10) / 10;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EssDashboard() {
  const router = useRouter();

  // live clock
  const [now, setNow] = useState(new Date());

  // data
  const [profile, setProfile] = useState<EssProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [punches, setPunches] = useState<AttendanceLog[]>([]);
  const [punchesLoading, setPunchesLoading] = useState(true);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [otApps, setOtApps] = useState<OTApp[]>([]);
  const [lastPayslip, setLastPayslip] = useState<PayslipSummary | null>(null);

  // clock action
  const [punching, setPunching] = useState(false);
  const [elapsed, setElapsed] = useState("");
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Live clock tick ────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Auth headers ───────────────────────────────────────────────────────────
  function authHeaders() {
    const token = localStorage.getItem("ess_token");
    return { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" };
  }

  // ── Load today's punches ───────────────────────────────────────────────────
  const loadPunches = useCallback(async () => {
    const token = localStorage.getItem("ess_token");
    if (!token) return;
    setPunchesLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/ess/clock?date=${today}`, { headers: authHeaders() });
      if (res.status === 401) {
        localStorage.removeItem("ess_token");
        router.replace("/ess/login");
        return;
      }
      const d = await res.json();
      setPunches(d?.data ?? []);
    } finally {
      setPunchesLoading(false);
    }
  }, [router]);

  // ── Bootstrap all data ────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("ess_token");
    if (!token) { router.replace("/ess/login"); return; }

    fetch("/api/ess/profile", { headers: authHeaders() })
      .then((r) => {
        if (r.status === 401) { localStorage.removeItem("ess_token"); router.replace("/ess/login"); return null; }
        return r.json();
      })
      .then((d) => { if (d) setProfile(d?.data ?? null); })
      .finally(() => setProfileLoading(false));

    fetch("/api/ess/leave-balances", { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setLeaveBalances(d?.data ?? []))
      .catch(() => {});

    fetch("/api/ess/ot-applications?limit=10", { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setOtApps(d?.data ?? []))
      .catch(() => {});

    fetch("/api/ess/payslips?limit=1", { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setLastPayslip(d?.data?.[0] ?? null))
      .catch(() => {});

    loadPunches();
  }, [router, loadPunches]);

  // ── Poll punch state every 30 s (picks up Kiosk punches made elsewhere) ──
  useEffect(() => {
    const id = setInterval(() => { loadPunches(); }, 30_000);
    return () => clearInterval(id);
  }, [loadPunches]);

  // ── Derive clock state ────────────────────────────────────────────────────
  const lastPunch = punches[punches.length - 1] ?? null;
  const clockedIn = lastPunch?.punchType === "IN";
  const clockInTime = clockedIn ? lastPunch?.punchedAt : null;

  // ── Elapsed timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    if (!clockedIn || !clockInTime) { setElapsed(""); return; }
    const tick = () => {
      const s = Math.floor((Date.now() - new Date(clockInTime).getTime()) / 1000);
      const h = Math.floor(s / 3600).toString().padStart(2, "0");
      const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
      const sec = (s % 60).toString().padStart(2, "0");
      setElapsed(`${h}:${m}:${sec}`);
    };
    tick();
    elapsedRef.current = setInterval(tick, 1000);
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [clockedIn, clockInTime]);

  // ── Punch handler ─────────────────────────────────────────────────────────
  async function doPunch() {
    const token = localStorage.getItem("ess_token");
    if (!token) { router.replace("/ess/login"); return; }
    setPunching(true);
    let latitude: number | null = null;
    let longitude: number | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }),
      );
      latitude = pos.coords.latitude;
      longitude = pos.coords.longitude;
    } catch { /* proceed without location */ }

    try {
      const punchType = clockedIn ? "OUT" : "IN";
      const res = await fetch("/api/ess/clock", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ punchType, latitude, longitude }),
      });
      const data = await res.json();
      if (res.status === 401) { localStorage.removeItem("ess_token"); router.replace("/ess/login"); return; }
      if (res.status === 403) { toast.error("Please accept biometric / location consent in your profile."); return; }
      if (!res.ok) { toast.error(data?.error ?? "Clock failed. Try again."); return; }
      toast.success(punchType === "IN" ? "Clocked in successfully!" : "Clocked out successfully!");
      loadPunches();
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setPunching(false);
    }
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const hoursToday = computeHoursToday(punches);
  const pendingOT = otApps.filter((o) => o.status === "PENDING").length;
  const topLeave = leaveBalances.slice(0, 2);

  // ── Recent activity items ─────────────────────────────────────────────────
  type ActivityItem = {
    icon: "in" | "out" | "ot" | "payslip";
    label: string;
    sub: string;
    badge: string;
    badgeClass: string;
    href: string;
  };
  const activity: ActivityItem[] = [];

  if (punches.length > 0) {
    const lp = punches[punches.length - 1];
    activity.push({
      icon: lp.punchType === "IN" ? "in" : "out",
      label: lp.punchType === "IN" ? "Clock in" : "Clock out",
      sub: `Today · ${fmtTime(lp.punchedAt)}`,
      badge: "Recorded",
      badgeClass: "bg-green-50 text-green-700",
      href: "/ess/clock",
    });
  }

  if (otApps.length > 0) {
    const ot = otApps[0];
    activity.push({
      icon: "ot",
      label: `OT request · ${ot.hours} hr${ot.hours !== 1 ? "s" : ""}`,
      sub: `${fmtDateShort(ot.date)} · ${ot.status === "PENDING" ? "Awaiting approval" : ot.status}`,
      badge: ot.status,
      badgeClass: ot.status === "PENDING" ? "bg-amber-50 text-amber-700" : ot.status === "APPROVED" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600",
      href: "/ess/ot-applications",
    });
  }

  if (lastPayslip) {
    const net = (Number(lastPayslip.netPayCents) / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
    activity.push({
      icon: "payslip",
      label: `Payslip · ${fmtDateShort(lastPayslip.periodStart)}–${fmtDateShort(lastPayslip.periodEnd)}`,
      sub: `Released ${fmtDateShort(lastPayslip.finalizedAt)} · ${net} net`,
      badge: "Released",
      badgeClass: "bg-green-50 text-green-700",
      href: "/ess/payslips",
    });
  }

  // ── Shared activity list ──────────────────────────────────────────────────
  function ActivityList() {
    if (activity.length === 0) {
      return (
        <div className="bg-white rounded-xl border border-gray-100 px-4 py-6 text-center text-sm text-gray-400">
          No recent activity yet
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        {activity.map((item, i) => (
          <Link key={i} href={item.href}>
            <div className="bg-white rounded-xl border border-gray-100 px-3.5 py-3 flex items-center justify-between hover:bg-gray-50 active:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    item.icon === "in" ? "bg-green-50" :
                    item.icon === "out" ? "bg-blue-50" :
                    item.icon === "ot" ? "bg-amber-50" :
                    "bg-green-50"
                  }`}
                >
                  {item.icon === "in" && <Timer className="h-4 w-4 text-green-600" />}
                  {item.icon === "out" && <LogOutIcon className="h-4 w-4 text-blue-700" />}
                  {item.icon === "ot" && <Zap className="h-4 w-4 text-amber-600" />}
                  {item.icon === "payslip" && <FileText className="h-4 w-4 text-green-700" />}
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-gray-900 leading-snug truncate">{item.label}</p>
                  <p className="text-[11px] text-gray-400">{item.sub}</p>
                </div>
              </div>
              <span className={`text-[11px] rounded-full px-2.5 py-0.5 flex-shrink-0 ml-2 ${item.badgeClass}`}>
                {item.badge}
              </span>
            </div>
          </Link>
        ))}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F0F4F8]">

      {/* ════════════════════════════════════════════════════════════════
          MOBILE LAYOUT  (hidden on lg+)
          ════════════════════════════════════════════════════════════════ */}
      <div className="lg:hidden">

        {/* Navy header */}
        <div className="bg-[#1E3A5F]">
          <div className="px-5 pt-3 flex justify-between items-center">
            <span className="text-[11px] text-white/60" suppressHydrationWarning>
              {now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="text-[11px] text-white/40" suppressHydrationWarning>
              {now.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}
            </span>
          </div>
          <div className="px-5 pt-3 pb-5">
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1 min-w-0 pr-3">
                {profileLoading ? (
                  <>
                    <Skeleton className="h-5 w-44 bg-white/20 mb-1.5" />
                    <Skeleton className="h-3.5 w-36 bg-white/10" />
                  </>
                ) : (
                  <>
                    <p className="text-white text-[17px] font-medium leading-snug">
                      {getGreeting()}, {profile?.firstName ?? "Employee"}!
                    </p>
                    <p className="text-white/55 text-[11.5px] mt-0.5 truncate">
                      {profile?.employeeNumber}
                      {profile?.department?.name ? ` · ${profile.department.name}` : ""}
                    </p>
                  </>
                )}
              </div>
              <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-medium">
                  {profile ? initials(profile) : "?"}
                </span>
              </div>
            </div>
            {profile?.position?.title && (
              <div className="bg-white/10 rounded-lg px-3 py-1.5 inline-flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-white/65 flex-shrink-0" />
                <span className="text-white/85 text-[12px]">{profile.position.title}</span>
              </div>
            )}
          </div>
        </div>

        {/* Clock status bar */}
        <div
          className={`px-5 py-2.5 flex items-center gap-2 border-b ${
            clockedIn ? "bg-green-50 border-green-100" : "bg-blue-50 border-blue-100"
          }`}
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${clockedIn ? "bg-green-500" : "bg-red-400"}`} />
          <span className={`text-xs font-medium ${clockedIn ? "text-green-800" : "text-blue-700"}`}>
            {punchesLoading ? "Loading…" : clockedIn ? "Clocked in" : "Not yet clocked in"}
          </span>
          {clockedIn && clockInTime && (
            <span className="text-[11px] text-blue-400 ml-auto">Since {fmtTime(clockInTime)}</span>
          )}
        </div>

        {/* Clock button */}
        <div className="bg-white px-5 pt-7 pb-5 flex flex-col items-center border-b border-gray-100">
          <button
            onClick={doPunch}
            disabled={punching || punchesLoading}
            aria-label={clockedIn ? "Clock out" : "Clock in"}
            className={`w-[116px] h-[116px] rounded-full flex flex-col items-center justify-center mb-4 transition-all active:scale-95 disabled:opacity-60 select-none
              ${clockedIn ? "bg-[#7F1D1D] border-[3px] border-red-600" : "bg-[#1E3A5F] border-[3px] border-[#2D5A8E]"}`}
          >
            {clockedIn ? <LogOutIcon className="h-9 w-9 text-white mb-1" /> : <Timer className="h-9 w-9 text-white mb-1" />}
            <span className="text-[11px] font-medium text-white/90 tracking-wider">
              {punching ? "…" : clockedIn ? "Clock out" : "Clock in"}
            </span>
          </button>
          <p className="text-sm text-gray-500 text-center">
            {clockedIn ? "Tap when your shift ends" : "Tap to record your attendance"}
          </p>
          {elapsed && <p className="text-[13px] font-medium text-[#185FA5] mt-0.5">{elapsed} elapsed</p>}
          <div className="flex gap-2 mt-4 flex-wrap justify-center">
            <span className="text-[11px] bg-blue-50 text-blue-700 rounded-full px-2.5 py-1 flex items-center gap-1">
              <MapPin className="h-3 w-3" /> GPS geofencing
            </span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="px-4 pt-3 grid grid-cols-2 gap-2.5">
          <div className="bg-white rounded-xl border border-gray-100 p-3.5">
            <p className="text-[11px] text-gray-500 mb-1.5 flex items-center gap-1.5">
              <Umbrella className="h-3.5 w-3.5" /> Leave balance
            </p>
            {leaveBalances.length === 0 ? (
              <p className="text-[13px] text-gray-400 mt-1">—</p>
            ) : (
              <>
                <p className="text-[22px] font-medium text-gray-900 leading-tight">
                  {Math.max(0, Number(topLeave[0].earned) - Number(topLeave[0].used))}{" "}
                  <span className="text-[12px] font-normal text-gray-400">{topLeave[0].leaveType.code} days</span>
                </p>
                {topLeave[1] && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {Math.max(0, Number(topLeave[1].earned) - Number(topLeave[1].used))} {topLeave[1].leaveType.code} remaining
                  </p>
                )}
              </>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3.5">
            <p className="text-[11px] text-gray-500 mb-1.5 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Today
            </p>
            <p className="text-[22px] font-medium text-gray-900 leading-tight">
              {hoursToday}{" "}
              <span className="text-[12px] font-normal text-gray-400">hrs worked</span>
            </p>
            {pendingOT > 0 ? (
              <p className="text-[11px] text-amber-600 mt-0.5">{pendingOT} OT pending approval</p>
            ) : (
              <p className="text-[11px] text-gray-400 mt-0.5">No pending OT</p>
            )}
          </div>
        </div>

        {/* Recent activity */}
        <div className="px-4 pt-4 pb-24">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mb-2.5">
            Recent Activity
          </p>
          <ActivityList />
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          DESKTOP LAYOUT  (hidden below lg)
          ════════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:block p-8">

        {/* Greeting row */}
        <div className="flex items-start justify-between mb-7">
          <div>
            {profileLoading ? (
              <>
                <Skeleton className="h-7 w-64 mb-2" />
                <Skeleton className="h-4 w-48" />
              </>
            ) : (
              <>
                <h1 className="text-[24px] font-semibold text-gray-900 leading-tight">
                  {getGreeting()}, {profile?.firstName ?? "Employee"}!
                </h1>
                <p className="text-[13px] text-gray-500 mt-1">
                  {profile?.employeeNumber}
                  {profile?.department?.name ? ` · ${profile.department.name}` : ""}
                  {profile?.position?.title ? ` · ${profile.position.title}` : ""}
                </p>
              </>
            )}
          </div>

          {/* Clock status pill + avatar */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
                clockedIn ? "bg-green-50 text-green-700 border border-green-200" : "bg-blue-50 text-blue-700 border border-blue-200"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${clockedIn ? "bg-green-500" : "bg-red-400"}`} />
              {punchesLoading ? "Loading…" : clockedIn ? `Clocked in · ${fmtTime(clockInTime!)}` : "Not clocked in"}
            </div>
            <div className="w-10 h-10 rounded-full bg-[#1E3A5F] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-semibold">{profile ? initials(profile) : "?"}</span>
            </div>
          </div>
        </div>

        {/* Main grid: left = clock widget, right = stats */}
        <div className="grid grid-cols-3 gap-5 mb-5">

          {/* ── Clock widget card ──────────────────────────────────────── */}
          <div className="col-span-1 bg-white rounded-2xl border border-gray-100 p-6 flex flex-col items-center justify-between shadow-sm">
            <div className="w-full mb-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Attendance</p>
              <p className="text-[13px] text-gray-500" suppressHydrationWarning>
                {now.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" })}
              </p>
            </div>

            {/* Big clock button */}
            <button
              onClick={doPunch}
              disabled={punching || punchesLoading}
              aria-label={clockedIn ? "Clock out" : "Clock in"}
              className={`w-36 h-36 rounded-full flex flex-col items-center justify-center mb-5 transition-all hover:scale-105 active:scale-95 disabled:opacity-60 select-none shadow-lg
                ${clockedIn ? "bg-[#7F1D1D] border-4 border-red-600" : "bg-[#1E3A5F] border-4 border-[#2D5A8E]"}`}
            >
              {clockedIn ? <LogOutIcon className="h-10 w-10 text-white mb-1" /> : <Timer className="h-10 w-10 text-white mb-1" />}
              <span className="text-[12px] font-semibold text-white/90 tracking-wider uppercase">
                {punching ? "…" : clockedIn ? "Clock out" : "Clock in"}
              </span>
            </button>

            <p className="text-[13px] text-gray-500 text-center mb-2">
              {clockedIn ? "Click when your shift ends" : "Click to record your attendance"}
            </p>
            {elapsed && (
              <p className="text-[14px] font-semibold text-[#185FA5] mb-2">{elapsed} elapsed</p>
            )}
            <span className="text-[11px] bg-blue-50 text-blue-700 rounded-full px-3 py-1 flex items-center gap-1.5">
              <MapPin className="h-3 w-3" /> GPS geofencing enabled
            </span>

            {/* Today's punch log */}
            {punches.length > 0 && (
              <div className="w-full mt-5 pt-4 border-t border-gray-100">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mb-2">Today&apos;s Punches</p>
                <div className="space-y-1.5">
                  {punches.slice(-4).map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-[12px]">
                      <span className={`flex items-center gap-1.5 font-medium ${p.punchType === "IN" ? "text-green-700" : "text-blue-700"}`}>
                        {p.punchType === "IN" ? <Timer className="h-3.5 w-3.5" /> : <LogOutIcon className="h-3.5 w-3.5" />}
                        {p.punchType === "IN" ? "In" : "Out"}
                      </span>
                      <span className="text-gray-500">{fmtTime(p.punchedAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Stats panel (2 cols spanning 2 grid cols) ──────────────── */}
          <div className="col-span-2 grid grid-cols-2 gap-5">

            {/* Hours today */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Today&apos;s Hours
              </p>
              <p className="text-[42px] font-bold text-gray-900 leading-none mb-1">
                {hoursToday}
                <span className="text-[16px] font-normal text-gray-400 ml-1.5">hrs</span>
              </p>
              <p className="text-[13px] text-gray-500">worked today</p>
              {pendingOT > 0 ? (
                <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <p className="text-[12px] text-amber-700 font-medium">{pendingOT} OT request{pendingOT > 1 ? "s" : ""} pending approval</p>
                </div>
              ) : (
                <p className="mt-3 text-[12px] text-gray-400">No pending OT</p>
              )}
            </div>

            {/* Leave balance */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
                <Umbrella className="h-3.5 w-3.5" /> Leave Balance
              </p>
              {leaveBalances.length === 0 ? (
                <p className="text-[14px] text-gray-400 mt-2">No leave balances</p>
              ) : (
                <div className="space-y-3">
                  {topLeave.map((b) => {
                    const avail = Math.max(0, Number(b.earned) - Number(b.used));
                    return (
                      <div key={b.id}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] text-gray-600 font-medium">{b.leaveType.name}</span>
                          <span className="text-[13px] font-bold text-gray-900">{avail} <span className="text-[11px] font-normal text-gray-400">days</span></span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#1E3A5F] rounded-full"
                            style={{ width: `${Math.min(100, (avail / Math.max(1, Number(b.openingBalance) + Number(b.earned))) * 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <Link href="/ess/leaves" className="mt-4 inline-flex items-center text-[12px] text-[#1E3A5F] font-medium hover:underline">
                View all leave →
              </Link>
            </div>

            {/* Last payslip */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Last Payslip
              </p>
              {lastPayslip ? (
                <>
                  <p className="text-[13px] text-gray-500 mb-1">
                    {fmtDateShort(lastPayslip.periodStart)} – {fmtDateShort(lastPayslip.periodEnd)}
                  </p>
                  <p className="text-[28px] font-bold text-gray-900 leading-tight">
                    {(Number(lastPayslip.netPayCents) / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" })}
                  </p>
                  <p className="text-[12px] text-gray-400 mt-0.5">net pay · Released {fmtDateShort(lastPayslip.finalizedAt)}</p>
                </>
              ) : (
                <p className="text-[14px] text-gray-400 mt-2">No payslips yet</p>
              )}
              <Link href="/ess/payslips" className="mt-4 inline-flex items-center text-[12px] text-[#1E3A5F] font-medium hover:underline">
                View all payslips →
              </Link>
            </div>

            {/* Quick actions */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">Quick Actions</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { href: "/ess/leaves", label: "File Leave", icon: Umbrella, bg: "bg-blue-50", color: "text-blue-700" },
                  { href: "/ess/ot-applications", label: "OT Request", icon: Zap, bg: "bg-amber-50", color: "text-amber-700" },
                  { href: "/ess/payslips", label: "Payslips", icon: FileText, bg: "bg-green-50", color: "text-green-700" },
                  { href: "/ess/profile", label: "My Profile", icon: Clock, bg: "bg-purple-50", color: "text-purple-700" },
                ].map(({ href, label, icon: Icon, bg, color }) => (
                  <Link key={href} href={href}>
                    <div className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 ${bg} hover:opacity-80 transition-opacity cursor-pointer`}>
                      <Icon className={`h-4 w-4 flex-shrink-0 ${color}`} />
                      <span className={`text-[12px] font-medium ${color}`}>{label}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">Recent Activity</p>
          <ActivityList />
        </div>
      </div>

    </div>
  );
}
