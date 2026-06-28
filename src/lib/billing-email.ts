/**
 * Billing-lifecycle email helpers.
 *
 * Assembles the merge variables for the three BILLING transactional templates —
 * Monthly Billing Notice (#6), Unpaid Billing Notice (#7) and Deactivation
 * Notice (#8) — from an invoice plus its tenant/subscription, then dispatches
 * them. Every send is best-effort: failures are logged, never thrown, so a
 * billing action (issuing an invoice, cancelling a subscription) never 500s
 * because email is misconfigured.
 *
 * Conventions used to fill the templates:
 *   • Recipient  → tenant.billingEmail, falling back to tenant.contactEmail.
 *   • First name → first token of tenant.ownerName (fallback "there").
 *   • Money      → BigInt centavos via formatCentavos(total, {withSymbol}).
 *   • Dates      → formatted in the PH timezone (en-PH).
 *
 * Policy assumptions (no formal product policy yet — see SETTLE_GRACE_DAYS /
 * DEACTIVATE_GRACE_DAYS and BILLING_PORTAL_URL below). The product has no
 * tenant-facing billing portal, so invoice/pay links point at a configurable
 * URL, defaulting to the app's billing area.
 */

import prismaAdmin from "@/lib/prisma-admin";
import { formatCentavos } from "@/lib/money";
import {
  sendMonthlyBillingNotice,
  sendUnpaidBillingNotice,
  sendDeactivationNotice,
} from "@/lib/emails";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
// No tenant-facing billing portal exists yet — point invoice/pay CTAs at a
// configurable URL, falling back to the app's billing area.
const BILLING_PORTAL_URL = process.env.BILLING_PORTAL_URL ?? `${APP_URL}/billing`;

// Grace-period windows — days from "now" the tenant is asked to settle before
// access is limited (SETTLE) / the account is deactivated (DEACTIVATE). These
// are PLATFORM-level knobs set in the Central Portal's environment, not
// per-tenant: configure BILLING_SETTLE_GRACE_DAYS / BILLING_DEACTIVATE_GRACE_DAYS
// in Render. Fall back to 7 when unset, blank, or not a positive integer.
function graceDays(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
const SETTLE_GRACE_DAYS = graceDays(process.env.BILLING_SETTLE_GRACE_DAYS, 7);
const DEACTIVATE_GRACE_DAYS = graceDays(process.env.BILLING_DEACTIVATE_GRACE_DAYS, 7);

const TZ = "Asia/Manila";
const DAY_MS = 86_400_000;

// ── Date / recipient formatting ─────────────────────────────────────────────

/** "5 July 2026" */
function longDate(d: Date): string {
  return new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }).format(d);
}

/** "5 Jul" (used in the small "Due …" pill) */
function shortDate(d: Date): string {
  return new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", timeZone: TZ }).format(d);
}

/** "June" — the headline month label */
function monthLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-PH", { month: "long", timeZone: TZ }).format(d);
}

/** "1–30 June 2026" when within one month, else "1 June 2026 – 5 July 2026". */
function billingPeriod(start: Date, end: Date): string {
  const monthYear = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: TZ });
  if (monthYear.format(start) === monthYear.format(end)) {
    const day = new Intl.DateTimeFormat("en-PH", { day: "numeric", timeZone: TZ });
    return `${day.format(start)}–${day.format(end)} ${monthYear.format(end)}`;
  }
  return `${longDate(start)} – ${longDate(end)}`;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** Whole days between two instants, floored at 0. */
function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

interface TenantContact {
  name: string;
  ownerName: string | null;
  billingEmail: string | null;
  contactEmail: string | null;
}

function recipient(t: TenantContact): string | null {
  return t.billingEmail?.trim() || t.contactEmail?.trim() || null;
}

function firstName(t: TenantContact): string {
  const owner = t.ownerName?.trim();
  if (!owner) return "there";
  return owner.split(/\s+/)[0];
}

const tenantSelect = {
  name: true,
  ownerName: true,
  billingEmail: true,
  contactEmail: true,
} as const;

// ── Senders ─────────────────────────────────────────────────────────────────

