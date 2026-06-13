/**
 * Central Portal metrics — shared, server-side derivations used across the
 * super-admin endpoints (tenants list, tenant detail, dashboard, billing,
 * analytics). Keeps MRR/health logic in one place so every screen agrees.
 *
 * Monetary values are BigInt centavos in the DB; helpers return whole-peso
 * numbers for display.
 */

import type { SubscriptionStatus, BillingCycle } from "@prisma/client";

/** Format whole pesos as ₱-prefixed en-PH string. */
export function peso(amount: number): string {
  return "₱" + Math.round(amount).toLocaleString("en-PH");
}

/** Convert BigInt centavos → whole-peso number. */
export function toPesos(centavos: bigint | number | null | undefined): number {
  if (centavos == null) return 0;
  return Math.round(Number(centavos) / 100);
}

type SubscriptionForMrr = {
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  package: { monthlyPrice: bigint; annualPrice: bigint } | null;
} | null;

/**
 * Monthly recurring revenue for a single tenant, in whole pesos.
 * Trialing/cancelled tenants contribute 0 (not yet / no longer paying).
 * Annual subscriptions are normalized to a monthly figure.
 */
export function tenantMrrPesos(sub: SubscriptionForMrr): number {
  if (!sub || !sub.package) return 0;
  if (sub.status !== "ACTIVE" && sub.status !== "PAST_DUE") return 0;
  if (sub.billingCycle === "ANNUAL") {
    return Math.round(toPesos(sub.package.annualPrice) / 12);
  }
  return toPesos(sub.package.monthlyPrice);
}

export type HealthBand = "Healthy" | "At risk" | "Critical";

export function healthBand(score: number): HealthBand {
  if (score >= 80) return "Healthy";
  if (score >= 50) return "At risk";
  return "Critical";
}

type TenantForHealth = {
  subscriptionStatus: SubscriptionStatus;
  healthScore: number | null;
  /** Count of OPEN/OVERDUE invoices, if known. */
  overdueInvoices?: number;
};

/**
 * Account-health score 0–100. A manual `healthScore` override always wins;
 * otherwise we derive a heuristic from subscription status and overdue
 * invoices. Deterministic (no randomness) so the number is stable across loads.
 */
export function computeHealthScore(t: TenantForHealth): number {
  if (t.healthScore != null) return clamp(t.healthScore);
  let base: number;
  switch (t.subscriptionStatus) {
    case "ACTIVE":    base = 92; break;
    case "TRIALING":  base = 74; break;
    case "PAST_DUE":  base = 48; break;
    case "CANCELLED": base = 18; break;
    default:          base = 70;
  }
  base -= Math.min(30, (t.overdueInvoices ?? 0) * 12);
  return clamp(base);
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Hex color for a health score, matching the design's green/orange/red bands. */
export function healthColor(score: number): string {
  return score >= 80 ? "#1f7a4d" : score >= 50 ? "#c2552f" : "#b23b34";
}

/** Row shape for the shared Central Portal tenant table. */
export type CentralTenantRow = {
  id: string;
  name: string;
  slug: string | null;
  tier: string;
  status: string;
  employees: number;
  mrr: number; // whole pesos
  health: number; // 0–100
  since: string; // ISO date
};
