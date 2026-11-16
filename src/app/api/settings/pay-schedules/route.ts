/**
 * /api/settings/pay-schedules (PAY-141)
 *   GET: the company's schedule per scheduled cycle (saved, or the default),
 *        plus the fixed weekly and daily rules, and the next paydays of each.
 *   PUT: save one cycle's schedule. Body:
 *        { cycle: "SEMI_MONTHLY" | "MONTHLY",
 *          slots: [{ payDay, cutoffStartDay, cutoffEndDay }, ...] }
 *        Days 1 to 31; 30 and 31 mean month-end. The cutoffs must cover the
 *        month with no gap or overlap.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, ok, unauthorized } from "@/lib/api-response";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { DEFAULT_SCHEDULES, scheduleProblems, type PayScheduleConfig } from "@/lib/payroll/pay-schedule";
import { loadPaySchedule, paydaysFor, SCHEDULED_CYCLES } from "@/lib/payroll/pay-schedule-db";

const day = z.number().int().min(1).max(31);
const putSchema = z.object({
  cycle: z.enum(["SEMI_MONTHLY", "MONTHLY"]),
  slots: z.array(z.object({ payDay: day, cutoffStartDay: day, cutoffEndDay: day })).min(1).max(2),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "READ"]);
  if (denied) return denied;

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const ahead = new Date(today.getTime() + 62 * 86_400_000);
  const data = await withTenant(auth.tenantId, async (tx) => {
    const schedules = [];
    for (const cycle of SCHEDULED_CYCLES) {
      const saved = await loadPaySchedule(tx, auth.tenantId, cycle);
      schedules.push({
        cycle,
        isDefault: !saved,
        slots: (saved ?? DEFAULT_SCHEDULES[cycle]).slots,
        nextPaydays: (await paydaysFor(tx, auth.tenantId, cycle, today, ahead)).slice(0, 4),
      });
    }
    const weekly = (await paydaysFor(tx, auth.tenantId, "WEEKLY", today, ahead)).slice(0, 4);
    return { schedules, weekly: { rule: "Paid every Saturday for Saturday to Friday", nextPaydays: weekly }, daily: { rule: "Paid daily" } };
  });
  return ok(data);
}

export async function PUT(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["SETTINGS", "UPDATE"]);
  if (denied) return denied;

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  // Slots in payday order, month-end (30/31) last.
  const norm = (n: number) => (n >= 30 ? 31 : n);
  const slots = [...parsed.data.slots].sort((a, b) => norm(a.payDay) - norm(b.payDay));
  const config: PayScheduleConfig = { cycle: parsed.data.cycle, slots };
  const problems = scheduleProblems(config);
  if (problems.length) return err(problems.join(" "), 422, { problems });

  const [a, b] = slots;
  const row = {
    payDay1: a.payDay,
    cutoff1StartDay: a.cutoffStartDay,
    cutoff1EndDay: a.cutoffEndDay,
    payDay2: b?.payDay ?? null,
    cutoff2StartDay: b?.cutoffStartDay ?? null,
    cutoff2EndDay: b?.cutoffEndDay ?? null,
  };
  const saved = await withTenant(auth.tenantId, async (tx) => {
    const before = await loadPaySchedule(tx, auth.tenantId, config.cycle);
    await tx.paySchedule.upsert({
      where: { tenantId_cycle: { tenantId: auth.tenantId, cycle: config.cycle } },
      create: { tenantId: auth.tenantId, cycle: config.cycle, ...row },
      update: row,
    });
    return { before };
  });
  await writeAuditLog({
    tenantId: auth.tenantId,
    actorUserId: auth.userId ?? null,
    action: "UPDATE",
    entity: "PaySchedule",
    entityId: config.cycle,
    changes: { before: saved.before?.slots ?? DEFAULT_SCHEDULES[config.cycle].slots, after: slots },
    ipAddress: getClientIp(req),
  });
  return ok({ cycle: config.cycle, slots });
}
