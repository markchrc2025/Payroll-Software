/**
 * src/lib/email.ts
 *
 * Thin wrapper around the Resend SDK.
 * All transactional emails are sent through this module.
 *
 * Usage:
 *   import { sendPasswordResetEmail } from "@/lib/email";
 *   await sendPasswordResetEmail({ to: "user@company.com", resetUrl: "https://..." });
 */

import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  console.warn("[email] RESEND_API_KEY is not set — emails will not be sent.");
}

const resend = new Resend(process.env.RESEND_API_KEY ?? "");

const FROM = process.env.EMAIL_FROM ?? "Sentire Payroll <no-reply@sentire.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const APP_NAME = "Sentire Payroll";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseTemplate(body: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#F5F6FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6FA;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;border:1px solid #E8EBF1;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#1E3A5F;padding:24px 32px;">
              <span style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:-0.3px;">${APP_NAME}</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #E8EBF1;background:#F5F6FA;">
              <p style="margin:0;font-size:11px;color:#9AA5B4;text-align:center;">
                This email was sent by ${APP_NAME}. If you didn't request this, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

// ---------------------------------------------------------------------------
// Password Reset
// ---------------------------------------------------------------------------

export async function sendPasswordResetEmail({
  to,
  name,
  resetUrl,
}: {
  to: string;
  name: string;
  resetUrl: string;
}): Promise<void> {
  const html = baseTemplate(`
    <p style="margin:0 0 8px;font-size:15px;color:#374151;font-weight:600;">Reset your password</p>
    <p style="margin:0 0 24px;font-size:13px;color:#6B7A8D;line-height:1.6;">
      Hi ${escapeHtml(name)}, we received a request to reset the password for your ${APP_NAME} account.
      Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
    </p>
    <a href="${resetUrl}"
       style="display:inline-block;padding:12px 28px;background:#1E3A5F;color:#FFFFFF;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none;">
      Reset Password
    </a>
    <p style="margin:24px 0 0;font-size:12px;color:#9AA5B4;">
      Or copy this link into your browser:<br/>
      <span style="color:#2D6BE4;word-break:break-all;">${resetUrl}</span>
    </p>
  `);

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Reset your ${APP_NAME} password`,
    html,
  });
}

// ---------------------------------------------------------------------------
// Welcome / Invitation
// ---------------------------------------------------------------------------

export async function sendWelcomeEmail({
  to,
  name,
  loginUrl,
  temporaryPassword,
}: {
  to: string;
  name: string;
  loginUrl?: string;
  temporaryPassword?: string;
}): Promise<void> {
  const url = loginUrl ?? `${APP_URL}/login`;

  const passwordRow = temporaryPassword
    ? `<p style="margin:16px 0;font-size:13px;color:#6B7A8D;">
         Your temporary password is: <strong style="color:#111827;font-family:monospace;">${escapeHtml(temporaryPassword)}</strong><br/>
         <span style="font-size:12px;color:#9AA5B4;">You will be prompted to change it on first login.</span>
       </p>`
    : "";

  const html = baseTemplate(`
    <p style="margin:0 0 8px;font-size:15px;color:#374151;font-weight:600;">Welcome to ${APP_NAME}!</p>
    <p style="margin:0 0 16px;font-size:13px;color:#6B7A8D;line-height:1.6;">
      Hi ${escapeHtml(name)}, your account has been created. You can now log in using your email address.
    </p>
    ${passwordRow}
    <a href="${url}"
       style="display:inline-block;padding:12px 28px;background:#1E3A5F;color:#FFFFFF;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none;">
      Log In
    </a>
  `);

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Welcome to ${APP_NAME}`,
    html,
  });
}

// ---------------------------------------------------------------------------
// Payslip notification
// ---------------------------------------------------------------------------

export async function sendPayslipReadyEmail({
  to,
  name,
  period,
  payslipUrl,
}: {
  to: string;
  name: string;
  period: string; // e.g. "May 16–31, 2026"
  payslipUrl: string;
}): Promise<void> {
  const html = baseTemplate(`
    <p style="margin:0 0 8px;font-size:15px;color:#374151;font-weight:600;">Your payslip is ready</p>
    <p style="margin:0 0 24px;font-size:13px;color:#6B7A8D;line-height:1.6;">
      Hi ${escapeHtml(name)}, your payslip for <strong>${escapeHtml(period)}</strong> is now available.
    </p>
    <a href="${payslipUrl}"
       style="display:inline-block;padding:12px 28px;background:#1E3A5F;color:#FFFFFF;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none;">
      View Payslip
    </a>
  `);

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your payslip for ${period} is ready`,
    html,
  });
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
