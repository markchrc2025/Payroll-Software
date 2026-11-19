/**
 * PAY-172 (Mark, 19 Nov 2026): warn HR and each employee's immediate
 * supervisor about employees in a payroll run without an approved DTR for
 * days of the cutoff (counted absent, or held under the strict DTR policy).
 *
 * HR = the user who created the run, else the company owner. A supervisor is
 * emailed at their sign-in email (or work email) about their own people.
 * Each employee is emailed about once per run: `notifiedAt` is stored on the
 * run's dtrGaps and kept across recomputes.
 */
import type { PrismaClient } from "@prisma/client";
import { sendDtrGapEmail } from "@/lib/email";
import type { DtrGap } from "@/lib/payroll/persist";

type Db = Pick<PrismaClient, "payrollBook" | "employee" | "user" | "tenant">;
type Send = typeof sendDtrGapEmail;

const fmt = (d: Date) => d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export async function notifyDtrGaps(
  db: Db,
  tenantId: string,
  bookId: string,
  deps: { send?: Send; now?: Date; appUrl?: string } = {},
): Promise<{ emailed: string[] }> {
  const send = deps.send ?? sendDtrGapEmail;
  const book = await db.payrollBook.findFirst({
    where: { id: bookId, tenantId },
    select: { id: true, periodStart: true, periodEnd: true, dtrGaps: true, createdByUserId: true },
  });
  const gaps = (Array.isArray(book?.dtrGaps) ? book!.dtrGaps : []) as unknown as DtrGap[];
  const fresh = gaps.filter((g) => !g.notifiedAt);
  if (!book || fresh.length === 0) return { emailed: [] };

  const employees = await db.employee.findMany({
    where: { tenantId, id: { in: fresh.map((g) => g.employeeId) } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      immediateSupervisor: { select: { id: true, firstName: true, lastName: true, workEmail: true, user: { select: { email: true } } } },
    },
  });
  const byId = new Map(employees.map((e) => [e.id, e]));
  const row = (g: DtrGap) => {
    const e = byId.get(g.employeeId);
    return { name: e ? `${e.firstName} ${e.lastName}` : g.employeeId, days: g.days, held: g.held };
  };
  const periodLabel = `${fmt(book.periodStart)} to ${fmt(book.periodEnd)}`;
  const runUrl = `${deps.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? ""}/payroll/${book.id}`;
  const emailed: string[] = [];

  // HR: the run's creator, else the company owner.
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { ownerUserId: true } });
  const hrUserId = book.createdByUserId ?? tenant?.ownerUserId ?? null;
  const hr = hrUserId ? await db.user.findUnique({ where: { id: hrUserId }, select: { email: true, firstName: true } }) : null;
  if (hr?.email) {
    await send({ to: hr.email, recipientName: hr.firstName ?? "there", periodLabel, rows: fresh.map(row), runUrl });
    emailed.push(hr.email);
  }

  // Each immediate supervisor: only their own people.
  const bySupervisor = new Map<string, { to: string; name: string; rows: ReturnType<typeof row>[] }>();
  for (const g of fresh) {
    const sup = byId.get(g.employeeId)?.immediateSupervisor;
    const to = sup?.user?.email ?? sup?.workEmail ?? null;
    if (!sup || !to || to === hr?.email) continue;
    const entry = bySupervisor.get(sup.id) ?? { to, name: sup.firstName, rows: [] };
    entry.rows.push(row(g));
    bySupervisor.set(sup.id, entry);
  }
  for (const s of bySupervisor.values()) {
    await send({ to: s.to, recipientName: s.name, periodLabel, rows: s.rows, runUrl });
    emailed.push(s.to);
  }

  const at = (deps.now ?? new Date()).toISOString();
  const freshIds = new Set(fresh.map((g) => g.employeeId));
  await db.payrollBook.update({
    where: { id: book.id },
    data: { dtrGaps: gaps.map((g) => (freshIds.has(g.employeeId) ? { ...g, notifiedAt: at } : g)) },
  });
  return { emailed };
}
