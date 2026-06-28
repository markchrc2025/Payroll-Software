/**
 * Job: billing.overdue  (cron — daily)
 *
 * Sweeps OPEN invoices whose `dueAt` has passed, flips them to OVERDUE, and
 * sends the tenant a single Unpaid Billing Notice on that transition. Already-
 * OVERDUE invoices are skipped, so a tenant is reminded once per invoice (not
 * on every sweep). Idempotent. Uses prismaAdmin (bypasses RLS).
 */

import prismaAdmin from "@/lib/prisma-admin";
import { sendUnpaidInvoiceEmail } from "@/lib/billing-email";

export async function handleBillingOverdueSweep(): Promise<void> {
  const now = new Date();

  const due = await prismaAdmin.invoice.findMany({
    where: {
      status: "OPEN",
      dueAt: { not: null, lt: now },
    },
    select: { id: true },
  });

  if (due.length === 0) return;

  for (const inv of due) {
    await prismaAdmin.invoice.update({
      where: { id: inv.id },
      data: { status: "OVERDUE" },
    });
    // Best-effort notice — internal try/catch, never throws.
    await sendUnpaidInvoiceEmail(inv.id);
  }

  console.log(`[jobs/billing.overdue] Marked ${due.length} invoice(s) overdue and notified.`);
}
