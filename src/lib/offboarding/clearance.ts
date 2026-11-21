/**
 * PAY-197 part 1 (Mark, 20 Nov 2026): Offboarding cases and clearance.
 *
 *   Ruling 2: clearance signatories come from a company checklist HR sets up
 *   (items with assigned signatories), copied into each case and routed.
 *   Ruling 3: the final pay run cannot be finalized until clearance is
 *   complete (block, not warn). DOLE Labor Advisory 06-2020 expects final pay
 *   within 30 days of separation, so the case shows the days since the last
 *   working day.
 *
 * Only an item's signatory signs it off, and never the leaving employee
 * (HR reassigns it first). When every item is signed off the case is CLEARED.
 */
import type { Prisma, SeparationReason } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export class OffboardingError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

/** Days from the last working day to `now` (0 on the day itself). */
export function daysSinceSeparation(lastWorkingDay: Date, now = new Date()): number {
  const a = Date.UTC(lastWorkingDay.getUTCFullYear(), lastWorkingDay.getUTCMonth(), lastWorkingDay.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** DOLE Labor Advisory 06-2020: final pay within 30 days of separation. */
export const FINAL_PAY_DAYS = 30;

export async function openCase(tx: Tx, tenantId: string, args: {
  employeeId: string; separationReason: SeparationReason; lastWorkingDay: Date; createdByUserId: string | null; notes?: string | null;
}) {
  const existing = await tx.offboardingCase.findFirst({ where: { tenantId, employeeId: args.employeeId, status: { not: "CLOSED" } } });
  if (existing) return existing;
  const template = await tx.clearanceTemplateItem.findMany({
    where: { tenantId, isActive: true, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return tx.offboardingCase.create({
    data: {
      tenantId, employeeId: args.employeeId, separationReason: args.separationReason, lastWorkingDay: args.lastWorkingDay,
      notes: args.notes ?? null, createdByUserId: args.createdByUserId,
      status: template.length ? "OPEN" : "CLEARED", clearedAt: template.length ? null : new Date(),
      items: {
        create: template.map((t) => ({ tenantId, name: t.name, description: t.description, signatoryUserId: t.signatoryUserId, sortOrder: t.sortOrder })),
      },
    },
    include: { items: true },
  });
}

async function refreshCase(tx: Tx, caseId: string) {
  const pending = await tx.clearanceItem.count({ where: { caseId, status: "PENDING" } });
  const c = await tx.offboardingCase.findUniqueOrThrow({ where: { id: caseId } });
  if (pending === 0 && c.status === "OPEN") await tx.offboardingCase.update({ where: { id: caseId }, data: { status: "CLEARED", clearedAt: new Date() } });
  if (pending > 0 && c.status === "CLEARED") await tx.offboardingCase.update({ where: { id: caseId }, data: { status: "OPEN", clearedAt: null } });
}

export async function clearItem(tx: Tx, tenantId: string, userId: string | null, itemId: string, remarks?: string | null) {
  const item = await tx.clearanceItem.findFirst({ where: { id: itemId, tenantId }, include: { case: { include: { employee: { select: { userId: true } } } } } });
  if (!item) throw new OffboardingError("Clearance item not found", 404);
  if (item.case.status === "CLOSED") throw new OffboardingError("This offboarding case is closed.");
  if (!userId || item.signatoryUserId !== userId) throw new OffboardingError("Only this item's signatory signs it off.", 403);
  if (item.case.employee.userId && item.case.employee.userId === userId) throw new OffboardingError("The leaving employee cannot sign off their own clearance; HR reassigns the item.", 403);
  if (item.status === "CLEARED") return item;
  const done = await tx.clearanceItem.update({ where: { id: itemId }, data: { status: "CLEARED", clearedAt: new Date(), clearedByUserId: userId, remarks: remarks ?? null } });
  await refreshCase(tx, item.caseId);
  return done;
}

export async function reassignItem(tx: Tx, tenantId: string, itemId: string, signatoryUserId: string) {
  const item = await tx.clearanceItem.findFirst({ where: { id: itemId, tenantId } });
  if (!item) throw new OffboardingError("Clearance item not found", 404);
  if (item.status === "CLEARED") throw new OffboardingError("This item is already signed off.");
  const user = await tx.user.findFirst({ where: { id: signatoryUserId, tenantId }, select: { id: true } });
  if (!user) throw new OffboardingError("Signatory not found in this company", 404);
  return tx.clearanceItem.update({ where: { id: itemId }, data: { signatoryUserId } });
}

/**
 * Ruling 3: employees of a final pay run whose clearance is not complete.
 * An employee with no offboarding case (separated before the module) is not
 * held.
 */
export async function unclearedEmployees(tx: Tx, tenantId: string, employeeIds: string[]) {
  if (!employeeIds.length) return [];
  const cases = await tx.offboardingCase.findMany({
    where: { tenantId, employeeId: { in: employeeIds }, status: "OPEN" },
    include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } }, items: { where: { status: "PENDING" }, select: { name: true } } },
  });
  return cases.filter((c) => c.items.length > 0).map((c) => ({
    employeeId: c.employeeId,
    name: `${c.employee.firstName} ${c.employee.lastName} (${c.employee.employeeNumber})`,
    pending: c.items.map((i) => i.name),
  }));
}
