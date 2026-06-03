/**
 * Job: payslip.publish
 *
 * Payload: { tenantId: string; bookId: string; sheetId: string }
 *
 * For each PayrollSheet in a finalized PayrollBook:
 *   1. Fetch sheet + employee + book details
 *   2. Render a PDF payslip using @react-pdf/renderer
 *   3. Upload to Cloudflare R2
 *   4. Write the R2 key back to PayrollSheet.payslipKey
 *   5. Email the employee that their payslip is ready
 *
 * Enqueued once per sheet by the finalize route.
 */

import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
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

// ---------------------------------------------------------------------------
// Minimal payslip PDF template
// ---------------------------------------------------------------------------

const pdfStyles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#1F2937" },
  header: { marginBottom: 16, borderBottomWidth: 1, borderBottomColor: "#E5E7EB", paddingBottom: 8 },
  title: { fontSize: 14, fontWeight: "bold", color: "#1E3A5F" },
  subtitle: { fontSize: 9, color: "#6B7280", marginTop: 2 },
  row: { flexDirection: "row", marginTop: 4 },
  label: { width: "55%", color: "#6B7280" },
  value: { width: "45%", textAlign: "right" },
  section: { marginTop: 12, marginBottom: 4, fontWeight: "bold", color: "#1E3A5F", fontSize: 10 },
  divider: { borderTopWidth: 1, borderTopColor: "#E5E7EB", marginTop: 6, paddingTop: 6 },
  totalLabel: { width: "55%", fontWeight: "bold" },
  totalValue: { width: "45%", textAlign: "right", fontWeight: "bold" },
});

function centsToPHP(cents: bigint): string {
  const amount = Number(cents) / 100;
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface PayslipData {
  employeeName: string;
  employeeNumber: string | null;
  position: string | null;
  periodStart: string;
  periodEnd: string;
  basicPay: bigint;
  otPay: bigint;
  holidayPay: bigint;
  nsdPay: bigint;
  restDayPay: bigint;
  hazardPay: bigint;
  taxableAllowances: bigint;
  grossCompensation: bigint;
  sssDed: bigint;
  philhealthDed: bigint;
  pagibigDed: bigint;
  withholdingTax: bigint;
  loanDeductions: bigint;
  netPay: bigint;
}

function PayslipDocument({ data }: { data: PayslipData }) {
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: pdfStyles.page },
      React.createElement(
        View,
        { style: pdfStyles.header },
        React.createElement(Text, { style: pdfStyles.title }, "PAYSLIP"),
        React.createElement(
          Text,
          { style: pdfStyles.subtitle },
          `${data.employeeName}${data.employeeNumber ? ` · ${data.employeeNumber}` : ""}${data.position ? ` · ${data.position}` : ""}`,
        ),
        React.createElement(
          Text,
          { style: pdfStyles.subtitle },
          `Period: ${data.periodStart} – ${data.periodEnd}`,
        ),
      ),
      React.createElement(Text, { style: pdfStyles.section }, "EARNINGS"),
      ...[
        ["Basic Pay", data.basicPay],
        ["Overtime Pay", data.otPay],
        ["Holiday Pay", data.holidayPay],
        ["Night Shift Differential", data.nsdPay],
        ["Rest Day Premium", data.restDayPay],
        ["Hazard Pay", data.hazardPay],
        ["Taxable Allowances", data.taxableAllowances],
      ]
        .filter(([, v]) => (v as bigint) > 0n)
        .map(([label, value]) =>
          React.createElement(
            View,
            { style: pdfStyles.row, key: String(label) },
            React.createElement(Text, { style: pdfStyles.label }, String(label)),
            React.createElement(Text, { style: pdfStyles.value }, centsToPHP(value as bigint)),
          ),
        ),
      React.createElement(
        View,
        { style: { ...pdfStyles.row, ...pdfStyles.divider } },
        React.createElement(Text, { style: pdfStyles.totalLabel }, "Gross Compensation"),
        React.createElement(Text, { style: pdfStyles.totalValue }, centsToPHP(data.grossCompensation)),
      ),
      React.createElement(Text, { style: pdfStyles.section }, "DEDUCTIONS"),
      ...[
        ["SSS", data.sssDed],
        ["PhilHealth", data.philhealthDed],
        ["Pag-IBIG", data.pagibigDed],
        ["Withholding Tax", data.withholdingTax],
        ["Loan Payments", data.loanDeductions],
      ]
        .filter(([, v]) => (v as bigint) > 0n)
        .map(([label, value]) =>
          React.createElement(
            View,
            { style: pdfStyles.row, key: String(label) },
            React.createElement(Text, { style: pdfStyles.label }, String(label)),
            React.createElement(Text, { style: pdfStyles.value }, centsToPHP(value as bigint)),
          ),
        ),
      React.createElement(
        View,
        { style: { ...pdfStyles.row, ...pdfStyles.divider } },
        React.createElement(Text, { style: pdfStyles.totalLabel }, "NET PAY"),
        React.createElement(Text, { style: pdfStyles.totalValue }, centsToPHP(data.netPay)),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

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

  const data: PayslipData = {
    employeeName: `${emp.firstName} ${emp.lastName}`,
    employeeNumber: emp.employeeNumber,
    position: emp.position?.title ?? null,
    periodStart: fmt(book.periodStart),
    periodEnd: fmt(book.periodEnd),
    basicPay: sheet.basePayCents,
    otPay: sheet.otPayCents,
    holidayPay: sheet.holidayPayCents,
    nsdPay: sheet.nsdPayCents,
    restDayPay: sheet.restDayPayCents,
    hazardPay: sheet.hazardPayCents,
    taxableAllowances: sheet.taxableAllowancesCents,
    grossCompensation: sheet.grossCompensationCents,
    sssDed: sheet.sssEeCents,
    philhealthDed: sheet.philhealthEeCents,
    pagibigDed: sheet.pagibigEeCents,
    withholdingTax: sheet.withholdingTaxCents,
    loanDeductions: sheet.loanDeductionsCents,
    netPay: sheet.netPayCents,
  };

  // Render PDF — call the builder directly so renderToBuffer receives a Document element
  const pdfBuffer = await renderToBuffer(PayslipDocument({ data }));

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
      name: data.employeeName,
      period,
      payslipUrl,
    }).catch((err) => {
      console.error(`[jobs/payslip.publish] Email failed for ${email}:`, err);
    });
  }
}