/** Monthly Billing Notice (#6) — sent when an invoice is issued (status OPEN). */
export async function sendMonthlyInvoiceEmail(invoiceId: string): Promise<void> {
  try {
    const inv = await prismaAdmin.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        tenant: { select: tenantSelect },
        subscription: { select: { billingCycle: true, package: { select: { name: true } } } },
      },
    });
    if (!inv) return;

    const to = recipient(inv.tenant);
    if (!to) {
      console.warn(`[billing-email] invoice ${inv.invoiceNumber}: no billing/contact email on tenant — skipping monthly notice.`);
      return;
    }

    const due = inv.dueAt ?? inv.periodEnd;
    const cycle = inv.subscription?.billingCycle ?? "MONTHLY";
    const planName = inv.subscription?.package?.name ?? "Subscription";

    await sendMonthlyBillingNotice(to, {
      firstName: firstName(inv.tenant),
      companyName: inv.tenant.name,
      monthLabel: monthLabel(inv.periodStart),
      invoiceUrl: BILLING_PORTAL_URL,
      amount: formatCentavos(inv.total, { withSymbol: true }),
      dueShort: shortDate(due),
      invoiceNumber: inv.invoiceNumber,
      billingPeriod: billingPeriod(inv.periodStart, inv.periodEnd),
      plan: `${planName} · ${cycle === "ANNUAL" ? "annual" : "monthly"}`,
      dueDate: longDate(due),
    });
  } catch (e) {
    console.error("[billing-email] monthly notice failed:", e);
  }
}

/** Unpaid Billing Notice (#7) — sent when an invoice goes overdue. */
export async function sendUnpaidInvoiceEmail(invoiceId: string): Promise<void> {
  try {
    const inv = await prismaAdmin.invoice.findUnique({
      where: { id: invoiceId },
      include: { tenant: { select: tenantSelect } },
    });
    if (!inv) return;

    const to = recipient(inv.tenant);
    if (!to) {
      console.warn(`[billing-email] invoice ${inv.invoiceNumber}: no billing/contact email on tenant — skipping unpaid notice.`);
      return;
    }

    const due = inv.dueAt ?? inv.periodEnd;
    const now = new Date();

    await sendUnpaidBillingNotice(to, {
      firstName: firstName(inv.tenant),
      companyName: inv.tenant.name,
      invoiceNumber: inv.invoiceNumber,
      payUrl: BILLING_PORTAL_URL,
      amount: formatCentavos(inv.total, { withSymbol: true }),
      daysOverdue: daysBetween(due, now),
      originalDueDate: longDate(due),
      billingPeriod: billingPeriod(inv.periodStart, inv.periodEnd),
      settleByDate: longDate(addDays(now, SETTLE_GRACE_DAYS)),
    });
  } catch (e) {
    console.error("[billing-email] unpaid notice failed:", e);
  }
}

/**
 * Deactivation Notice (#8) — sent when a tenant's subscription is cancelled
 * while a bill is still outstanding. Anchored to the oldest outstanding
 * (OPEN/OVERDUE) invoice; if the tenant owes nothing, the template (which is
 * entirely invoice-centric) has nothing to reference, so we skip silently.
 */
export async function sendDeactivationEmailForTenant(tenantId: string): Promise<void> {
  try {
    const inv = await prismaAdmin.invoice.findFirst({
      where: { tenantId, status: { in: ["OPEN", "OVERDUE"] } },
      orderBy: { dueAt: "asc" }, // oldest outstanding first
      include: { tenant: { select: tenantSelect } },
    });
    if (!inv) {
      console.log(`[billing-email] tenant ${tenantId} cancelled with no outstanding invoice — skipping deactivation notice.`);
      return;
    }

    const to = recipient(inv.tenant);
    if (!to) {
      console.warn(`[billing-email] tenant ${tenantId}: no billing/contact email — skipping deactivation notice.`);
      return;
    }

    const now = new Date();
    const suspendedSince = inv.dueAt ?? inv.issuedAt ?? now;

    await sendDeactivationNotice(to, {
      firstName: firstName(inv.tenant),
      companyName: inv.tenant.name,
      invoiceNumber: inv.invoiceNumber,
      payUrl: BILLING_PORTAL_URL,
      amount: formatCentavos(inv.total, { withSymbol: true }),
      suspendedSince: longDate(suspendedSince),
      deactivatesOn: longDate(addDays(now, DEACTIVATE_GRACE_DAYS)),
    });
  } catch (e) {
    console.error("[billing-email] deactivation notice failed:", e);
  }
}
