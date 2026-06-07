import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prismaAdmin from "@/lib/prisma-admin";
import { requireCentralPermission } from "@/lib/central-permission";
import { ok, err, serverError } from "@/lib/api-response";
import { z } from "zod";

// Money is stored as BigInt centavos; serialize to Number for JSON responses.
function serialize(p: { monthlyPrice: bigint; annualPrice: bigint } & Record<string, unknown>) {
  return { ...p, monthlyPrice: Number(p.monthlyPrice), annualPrice: Number(p.annualPrice) };
}

// GET /api/admin/billing/packages
// Returns all billing packages (the catalog of tier pricing).
export async function GET() {
  const ctx = await requireCentralPermission("BILLING", "READ");
  if (ctx instanceof Response) return ctx;

  try {
    let packages = await prismaAdmin.billingPackage.findMany({
      orderBy: { monthlyPrice: "asc" },
    });

    // Bootstrap the three tier packages at zero price on first load.
    if (packages.length === 0) {
      const defaults = [
        { tier: "STARTER" as const, name: "Starter" },
        { tier: "GROWTH" as const, name: "Growth" },
        { tier: "PRO" as const, name: "Pro" },
      ];
      await prismaAdmin.billingPackage.createMany({
        data: defaults.map((d) => ({ tier: d.tier, name: d.name })),
        skipDuplicates: true,
      });
      packages = await prismaAdmin.billingPackage.findMany({ orderBy: { monthlyPrice: "asc" } });
    }

    return ok(packages.map(serialize));
  } catch (e) {
    console.error("[billing/packages] GET", e);
    return serverError(e);
  }
}

// Prices are sent from the client in centavos; taxRateBps is basis points.
const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  monthlyPrice: z.number().int().nonnegative().optional(),
  annualPrice: z.number().int().nonnegative().optional(),
  taxRateBps: z.number().int().min(0).max(10000).optional(),
  currency: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  features: z.array(z.string()).optional(),
});

// PATCH /api/admin/billing/packages
// Update pricing / tax / status for a package.
export async function PATCH(req: NextRequest) {
  const ctx = await requireCentralPermission("BILLING", "MANAGE");
  if (ctx instanceof Response) return ctx;

  try {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return err("Invalid request", 400, parsed.error.flatten());

    const { id, ...rest } = parsed.data;

    const data: Prisma.BillingPackageUpdateInput = {};
    if (rest.name !== undefined) data.name = rest.name;
    if (rest.description !== undefined) data.description = rest.description;
    if (rest.monthlyPrice !== undefined) data.monthlyPrice = BigInt(rest.monthlyPrice);
    if (rest.annualPrice !== undefined) data.annualPrice = BigInt(rest.annualPrice);
    if (rest.taxRateBps !== undefined) data.taxRateBps = rest.taxRateBps;
    if (rest.currency !== undefined) data.currency = rest.currency;
    if (rest.isActive !== undefined) data.isActive = rest.isActive;
    if (rest.features !== undefined) data.features = rest.features;

    const updated = await prismaAdmin.billingPackage.update({ where: { id }, data });

    return ok(serialize(updated));
  } catch (e) {
    console.error("[billing/packages] PATCH", e);
    return serverError(e);
  }
}
