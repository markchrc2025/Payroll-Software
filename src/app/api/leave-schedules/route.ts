/**
 * Wave E3 (PAY-215, decision 9): company shutdowns and blackout dates
 * (src/lib/leave/schedule.ts).
 *   GET   the company's schedules (LEAVES:READ)
 *   POST  one (LEAVES:UPDATE): { kind, name, startDate, endDate, departmentIds?, leaveTypeId? (shutdown), blackoutMode? (blackout) }
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";

const D = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z.object({
  kind: z.enum(["SHUTDOWN", "BLACKOUT"]),
  name: z.string().trim().min(1).max(120),
  startDate: D, endDate: D,
  departmentIds: z.array(z.string()).default([]),
  leaveTypeId: z.string().min(1).nullable().optional(),
  blackoutMode: z.enum(["BLOCK", "FLAG"]).nullable().optional(),
}).superRefine((v, c) => {
  if (v.endDate < v.startDate) c.addIssue({ code: "custom", path: ["endDate"], message: "The end is before the start" });
  if (v.kind === "SHUTDOWN" && !v.leaveTypeId) c.addIssue({ code: "custom", path: ["leaveTypeId"], message: "Choose the leave type the shutdown is charged to" });
  if (v.kind === "BLACKOUT" && !v.blackoutMode) c.addIssue({ code: "custom", path: ["blackoutMode"], message: "Choose whether requests are blocked or flagged" });
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["LEAVES", "READ"]);
  if (denied) return denied;
  return ok(await withTenant(auth.tenantId, (tx) => tx.leaveSchedule.findMany({ where: { tenantId: auth.tenantId, deletedAt: null }, orderBy: { startDate: "desc" } })));
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["LEAVES", "UPDATE"]);
  if (denied) return denied;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Check the schedule", 422);
  const d = parsed.data;
  const row = await withTenant(auth.tenantId, async (tx) => {
    if (d.leaveTypeId && !(await tx.leaveType.count({ where: { id: d.leaveTypeId, tenantId: auth.tenantId, deletedAt: null } }))) return null;
    return tx.leaveSchedule.create({ data: {
      tenantId: auth.tenantId, kind: d.kind, name: d.name, startDate: new Date(`${d.startDate}T00:00:00.000Z`), endDate: new Date(`${d.endDate}T00:00:00.000Z`),
      departmentIds: d.departmentIds, leaveTypeId: d.kind === "SHUTDOWN" ? d.leaveTypeId! : null, blackoutMode: d.kind === "BLACKOUT" ? d.blackoutMode! : null,
    } });
  });
  if (!row) return err("That leave type is not the company's", 422);
  void writeAuditLog({ tenantId: auth.tenantId, actorUserId: auth.userId, action: "CREATE", entity: "LeaveSchedule", entityId: row.id, ipAddress: getClientIp(req) });
  return ok(row, "Saved", 201);
}
