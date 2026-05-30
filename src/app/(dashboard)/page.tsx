import type React from "react";
import {
  Users,
  Building2,
  GitBranch,
  Wallet,
  CalendarOff,
  Cake,
  CalendarDays,
} from "lucide-react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prismaAdmin from "@/lib/prisma-admin";

// ─── Philippine public holidays 2026 ────────────────────────────────────────
const PH_HOLIDAYS_2026 = [
  { date: "2026-01-01", name: "New Year's Day", type: "Regular" },
  { date: "2026-03-31", name: "Eid'l Fitr", type: "Regular" },
  { date: "2026-04-02", name: "Maundy Thursday", type: "Regular" },
  { date: "2026-04-03", name: "Good Friday", type: "Regular" },
  { date: "2026-04-04", name: "Black Saturday", type: "Special" },
  { date: "2026-04-09", name: "Araw ng Kagitingan", type: "Regular" },
  { date: "2026-05-01", name: "Labor Day", type: "Regular" },
  { date: "2026-06-07", name: "Eid'l Adha", type: "Regular" },
  { date: "2026-06-12", name: "Independence Day", type: "Regular" },
  { date: "2026-08-24", name: "Ninoy Aquino Day", type: "Special" },
  { date: "2026-08-31", name: "National Heroes Day", type: "Regular" },
  { date: "2026-11-01", name: "All Saints' Day", type: "Special" },
  { date: "2026-11-02", name: "All Souls' Day", type: "Special" },
  { date: "2026-11-30", name: "Bonifacio Day", type: "Regular" },
  { date: "2026-12-08", name: "Immaculate Conception", type: "Special" },
  { date: "2026-12-24", name: "Christmas Eve", type: "Special" },
  { date: "2026-12-25", name: "Christmas Day", type: "Regular" },
  { date: "2026-12-30", name: "Rizal Day", type: "Regular" },
  { date: "2026-12-31", name: "New Year's Eve", type: "Special" },
];

function getUpcomingHolidays(from: Date, count = 3) {
  const fromMs = from.getTime();
  return PH_HOLIDAYS_2026.filter((h) => new Date(h.date).getTime() >= fromMs).slice(0, count);
}

function isBirthdayInRange(birthDate: Date, from: Date, days: number): boolean {
  for (let i = 0; i <= days; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    if (birthDate.getMonth() === d.getMonth() && birthDate.getDate() === d.getDate()) return true;
  }
  return false;
}

function birthdayLabel(birthDate: Date, today: Date): string {
  if (birthDate.getMonth() === today.getMonth() && birthDate.getDate() === today.getDate())
    return "Today!";
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (birthDate.getMonth() === tomorrow.getMonth() && birthDate.getDate() === tomorrow.getDate())
    return "Tomorrow";
  return birthDate.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

// ─── Data fetch ──────────────────────────────────────────────────────────────
async function getDashboardStats(tenantId: string) {
  try {
    return await _getDashboardStats(tenantId);
  } catch {
    return { employees: 0, departments: 0, branches: 0, nextRun: null, cutoffDays: null };
  }
}

async function _getDashboardStats(tenantId: string) {
  const [employees, departments, branches, nextRun] = await Promise.all([
    prismaAdmin.employee.count({
      where: { tenantId, deletedAt: null, employmentStatus: { not: "RESIGNED" } },
    }),
    prismaAdmin.department.count({ where: { tenantId, deletedAt: null } }),
    prismaAdmin.branch.count({ where: { tenantId, deletedAt: null } }),
    prismaAdmin.payrollBook.findFirst({
      where: { tenantId, status: "DRAFT" },
      orderBy: { periodEnd: "asc" },
      select: { periodEnd: true },
    }),
  ]);

  const cutoffDays =
    nextRun?.periodEnd
      ? Math.ceil(
          (new Date(nextRun.periodEnd).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      : null;

  return { employees, departments, branches, nextRun, cutoffDays };
}

// Separate isolated fetch for leave-today widget (failure → empty list, never crashes dashboard)
async function getLeaveToday(tenantId: string) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const rows = await prismaAdmin.leaveTransaction.findMany({
      where: {
        tenantId,
        type: "USAGE",
        approvalStatus: "APPROVED",
        startDate: { lte: todayEnd },
        endDate: { gte: today },
      },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        leaveType: { select: { name: true } },
      },
      take: 6,
      orderBy: { startDate: "asc" },
    });
    return rows.map((r) => ({
      name: `${r.employee.firstName} ${r.employee.lastName}`,
      leaveType: r.leaveType.name,
    }));
  } catch {
    return [];
  }
}

