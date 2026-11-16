/**
 * Job: payslip.publish
 *
 * Payload: { tenantId: string; bookId: string; sheetId: string }
 *
 * For each PayrollSheet in a finalized PayrollBook:
 *   1. Fetch sheet + employee + book details
 *   2. Render the payslip PDF (src/lib/payslip/pdf-document.tsx, PAY-139)
 *   3. Upload to Cloudflare R2
 *   4. Write the R2 key back to PayrollSheet.payslipKey
 *   5. Email the employee that their payslip is ready
 *
 * Enqueued once per sheet by the finalize route.
 */

import { withTenant } from "@/lib/with-tenant";
import { loadPayslipPdfData } from "@/lib/payslip/pdf-data";
import { renderPayslipPdf } from "@/lib/payslip/pdf-document";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import prismaAdmin from "@/lib/prisma-admin";
import { r2, R2_BUCKET, isR2Configured } from "@/lib/r2";
import { sendPayslipReadyEmail } from "@/lib/email";
import { invalidate } from "@/lib/cache/cache";
import { CacheKeys } from "@/lib/cache/keys";

export interface PayslipPublishJobData {
  tenantId: string;
  bookId: string;
  sheetId: string;
}

export async function handlePayslipPublish(job: { data: PayslipPublishJobData }): Promise<void> {
  const { tenantId, bookId, sheetId } = job.data;

  const sheet = await prismaAdmin.payrollSheet.findFirst({
    where: { id: sheetId, tenantId, payrollBookId: bookId },
    include: {
      payrollBook: { select: { periodStart: true, periodEnd: true } },
      employee: {
        select: {
          firstName: true,
          lastName: true,
          employeeNumber: true,
          position: { select: { title: true } },
          user: { select: { email: true } },
        },
      },
    },
  });

  if (!sheet) {
    console.warn(`[jobs/payslip.publish] Sheet ${sheetId} not found — skipping`);
    return;
  }

  // Already published — idempotent
  if (sheet.payslipKey) {
    console.log(`[jobs/payslip.publish] Sheet ${sheetId} already has payslipKey — skipping`);
    return;
  }

  const emp = sheet.employee;
  const book = sheet.payrollBook;

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

  // PAY-139: the same payslip PDF the admin and the employee download.
  const pdfData = await withTenant(tenantId, (tx) =>
    loadPayslipPdfData(tx, { tenantId, bookId, employeeId: sheet.employeeId }),
  );
  const pdfBuffer = await renderPayslipPdf(pdfData);

  const key = `tenants/${tenantId}/payslips/${bookId}/${sheetId}.pdf`;

  // Upload to R2 (skip gracefully if not configured)
  if (isR2Configured()) {
    await r2().send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: pdfBuffer,
        ContentType: "application/pdf",
        ContentDisposition: `inline; filename="payslip-${sheetId}.pdf"`,
      }),
    );

    // Persist the key
    await prismaAdmin.payrollSheet.update({
      where: { id: sheetId },
      data: { payslipKey: key },
    });

    // Invalidate finalized-sheet cache
    await invalidate(CacheKeys.payrollSheet(tenantId, bookId, sheet.employeeId));

    console.log(`[jobs/payslip.publish] Uploaded ${key}`);
  } else {
    console.warn(`[jobs/payslip.publish] R2 not configured — PDF generated but not stored`);
  }

  // Email employee (best-effort)
  const email = emp.user?.email;
  if (email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.sentire.app";
    const period = `${fmt(book.periodStart)} – ${fmt(book.periodEnd)}`;
    const payslipUrl = isR2Configured()
      ? `${appUrl}/ess/payslips/${sheetId}`
      : `${appUrl}/ess/payslips`;

    await sendPayslipReadyEmail({
      to: email,
      name: `${emp.firstName} ${emp.lastName}`,
      period,
      payslipUrl,
    }).catch((err) => {
      console.error(`[jobs/payslip.publish] Email failed for ${email}:`, err);
    });
  }
}
