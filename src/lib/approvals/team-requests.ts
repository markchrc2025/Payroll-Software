/**
 * PAY-191 part 2 (Wave 3, Mark 20 Nov 2026): Team requests in ESS. An employee
 * named as an approver in a request's approval chain (an ApprovalStep, from the
 * company's approval workflow, e.g. the immediate supervisor) sees the requests
 * waiting for them and approves or rejects them in ESS.
 *
 * Only the assigned approver of the step that is due acts here. With no chain,
 * a request waits for the owner or a role with the approve permission in the
 * dashboard, as before (unit 0.22 Am 1, ruling B5); this does not change that.
 * Modules: leave, overtime and undertime, the ones whose chain is snapshotted
 * at filing. Expense claims are left to HR, who sets their tax treatment when
 * approving (reading taken without a ruling, flagged to Mark).
 *
 * The final approval does what HR's approve route does: leave is debited and
 * written to the DTR (finalizeLeaveApproval), overtime is written to the day's
 * DTR (writeOtMinutes), undertime is approved.
 */
import type { ApprovalModule } from "@prisma/client";
import type { TenantTx } from "@/lib/with-tenant";
import { finalizeLeaveApproval } from "@/lib/leave/apply-to-dtr";
import { writeOtMinutes } from "@/lib/attendance/ot-minutes";

export const TEAM_MODULES = ["LEAVE", "OT", "UNDERTIME"] as const;
export type TeamModule = (typeof TEAM_MODULES)[number];

