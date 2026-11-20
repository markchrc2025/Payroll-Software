/**
 * /api/settings/tenant
 *   GET  — fetch current tenant settings
 *   PATCH — update tenant settings (company info + payroll defaults)
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, ok, unauthorized } from "@/lib/api-response";
import { forbidUnless } from "@/lib/authz/route-permission";

const INDUSTRY_LIST = [
  "Agriculture",
  "BPO / Outsourcing",
  "Construction",
  "Education",
  "Financial Services",
  "Food & Beverage",
  "Government",
  "Healthcare",
  "Hospitality & Tourism",
  "IT / Software",
  "Legal Services",
  "Logistics / Supply Chain",
  "Manufacturing",
  "Media & Advertising",
  "Non-Profit / NGO",
  "Real Estate",
  "Retail / E-Commerce",
  "Telecommunications",
  "Transport",
  "Other",
];
void INDUSTRY_LIST;

const patchSchema = z.object({
  // Company info
  name:            z.string().min(1).max(200).optional(),
  tradeName:       z.string().max(200).nullish(),
  industry:        z.string().max(120).nullish(),
  contactEmail:    z.string().email().max(200).nullish(),
  contactPhone:    z.string().max(40).nullish(),
  address:         z.string().max(400).nullish(),
  city:            z.string().max(120).nullish(),
  province:        z.string().max(120).nullish(),
  zipCode:         z.string().max(20).nullish(),
  logoUrl:         z.string().url().max(1000).nullish(),
  logoKey:         z.string().max(500).nullish(),
  // Payroll defaults
  payrollCycle: z
    .enum(["DAILY", "WEEKLY", "SEMI_MONTHLY", "MONTHLY"])
    .optional(),
  workingDaysDenominator: z.number().int().min(1).max(400).optional(),
  statutoryCutoffRule: z
    .enum(["FIRST_CUTOFF", "SECOND_CUTOFF"])
    .optional(),
  thirteenthMonthBasis: z
    .enum(["STRICT_DOLE", "INCLUDE_ALLOWANCES"])
    .optional(),
  // "No negative pay" safeguard: max % of monthly gross that statutory + loan
  // deductions may consume. New loans breaching this are blocked at creation.
  maxDeductionPctOfGross: z.number().int().min(1).max(100).optional(),
  // PAY-146: deduct an unpaid meal break only on days longer than this (minutes).
  breakDeductAfterMinutes: z.number().int().min(0).max(1440).optional(),
  // Whether FINAL_PAY runs may go negative (terminal charges on separation).
  // REGULAR/YEAR_END runs are always floored regardless of this flag.
  allowNegativeFinalPay: z.boolean().optional(),
  // PAY-172: hold the pay of an employee whose cutoff DTR is not fully approved.
  strictDtrPolicy: z.boolean().optional(),
  // PAY-143: other earnings in each contribution's base.
  sssIncludeEarnings: z.boolean().optional(),
  sssIncludePremiums: z.boolean().optional(),
  philhealthIncludeEarnings: z.boolean().optional(),
  philhealthIncludePremiums: z.boolean().optional(),
  pagibigIncludeEarnings: z.boolean().optional(),
  pagibigIncludePremiums: z.boolean().optional(),
  // Night-shift differential window (NSD is always computed; only the window
  // is configurable). HH:MM, 24-hour.
  nsdWindowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:MM (24h)").optional(),
  nsdWindowEnd:   z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:MM (24h)").optional(),
  // Timekeeping timezone: company IANA tz + whether DTR follows company or
  // each employee's own timezone.
  timezone:                z.string().min(1).max(64).optional(),
  timekeepingTimezoneMode: z.enum(["COMPANY", "EMPLOYEE"]).optional(),
  // Employee ID format — prefix/suffix restricted to URL-safe characters so
  // the Employee ID can be used directly in routes (e.g. /employees/EMP-0001).
  empIdPrefix:      z.string().max(20).regex(/^[A-Za-z0-9._-]*$/, "Only letters, numbers, and . _ - are allowed").optional(),
  empIdIncludeYear: z.boolean().optional(),
  empIdPadding:     z.number().int().min(1).max(10).optional(),
  empIdSuffix:      z.string().max(20).regex(/^[A-Za-z0-9._-]*$/, "Only letters, numbers, and . _ - are allowed").optional(),
  empIdNextSeq:     z.number().int().positive().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // Unit 0.25, Mark's ruling of 10 Nov: locked. This returns the company's
  // payroll rules (pay cycle, statutory cutoff, 13th month basis, maximum
  // deduction %, night-differential window, employee ID numbering), not just
  // branding. Only the Settings screens call it; the logo stays open.
  const denied = await forbidUnless(auth, ["SETTINGS", "READ"]);
  if (denied) return denied;

  const tenant = await withTenant(auth.tenantId, (tx) =>
    tx.tenant.findFirst({
      where: { id: auth.tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        tradeName: true,
        industry: true,
        contactEmail: true,
        contactPhone: true,
        address: true,
        city: true,
        province: true,
        zipCode: true,
        country: true,
        logoUrl: true,
        logoKey: true,
        payrollCycle: true,
        workingDaysDenominator: true,
        statutoryCutoffRule: true,
        thirteenthMonthBasis: true,
        maxDeductionPctOfGross: true,
        breakDeductAfterMinutes: true,
        allowNegativeFinalPay: true,
        strictDtrPolicy: true,
        sssIncludeEarnings: true, sssIncludePremiums: true, philhealthIncludeEarnings: true,
        philhealthIncludePremiums: true, pagibigIncludeEarnings: true, pagibigIncludePremiums: true,
        nsdWindowStart: true,
        nsdWindowEnd: true,
        timezone: true,
        timekeepingTimezoneMode: true,
        empIdPrefix: true,
        empIdIncludeYear: true,
        empIdPadding: true,
        empIdSuffix: true,
        empIdNextSeq: true,
        empIdSeqYear: true,
        updatedAt: true,
      },
    }),
  );

  if (!tenant) return err("Tenant not found", 404);
  return ok(tenant);
}

export async function PATCH(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // Unit 0.25: the caller's role must allow this, not just a sign-in.
  const denied = await forbidUnless(auth, ["SETTINGS", "UPDATE"]);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());

  const data = parsed.data;

  // Guard: empIdNextSeq can only advance, never go back.
  if (data.empIdNextSeq !== undefined) {
    const current = await withTenant(auth.tenantId, (tx) =>
      tx.tenant.findFirst({
        where: { id: auth.tenantId },
        select: { empIdNextSeq: true },
      }),
    );
    if (current && data.empIdNextSeq < current.empIdNextSeq) {
      return err(
        `Cannot set Next Sequence below current value (${current.empIdNextSeq})`,
        422,
      );
    }
  }

  const updated = await withTenant(auth.tenantId, (tx) =>
    tx.tenant.update({
      where: { id: auth.tenantId },
      data,
      select: {
        id: true,
        name: true,
        tradeName: true,
        industry: true,
        contactEmail: true,
        contactPhone: true,
        address: true,
        city: true,
        province: true,
        zipCode: true,
        country: true,
        logoUrl: true,
        logoKey: true,
        payrollCycle: true,
        workingDaysDenominator: true,
        statutoryCutoffRule: true,
        thirteenthMonthBasis: true,
        maxDeductionPctOfGross: true,
        breakDeductAfterMinutes: true,
        allowNegativeFinalPay: true,
        strictDtrPolicy: true,
        sssIncludeEarnings: true, sssIncludePremiums: true, philhealthIncludeEarnings: true,
        philhealthIncludePremiums: true, pagibigIncludeEarnings: true, pagibigIncludePremiums: true,
        nsdWindowStart: true,
        nsdWindowEnd: true,
        timezone: true,
        timekeepingTimezoneMode: true,
        empIdPrefix: true,
        empIdIncludeYear: true,
        empIdPadding: true,
        empIdSuffix: true,
        empIdNextSeq: true,
        empIdSeqYear: true,
        updatedAt: true,
      },
    }),
  );

  return ok(updated);
}
