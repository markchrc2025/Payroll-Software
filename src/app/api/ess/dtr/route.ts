/**
 * GET  /api/ess/dtr
 *   Returns DTR records for the authenticated employee, grouped by
 *   semi-monthly payroll period (1–15 and 16–EOM), ordered latest first.
 *   Each period includes the DTRSubmission status (if any).
 *
 * POST /api/ess/dtr
 *   Submit DTR for a period. Creates a DTRSubmission row.
 *   Body: { periodStart: ISO date string, periodEnd: ISO date string }
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getEssContext } from "@/lib/ess-auth";
import { err, ok, unauthorized, serverError } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Return the period (start, end) for a given date following PH semi-monthly convention */
function getPeriodBounds(date: Date): { start: Date; end: Date } {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  if (d <= 15) {
    return {
      start: new Date(Date.UTC(y, m, 1)),
      end:   new Date(Date.UTC(y, m, 15)),
    };
  }
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return {
    start: new Date(Date.UTC(y, m, 16)),
    end:   new Date(Date.UTC(y, m, lastDay)),
  };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const limitParam = Math.min(12, Math.max(1, Number(searchParams.get("limit") ?? "6")));

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      // Fetch last N months of DTR records
      const cutoff = new Date();
      cutoff.setUTCMonth(cutoff.getUTCMonth() - (limitParam * 1));
      cutoff.setUTCDate(1);

      const records = await tx.dTRRecord.findMany({
        where: {
          tenantId: ctx.tenantId,
          employeeId: ctx.employeeId,
          date: { gte: cutoff },
        },
        select: {
          id: true,
          date: true,
          dayStatus: true,
          workedMinutes: true,
          lateMinutes: true,
          undertimeMinutes: true,
          otMinutes: true,
          approvalStatus: true,
          officialTimeIn: true,
          officialTimeOut: true,
          manualTimeIn: true,
          manualTimeOut: true,
          effectiveTimeIn: true,
          effectiveTimeOut: true,
          isLocked: true,
          notes: true,
        },
        orderBy: { date: "desc" },
      });

      // Fetch all submissions for this employee
      const submissions = await tx.dTRSubmission.findMany({
        where: {
          tenantId: ctx.tenantId,
          employeeId: ctx.employeeId,
          periodStart: { gte: cutoff },
        },
        select: {
          id: true,
          periodStart: true,
          periodEnd: true,
          status: true,
          submittedAt: true,
          supervisorActedAt: true,
          managerActedAt: true,
          returnedReason: true,
          returnedAt: true,
        },
        orderBy: { periodStart: "desc" },
      });

      // Group records by period
      const periodMap = new Map<string, {
        periodStart: Date;
        periodEnd: Date;
        records: typeof records;
      }>();

      for (const r of records) {
        const { start, end } = getPeriodBounds(r.date);
        const key = start.toISOString();
        if (!periodMap.has(key)) {
          periodMap.set(key, { periodStart: start, periodEnd: end, records: [] });
        }
        periodMap.get(key)!.records.push(r);
      }

      // Build submission lookup
      const subMap = new Map(
        submissions.map((s) => [s.periodStart.toISOString(), s])
      );

      // Assemble periods sorted descending
      const periods = Array.from(periodMap.values())
        .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime())
        .slice(0, limitParam)
        .map(({ periodStart, periodEnd, records: recs }) => {
          const sub = subMap.get(periodStart.toISOString()) ?? null;
          const totalWorked    = recs.reduce((sum, r) => sum + r.workedMinutes, 0);
          const totalLate      = recs.reduce((sum, r) => sum + r.lateMinutes, 0);
          const totalOT        = recs.reduce((sum, r) => sum + r.otMinutes, 0);
          const totalUndertime = recs.reduce((sum, r) => sum + r.undertimeMinutes, 0);
          const presentDays = recs.filter((r) => r.dayStatus === "PRESENT").length;
          const absentDays  = recs.filter((r) => r.dayStatus === "ABSENT").length;

          return {
            periodStart: periodStart.toISOString(),
            periodEnd:   periodEnd.toISOString(),
            totalWorkedMinutes: totalWorked,
            totalLateMinutes:   totalLate,
            totalOTMinutes:        totalOT,
            totalUndertimeMinutes: totalUndertime,
            presentDays,
            absentDays,
            recordCount: recs.length,
            submission: sub
              ? {
                  id:               sub.id,
                  status:           sub.status,
                  submittedAt:      sub.submittedAt.toISOString(),
                  supervisorActedAt: sub.supervisorActedAt?.toISOString() ?? null,
                  managerActedAt:   sub.managerActedAt?.toISOString() ?? null,
                  returnedReason:   sub.returnedReason ?? null,
                  returnedAt:       sub.returnedAt?.toISOString() ?? null,
                }
              : null,
            records: recs.map((r) => ({
              id:             r.id,
              date:           r.date.toISOString(),
              dayStatus:      r.dayStatus,
              approvalStatus: r.approvalStatus,
              workedMinutes:  r.workedMinutes,
              lateMinutes:    r.lateMinutes,
              undertimeMinutes: r.undertimeMinutes,
              otMinutes:      r.otMinutes,
              timeIn:  (r.effectiveTimeIn  ?? r.manualTimeIn  ?? r.officialTimeIn)?.toISOString()  ?? null,
              timeOut: (r.effectiveTimeOut ?? r.manualTimeOut ?? r.officialTimeOut)?.toISOString() ?? null,
              isLocked: r.isLocked,
              notes:    r.notes ?? null,
            })),
          };
        });

      return periods;
    });

    return ok(result);
  } catch (e) {
    console.error("[ess/dtr GET]", e);
    return serverError();
  }
}

// ── POST (submit DTR) ─────────────────────────────────────────────────────────

const submitSchema = z.object({
  periodStart: z.string().datetime(),
  periodEnd:   z.string().datetime(),
});

export async function POST(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const { periodStart, periodEnd } = parsed.data;
  const ps = new Date(periodStart);
  const pe = new Date(periodEnd);

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      // Upsert: if returned, allow re-submission
      const existing = await tx.dTRSubmission.findUnique({
        where: {
          tenantId_employeeId_periodStart_periodEnd: {
            tenantId:   ctx.tenantId,
            employeeId: ctx.employeeId,
            periodStart: ps,
            periodEnd:   pe,
          },
        },
      });

      if (existing) {
        if (existing.status !== "RETURNED") {
          return { alreadySubmitted: true, submission: existing };
        }
        // Re-submit after being returned
        const updated = await tx.dTRSubmission.update({
          where: { id: existing.id },
          data: {
            status:        "SUBMITTED",
            submittedAt:   new Date(),
            returnedReason: null,
            returnedAt:    null,
            returnedByRole: null,
          },
        });
        return { alreadySubmitted: false, submission: updated };
      }

      const submission = await tx.dTRSubmission.create({
        data: {
          tenantId:   ctx.tenantId,
          employeeId: ctx.employeeId,
          periodStart: ps,
          periodEnd:   pe,
          status:     "SUBMITTED",
        },
      });
      return { alreadySubmitted: false, submission };
    });

    if (result.alreadySubmitted) {
      return err("DTR for this period has already been submitted.", 409);
    }
    return ok({ id: result.submission.id, status: result.submission.status }, 201);
  } catch (e) {
    console.error("[ess/dtr POST]", e);
    return serverError();
  }
}
