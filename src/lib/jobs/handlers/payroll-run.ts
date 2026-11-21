/**
 * Job: payroll.run
 *
 * Payload: { tenantId: string; bookId: string }
 *
 * Runs the full gross-to-net computation for a PROCESSING PayrollBook and
 * transitions it to DRAFT (ready for operator review and finalization).
 * On unhandled error the book is left in PROCESSING — pg-boss will retry up
 * to retryLimit times before marking the job failed.
 */

import { processRun, PayrollRunNotFoundError, PayrollRunConflictError } from "@/lib/payroll/persist";
import prismaAdmin from "@/lib/prisma-admin";
import { notifyDtrGaps } from "@/lib/payroll/dtr-gap-notify";
import { recordJobWrite, systemPrincipal } from "@/lib/jobs/principal";

export interface PayrollRunJobData {
  tenantId: string;
  bookId: string;
  /** PAY-205: the user whose request queued the run. */
  enqueuedByUserId?: string | null;
}

export async function handlePayrollRun(job: { data: PayrollRunJobData }): Promise<void> {
  const { tenantId, bookId } = job.data;
  console.log(`[jobs/payroll.run] Starting compute for book ${bookId}`);
  try {
    await processRun(tenantId, bookId);
    await recordJobWrite(systemPrincipal("payroll.run", job.data.enqueuedByUserId), { tenantId, entity: "PayrollBook", entityId: bookId, summary: { after: { status: "DRAFT" }, computed: true } });
    console.log(`[jobs/payroll.run] Completed — book ${bookId} is now DRAFT`);
    // PAY-172: warn HR and supervisors about employees without approved DTR.
    await notifyDtrGaps(prismaAdmin, tenantId, bookId).catch((e) =>
      console.error(`[jobs/payroll.run] DTR warning email failed for book ${bookId}:`, e),
    );
  } catch (err) {
    if (err instanceof PayrollRunNotFoundError) {
      // Book was deleted before job ran — nothing to do.
      console.warn(`[jobs/payroll.run] Book ${bookId} not found — skipping`);
      return;
    }
    if (err instanceof PayrollRunConflictError) {
      console.warn(`[jobs/payroll.run] Conflict for book ${bookId}: ${(err as Error).message}`);
      return;
    }
    console.error(`[jobs/payroll.run] Failed for book ${bookId}:`, err);
    throw err; // let pg-boss retry
  }
}
