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

const FROM = process.env.EMAIL_FROM ?? "Sentire Payroll <no-reply@sentire.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const APP_NAME = "Sentire Payroll";

/**
 * Lazy Resend factory — avoids throwing at module-init time when
 * RESEND_API_KEY is not set (e.g. during `next build` on Render before
 * env vars are wired up). The error surfaces only when an email is
 * actually attempted.
 */
function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("[email] RESEND_API_KEY is not set — cannot send email.");
  }
  return new Resend(key);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Send through Resend and SURFACE failures.
 *
 * The Resend SDK does NOT reject/throw on API errors (unverified from-domain,
 * invalid_from_address, missing/restricted API key, rate limits, …). It
 * resolves with the failure tucked into the `error` field. Checking it here
 * turns a rejected send into a real exception instead of a silent no-op, so
 * callers (and the UI) learn the truth instead of seeing a false "sent".
 */
async function dispatch(opts: { to: string; subject: string; html: string }): Promise<void> {
  const { error } = await getResend().emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  if (error) {
    throw new Error(
      `Resend rejected "${opts.subject}" to ${opts.to} [${error.name}]: ${error.message}`,
    );
  }
}

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

  await dispatch({ to, subject: `Reset your ${APP_NAME} password`, html });
}

// ---------------------------------------------------------------------------
// Password Changed (security notice)
// ---------------------------------------------------------------------------

export async function sendPasswordChangedEmail({
  to,
  name,
  changedAt = new Date(),
}: {
  to: string;
  name: string;
  changedAt?: Date;
}): Promise<void> {
  const when = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "long",
    timeStyle: "short",
  }).format(changedAt);

  const html = baseTemplate(`
    <p style="margin:0 0 8px;font-size:15px;color:#374151;font-weight:600;">Your password was changed</p>
    <p style="margin:0 0 16px;font-size:13px;color:#6B7A8D;line-height:1.6;">
      Hi ${escapeHtml(name)}, this is a confirmation that the password for your
      ${APP_NAME} account (<strong>${escapeHtml(to)}</strong>) was successfully changed on
      <strong>${escapeHtml(when)}</strong> (Philippine time).
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:#6B7A8D;line-height:1.6;">
      If you made this change, no further action is needed.
    </p>
    <p style="margin:0;font-size:13px;color:#B4471F;line-height:1.6;">
      <strong>If you did NOT make this change</strong>, your account may be compromised.
      Reset your password immediately using "Forgot password" on the login page, or
      contact your administrator.
    </p>
  `);

  await dispatch({ to, subject: `Your ${APP_NAME} password was changed`, html });
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

  await dispatch({ to, subject: `Welcome to ${APP_NAME}`, html });
}

// ---------------------------------------------------------------------------
// ESS invitation — activate Employee Self-Service (set a password)
// ---------------------------------------------------------------------------

export async function sendEssInviteEmail({
  to,
  name,
  companyName,
  companyCode,
  employeeNumber,
  activateUrl,
  expiresInDays = 7,
}: {
  to: string;
  name: string;
  companyName: string;
  companyCode: string;
  employeeNumber: string;
  activateUrl: string;
  expiresInDays?: number;
}): Promise<void> {
  const html = baseTemplate(`
    <p style="margin:0 0 8px;font-size:15px;color:#374151;font-weight:600;">You're invited to Employee Self-Service</p>
    <p style="margin:0 0 16px;font-size:13px;color:#6B7A8D;line-height:1.6;">
      Hi ${escapeHtml(name)}, ${escapeHtml(companyName)} has enabled your Employee Self-Service
      (ESS) access. Click below to set your password and activate your account.
      This link expires in <strong>${expiresInDays} day${expiresInDays === 1 ? "" : "s"}</strong>.
    </p>
    <a href="${escapeHtml(activateUrl)}"
       style="display:inline-block;padding:12px 28px;background:#1E3A5F;color:#FFFFFF;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none;">
      Activate ESS Access
    </a>
    <p style="margin:24px 0 0;font-size:13px;color:#6B7A8D;line-height:1.6;">
      When you sign in, you'll need your <strong>Company Code</strong> and <strong>Employee ID</strong>:
    </p>
    <p style="margin:8px 0 0;font-size:13px;color:#111827;">
      Company Code: <strong style="font-family:monospace;">${escapeHtml(companyCode)}</strong><br/>
      Employee ID: <strong style="font-family:monospace;">${escapeHtml(employeeNumber)}</strong>
    </p>
    <p style="margin:20px 0 0;font-size:12px;color:#9AA5B4;">
      Or copy this link into your browser:<br/>
      <span style="color:#2D6BE4;word-break:break-all;">${escapeHtml(activateUrl)}</span>
    </p>
  `);

  await dispatch({ to, subject: `Activate your ${companyName} Employee Self-Service access`, html });
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

  await dispatch({ to, subject: `Your payslip for ${period} is ready`, html });
}

// ---------------------------------------------------------------------------
// OT Approved
// ---------------------------------------------------------------------------

export async function sendOtApprovedEmail({
  to,
  name,
  date,
  hours,
  reviewUrl,
}: {
  to: string;
  name: string;
  date: string; // e.g. "June 3, 2026"
  hours: string; // e.g. "2.5"
  reviewUrl: string;
}): Promise<void> {
  const html = baseTemplate(`
    <p style="margin:0 0 8px;font-size:15px;color:#374151;font-weight:600;">Overtime application approved</p>
    <p style="margin:0 0 24px;font-size:13px;color:#6B7A8D;line-height:1.6;">
      Hi ${escapeHtml(name)}, your overtime application for <strong>${escapeHtml(date)}</strong>
      (${escapeHtml(hours)} hour${Number(hours) !== 1 ? "s" : ""}) has been <strong>approved</strong>.
    </p>
    <a href="${escapeHtml(reviewUrl)}"
       style="display:inline-block;padding:12px 28px;background:#1E3A5F;color:#FFFFFF;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none;">
      View Details
    </a>
  `);

  await dispatch({ to, subject: `Your overtime on ${date} has been approved`, html });
}

// ---------------------------------------------------------------------------
// DTR Submission — notify supervisor
// ---------------------------------------------------------------------------

export async function sendDtrSubmittedEmail({
  to,
  supervisorName,
  employeeName,
  periodStart,
  periodEnd,
  reviewUrl,
}: {
  to: string;
  supervisorName: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  reviewUrl: string;
}): Promise<void> {
  const html = baseTemplate(`
    <p style="margin:0 0 8px;font-size:15px;color:#374151;font-weight:600;">DTR submitted for your review</p>
    <p style="margin:0 0 24px;font-size:13px;color:#6B7A8D;line-height:1.6;">
      Hi ${escapeHtml(supervisorName)}, <strong>${escapeHtml(employeeName)}</strong> has submitted
      their Daily Time Record for <strong>${escapeHtml(periodStart)}</strong> to
      <strong>${escapeHtml(periodEnd)}</strong> and it is awaiting your review.
    </p>
    <a href="${escapeHtml(reviewUrl)}"
       style="display:inline-block;padding:12px 28px;background:#1E3A5F;color:#FFFFFF;font-size:14px;font-weight:600;border-radius:8px;text-decoration:none;">
      Review DTR
    </a>
  `);

  await dispatch({ to, subject: `DTR review needed: ${employeeName} (${periodStart} – ${periodEnd})`, html });
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
