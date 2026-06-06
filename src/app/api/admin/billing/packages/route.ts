import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prismaAdmin from "@/lib/prisma-admin";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { ok, err, unauthorized, serverError } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { z } from "zod";

// GET /api/admin/billing/packages
// Returns all billing packages (the catalog of tier pricing).
export async function GET() {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

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

    return ok(packages);
  } catch (e) {
    console.error("[billing/packages] GET", e);
    return serverError();
  }
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  monthlyPrice: z.number().nonnegative().optional(),
  annualPrice: z.number().nonnegative().optional(),
  taxRate: z.number().min(0).max(1).optional(),
  currency: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  features: z.array(z.string()).optional(),
});

// PATCH /api/admin/billing/packages
// Update pricing / tax / status for a package.
export async function PATCH(req: NextRequest) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  try {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return err("Invalid request", 400, parsed.error.flatten());

    const { id, ...rest } = parsed.data;

    const data: Prisma.BillingPackageUpdateInput = {};
    if (rest.name !== undefined) data.name = rest.name;
    if (rest.description !== undefined) data.description = rest.description;
    if (rest.monthlyPrice !== undefined) data.monthlyPrice = new Prisma.Decimal(rest.monthlyPrice);
    if (rest.annualPrice !== undefined) data.annualPrice = new Prisma.Decimal(rest.annualPrice);
    if (rest.taxRate !== undefined) data.taxRate = new Prisma.Decimal(rest.taxRate);
    if (rest.currency !== undefined) data.currency = rest.currency;
    if (rest.isActive !== undefined) data.isActive = rest.isActive;
    if (rest.features !== undefined) data.features = rest.features;

    const updated = await prismaAdmin.billingPackage.update({ where: { id }, data });

    await writeAuditLog({
      actorUserId: ctx.userId,
      action: "UPDATE",
      entity: "BillingPackage",
      entityId: id,
      changes: rest,
      ipAddress: getClientIp(req),
    });

    return ok(updated, "Package updated");
  } catch (e) {
    console.error("[billing/packages] PATCH", e);
    return serverError();
  }
}
