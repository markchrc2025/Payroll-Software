/**
 * Job: dtr.submitted
 *
 * Payload: { tenantId: string; submissionId: string }
 *
 * Emails the linked supervisor (if any) that a DTR submission is waiting for
 * their review.
 */

import prismaAdmin from "@/lib/prisma-admin";
import { sendDtrSubmittedEmail } from "@/lib/email";

export interface DtrSubmittedJobData {
  tenantId: string;
  submissionId: string;
}

export async function handleDtrSubmitted(job: { data: DtrSubmittedJobData }): Promise<void> {
  const { tenantId, submissionId } = job.data;

  const submission = await prismaAdmin.dTRSubmission.findFirst({
    where: { id: submissionId, tenantId },
    include: {
      employee: {
        select: {
          firstName: true,
          lastName: true,
          immediateSupervisor: {
            select: {
              firstName: true,
              lastName: true,
              user: { select: { email: true } },
            },
          },
        },
      },
    },
  });

  if (!submission) {
    console.warn(`[jobs/dtr.submitted] Submission ${submissionId} not found — skipping`);
    return;
  }

  const supervisor = submission.employee.immediateSupervisor;
  const supervisorEmail = supervisor?.user?.email;
  if (!supervisorEmail) {
    // No supervisor configured or no user account — skip silently
    return;
  }

  const employeeName = `${submission.employee.firstName} ${submission.employee.lastName}`;
  const supervisorName = `${supervisor!.firstName} ${supervisor!.lastName}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.sentire.app";

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  await sendDtrSubmittedEmail({
    to: supervisorEmail,
    supervisorName,
    employeeName,
    periodStart: fmt(submission.periodStart),
    periodEnd: fmt(submission.periodEnd),
    reviewUrl: `${appUrl}/dtr/submissions/${submissionId}`,
  }).catch((err) => {
    console.error(`[jobs/dtr.submitted] Email failed for ${supervisorEmail}:`, err);
  });

  console.log(`[jobs/dtr.submitted] Notified supervisor ${supervisorEmail} for submission ${submissionId}`);
}
