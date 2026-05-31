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

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F0F4F8]">

      {/* ── Navy header ─────────────────────────────────────────────────── */}
      <div className="bg-[#1E3A5F]">
        {/* Status row */}
        <div className="px-5 pt-3 flex justify-between items-center">
          <span className="text-[11px] text-white/60" suppressHydrationWarning>
            {now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="text-[11px] text-white/40" suppressHydrationWarning>
            {now.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}
          </span>
        </div>

        {/* Greeting + avatar */}
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

          {/* Position pill */}
          {profile?.position?.title && (
            <div className="bg-white/10 rounded-lg px-3 py-1.5 inline-flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-white/65 flex-shrink-0" />
              <span className="text-white/85 text-[12px]">{profile.position.title}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Clock status bar ──────────────────────────────────────────────── */}
      <div
        className={`px-5 py-2.5 flex items-center gap-2 border-b ${
          clockedIn ? "bg-green-50 border-green-100" : "bg-blue-50 border-blue-100"
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            clockedIn ? "bg-green-500" : "bg-red-400"
          }`}
        />
        <span
          className={`text-xs font-medium ${
            clockedIn ? "text-green-800" : "text-blue-700"
          }`}
        >
          {punchesLoading ? "Loading…" : clockedIn ? "Clocked in" : "Not yet clocked in"}
        </span>
        {clockedIn && clockInTime && (
          <span className="text-[11px] text-blue-400 ml-auto">
            Since {fmtTime(clockInTime)}
          </span>
        )}
      </div>

      {/* ── Clock button ──────────────────────────────────────────────────── */}
      <div className="bg-white px-5 pt-7 pb-5 flex flex-col items-center border-b border-gray-100">
        <button
          onClick={doPunch}
          disabled={punching || punchesLoading}
          aria-label={clockedIn ? "Clock out" : "Clock in"}
          className={`w-[116px] h-[116px] rounded-full flex flex-col items-center justify-center mb-4 transition-all active:scale-95 disabled:opacity-60 select-none
            ${clockedIn
              ? "bg-[#7F1D1D] border-[3px] border-red-600"
              : "bg-[#1E3A5F] border-[3px] border-[#2D5A8E]"
            }`}
        >
          {clockedIn
            ? <LogOutIcon className="h-9 w-9 text-white mb-1" />
            : <Timer className="h-9 w-9 text-white mb-1" />
          }
          <span className="text-[11px] font-medium text-white/90 tracking-wider">
            {punching ? "…" : clockedIn ? "Clock out" : "Clock in"}
          </span>
        </button>

        <p className="text-sm text-gray-500 text-center">
          {clockedIn ? "Tap when your shift ends" : "Tap to record your attendance"}
        </p>
        {elapsed && (
          <p className="text-[13px] font-medium text-[#185FA5] mt-0.5">{elapsed} elapsed</p>
        )}

        <div className="flex gap-2 mt-4 flex-wrap justify-center">
          <span className="text-[11px] bg-blue-50 text-blue-700 rounded-full px-2.5 py-1 flex items-center gap-1">
            <MapPin className="h-3 w-3" /> GPS geofencing
          </span>
        </div>
      </div>

      {/* ── Stats grid ────────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 grid grid-cols-2 gap-2.5">
        {/* Leave balance */}
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

        {/* Today's hours */}
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

      {/* ── Recent activity ───────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-24">
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mb-2.5">
          Recent Activity
        </p>

        {activity.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 px-4 py-6 text-center text-sm text-gray-400">
            No recent activity yet
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {activity.map((item, i) => (
              <Link key={i} href={item.href}>
                <div className="bg-white rounded-xl border border-gray-100 px-3.5 py-3 flex items-center justify-between active:bg-gray-50 transition-colors">
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
        )}
      </div>

    </div>
  );
}
