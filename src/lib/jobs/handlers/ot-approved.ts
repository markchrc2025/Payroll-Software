/**
 * Job: ot.approved
 *
 * Payload: { tenantId: string; otApplicationId: string }
 *
 * Sends an email notification to the employee whose OT application was approved.
 * The DTR sync is done synchronously in the approve route; this job handles
 * the async notification side-effect.
 */

import prismaAdmin from "@/lib/prisma-admin";
import { sendOtApprovedEmail } from "@/lib/email";

export interface OtApprovedJobData {
  tenantId: string;
  otApplicationId: string;
}

export async function handleOtApproved(job: { data: OtApprovedJobData }): Promise<void> {
  const { tenantId, otApplicationId } = job.data;

  const ota = await prismaAdmin.oTApplication.findFirst({
    where: { id: otApplicationId, tenantId },
    include: {
      employee: {
        select: {
          firstName: true,
          lastName: true,
          user: { select: { email: true } },
        },
      },
    },
  });

  if (!ota) {
    console.warn(`[jobs/ot.approved] OTApplication ${otApplicationId} not found — skipping`);
    return;
  }

  const email = ota.employee.user?.email;
  if (!email) return; // no user account linked — nothing to notify

  const name = `${ota.employee.firstName} ${ota.employee.lastName}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.sentire.app";
  const dateStr = ota.date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Manila",
  });

  await sendOtApprovedEmail({
    to: email,
    name,
    date: dateStr,
    hours: Number(ota.hours).toFixed(1),
    reviewUrl: `${appUrl}/ess/ot-applications`,
  }).catch((err) => {
    console.error(`[jobs/ot.approved] Email failed for ${email}:`, err);
  });

  console.log(`[jobs/ot.approved] Notified ${email} — OT on ${dateStr} approved`);
}
