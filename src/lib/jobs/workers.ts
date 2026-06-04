/**
 * Register all pg-boss workers and cron schedules.
 *
 * Called once from src/instrumentation.ts on the Node.js runtime.
 * Each worker is registered idempotently — calling this multiple times is safe.
 */

import { startJobQueue } from "./client";
import { handlePayrollRun, PayrollRunJobData } from "./handlers/payroll-run";
import { handleOtApproved, OtApprovedJobData } from "./handlers/ot-approved";
import { handleDtrSubmitted, DtrSubmittedJobData } from "./handlers/dtr-submitted";
import { handlePayslipPublish, PayslipPublishJobData } from "./handlers/payslip-publish";
import { handleLeaveAccrual } from "./handlers/leave-accrual";

export const JOB_NAMES = {
  PAYROLL_RUN: "payroll.run",
  OT_APPROVED: "ot.approved",
  DTR_SUBMITTED: "dtr.submitted",
  PAYSLIP_PUBLISH: "payslip.publish",
  LEAVE_ACCRUAL: "leave.accrual",
} as const;

const RETRY_LIMIT = 3;
const RETRY_DELAY = 60; // seconds

export async function registerWorkers(): Promise<void> {
  const boss = await startJobQueue();

  boss.on("error", (err: Error) => {
    console.error("[pg-boss] error:", err);
  });

  // Ensure all queues exist before registering workers
  await Promise.all(
    Object.values(JOB_NAMES).map((name) =>
      boss.createQueue(name).catch(() => {/* already exists — ignore */})
    )
  );

  // Payroll gross-to-net computation
  await boss.work<PayrollRunJobData>(
    JOB_NAMES.PAYROLL_RUN,
    { localConcurrency: 2 },
    async (jobs) => { for (const job of jobs) await handlePayrollRun(job); },
  );

  // OT approved employee notification
  await boss.work<OtApprovedJobData>(
    JOB_NAMES.OT_APPROVED,
    { localConcurrency: 5 },
    async (jobs) => { for (const job of jobs) await handleOtApproved(job); },
  );

  // DTR submission supervisor notification
  await boss.work<DtrSubmittedJobData>(
    JOB_NAMES.DTR_SUBMITTED,
    { localConcurrency: 5 },
    async (jobs) => { for (const job of jobs) await handleDtrSubmitted(job); },
  );

  // Payslip PDF generation + R2 upload
  await boss.work<PayslipPublishJobData>(
    JOB_NAMES.PAYSLIP_PUBLISH,
    { localConcurrency: 3 },
    async (jobs) => { for (const job of jobs) await handlePayslipPublish(job); },
  );

  // Monthly leave accrual cron — 1st of every month at 00:05 PH time (UTC 16:05 prev day)
  await boss.schedule(
    JOB_NAMES.LEAVE_ACCRUAL,
    "5 16 * * *", // equivalent to 00:05 PH time (UTC+8)
    {},
    { tz: "UTC" },
  );

  await boss.work(
    JOB_NAMES.LEAVE_ACCRUAL,
    { localConcurrency: 1 },
    () => handleLeaveAccrual(),
  );

  console.log("[pg-boss] Workers registered:", Object.values(JOB_NAMES).join(", "));
}

// ---------------------------------------------------------------------------
// Enqueue helpers — used by API routes
// ---------------------------------------------------------------------------

export async function enqueuePayrollRun(data: { tenantId: string; bookId: string }) {
  const boss = await startJobQueue();
  return boss.send(JOB_NAMES.PAYROLL_RUN, data, { retryLimit: RETRY_LIMIT, retryDelay: RETRY_DELAY });
}

export async function enqueueOtApproved(data: { tenantId: string; otApplicationId: string }) {
  const boss = await startJobQueue();
  return boss.send(JOB_NAMES.OT_APPROVED, data, { retryLimit: RETRY_LIMIT, retryDelay: RETRY_DELAY });
}

export async function enqueueDtrSubmitted(data: { tenantId: string; submissionId: string }) {
  const boss = await startJobQueue();
  return boss.send(JOB_NAMES.DTR_SUBMITTED, data, { retryLimit: RETRY_LIMIT, retryDelay: RETRY_DELAY });
}

export async function enqueuePayslipPublish(data: { tenantId: string; bookId: string; sheetId: string }) {
  const boss = await startJobQueue();
  return boss.send(JOB_NAMES.PAYSLIP_PUBLISH, data, { retryLimit: RETRY_LIMIT, retryDelay: RETRY_DELAY });
}
