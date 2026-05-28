/**
 * GET /api/analytics/employees/upcoming-events
 *
 * Returns employee events occurring in the next `days` calendar days (default 30):
 *   - birthdays
 *   - regularization anniversaries
 *   - work anniversaries (hire date month/day match)
 *
 * Query params:
 *   days   (optional)  — look-ahead window in days (1–90, default 30)
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err } from "@/lib/api-response";

interface UpcomingEvent {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  eventType: "birthday" | "regularization" | "workAnniversary";
  /** Calendar date in the look-ahead window (this year, may be Jan if wrapping) */
  eventDate: string; // ISO YYYY-MM-DD
  /** Years milestone, if computable */
  yearsCompleting?: number;
}

/**
 * Returns month-day pairs that fall within today+1 … today+days window,
 * accounting for year wrap. Returns an array because the window may span
 * Dec→Jan.
 *
 * We return all (month, day) tuples in the window so callers can filter.
 */
function dateInWindow(date: Date, today: Date, windowEnd: Date): boolean {
  // Create a "this-year" occurrence for comparison
  const thisYear = today.getFullYear();
  const occurrence = new Date(thisYear, date.getMonth(), date.getDate());

  // If occurrence is already past in this year, check next year's occurrence
  if (occurrence < today) {
    occurrence.setFullYear(thisYear + 1);
  }

  return occurrence >= today && occurrence <= windowEnd;
}

function thisYearOccurrence(date: Date, today: Date): Date {
  const thisYear = today.getFullYear();
  const occ = new Date(thisYear, date.getMonth(), date.getDate());
  if (occ < today) occ.setFullYear(thisYear + 1);
  return occ;
}

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "REPORTS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const url = new URL(req.url);
  const daysStr = url.searchParams.get("days") ?? "30";
  const days = parseInt(daysStr, 10);
  if (isNaN(days) || days < 1 || days > 90)
    return err("days must be between 1 and 90", 400);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = new Date(today);
  windowEnd.setDate(today.getDate() + days);
  windowEnd.setHours(23, 59, 59, 999);

  const employees = await withTenant(auth.tenantId, (tx) =>
    tx.employee.findMany({
      where: {
        tenantId: auth.tenantId,
        deletedAt: null,
        employmentStatus: { not: "TERMINATED" },
      },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        hireDate: true,
        regularizationDate: true,
      },
    })
  );

  const events: UpcomingEvent[] = [];

  for (const emp of employees) {
    if (emp.birthDate && dateInWindow(emp.birthDate, today, windowEnd)) {
      const occ = thisYearOccurrence(emp.birthDate, today);
      const age = occ.getFullYear() - emp.birthDate.getFullYear();
      events.push({
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        firstName: emp.firstName,
        lastName: emp.lastName,
        eventType: "birthday",
        eventDate: occ.toISOString().slice(0, 10),
        yearsCompleting: age,
      });
    }

    if (dateInWindow(emp.hireDate, today, windowEnd)) {
      const occ = thisYearOccurrence(emp.hireDate, today);
      const yearsCompleting = occ.getFullYear() - emp.hireDate.getFullYear();
      if (yearsCompleting >= 1) {
        events.push({
          employeeId: emp.id,
          employeeNumber: emp.employeeNumber,
          firstName: emp.firstName,
          lastName: emp.lastName,
          eventType: "workAnniversary",
          eventDate: occ.toISOString().slice(0, 10),
          yearsCompleting,
        });
      }
    }

    if (emp.regularizationDate && dateInWindow(emp.regularizationDate, today, windowEnd)) {
      const occ = thisYearOccurrence(emp.regularizationDate, today);
      const yearsCompleting = occ.getFullYear() - emp.regularizationDate.getFullYear();
      events.push({
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        firstName: emp.firstName,
        lastName: emp.lastName,
        eventType: "regularization",
        eventDate: occ.toISOString().slice(0, 10),
        yearsCompleting: yearsCompleting > 0 ? yearsCompleting : undefined,
      });
    }
  }

  // Sort by nearest event date first
  events.sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  return ok({
    windowDays: days,
    windowStart: today.toISOString().slice(0, 10),
    windowEnd: windowEnd.toISOString().slice(0, 10),
    count: events.length,
    events,
  });
}
