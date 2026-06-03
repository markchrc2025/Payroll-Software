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

export interface PayrollRunJobData {
  tenantId: string;
  bookId: string;
}

export async function handlePayrollRun(job: { data: PayrollRunJobData }): Promise<void> {
  const { tenantId, bookId } = job.data;
  console.log(`[jobs/payroll.run] Starting compute for book ${bookId}`);
  try {
    await processRun(tenantId, bookId);
    console.log(`[jobs/payroll.run] Completed — book ${bookId} is now DRAFT`);
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
