/**
 * POST /api/dtr/bulk-approve
 *
 * PAY-178 (staging chain test, 17 Nov 2026): HR could approve DTR only through
 * an employee's ESS submission. Days from the biometric import or the kiosk,
 * with no ESS submission, had no way to be approved in the app, and approving
 * one day at a time is not workable. This approves every PENDING day in a date
 * range, for all employees or the ones chosen, in one step.
 *
 * Body: { from: "YYYY-MM-DD", to: "YYYY-MM-DD", employeeIds?: string[] }
 *
 * The rules of single-day approval hold for every day:
 *  - only PENDING, unlocked days;
 *  - a day with a missing punch is skipped (PAY-177) and listed, so HR can fix
 *    the time and approve it after;
 *  - an approver's own days are skipped (no self-approval).
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { err, ok } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const bodySchema = z
  .object({
    from: ymd,
    to: ymd,
    employeeIds: z.array(z.string().min(1)).max(1000).optional(),
  })
  .refine((b) => b.from <= b.to, { message: "from must be on or before to", path: ["to"] })
  .refine(
    (b) => (Date.parse(`${b.to}T00:00:00Z`) - Date.parse(`${b.from}T00:00:00Z`)) / 86_400_000 <= 62,
    { message: "Approve at most 62 days at a time", path: ["to"] },
  );

export interface BulkApproveResult {
  approved: number;
  skippedMissingPunch: { employeeId: string; employeeNumber: string; name: string; date: string }[];
  skippedOwn: number;
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "TIMESHEETS", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());
  const { from, to, employeeIds } = parsed.data;

  const result = await withTenant(auth.tenantId, async (tx): Promise<BulkApproveResult> => {
    const own = auth.userId
      ? await tx.employee.findFirst({ where: { userId: auth.userId, tenantId: auth.tenantId }, select: { id: true } })
      : null;

    const pending = await tx.dTRRecord.findMany({
      where: {
        tenantId: auth.tenantId,
        approvalStatus: "PENDING",
        isLocked: false,
        date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
        ...(employeeIds && { employeeId: { in: employeeIds } }),
      },
      select: {
        id: true,
        date: true,
        employeeId: true,
        hasMissingPunch: true,
        employee: { select: { employeeNumber: true, firstName: true, lastName: true } },
      },
      orderBy: [{ date: "asc" }],
    });

    const ownDays = pending.filter((d) => own && d.employeeId === own.id);
    const missing = pending.filter((d) => d.hasMissingPunch && !(own && d.employeeId === own.id));
    const approvable = pending.filter((d) => !d.hasMissingPunch && !(own && d.employeeId === own.id));

    if (approvable.length > 0) {
      await tx.dTRRecord.updateMany({
        // Re-check the status in the write so a day changed meanwhile is left alone.
        where: { id: { in: approvable.map((d) => d.id) }, approvalStatus: "PENDING", isLocked: false, hasMissingPunch: false },
        data: { approvalStatus: "APPROVED", approvedById: auth.userId ?? null, approvedAt: new Date() },
      });
    }

    return {
      approved: approvable.length,
      skippedMissingPunch: missing.map((d) => ({
        employeeId: d.employeeId,
        employeeNumber: d.employee.employeeNumber,
        name: `${d.employee.firstName} ${d.employee.lastName}`.trim(),
        date: d.date.toISOString().slice(0, 10),
      })),
      skippedOwn: ownDays.length,
    };
  });

  await writeAuditLog({
    tenantId: auth.tenantId,
    actorUserId: auth.userId,
    action: "APPROVE",
    entity: "DTRRecord",
    changes: { bulk: true, from, to, employees: employeeIds?.length ?? "all", approved: result.approved, skippedMissingPunch: result.skippedMissingPunch.length, skippedOwn: result.skippedOwn },
    ipAddress: getClientIp(req),
  });

  return ok(result, `${result.approved} day(s) approved`);
}
