/**
 * The 11 transactional email templates. Each render* function takes typed merge
 * variables and returns { subject, html }. Copy is reproduced verbatim from the
 * design references in docs/design_handoff_emails/emails/.
 *
 * Merge-variable values that come from user/tenant data are escaped here; URLs
 * are escaped for attribute context. Static copy (including the typographic
 * &nbsp; in fixed phrases like "Sentire&nbsp;Payroll") is written directly.
 */

import { COLOR } from "./tokens";
import { renderShell, supportLine } from "./layout";
import {
  intro,
  featuresPanel,
  stepsPanel,
  note,
  fallback,
  noticeIntro,
  detailPanel,
  billingPanel,
  calloutBox,
  warnLink,
} from "./blocks";
import { escapeHtml, escapeAttr } from "./util";

export type Rendered = { subject: string; html: string };

/** Inline emphasis matching the references (<strong> in ink, weight 600). */
const b = (t: string) => `<strong style="color:${COLOR.ink};font-weight:600;">${t}</strong>`;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Employee Onboarding — SELF-SERVICE
// ─────────────────────────────────────────────────────────────────────────────
export function renderEmployeeOnboarding(v: {
  firstName: string;
  companyName: string;
  activationUrl: string;
}): Rendered {
  const name = escapeHtml(v.firstName);
  const company = escapeHtml(v.companyName);
  const url = escapeAttr(v.activationUrl);
  const html = renderShell({
    title: "Welcome to Sentire",
    preheader: "Activate your account to clock in, view payslips and request leave — all in one place.",
    surface: "SELF_SERVICE",
    body: [
      intro({
        eyebrow: "Employee Self-Service",
        h1: `Welcome to Sentire, ${name}`,
        bodyHtml: `${b(company)} has set you up with Employee&nbsp;Self-Service. Activate your account to manage your whole work day in one place.`,
        ctaLabel: "Activate my account",
        ctaUrl: url,
      }),
      featuresPanel({
        items: [
          { icon: "clock", title: "Clock in & out", desc: "Log your hours and track daily attendance from any device." },
          { icon: "payslip", title: "Payslips on demand", desc: "View and download every payslip the moment it's ready." },
          { icon: "leave", title: "Leave made easy", desc: "Request time off and watch your balance update in real time." },
        ],
      }),
    ].join("\n"),
    footerLines: [
      `This invite was sent to you by ${company}. The activation link expires in <strong style="color:${COLOR.muted};font-weight:600;">7 days</strong>.`,
      supportLine("Trouble signing in? Email", "SELF_SERVICE"),
    ],
    legal: "© 2026 Sentire · You’re receiving this because you were added to Sentire Self-Service.",
  });
  return { subject: "Welcome to Sentire", html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Employee ESS Reset Password — SELF-SERVICE
// ─────────────────────────────────────────────────────────────────────────────
export function renderEmployeeResetPassword(v: { firstName: string; resetUrl: string }): Rendered {
  const name = escapeHtml(v.firstName);
  const url = escapeAttr(v.resetUrl);
  const html = renderShell({
    title: "Reset your password",
    preheader: "Choose a new password for your Sentire Self-Service account. This secure link expires in 1 hour.",
    surface: "SELF_SERVICE",
    body: [
      intro({
        eyebrow: "Account security",
        h1: "Reset your password",
        bodyHtml: `Hi ${name}, we received a request to reset the password for your Sentire&nbsp;Self-Service account. Choose a new one below — this link expires in ${b("1&nbsp;hour")}.`,
        ctaLabel: "Reset password",
        ctaUrl: url,
      }),
      fallback(url),
    ].join("\n"),
    footerLines: [
      "Didn't request this? You can safely ignore this email — your password won't change.",
      supportLine("Need a hand? Reach us at", "SELF_SERVICE"),
    ],
    legal: "© 2026 Sentire · Sent because a password reset was requested for your account.",
  });
  return { subject: "Reset your password", html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Employee Reset Password Notice — SELF-SERVICE
// ─────────────────────────────────────────────────────────────────────────────
export function renderEmployeeResetPasswordNotice(v: {
  accountEmail: string;
  changedAt: string;
  device: string;
  secureUrl: string;
}): Rendered {
  const html = renderShell({
    title: "Your password was changed",
    preheader: "This is a confirmation that the password for your Sentire Self-Service account was just changed.",
    surface: "SELF_SERVICE",
    body: [
      noticeIntro({
        icon: "check",
        h1: "Your password was changed",
        bodyHtml:
          "This is a confirmation that the password for your Sentire&nbsp;Self-Service account was just updated. No further action is needed.",
      }),
      detailPanel([
        { label: "Account", value: escapeHtml(v.accountEmail) },
        { label: "When", value: escapeHtml(v.changedAt) },
        { label: "Device", value: escapeHtml(v.device) },
      ]),
      calloutBox({
        tone: "red",
        variant: "notice",
        title: "Didn't make this change?",
        bodyHtml: `If you didn’t change your password, your account may be at risk. ${warnLink("Secure your account", escapeAttr(v.secureUrl))}`,
      }),
    ].join("\n"),
    footerLines: [
      "You’re receiving this security notice to help keep your account safe.",
      supportLine("Questions? Reach us at", "SELF_SERVICE"),
    ],
    legal: "© 2026 Sentire · Security notification for your Self-Service account.",
  });
  return { subject: "Your password was changed", html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Tenant Onboarding — PAYROLL
// ─────────────────────────────────────────────────────────────────────────────
export function renderTenantOnboarding(v: {
  firstName: string;
  companyName: string;
  activationUrl: string;
}): Rendered {
  const name = escapeHtml(v.firstName);
  const company = escapeHtml(v.companyName);
  const url = escapeAttr(v.activationUrl);
  const html = renderShell({
    title: "Welcome to Sentire Payroll",
    preheader: `${v.companyName} is live on Sentire Payroll — and you're the Payroll Administrator. Let's set up your workspace.`,
    surface: "PAYROLL",
    body: [
      intro({
        eyebrow: "Welcome aboard",
        h1: `Welcome to Sentire&nbsp;Payroll, ${name}`,
        bodyHtml: `Great news — ${b(company)} is now set up on Sentire&nbsp;Payroll, and you've been added as the ${b("Payroll&nbsp;Administrator")}. Activate your account to get the workspace ready for your team.`,
        ctaLabel: "Activate your account",
        ctaUrl: url,
      }),
      stepsPanel({
        kicker: "Get set up",
        meta: "3 steps · ~10 min",
        title: "Your first three steps",
        steps: [
          { title: "Complete your company profile", desc: "Confirm your business details, tax IDs and pay schedule." },
          { title: "Add employees & pay groups", desc: "Invite your team or import them from a spreadsheet in minutes." },
          { title: "Run your first payroll", desc: "We'll guide you through it step by step — no spreadsheets required." },
        ],
      }),
      note(
        "Prefer a hand? Your dedicated onboarding specialist is one reply away — we'll walk you through setup whenever you're ready.",
      ),
    ].join("\n"),
    footerLines: [
      `This activation link expires in <strong style="color:${COLOR.muted};font-weight:600;">7 days</strong>. If it lapses, ask your Sentire contact to resend it.`,
      supportLine("Questions about getting started? Email", "PAYROLL"),
    ],
    legal: `© 2026 Sentire · You’re receiving this because ${company} was set up on Sentire Payroll.`,
  });
  return { subject: "Welcome to Sentire Payroll", html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Tenant Admin Reset Password — PAYROLL
// ─────────────────────────────────────────────────────────────────────────────
export function renderTenantAdminResetPassword(v: { firstName: string; resetUrl: string }): Rendered {
  const name = escapeHtml(v.firstName);
  const url = escapeAttr(v.resetUrl);
  const html = renderShell({
    title: "Reset your password",
    preheader: "Choose a new password for your Sentire Payroll admin account. This secure link expires in 1 hour.",
    surface: "PAYROLL",
    body: [
      intro({
        eyebrow: "Account security",
        h1: "Reset your password",
        bodyHtml: `Hi ${name}, we received a request to reset the password for your Sentire&nbsp;Payroll ${b("administrator")} account. Choose a new one below — this link expires in ${b("1&nbsp;hour")}.`,
        ctaLabel: "Reset password",
        ctaUrl: url,
      }),
      fallback(url),
    ].join("\n"),
    footerLines: [
      "Didn't request this? Your password won't change. If you didn't ask for a reset, let us know so we can secure the account.",
      supportLine("Reach us any time at", "PAYROLL"),
    ],
    legal: "© 2026 Sentire · Sent because a password reset was requested for your admin account.",
  });
  return { subject: "Reset your password", html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Monthly Billing Notice — BILLING
// ─────────────────────────────────────────────────────────────────────────────
export function renderMonthlyBillingNotice(v: {
  firstName: string;
  companyName: string;
  monthLabel: string; // e.g. "June" — used in the headline
  invoiceUrl: string;
  amount: string; // pre-formatted, e.g. "₱48,500.00"
  dueShort: string; // e.g. "5 Jul" (pill)
  invoiceNumber: string;
  billingPeriod: string; // e.g. "1–30 June 2026"
  plan: string; // e.g. "Growth · 48 employees"
  dueDate: string; // e.g. "5 July 2026"
}): Rendered {
  const name = escapeHtml(v.firstName);
  const company = escapeHtml(v.companyName);
  const url = escapeAttr(v.invoiceUrl);
  const html = renderShell({
    title: "Your Sentire invoice is ready",
    preheader: `Your Sentire Payroll invoice for ${v.monthLabel} 2026 is ready — ${v.amount}, due ${v.dueShort}.`,
    surface: "BILLING",
    body: [
      intro({
        eyebrow: "Monthly billing",
        h1: `Your ${escapeHtml(v.monthLabel)} invoice is ready`,
        bodyHtml: `Hi ${name}, here's the Sentire&nbsp;Payroll invoice for ${b(company)}. You can review the full breakdown and pay online any time before the due date.`,
        ctaLabel: "View & pay invoice",
        ctaUrl: url,
      }),
      billingPanel({
        label: "Amount due",
        pillText: `Due ${escapeHtml(v.dueShort)}`,
        pillTone: "orange",
        amount: escapeHtml(v.amount),
        rows: [
          { label: "Invoice number", value: escapeHtml(v.invoiceNumber) },
          { label: "Billing period", value: escapeHtml(v.billingPeriod) },
          { label: "Plan", value: escapeHtml(v.plan) },
          { label: "Due date", value: escapeHtml(v.dueDate) },
        ],
      }),
      note(
        "Autopay is on for this account — we’ll charge your card on file on the due date, so there’s nothing more you need to do.",
      ),
    ].join("\n"),
    footerLines: [
      "A PDF copy of this invoice is attached for your records.",
      supportLine("Questions about your bill? Email", "BILLING"),
    ],
    legal: `© 2026 Sentire · You’re receiving this because you manage billing for ${company}.`,
  });
  return { subject: "Your Sentire invoice is ready", html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Notice of Unpaid Billing — BILLING
// ─────────────────────────────────────────────────────────────────────────────
export function renderUnpaidBillingNotice(v: {
  firstName: string;
  companyName: string;
  invoiceNumber: string;
  payUrl: string;
  amount: string;
  daysOverdue: number;
  originalDueDate: string;
  billingPeriod: string;
  settleByDate: string;
}): Rendered {
  const name = escapeHtml(v.firstName);
  const company = escapeHtml(v.companyName);
  const url = escapeAttr(v.payUrl);
  const inv = escapeHtml(v.invoiceNumber);
  const html = renderShell({
    title: "Your invoice is past due",
    preheader: `Invoice ${v.invoiceNumber} for ${v.amount} was due ${v.originalDueDate} and remains unpaid. Please settle to avoid service limits.`,
    surface: "BILLING",
    body: [
      intro({
        eyebrow: "Payment overdue",
        eyebrowTone: "red",
        h1: "Your invoice is past due",
        bodyHtml: `Hi ${name}, we weren't able to collect payment for ${b(company)}. Invoice ${inv} was due on ${escapeHtml(v.originalDueDate)} and is still unpaid. Settling it now keeps payroll running without interruption.`,
        ctaLabel: "Pay now",
        ctaUrl: url,
      }),
      billingPanel({
        label: "Amount due",
        pillText: `Past due · ${v.daysOverdue} day${v.daysOverdue === 1 ? "" : "s"}`,
        pillTone: "red",
        amount: escapeHtml(v.amount),
        rows: [
          { label: "Invoice number", value: inv },
          { label: "Original due date", value: escapeHtml(v.originalDueDate) },
          { label: "Billing period", value: escapeHtml(v.billingPeriod) },
        ],
      }),
      calloutBox({
        tone: "amber",
        variant: "billing",
        title: "What happens if this stays unpaid",
        bodyHtml: `To avoid disruption, please settle by <strong>${escapeHtml(v.settleByDate)}</strong>. After that, admin and employee access may be limited until the balance is cleared.`,
      }),
    ].join("\n"),
    footerLines: [
      "Already paid? Thank you — you can disregard this notice; payments can take a little time to reflect.",
      supportLine("Need to update a card or arrange payment? Email", "BILLING"),
    ],
    legal: `© 2026 Sentire · Payment reminder for ${company}.`,
  });
  return { subject: "Your invoice is past due", html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Deactivation Notice — BILLING
// ─────────────────────────────────────────────────────────────────────────────
export function renderDeactivationNotice(v: {
  firstName: string;
  companyName: string;
  invoiceNumber: string;
  payUrl: string;
  amount: string;
  suspendedSince: string;
  deactivatesOn: string;
}): Rendered {
  const name = escapeHtml(v.firstName);
  const company = escapeHtml(v.companyName);
  const url = escapeAttr(v.payUrl);
  const inv = escapeHtml(v.invoiceNumber);
  const html = renderShell({
    title: "Your account is scheduled for deactivation",
    preheader: `${v.companyName} is suspended for non-payment and will be deactivated on ${v.deactivatesOn} unless the balance is settled.`,
    surface: "BILLING",
    body: [
      intro({
        eyebrow: "Account deactivation",
        eyebrowTone: "red",
        h1: "Your account is scheduled for deactivation",
        bodyHtml: `Hi ${name}, because invoice ${inv} remains unpaid, ${b(company)} has been suspended and is scheduled for deactivation. You can restore full access right away by settling the outstanding balance.`,
        ctaLabel: "Reactivate account",
        ctaUrl: url,
      }),
      billingPanel({
        label: "Outstanding balance",
        pillText: "Suspended",
        pillTone: "red",
        amount: escapeHtml(v.amount),
        rows: [
          { label: "Invoice number", value: inv },
          { label: "Suspended since", value: escapeHtml(v.suspendedSince) },
          { label: "Deactivates on", value: escapeHtml(v.deactivatesOn) },
        ],
      }),
      calloutBox({
        tone: "red",
        variant: "billing",
        title: "What deactivation means",
        bodyHtml:
          "Employees will lose access to Self-Service, scheduled payroll runs will be paused, and your data will be retained for <strong>30 days</strong> before removal. Settling the balance reverses all of this immediately.",
      }),
    ].join("\n"),
    footerLines: [
      "If you believe this is an error or you’re working through a payment issue, talk to us — we’d much rather help than deactivate.",
      supportLine("Reach the billing team at", "BILLING"),
    ],
    legal: `© 2026 Sentire · Final billing notice for ${company}.`,
  });
  return { subject: "Your account is scheduled for deactivation", html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Admin Onboarding — CENTRAL
// ─────────────────────────────────────────────────────────────────────────────
export function renderAdminOnboarding(v: { firstName: string; activationUrl: string }): Rendered {
  const name = escapeHtml(v.firstName);
  const url = escapeAttr(v.activationUrl);
  const html = renderShell({
    title: "Welcome to Sentire Central",
    preheader: "You've been granted access to Sentire Central — the console for managing tenants, billing and platform health.",
    surface: "CENTRAL",
    body: [
      intro({
        eyebrow: "Central Admin Console",
        h1: `Welcome to Sentire&nbsp;Central, ${name}`,
        bodyHtml: `You've been granted ${b("Administrator")} access to ${b("Sentire&nbsp;Central")} — the console for managing tenants, billing and platform health. Activate your account to get started.`,
        ctaLabel: "Activate admin access",
        ctaUrl: url,
      }),
      stepsPanel({
        kicker: "Get oriented",
        meta: "3 steps · ~5 min",
        title: "Where to start",
        steps: [
          { title: "Set up two-factor authentication", desc: "Required for all Central admins — adds a second layer of security." },
          { title: "Review the tenant directory", desc: "See every company on the platform, their status and health at a glance." },
          { title: "Check the platform dashboard", desc: "Track active runs, billing and items that need attention." },
        ],
      }),
      note("Your access level is set by your team lead. If something looks off, reach out before your first session."),
    ].join("\n"),
    footerLines: [
      `This activation link expires in <strong style="color:${COLOR.muted};font-weight:600;">7 days</strong> and is tied to your work email.`,
      supportLine("Need access changed? Contact", "CENTRAL"),
    ],
    legal: "© 2026 Sentire · Internal access notification for Sentire Central.",
  });
  return { subject: "Welcome to Sentire Central", html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Admin Reset Password — CENTRAL
// ─────────────────────────────────────────────────────────────────────────────
export function renderAdminResetPassword(v: { firstName: string; resetUrl: string }): Rendered {
  const name = escapeHtml(v.firstName);
  const url = escapeAttr(v.resetUrl);
  const html = renderShell({
    title: "Reset your password",
    preheader: "Choose a new password for your Sentire Central admin account. This secure link expires in 1 hour.",
    surface: "CENTRAL",
    body: [
      intro({
        eyebrow: "Account security",
        h1: "Reset your password",
        bodyHtml: `Hi ${name}, we received a request to reset the password for your Sentire&nbsp;Central ${b("administrator")} account. Choose a new one below — this link expires in ${b("1&nbsp;hour")}.`,
        ctaLabel: "Reset password",
        ctaUrl: url,
      }),
      fallback(url),
    ].join("\n"),
    footerLines: [
      "Didn't request this? Your password won't change. Because this is a privileged account, please report any unexpected reset.",
      supportLine("Reach the platform team at", "CENTRAL"),
    ],
    legal: "© 2026 Sentire · Sent because a password reset was requested for your Central account.",
  });
  return { subject: "Reset your password", html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. Admin Reset Password Notice — CENTRAL
// ─────────────────────────────────────────────────────────────────────────────
export function renderAdminResetPasswordNotice(v: {
  accountEmail: string;
  role: string;
  changedAt: string;
  device: string;
  secureUrl: string;
}): Rendered {
  const html = renderShell({
    title: "Your password was changed",
    preheader: "This is a confirmation that the password for your Sentire Central admin account was just changed.",
    surface: "CENTRAL",
    body: [
      noticeIntro({
        icon: "shield",
        h1: "Your password was changed",
        bodyHtml:
          "This is a confirmation that the password for your Sentire&nbsp;Central administrator account was just updated. No further action is needed.",
      }),
      detailPanel([
        { label: "Account", value: escapeHtml(v.accountEmail) },
        { label: "Role", value: escapeHtml(v.role) },
        { label: "When", value: escapeHtml(v.changedAt) },
        { label: "Device", value: escapeHtml(v.device) },
      ]),
      calloutBox({
        tone: "red",
        variant: "notice",
        title: "Didn't make this change?",
        bodyHtml: `If this wasn’t you, a privileged account may be compromised. ${warnLink("Secure it now", escapeAttr(v.secureUrl))}`,
      }),
    ].join("\n"),
    footerLines: [
      "Password changes on privileged accounts are always logged and notified.",
      supportLine("Report anything suspicious to", "CENTRAL"),
    ],
    legal: "© 2026 Sentire · Security notification for your Central admin account.",
  });
  return { subject: "Your password was changed", html };
}
