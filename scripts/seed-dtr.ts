/**
 * seed-dtr.ts — Seed DTR records + PeriodInputs for May 2026
 *
 * Covers both semi-monthly cutoffs for the demo tenant so the HR Admin
 * can immediately create and test a payroll run.
 *
 * May 2026 calendar (May 1 = Friday / Labor Day):
 *   Period 1: May  1–15 → 10 working days (May 4–8, 11–15; May 1 = Regular Holiday)
 *   Period 2: May 16–31 → 10 working days (May 18–22, 25–29)
 *
 * MONTHLY employees (Ramon Villanueva, Liza Fernandez) get a single
 * PeriodInput for May 1–31 (20 working days).
 *
 * Run:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/seed-dtr.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

// ── helpers ────────────────────────────────────────────────────────────────

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function isWeekend(date: Date): boolean {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6; // Sun=0, Sat=6
}

function isLaborDay(date: Date): boolean {
  return date.getUTCMonth() === 4 && date.getUTCDate() === 1; // May 1
}

/** All calendar dates in [start, end] inclusive. */
function dateRange(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

// ── per-employee variation ─────────────────────────────────────────────────

interface Variation {
  /** Days worked in period 1 (May 1–15). */
  p1Days: number;
  /** Days worked in period 2 (May 16–31). For MONTHLY, this is for full month. */
  p2Days: number;
  p1LateMinutes: number;
  p2LateMinutes: number;
  /** OT hours for period 1. */
  p1OtHours: number;
  /** OT hours for period 2. */
  p2OtHours: number;
  /** Night-diff hours period 2. */
  p2NsdHours?: number;
  /** One absent working day in period 2 (day-of-month, e.g. 20). */
  absentDayP2?: number;
  /** Unpaid leave days in period 2 (derived from absentDayP2 if set). */
  p2UnpaidLeaveDays?: number;
}

const VARIATIONS: Variation[] = [
  // EMP-0001  Maria Santos       ₱65 000  HR Manager      SEMI_MONTHLY
  { p1Days: 10, p2Days: 10, p1LateMinutes: 0,  p2LateMinutes: 0,  p1OtHours: 0,   p2OtHours: 1   },
  // EMP-0002  Jose Dela Cruz     ₱75 000  Senior Engineer SEMI_MONTHLY
  { p1Days: 10, p2Days: 10, p1LateMinutes: 0,  p2LateMinutes: 0,  p1OtHours: 1,   p2OtHours: 2   },
  // EMP-0003  Ana Reyes          ₱45 000  SW Engineer     SEMI_MONTHLY  — 1 absent + late
  { p1Days: 10, p2Days: 9,  p1LateMinutes: 0,  p2LateMinutes: 30, p1OtHours: 0,   p2OtHours: 0,  absentDayP2: 20, p2UnpaidLeaveDays: 1 },
  // EMP-0004  Ramon Villanueva   ₱70 000  Sales Manager   MONTHLY
  { p1Days: 20, p2Days: 0,  p1LateMinutes: 0,  p2LateMinutes: 0,  p1OtHours: 0,   p2OtHours: 0   },
  // EMP-0005  Liza Fernandez     ₱28 000  Sales Rep       MONTHLY
  { p1Days: 20, p2Days: 0,  p1LateMinutes: 0,  p2LateMinutes: 0,  p1OtHours: 0,   p2OtHours: 0   },
  // EMP-0006  Miguel Torres      ₱30 000  Junior Engineer SEMI_MONTHLY  — consistently late
  { p1Days: 10, p2Days: 10, p1LateMinutes: 30, p2LateMinutes: 60, p1OtHours: 0,   p2OtHours: 0   },
  // EMP-0007  Patricia Castillo  ₱40 000  HR Specialist   SEMI_MONTHLY  — perfect
  { p1Days: 10, p2Days: 10, p1LateMinutes: 0,  p2LateMinutes: 0,  p1OtHours: 0,   p2OtHours: 0   },
  // EMP-0008  Carlos Mendoza     ₱55 000  DevOps Engineer SEMI_MONTHLY  — heavy OT + NSD
  { p1Days: 10, p2Days: 10, p1LateMinutes: 0,  p2LateMinutes: 0,  p1OtHours: 1.5, p2OtHours: 3,  p2NsdHours: 2  },
  // EMP-0009  Jennifer Pascual   ₱38 000  Marketing Spec  SEMI_MONTHLY  — perfect
  { p1Days: 10, p2Days: 10, p1LateMinutes: 0,  p2LateMinutes: 0,  p1OtHours: 0,   p2OtHours: 0   },
  // EMP-0010  Roberto Aquino     ₱50 000  Accountant      SEMI_MONTHLY
  { p1Days: 10, p2Days: 10, p1LateMinutes: 0,  p2LateMinutes: 0,  p1OtHours: 0,   p2OtHours: 1.5 },
];

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("🗂️  Seeding DTR records + PeriodInputs for May 2026…\n");

  const tenant = await prisma.tenant.findFirst({
    where: { name: "Demo Corp Philippines, Inc.", deletedAt: null },
  });
  if (!tenant) throw new Error("Demo tenant not found — run `npm run seed` first.");

  const employees = await prisma.employee.findMany({
    where: { tenantId: tenant.id, deletedAt: null },
    orderBy: { employeeNumber: "asc" },
  });
  if (employees.length === 0) throw new Error("No employees found.");
  console.log(`Found ${employees.length} employees.\n`);

  const P1_START = utcDate(2026, 5, 1);
  const P1_END   = utcDate(2026, 5, 15);
  const P2_START = utcDate(2026, 5, 16);
  const P2_END   = utcDate(2026, 5, 31);

  const allMayDays    = dateRange(P1_START, P2_END);
  const adminUserId   = (await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: "admin@democorp.ph" },
  }))?.id ?? null;

  let dtrCreated = 0;
  let piCreated  = 0;

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const v   = VARIATIONS[i] ?? { p1Days: 10, p2Days: 10, p1LateMinutes: 0, p2LateMinutes: 0, p1OtHours: 0, p2OtHours: 0 };
    const isMonthly = emp.payFrequency === "MONTHLY";

    // ── DTR records (one per calendar day in May) ────────────────────────
    for (const day of allMayDays) {
      const dom = day.getUTCDate();
      const weekend = isWeekend(day);
      const laborDay = isLaborDay(day);
      const absentThisDay = !isMonthly && v.absentDayP2 === dom;

      let dayStatus: string;
      let workedMinutes = 0;
      let lateMinutes   = 0;
      let otMinutes     = 0;
      let nsdMinutes    = 0;
      let holidayType: string | null = null;

      if (weekend) {
        dayStatus = "REST_DAY";
      } else if (laborDay) {
        dayStatus   = "HOLIDAY";
        holidayType = "REGULAR_HOLIDAY";
        // Employees are not required to work on Labor Day for demo
        workedMinutes = 0;
      } else if (absentThisDay) {
        dayStatus = "ABSENT";
      } else {
        dayStatus     = "PRESENT";
        workedMinutes = 480; // 8 h

        // Late minutes — distribute aggregate late across working days
        const p1WorkDays = 10;
        const p2WorkDays = 10;

        if (dom >= 4 && dom <= 15 && v.p1LateMinutes > 0) {
          // Spread late mins across period-1 working days
          lateMinutes = Math.round(v.p1LateMinutes / p1WorkDays);
        }
        if (dom >= 18 && dom <= 31 && v.p2LateMinutes > 0) {
          lateMinutes = Math.round(v.p2LateMinutes / p2WorkDays);
        }

        // OT — give it on the last working Friday of each period
        if (dom === 15 && v.p1OtHours > 0) {
          otMinutes = Math.round(v.p1OtHours * 60);
        }
        if (dom === 29 && v.p2OtHours > 0) {
          otMinutes  = Math.round(v.p2OtHours * 60);
        }
        // NSD — only on specific day
        if (dom === 29 && v.p2NsdHours) {
          nsdMinutes = Math.round(v.p2NsdHours * 60);
        }
      }

      await prisma.dTRRecord.upsert({
        where: {
          tenantId_employeeId_date: {
            tenantId:   tenant.id,
            employeeId: emp.id,
            date:       day,
          },
        },
        update: {}, // idempotent — don't overwrite if already seeded
        create: {
          tenantId:        tenant.id,
          employeeId:      emp.id,
          date:            day,
          dayStatus:       dayStatus as never,
          workedMinutes,
          lateMinutes,
          undertimeMinutes: 0,
          otMinutes,
          nsdMinutes,
          hazardMinutes:   0,
          holidayType,
          approvalStatus:  "APPROVED",
          approvedById:    adminUserId,
          approvedAt:      new Date(),
          isLocked:        false,
        },
      });
      dtrCreated++;
    }

    // ── PeriodInputs ────────────────────────────────────────────────────
    if (isMonthly) {
      // Single PeriodInput for the full month
      await prisma.periodInput.upsert({
        where: {
          tenantId_employeeId_periodStart_periodEnd: {
            tenantId:    tenant.id,
            employeeId:  emp.id,
            periodStart: P1_START,
            periodEnd:   P2_END,
          },
        },
        update: {},
        create: {
          tenantId:            tenant.id,
          employeeId:          emp.id,
          periodStart:         P1_START,
          periodEnd:           P2_END,
          daysWorked:          v.p1Days,  // e.g. 20 for monthly
          lateUndertimeMinutes: v.p1LateMinutes,
          regularOtHours:      v.p1OtHours,
          restDayHours:        0,
          specialHolidayHours: 0,
          regularHolidayHours: 0,
          nightDiffHours:      0,
          hazardHours:         0,
          unpaidLeaveDays:     0,
          notes:               "Seeded — May 2026 full month",
        },
      });
      piCreated++;
    } else {
      // Period 1 (May 1–15)
      await prisma.periodInput.upsert({
        where: {
          tenantId_employeeId_periodStart_periodEnd: {
            tenantId:    tenant.id,
            employeeId:  emp.id,
            periodStart: P1_START,
            periodEnd:   P1_END,
          },
        },
        update: {},
        create: {
          tenantId:            tenant.id,
          employeeId:          emp.id,
          periodStart:         P1_START,
          periodEnd:           P1_END,
          daysWorked:          v.p1Days,
          lateUndertimeMinutes: v.p1LateMinutes,
          regularOtHours:      v.p1OtHours,
          restDayHours:        0,
          specialHolidayHours: 0,
          regularHolidayHours: 0,
          nightDiffHours:      0,
          hazardHours:         0,
          unpaidLeaveDays:     0,
          notes:               "Seeded — May 2026 first half",
        },
      });
      piCreated++;

      // Period 2 (May 16–31)
      await prisma.periodInput.upsert({
        where: {
          tenantId_employeeId_periodStart_periodEnd: {
            tenantId:    tenant.id,
            employeeId:  emp.id,
            periodStart: P2_START,
            periodEnd:   P2_END,
          },
        },
        update: {},
        create: {
          tenantId:            tenant.id,
          employeeId:          emp.id,
          periodStart:         P2_START,
          periodEnd:           P2_END,
          daysWorked:          v.p2Days,
          lateUndertimeMinutes: v.p2LateMinutes,
          regularOtHours:      v.p2OtHours,
          restDayHours:        0,
          specialHolidayHours: 0,
          regularHolidayHours: 0,
          nightDiffHours:      v.p2NsdHours ?? 0,
          hazardHours:         0,
          unpaidLeaveDays:     v.p2UnpaidLeaveDays ?? 0,
          notes:               "Seeded — May 2026 second half",
        },
      });
      piCreated++;
    }

    console.log(
      `  ✅  ${emp.employeeNumber}  ${emp.lastName}, ${emp.firstName}`.padEnd(45) +
      `(${emp.payFrequency})  DTR: May 1–31  |  PeriodInputs: ${isMonthly ? "1 (monthly)" : "2 (semi-monthly)"}`
    );
  }

  console.log(`
────────────────────────────────────────────────────────
✅  DTR rows upserted  : ${dtrCreated}
✅  PeriodInputs upserted: ${piCreated}

Ready to test payroll runs:
  1. Login → admin@democorp.ph / Admin1234!
  2. Go to /payroll
  3. "New Run":
     • Period: 2026-05-16 → 2026-05-31  (second half, semi-monthly, REGULAR)
       OR
     • Period: 2026-05-01 → 2026-05-15  (first half)
       OR
     • Period: 2026-05-01 → 2026-05-31  (monthly employees, MONTHLY cycle)
  4. Recompute → Finalize → View payslips
────────────────────────────────────────────────────────
`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