// Separate isolated fetch for birthday widget
async function getUpcomingBirthdays(tenantId: string) {
  try {
    const rows = await prismaAdmin.employee.findMany({
      where: {
        tenantId,
        deletedAt: null,
        birthDate: { not: null },
        employmentStatus: { not: "RESIGNED" },
      },
      select: { id: true, firstName: true, lastName: true, birthDate: true },
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return rows
      .filter((e) => e.birthDate && isBirthdayInRange(new Date(e.birthDate), today, 7))
      .map((e) => ({
        id: e.id,
        name: `${e.firstName} ${e.lastName}`,
        label: birthdayLabel(new Date(e.birthDate!), today),
      }));
  } catch {
    return [];
  }
}

// ─── Stat card component ──────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  chipBg,
  chipColor,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ElementType;
  chipBg: string;
  chipColor: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#E8EBF1] p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <span className="text-[12.5px] font-semibold text-[#4A586B] uppercase tracking-wide">{label}</span>
        <div
          className="h-[34px] w-[34px] rounded-[9px] flex items-center justify-center shrink-0"
          style={{ background: chipBg, color: chipColor }}
        >
          <Icon className="h-[17px] w-[17px]" />
        </div>
      </div>
      <div
        className="text-[32px] font-semibold leading-none tracking-tight text-[#111827] font-display"
      >
        {value}
      </div>
      <div className="mt-2 text-[12px] text-[#6B7A8D]">{hint}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const [{ employees, departments, branches, nextRun, cutoffDays }, onLeave, upcomingBirthdays] =
    await Promise.all([
      getDashboardStats(session.user.tenantId),
      getLeaveToday(session.user.tenantId),
      getUpcomingBirthdays(session.user.tenantId),
    ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingHolidays = getUpcomingHolidays(today, 3);

  const stats = [
    {
      label: "Active Employees",
      value: employees.toString(),
      icon: Users,
      hint: "Non-resigned headcount",
      chipBg: "#EAF1FD",
      chipColor: "#2D6BE4",
    },
    {
      label: "Departments",
      value: departments.toString(),
      icon: Building2,
      hint: "Across the company",
      chipBg: "#E5F6EE",
      chipColor: "#0FA36B",
    },
    {
      label: "Branches",
      value: branches.toString(),
      icon: GitBranch,
      hint: "All locations",
      chipBg: "#FBF0DD",
      chipColor: "#DB8A28",
    },
    {
      label: "Next Payroll",
      value: cutoffDays !== null ? `${cutoffDays}d` : "—",
      icon: Wallet,
      hint: nextRun?.periodEnd
        ? `Cutoff ${new Date(nextRun.periodEnd).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`
        : "No draft run",
      chipBg: "#F8F0DC",
      chipColor: "#A87A1E",
    },
  ];

  return (
    <div className="space-y-8">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.5px] text-[#111827] leading-tight">
            Dashboard
          </h1>
          <p className="text-[13px] text-[#6B7A8D] mt-1">
            {new Date().toLocaleDateString("en-PH", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        {cutoffDays !== null && (
          <div className="hidden sm:flex items-center gap-2 rounded-xl border border-[#E8EBF1] bg-white px-4 py-2 shadow-sm">
            <CalendarDays className="h-4 w-4 text-[#2D6BE4]" />
            <span className="text-[13px] font-semibold text-[#2D6BE4]">
              Cutoff in {cutoffDays}d
            </span>
          </div>
        )}
      </div>

      {/* ── Metric cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* ── Human widgets ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* On Leave Today */}
        <div className="bg-white rounded-2xl border border-[#E8EBF1] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8EBF1]">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: "#FBF0DD", color: "#DB8A28" }}>
                <CalendarOff className="h-[15px] w-[15px]" />
              </div>
              <span className="font-display text-[15px] font-semibold text-[#111827]">On Leave Today</span>
            </div>
            <span className="text-[12px] font-semibold text-[#2D6BE4]">{onLeave.length} people</span>
          </div>
          <div className="px-3 py-2">
            {onLeave.length === 0 ? (
              <p className="text-[13px] text-[#6B7A8D] italic py-3 px-2">No approved leaves today.</p>
            ) : (
              <ul>
                {onLeave.map((e, i) => {
                  const initials = e.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
                  return (
                    <li key={i} className="flex items-center gap-3 px-2 py-2.5 rounded-[10px] hover:bg-[#F8F9FC]">
                      <div className="h-[34px] w-[34px] rounded-full flex items-center justify-center text-[12px] font-bold shrink-0" style={{ background: "#FBF0DD", color: "#DB8A28" }}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-semibold text-[#111827] truncate">{e.name}</div>
                        <div className="text-[12px] text-[#6B7A8D]">{e.leaveType}</div>
                      </div>
                      <span className="shrink-0 text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#FBF0DD", color: "#DB8A28" }}>
                        Away
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Birthdays this week */}
        <div className="bg-white rounded-2xl border border-[#E8EBF1] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8EBF1]">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: "#FCE9E7", color: "#E0463B" }}>
                <Cake className="h-[15px] w-[15px]" />
              </div>
              <span className="font-display text-[15px] font-semibold text-[#111827]">Birthdays This Week</span>
            </div>
            <span className="text-[12px] font-semibold text-[#2D6BE4]">{upcomingBirthdays.length} coming up</span>
          </div>
          <div className="px-3 py-2">
            {upcomingBirthdays.length === 0 ? (
              <p className="text-[13px] text-[#6B7A8D] italic py-3 px-2">No upcoming birthdays.</p>
            ) : (
              <ul>
                {upcomingBirthdays.map((e) => {
                  const initials = e.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
                  const isToday = e.label === "Today!";
                  return (
                    <li key={e.id} className="flex items-center gap-3 px-2 py-2.5 rounded-[10px] hover:bg-[#F8F9FC]">
                      <div className="h-[34px] w-[34px] rounded-full flex items-center justify-center text-[12px] font-bold shrink-0" style={{ background: "#FCE9E7", color: "#E0463B" }}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-semibold text-[#111827] truncate">{e.name}</div>
                        <div className="text-[12px] text-[#6B7A8D]">Birthday</div>
                      </div>
                      <span
                        className="shrink-0 text-[10.5px] font-bold px-2 py-0.5 rounded-full"
                        style={isToday
                          ? { background: "#E0463B", color: "#fff" }
                          : { background: "#FCE9E7", color: "#E0463B" }}
                      >
                        {e.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Upcoming holidays */}
        <div className="bg-white rounded-2xl border border-[#E8EBF1] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8EBF1]">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: "#EAF1FD", color: "#2D6BE4" }}>
                <CalendarDays className="h-[15px] w-[15px]" />
              </div>
              <span className="font-display text-[15px] font-semibold text-[#111827]">Upcoming Holidays</span>
            </div>
            <span className="text-[12px] font-semibold text-[#6B7A8D]">PH 2026</span>
          </div>
          <div className="px-3 py-2">
            {upcomingHolidays.length === 0 ? (
              <p className="text-[13px] text-[#6B7A8D] italic py-3 px-2">No upcoming holidays.</p>
            ) : (
              <ul>
                {upcomingHolidays.map((h) => {
                  const d = new Date(h.date);
                  const daysAway = Math.ceil(
                    (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                  );
                  const isRegular = h.type === "Regular";
                  return (
                    <li key={h.date} className="flex items-center gap-3 px-2 py-2.5 rounded-[10px] hover:bg-[#F8F9FC]">
                      <div className="h-[34px] w-[34px] rounded-full flex items-center justify-center text-[12px] font-bold shrink-0" style={{ background: "#EAF1FD", color: "#2D6BE4" }}>
                        {d.getDate()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-semibold text-[#111827] truncate">{h.name}</div>
                        <div className="text-[12px] text-[#6B7A8D]">
                          {d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className="text-[10.5px] font-bold px-2 py-0.5 rounded-full"
                          style={isRegular
                            ? { background: "#EAF1FD", color: "#2D6BE4" }
                            : { background: "#FBF0DD", color: "#DB8A28" }}
                        >
                          {h.type}
                        </span>
                        <span className="text-[11px] text-[#6B7A8D]">
                          {daysAway === 0 ? "Today" : `in ${daysAway}d`}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
