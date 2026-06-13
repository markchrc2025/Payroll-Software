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
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

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

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());

  const data = parsed.data;

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
        updatedAt: true,
      },
    }),
  );

  return ok(updated);
}
