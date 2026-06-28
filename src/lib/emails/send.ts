/**
 * Send functions — one per template. Each renders the template, then dispatches
 * through Resend with the surface's support address as Reply-To so a recipient's
 * reply lands with the right team (billing@sentire.solutions for BILLING,
 * central-support@sentire.com for CENTRAL, support@sentire.com otherwise).
 */

import { dispatch, type Attachment } from "./client";
import { SURFACES } from "./surfaces";
import * as t from "./templates";

const support = {
  selfService: SURFACES.SELF_SERVICE.support,
  payroll: SURFACES.PAYROLL.support,
  billing: SURFACES.BILLING.support,
  central: SURFACES.CENTRAL.support,
};

// 1
export async function sendEmployeeOnboarding(
  to: string,
  v: Parameters<typeof t.renderEmployeeOnboarding>[0],
): Promise<void> {
  const { subject, html } = t.renderEmployeeOnboarding(v);
  // Replies go to the company/HR contact when provided, else Sentire support.
  await dispatch({ to, subject, html, replyTo: v.supportEmail?.trim() || support.selfService });
}

// 2
export async function sendEmployeeResetPassword(
  to: string,
  v: Parameters<typeof t.renderEmployeeResetPassword>[0],
): Promise<void> {
  const { subject, html } = t.renderEmployeeResetPassword(v);
  await dispatch({ to, subject, html, replyTo: support.selfService });
}

// 3
export async function sendEmployeeResetPasswordNotice(
  to: string,
  v: Parameters<typeof t.renderEmployeeResetPasswordNotice>[0],
): Promise<void> {
  const { subject, html } = t.renderEmployeeResetPasswordNotice(v);
  await dispatch({ to, subject, html, replyTo: support.selfService });
}

// 4
export async function sendTenantOnboarding(
  to: string,
  v: Parameters<typeof t.renderTenantOnboarding>[0],
): Promise<void> {
  const { subject, html } = t.renderTenantOnboarding(v);
  await dispatch({ to, subject, html, replyTo: support.payroll });
}

// 5
export async function sendTenantAdminResetPassword(
  to: string,
  v: Parameters<typeof t.renderTenantAdminResetPassword>[0],
): Promise<void> {
  const { subject, html } = t.renderTenantAdminResetPassword(v);
  await dispatch({ to, subject, html, replyTo: support.payroll });
}

// 6 — supports an optional invoice PDF attachment (footer copy promises one).
export async function sendMonthlyBillingNotice(
  to: string,
  v: Parameters<typeof t.renderMonthlyBillingNotice>[0],
  attachments?: Attachment[],
): Promise<void> {
  const { subject, html } = t.renderMonthlyBillingNotice(v);
  await dispatch({ to, subject, html, replyTo: support.billing, attachments });
}

// 7
export async function sendUnpaidBillingNotice(
  to: string,
  v: Parameters<typeof t.renderUnpaidBillingNotice>[0],
): Promise<void> {
  const { subject, html } = t.renderUnpaidBillingNotice(v);
  await dispatch({ to, subject, html, replyTo: support.billing });
}

// 8
export async function sendDeactivationNotice(
  to: string,
  v: Parameters<typeof t.renderDeactivationNotice>[0],
): Promise<void> {
  const { subject, html } = t.renderDeactivationNotice(v);
  await dispatch({ to, subject, html, replyTo: support.billing });
}

// 9
export async function sendAdminOnboarding(
  to: string,
  v: Parameters<typeof t.renderAdminOnboarding>[0],
): Promise<void> {
  const { subject, html } = t.renderAdminOnboarding(v);
  await dispatch({ to, subject, html, replyTo: support.central });
}

// 10
export async function sendAdminResetPassword(
  to: string,
  v: Parameters<typeof t.renderAdminResetPassword>[0],
): Promise<void> {
  const { subject, html } = t.renderAdminResetPassword(v);
  await dispatch({ to, subject, html, replyTo: support.central });
}

// 11
export async function sendAdminResetPasswordNotice(
  to: string,
  v: Parameters<typeof t.renderAdminResetPasswordNotice>[0],
): Promise<void> {
  const { subject, html } = t.renderAdminResetPasswordNotice(v);
  await dispatch({ to, subject, html, replyTo: support.central });
}
