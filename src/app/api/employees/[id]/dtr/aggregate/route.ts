/**
 * /api/employees/[id]/dtr/aggregate
 *   POST — Aggregate APPROVED DTR records for a period → upsert PeriodInput
 *
 * Body: { periodStart: "YYYY-MM-DD", periodEnd: "YYYY-MM-DD", replace?: boolean }
 *
 * Mapping:
 *   daysWorked         = count of APPROVED PRESENT/HOLIDAY/REST_DAY/PAID_LEAVE days
 *   lateUndertimeMinutes = sum(lateMinutes + undertimeMinutes)
 *   regularOtHours     = sum(otMinutes) / 60
 *   nightDiffHours     = sum(nsdMinutes) / 60
 *   hazardHours        = sum(hazardMinutes) / 60
 *   specialHolidayHours = sum(workedMinutes) for HOLIDAY days with holidayType=SPECIAL_HOLIDAY / 60
 *   regularHolidayHours = sum(workedMinutes) for HOLIDAY days with holidayType=REGULAR_HOLIDAY / 60
 *   unpaidLeaveDays    = count of ABSENT + UNPAID_LEAVE days
 *   restDayHours       = sum(workedMinutes) for REST_DAY days / 60
 */
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, notFound, ok, unauthorized } from "@/lib/api-response";
import { aggregateDtrSchema } from "@/lib/validations/dtr";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id: employeeId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = aggregateDtrSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const { periodStart, periodEnd, replace } = parsed.data;

  if (periodEnd < periodStart)
    return err("periodEnd must be on or after periodStart", 422);

  const periodStartDate = new Date(periodStart + "T00:00:00.000Z");
  const periodEndDate = new Date(periodEnd + "T23:59:59.999Z");

  const result = await withTenant(auth.tenantId, async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!employee) return "NOT_FOUND";

    const records = await tx.dTRRecord.findMany({
      where: {
        tenantId: auth.tenantId,
        employeeId,
        approvalStatus: "APPROVED",
        date: { gte: periodStartDate, lte: periodEndDate },
      },
    });

    // --- Aggregate ---
    let daysWorked = 0;
    let lateUndertimeMinutes = 0;
    let otMinutesTotal = 0;
    let nsdMinutesTotal = 0;
    let hazardMinutesTotal = 0;
    let specialHolidayMinutes = 0;
    let regularHolidayMinutes = 0;
    let restDayMinutes = 0;
    let unpaidLeaveDays = 0;

    for (const r of records) {
      lateUndertimeMinutes += r.lateMinutes + r.undertimeMinutes;
      otMinutesTotal += r.otMinutes;
      nsdMinutesTotal += r.nsdMinutes;
      hazardMinutesTotal += r.hazardMinutes;

      if (r.dayStatus === "ABSENT" || r.dayStatus === "UNPAID_LEAVE") {
        unpaidLeaveDays++;
        continue;
      }

      // Days that count toward attendance
      if (
        r.dayStatus === "PRESENT" ||
        r.dayStatus === "PAID_LEAVE"
      ) {
        daysWorked++;
      } else if (r.dayStatus === "REST_DAY") {
        restDayMinutes += r.workedMinutes;
        daysWorked++;
      } else if (r.dayStatus === "HOLIDAY") {
        daysWorked++;
        if (r.holidayType === "SPECIAL_HOLIDAY") {
          specialHolidayMinutes += r.workedMinutes;
        } else if (r.holidayType === "REGULAR_HOLIDAY") {
          regularHolidayMinutes += r.workedMinutes;
        }
      }
    }

    const minutesToHours = (m: number) =>
      new Prisma.Decimal(m).dividedBy(60).toDecimalPlaces(2).toString();

    // Check if PeriodInput already exists
    const existing = await tx.periodInput.findFirst({
      where: {
        tenantId: auth.tenantId,
        employeeId,
        periodStart: periodStartDate,
        periodEnd: new Date(periodEnd + "T00:00:00.000Z"),
      },
      select: { id: true },
    });

    const data = {
      daysWorked: new Prisma.Decimal(daysWorked).toString(),
      lateUndertimeMinutes,
      regularOtHours: minutesToHours(otMinutesTotal),
      nightDiffHours: minutesToHours(nsdMinutesTotal),
      hazardHours: minutesToHours(hazardMinutesTotal),
      specialHolidayHours: minutesToHours(specialHolidayMinutes),
      regularHolidayHours: minutesToHours(regularHolidayMinutes),
      restDayHours: minutesToHours(restDayMinutes),
      unpaidLeaveDays: new Prisma.Decimal(unpaidLeaveDays).toString(),
      notes: `Aggregated from ${records.length} DTR records`,
    };

    if (existing && !replace) {
      return {
        skipped: true,
        message:
          "PeriodInput already exists. Pass replace:true to overwrite.",
        periodInputId: existing.id,
      };
    }

    if (existing) {
      return tx.periodInput.update({
        where: { id: existing.id },
        data,
      });
    }

    return tx.periodInput.create({
      data: {
        tenantId: auth.tenantId,
        employeeId,
        periodStart: periodStartDate,
        periodEnd: new Date(periodEnd + "T00:00:00.000Z"),
        ...data,
      },
    });
  });

  if (result === "NOT_FOUND") return notFound();
  return ok(result, "DTR aggregated into PeriodInput");
}