export interface TeamRequest {
  stepId: string;
  module: TeamModule;
  entityId: string;
  employee: { id: string; name: string; employeeNumber: string };
  /** What is asked: leave type and dates, OT hours, undertime minutes. */
  title: string;
  date: string;
  endDate: string | null;
  amount: string;
  reason: string;
  stepIndex: number;
  steps: number;
  filedAt: string;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** The step due for each entity: its lowest-index PENDING step. */
function dueSteps<T extends { entityId: string; stepIndex: number; status: string }>(rows: T[]): Map<string, T> {
  const due = new Map<string, T>();
  for (const r of rows) {
    if (r.status !== "PENDING") continue;
    const cur = due.get(r.entityId);
    if (!cur || r.stepIndex < cur.stepIndex) due.set(r.entityId, r);
  }
  return due;
}

/** Requests whose due step is assigned to `approverEmployeeId`, oldest first. */
export async function listTeamRequests(tx: TenantTx, tenantId: string, approverEmployeeId: string): Promise<TeamRequest[]> {
  const mine = await tx.approvalStep.findMany({
    where: { tenantId, approverEmployeeId, status: "PENDING", module: { in: [...TEAM_MODULES] } },
    select: { entityId: true },
  });
  if (mine.length === 0) return [];
  const entityIds = [...new Set(mine.map((m) => m.entityId))];
  const all = await tx.approvalStep.findMany({
    where: { tenantId, entityId: { in: entityIds }, module: { in: [...TEAM_MODULES] } },
    select: { id: true, module: true, entityId: true, stepIndex: true, status: true, approverEmployeeId: true },
  });
  const due = [...dueSteps(all).values()].filter((s) => s.approverEmployeeId === approverEmployeeId);
  const counts = new Map<string, number>();
  for (const s of all) counts.set(s.entityId, (counts.get(s.entityId) ?? 0) + 1);
  const ids = (m: ApprovalModule) => due.filter((s) => s.module === m).map((s) => s.entityId);

  const emp = { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } as const;
  const [leaves, ots, uts] = await Promise.all([
    tx.leaveTransaction.findMany({
      where: { tenantId, id: { in: ids("LEAVE") }, approvalStatus: "PENDING" },
      include: { employee: emp, leaveType: { select: { name: true, unit: true } } },
    }),
    tx.oTApplication.findMany({ where: { tenantId, id: { in: ids("OT") }, status: "PENDING" }, include: { employee: emp } }),
    tx.undertimeRequest.findMany({ where: { tenantId, id: { in: ids("UNDERTIME") }, status: "PENDING" }, include: { employee: emp } }),
  ]);
  const stepOf = new Map(due.map((s) => [s.entityId, s]));
  const who = (e: { id: string; firstName: string; lastName: string; employeeNumber: string }) => ({
    id: e.id, name: `${e.firstName} ${e.lastName}`, employeeNumber: e.employeeNumber,
  });
  const base = (entityId: string) => {
    const s = stepOf.get(entityId)!;
    return { stepId: s.id, entityId, stepIndex: s.stepIndex, steps: counts.get(entityId) ?? 1 };
  };

  const out: TeamRequest[] = [
    ...leaves.map((l) => ({
      ...base(l.id), module: "LEAVE" as const, employee: who(l.employee),
      title: l.leaveType.name, date: iso(l.startDate)!, endDate: iso(l.endDate),
      amount: `${Number(l.amount)} ${l.leaveType.unit === "HOURS" ? "hour(s)" : "day(s)"}`,
      reason: l.reason ?? "", filedAt: l.createdAt.toISOString(),
    })),
    ...ots.map((o) => ({
      ...base(o.id), module: "OT" as const, employee: who(o.employee),
      title: "Overtime", date: o.date.toISOString(), endDate: null,
      amount: `${Number(o.hours)} hour(s)`, reason: o.justification, filedAt: o.createdAt.toISOString(),
    })),
    ...uts.map((u) => ({
      ...base(u.id), module: "UNDERTIME" as const, employee: who(u.employee),
      title: "Undertime", date: u.date.toISOString(), endDate: null,
      amount: `${u.undertimeMinutes} min`, reason: u.reason, filedAt: u.createdAt.toISOString(),
    })),
  ];
  return out.sort((a, b) => a.filedAt.localeCompare(b.filedAt));
}

export type StepActionResult =
  | { ok: true; module: TeamModule; entityId: string; final: boolean; status: "APPROVED" | "REJECTED" | "PENDING" }
  | { ok: false; code: "NOT_FOUND" | "NOT_YOURS" | "NOT_DUE" | "NOT_PENDING" | "SELF" | "REASON_REQUIRED" };

/**
 * The assigned approver of the step that is due approves or rejects it.
 * `actorUserId` is the approver's own user account, if they have one (for the
 * audit columns); the step records who acted either way.
 */
export async function actOnTeamStep(
  tx: TenantTx,
  p: {
    tenantId: string;
    stepId: string;
    approverEmployeeId: string;
    actorUserId: string | null;
    decision: "APPROVE" | "REJECT";
    note?: string | null;
    now?: Date;
  },
): Promise<StepActionResult> {
  const now = p.now ?? new Date();
  const step = await tx.approvalStep.findFirst({ where: { id: p.stepId, tenantId: p.tenantId } });
  if (!step || !(TEAM_MODULES as readonly string[]).includes(step.module)) return { ok: false, code: "NOT_FOUND" };
  if (step.approverEmployeeId !== p.approverEmployeeId) return { ok: false, code: "NOT_YOURS" };
  if (step.status !== "PENDING") return { ok: false, code: "NOT_PENDING" };
  const mod = step.module as TeamModule;
  const reason = p.note?.trim() || null;
  if (p.decision === "REJECT" && !reason) return { ok: false, code: "REASON_REQUIRED" };

  const entity =
    mod === "LEAVE"
      ? await tx.leaveTransaction.findFirst({ where: { id: step.entityId, tenantId: p.tenantId }, select: { employeeId: true, approvalStatus: true } })
          .then((r) => r && { employeeId: r.employeeId, status: r.approvalStatus as string })
      : mod === "OT"
        ? await tx.oTApplication.findFirst({ where: { id: step.entityId, tenantId: p.tenantId }, select: { employeeId: true, status: true } })
        : await tx.undertimeRequest.findFirst({ where: { id: step.entityId, tenantId: p.tenantId }, select: { employeeId: true, status: true } });
  if (!entity) return { ok: false, code: "NOT_FOUND" };
  if (entity.employeeId === p.approverEmployeeId) return { ok: false, code: "SELF" };
  if (entity.status !== "PENDING") return { ok: false, code: "NOT_PENDING" };

  const steps = await tx.approvalStep.findMany({
    where: { tenantId: p.tenantId, module: step.module, entityId: step.entityId },
    orderBy: { stepIndex: "asc" },
  });
  const due = steps.find((s) => s.status === "PENDING");
  if (!due || due.id !== step.id) return { ok: false, code: "NOT_DUE" };

  if (p.decision === "REJECT") {
    await tx.approvalStep.update({
      where: { id: step.id },
      data: { status: "REJECTED", actedByUserId: p.actorUserId, actedAt: now, note: reason },
    });
    if (mod === "LEAVE") {
      await tx.leaveTransaction.update({
        where: { id: step.entityId },
        data: { approvalStatus: "REJECTED", approvedByUserId: p.actorUserId, approvedAt: now, rejectionReason: reason },
      });
    } else if (mod === "OT") {
      await tx.oTApplication.update({
        where: { id: step.entityId },
        data: { status: "REJECTED", approverId: p.actorUserId, rejectedAt: now, rejectionReason: reason },
      });
    } else {
      await tx.undertimeRequest.update({
        where: { id: step.entityId },
        data: { status: "REJECTED", approverId: p.actorUserId, rejectedAt: now, rejectionReason: reason },
      });
    }
    return { ok: true, module: mod, entityId: step.entityId, final: true, status: "REJECTED" };
  }

  await tx.approvalStep.update({
    where: { id: step.id },
    data: { status: "APPROVED", actedByUserId: p.actorUserId, actedAt: now, note: reason },
  });
  const next = steps.find((s) => s.stepIndex > step.stepIndex && s.status === "PENDING");
  if (next) {
    const data = { currentStepIndex: next.stepIndex };
    if (mod === "LEAVE") await tx.leaveTransaction.update({ where: { id: step.entityId }, data });
    else if (mod === "OT") await tx.oTApplication.update({ where: { id: step.entityId }, data });
    else await tx.undertimeRequest.update({ where: { id: step.entityId }, data });
    return { ok: true, module: mod, entityId: step.entityId, final: false, status: "PENDING" };
  }

  if (mod === "LEAVE") {
    await tx.leaveTransaction.update({
      where: { id: step.entityId },
      data: { approvalStatus: "APPROVED", approvedByUserId: p.actorUserId, approvedAt: now, currentStepIndex: step.stepIndex },
    });
    await finalizeLeaveApproval(tx, step.entityId);
  } else if (mod === "OT") {
    const updated = await tx.oTApplication.update({
      where: { id: step.entityId },
      data: { status: "APPROVED", approverId: p.actorUserId, approvedAt: now, currentStepIndex: step.stepIndex },
    });
    await writeOtMinutes(tx, p.tenantId, updated);
  } else {
    await tx.undertimeRequest.update({
      where: { id: step.entityId },
      data: { status: "APPROVED", approverId: p.actorUserId, approvedAt: now, currentStepIndex: step.stepIndex },
    });
  }
  return { ok: true, module: mod, entityId: step.entityId, final: true, status: "APPROVED" };
}
