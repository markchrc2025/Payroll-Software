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
import { getSetupChecklist } from "@/lib/onboarding/checklist";
import { SetupChecklist } from "@/components/dashboard/SetupChecklist";

// ─── Upcoming holidays: the company's own holiday calendar ──────────────────
// PAY-74: was a hard-coded 2026 list with wrong dates (Eid'l Fitr and Eid'l
// Adha guessed, Ninoy Aquino Day on 24 Aug instead of 21 Aug); now the
// company's Holiday rows, which a new company gets seeded with.
async function getUpcomingHolidays(tenantId: string, from: Date, count = 3) {
  const rows = await prismaAdmin.holiday.findMany({
    where: { tenantId, deletedAt: null, date: { gte: from } },
    orderBy: { date: "asc" },
    take: count,
    select: { date: true, name: true, category: true },
  });
  return rows.map((h) => ({
    date: h.date.toISOString().slice(0, 10),
    name: h.name,
    type: h.category === "LEGAL" ? "Regular" : "Special",
  }));
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
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[var(--line)] px-3.5 py-3">
      <div className="flex items-start justify-between mb-1.5">
        <span className="text-[13px] font-normal text-[var(--muted-2)]">{label}</span>
        <div className="h-6 w-6 rounded-[6px] flex items-center justify-center shrink-0 bg-[var(--fill)] text-[var(--muted-clr)]">
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="text-[24px] font-semibold leading-tight tracking-[-0.01em] tabular-nums text-[var(--ink)]">
        {value}
      </div>
      <div className="mt-1 text-[12.5px] text-[var(--muted-2)]">{hint}</div>
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
  const [upcomingHolidays, setupSteps] = await Promise.all([
    getUpcomingHolidays(session.user.tenantId, new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())), 3),
    getSetupChecklist(session.user.tenantId),
  ]);

  const stats = [
    {
      label: "Active Employees",
      value: employees.toString(),
      icon: Users,
      hint: "Non-resigned headcount",
    },
    {
      label: "Departments",
      value: departments.toString(),
      icon: Building2,
      hint: "Across the company",
    },
    {
      label: "Branches",
      value: branches.toString(),
      icon: GitBranch,
      hint: "All locations",
    },
    {
      label: "Next Payroll",
      value: cutoffDays !== null ? `${cutoffDays}d` : "—",
      icon: Wallet,
      hint: nextRun?.periodEnd
        ? `Cutoff ${new Date(nextRun.periodEnd).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`
        : "No draft run",
    },
  ];

  return (
    <div className="space-y-8">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">
            Dashboard
          </h1>
          <p className="text-[13px] text-[#6B6B6B] mt-1">
            {new Date().toLocaleDateString("en-PH", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        {cutoffDays !== null && (
          <div className="hidden sm:flex items-center gap-2 rounded-xl border border-[#E8E8E8] bg-white px-4 py-2">
            <CalendarDays className="h-4 w-4 text-[#E8693A]" />
            <span className="text-[13px] font-semibold text-[#E8693A]">
              Cutoff in {cutoffDays}d
            </span>
          </div>
        )}
      </div>

      {/* PAY-74: setup checklist until the first payslips are published */}
      <SetupChecklist steps={setupSteps} />

      {/* ── Metric cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* ── Human widgets ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* On Leave Today */}
        <div className="bg-white rounded-2xl border border-[var(--line)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E8E8]">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-[7px] flex items-center justify-center bg-[var(--fill)] text-[var(--muted-clr)]">
                <CalendarOff className="h-[15px] w-[15px]" />
              </div>
              <span className="font-display text-[15px] font-semibold text-[#171717]">On Leave Today</span>
            </div>
            <span className="text-[12px] font-semibold text-[#E8693A]">{onLeave.length} people</span>
          </div>
          <div className="px-3 py-2">
            {onLeave.length === 0 ? (
              <p className="text-[13px] text-[#6B6B6B] italic py-3 px-2">No approved leaves today.</p>
            ) : (
              <ul>
                {onLeave.map((e, i) => {
                  const initials = e.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
                  return (
                    <li key={i} className="flex items-center gap-3 px-2 py-2.5 rounded-[10px] hover:bg-[#F7F7F7]">
                      <div className="h-[34px] w-[34px] rounded-[7px] flex items-center justify-center text-[13.5px] font-medium shrink-0 bg-[var(--fill)] text-[var(--ink)]">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-semibold text-[#171717] truncate">{e.name}</div>
                        <div className="text-[12px] text-[#6B6B6B]">{e.leaveType}</div>
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
        <div className="bg-white rounded-2xl border border-[var(--line)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E8E8]">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-[7px] flex items-center justify-center bg-[var(--fill)] text-[var(--muted-clr)]">
                <Cake className="h-[15px] w-[15px]" />
              </div>
              <span className="font-display text-[15px] font-semibold text-[#171717]">Birthdays This Week</span>
            </div>
            <span className="text-[12px] font-semibold text-[#E8693A]">{upcomingBirthdays.length} coming up</span>
          </div>
          <div className="px-3 py-2">
            {upcomingBirthdays.length === 0 ? (
              <p className="text-[13px] text-[#6B6B6B] italic py-3 px-2">No upcoming birthdays.</p>
            ) : (
              <ul>
                {upcomingBirthdays.map((e) => {
                  const initials = e.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
                  const isToday = e.label === "Today!";
                  return (
                    <li key={e.id} className="flex items-center gap-3 px-2 py-2.5 rounded-[10px] hover:bg-[#F7F7F7]">
                      <div className="h-[34px] w-[34px] rounded-[7px] flex items-center justify-center text-[13.5px] font-medium shrink-0 bg-[var(--fill)] text-[var(--ink)]">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-semibold text-[#171717] truncate">{e.name}</div>
                        <div className="text-[12px] text-[#6B6B6B]">Birthday</div>
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
        <div className="bg-white rounded-2xl border border-[var(--line)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E8E8]">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-[7px] flex items-center justify-center bg-[var(--fill)] text-[var(--muted-clr)]">
                <CalendarDays className="h-[15px] w-[15px]" />
              </div>
              <span className="font-display text-[15px] font-semibold text-[#171717]">Upcoming Holidays</span>
            </div>
            <span className="text-[12px] font-semibold text-[#6B6B6B]">PH 2026</span>
          </div>
          <div className="px-3 py-2">
            {upcomingHolidays.length === 0 ? (
              <p className="text-[13px] text-[#6B6B6B] italic py-3 px-2">No upcoming holidays.</p>
            ) : (
              <ul>
                {upcomingHolidays.map((h) => {
                  const d = new Date(h.date);
                  const daysAway = Math.ceil(
                    (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                  );
                  const isRegular = h.type === "Regular";
                  return (
                    <li key={h.date} className="flex items-center gap-3 px-2 py-2.5 rounded-[10px] hover:bg-[#F7F7F7]">
                      <div className="h-[34px] w-[34px] rounded-[7px] flex items-center justify-center text-[13.5px] font-medium shrink-0 bg-[var(--fill)] text-[var(--ink)]">
                        {d.getDate()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-semibold text-[#171717] truncate">{h.name}</div>
                        <div className="text-[12px] text-[#6B6B6B]">
                          {d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className="text-[10.5px] font-bold px-2 py-0.5 rounded-full"
                          style={isRegular
                            ? { background: "#fdeee6", color: "#E8693A" }
                            : { background: "#FBF0DD", color: "#DB8A28" }}
                        >
                          {h.type}
                        </span>
                        <span className="text-[11px] text-[#6B6B6B]">
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
