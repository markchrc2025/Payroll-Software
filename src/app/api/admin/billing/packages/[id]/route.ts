import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prismaAdmin from "@/lib/prisma-admin";
import { requireCentralPermission } from "@/lib/central-permission";
import { ok, err, notFound, serverError } from "@/lib/api-response";
import { writeCentralAudit } from "@/lib/central/audit";
import { getClientIp } from "@/lib/audit";
import { z } from "zod";

function serialize(p: { monthlyPrice: bigint; annualPrice: bigint } & Record<string, unknown>) {
  return { ...p, monthlyPrice: Number(p.monthlyPrice), annualPrice: Number(p.annualPrice) };
}

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).nullable().optional(),
  tier: z.enum(["STARTER", "GROWTH", "PRO"]).nullable().optional(),
  monthlyPrice: z.number().int().nonnegative().optional(),
  annualPrice: z.number().int().nonnegative().optional(),
  taxRateBps: z.number().int().min(0).max(10000).optional(),
  currency: z.string().min(1).max(8).optional(),
  isActive: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  features: z.array(z.string().max(120)).max(20).optional(),
});

// PATCH /api/admin/billing/packages/[id] — edit a package (incl. publish toggle).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCentralPermission("BILLING", "MANAGE");
  if (ctx instanceof Response) return ctx;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Invalid request", 400, parsed.error.flatten());
  const r = parsed.data;

  try {
    const data: Prisma.BillingPackageUpdateInput = {};
    if (r.name !== undefined) data.name = r.name;
    if (r.description !== undefined) data.description = r.description;
    if (r.tier !== undefined) data.tier = r.tier;
    if (r.monthlyPrice !== undefined) data.monthlyPrice = BigInt(r.monthlyPrice);
    if (r.annualPrice !== undefined) data.annualPrice = BigInt(r.annualPrice);
    if (r.taxRateBps !== undefined) data.taxRateBps = r.taxRateBps;
    if (r.currency !== undefined) data.currency = r.currency;
    if (r.isActive !== undefined) data.isActive = r.isActive;
    if (r.isPublished !== undefined) data.isPublished = r.isPublished;
    if (r.sortOrder !== undefined) data.sortOrder = r.sortOrder;
    if (r.features !== undefined) data.features = r.features as unknown as Prisma.InputJsonValue;

    const updated = await prismaAdmin.billingPackage.update({ where: { id }, data });

    await writeCentralAudit({
      actorUserId: ctx.userId,
      action: r.isPublished !== undefined ? (r.isPublished ? "published package" : "unpublished package") : "updated package",
      target: updated.name,
      kind: "BILLING",
      ipAddress: getClientIp(req),
    });

    return ok(serialize(updated), "Package updated");
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025") {
      return notFound("Package");
    }
    console.error("[billing/packages/[id]] PATCH", e);
    return serverError(e);
  }
}

// DELETE /api/admin/billing/packages/[id] — remove a package (blocked if in use).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCentralPermission("BILLING", "MANAGE");
  if (ctx instanceof Response) return ctx;

  const { id } = await params;
  try {
    const pkg = await prismaAdmin.billingPackage.findUnique({
      where: { id },
      select: { id: true, name: true, _count: { select: { subscriptions: true } } },
    });
    if (!pkg) return notFound("Package");
    if (pkg._count.subscriptions > 0) {
      return err(
        `${pkg._count.subscriptions} tenant(s) are on this package. Unpublish it instead, or move them to another package first.`,
        409,
      );
    }

    await prismaAdmin.billingPackage.delete({ where: { id } });
    await writeCentralAudit({
      actorUserId: ctx.userId,
      action: "deleted package",
      target: pkg.name,
      kind: "BILLING",
      ipAddress: getClientIp(req),
    });

    return ok({ id }, "Package deleted");
  } catch (e) {
    console.error("[billing/packages/[id]] DELETE", e);
    return serverError(e);
  }
}
