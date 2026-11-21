/**
 * Wave C0 (PAY-213): the shared approval inbox. One list per module of the
 * requests waiting for the signed-in approver, with what the approver needs
 * to decide, and the exceptions that keep an item out of a bulk approval.
 *
 * Who sees an item (the same rules the approve routes enforce):
 * - the employee assigned to the request's due approval step; or
 * - the company owner or a role holding the module's approve permission
 *   (LEAVE: LEAVES:APPROVE; EXPENSE: PAYROLL:APPROVE; DOCUMENT: DOCUMENTS:APPROVE);
 * - never the employee the request is about.
 *
 * The inbox only lists. Approving and rejecting go through each module's own
 * approve and reject routes, so every rule stays in one place.
 */
import type { Prisma } from "@prisma/client";
import type { AuthContext } from "@/lib/auth";
import type { TenantTx } from "@/lib/with-tenant";
import { callerEmployeeId, holdsApprovePermission, holdsPermission } from "./second-party";
import { renderRequest } from "@/lib/documents/templates";
import type { InboxItem, InboxModule } from "./inbox-view";

export type { InboxItem, InboxModule } from "./inbox-view";

const attrs = (j: Prisma.JsonValue | null | undefined) => (j && typeof j === "object" && !Array.isArray(j) ? j : {}) as Record<string, unknown>;
const peso = (c: bigint | string) => `₱${(Number(c) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** The step due for each entity: its lowest-index PENDING step. */
async function dueStepsByEntity(tx: TenantTx, tenantId: string, module: "LEAVE" | "EXPENSE" | "DOCUMENT", ids: string[]) {
  const steps = ids.length
    ? await tx.approvalStep.findMany({ where: { tenantId, module, entityId: { in: ids } }, select: { id: true, entityId: true, stepIndex: true, status: true, approverEmployeeId: true } })
    : [];
  const due = new Map<string, (typeof steps)[number]>();
  const any = new Set<string>();
  for (const s of steps) {
    any.add(s.entityId);
    if (s.status !== "PENDING") continue;
    const cur = due.get(s.entityId);
    if (!cur || s.stepIndex < cur.stepIndex) due.set(s.entityId, s);
  }
  return { due, hasChain: any };
}

export async function listInbox(tx: TenantTx, auth: AuthContext, module: InboxModule): Promise<InboxItem[]> {
  const me = await callerEmployeeId(tx, auth);
  const hr = await holdsApprovePermission(tx, auth, module);
  const tenantId = auth.tenantId;
  const emp = { select: { id: true, firstName: true, lastName: true, employeeNumber: true, departmentId: true, department: { select: { name: true } } } } as const;
  const who = (e: { id: string; firstName: string; lastName: string; employeeNumber: string; department: { name: string } | null }) =>
    ({ id: e.id, name: `${e.lastName}, ${e.firstName}`, employeeNumber: e.employeeNumber, department: e.department?.name ?? null });

  if (module === "EXPENSE") {
    if (!hr) return [];
    const claims = await tx.expenseClaim.findMany({
      where: { tenantId, status: "SUBMITTED", ...(me ? { employeeId: { not: me } } : {}) },
      include: { employee: emp, categoryItem: { select: { name: true, attributes: true } }, typeItem: { select: { name: true, attributes: true } } },
      orderBy: { updatedAt: "asc" },
    });
    return claims.map((c) => {
      const flags = (Array.isArray(c.limitFlags) ? c.limitFlags : []) as { kind: string; limitCents: string; amountCents?: string; monthTotalCents?: string; month?: string }[];
      const exceptions = flags.map((f) => f.kind === "PER_CLAIM"
        ? `Over the per-claim limit of ${peso(f.limitCents)}`
        : `Month total ${peso(f.monthTotalCents ?? "0")} is over the monthly limit of ${peso(f.limitCents)} (${f.month})`);
      if (!c.receiptKey) exceptions.push("No receipt attached");
      const treatment = (attrs(c.typeItem?.attributes).taxTreatment as string | undefined) ?? null;
      if (!treatment) exceptions.push("Its type sets no tax treatment: choose one");
      return {
        module, id: c.id, stepId: null, via: "HR" as const, employee: who(c.employee),
        title: c.categoryItem?.name ?? c.category, date: ymd(c.claimDate)!, endDate: null, amount: peso(c.amountCents),
        reason: c.description, filedAt: c.updatedAt.toISOString(), exceptions,
        details: { type: c.typeItem?.name ?? null, taxTreatment: treatment, hasReceipt: !!c.receiptKey },
      };
    });
  }

  if (module === "DOCUMENT") {
    const reqs = await tx.documentRequest.findMany({
      where: { tenantId, status: "PENDING", ...(me ? { employeeId: { not: me } } : {}) },
      include: { employee: emp, template: { select: { name: true, showsSalary: true } } },
      orderBy: { createdAt: "asc" },
    });
    const { due, hasChain } = await dueStepsByEntity(tx, tenantId, "DOCUMENT", reqs.map((r) => r.id));
    const seesPay = await holdsPermission(tx, auth, ["PAYROLL", "READ"]);
    const out: InboxItem[] = [];
    for (const r of reqs) {
      const step = due.get(r.id);
      const mineStep = !!step && !!me && step.approverEmployeeId === me;
      if (!mineStep && !hr) continue;
      const exceptions: string[] = [];
      let preview: { title: string; body: string } | null = null;
      // A letter that shows pay is previewed only to someone who may see pay.
      if (r.template.showsSalary && !seesPay) exceptions.push("Shows pay: only a role that may see pay can approve it");
      else preview = await renderRequest(tx, tenantId, r.id);
      out.push({
        module, id: r.id, stepId: mineStep ? step!.id : null,
        via: mineStep ? "STEP" : hasChain.has(r.id) ? "HR_OVERRIDE" : "HR",
        employee: who(r.employee), title: r.template.name, date: ymd(r.createdAt)!, endDate: null, amount: "",
        reason: r.purpose ?? "", filedAt: r.createdAt.toISOString(), exceptions,
        details: { showsSalary: r.template.showsSalary, preview },
      });
    }
    return out;
  }

  // LEAVE
  const pending = await tx.leaveTransaction.findMany({
    where: { tenantId, type: "USAGE", approvalStatus: "PENDING", ...(me ? { employeeId: { not: me } } : {}) },
    include: { employee: emp, leaveType: { select: { id: true, name: true, unit: true } } },
    orderBy: { createdAt: "asc" },
  });
  const { due, hasChain } = await dueStepsByEntity(tx, tenantId, "LEAVE", pending.map((p) => p.id));
  const mine = pending.filter((p) => {
    const step = due.get(p.id);
    if (me && step?.approverEmployeeId === me) return true;
    return hr; // HR approves where there is no chain, and may override a chain (the leave route's rule)
  });
  if (!mine.length) return [];

  const years = [...new Set(mine.map((p) => (p.startDate ?? p.createdAt).getUTCFullYear()))];
  const balances = await tx.leaveBalance.findMany({
    where: { tenantId, employeeId: { in: [...new Set(mine.map((p) => p.employeeId))] }, year: { in: years } },
  });
  const bal = new Map(balances.map((b) => [`${b.employeeId}|${b.leaveTypeId}|${b.year}`, b]));
  const pendingTotals = new Map<string, number>();
  for (const p of pending) {
    const k = `${p.employeeId}|${p.leaveTypeId}|${(p.startDate ?? p.createdAt).getUTCFullYear()}`;
    pendingTotals.set(k, (pendingTotals.get(k) ?? 0) + Number(p.paidUnits));
  }

  const deptIds = [...new Set(mine.map((p) => p.employee.departmentId).filter((d): d is string => !!d))];
  const minStart = new Date(Math.min(...mine.map((p) => (p.startDate ?? p.createdAt).getTime())));
  const maxEnd = new Date(Math.max(...mine.map((p) => (p.endDate ?? p.startDate ?? p.createdAt).getTime())));
  const overlapping = deptIds.length
    ? await tx.leaveTransaction.findMany({
        where: {
          tenantId, type: "USAGE", approvalStatus: { in: ["APPROVED", "PENDING"] },
          employee: { departmentId: { in: deptIds } },
          startDate: { lte: maxEnd }, endDate: { gte: minStart },
        },
        select: { id: true, employeeId: true, startDate: true, endDate: true, approvalStatus: true, employee: { select: { firstName: true, lastName: true, departmentId: true } } },
      })
    : [];

  return mine.map((p) => {
    const start = p.startDate ?? p.createdAt, end = p.endDate ?? start;
    const year = start.getUTCFullYear();
    const k = `${p.employeeId}|${p.leaveTypeId}|${year}`;
    const b = bal.get(k);
    const available = b ? Number(b.openingBalance) + Number(b.earned) - Number(b.used) - Number(b.forfeited) - Number(b.convertedToCash) : 0;
    // After this one and every other pending one of the same type and year.
    const after = available - (pendingTotals.get(k) ?? 0);
    const coverage = overlapping.filter((o) => o.id !== p.id && o.employeeId !== p.employeeId && o.employee.departmentId === p.employee.departmentId
      && o.startDate! <= end && o.endDate! >= start);
    const exceptions: string[] = [];
    if (Number(p.paidUnits) > 0 && after < 0) exceptions.push(`Balance would be ${after.toFixed(2)} after the pending requests`);
    if (Number(p.unpaidUnits) > 0) exceptions.push(`${Number(p.unpaidUnits)} unpaid ${p.leaveType.unit === "HOURS" ? "hour(s)" : "day(s)"}`);
    if (coverage.length) exceptions.push(`${coverage.length} other${coverage.length === 1 ? "" : "s"} in the department off on these dates`);
    const step = due.get(p.id);
    return {
      module, id: p.id, stepId: step && me && step.approverEmployeeId === me ? step.id : null,
      via: step && me && step.approverEmployeeId === me ? ("STEP" as const) : hasChain.has(p.id) ? ("HR_OVERRIDE" as const) : ("HR" as const),
      employee: who(p.employee), title: p.leaveType.name, date: ymd(start)!, endDate: ymd(end),
      amount: `${Number(p.amount)} ${p.leaveType.unit === "HOURS" ? "hour(s)" : "day(s)"}`,
      reason: p.reason ?? "", filedAt: p.createdAt.toISOString(), exceptions,
      details: {
        balanceAvailable: available.toFixed(2), balanceAfter: after.toFixed(2),
        coverage: coverage.map((o) => `${o.employee.firstName} ${o.employee.lastName} (${o.approvalStatus === "APPROVED" ? "approved" : "pending"}, ${ymd(o.startDate)} to ${ymd(o.endDate)})`),
      },
    };
  });
}
