/**
 * GET   /api/admin/tenants/[id] — get tenant details
 * PATCH /api/admin/tenants/[id] — update subscriptionTier, subscriptionStatus, featureFlags, etc.
 *
 * Requires SUPER_ADMIN system role. Uses prismaAdmin (BYPASSRLS).
 */
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prismaAdmin from "@/lib/prisma-admin";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { ok, err, unauthorized, notFound, serverError } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { z } from "zod";

const patchTenantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  tradeName: z.string().max(200).nullable().optional(),
  subdomain: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/).nullable().optional(),
  industry: z.string().max(100).nullable().optional(),
  subscriptionTier: z.enum(["STARTER", "GROWTH", "PRO"]).optional(),
  subscriptionStatus: z.enum(["ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED"]).optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
  billingEmail: z.string().email().nullable().optional(),
  /// Merged (not replaced) into existing featureFlags
  featureFlagsPatch: z.record(z.string(), z.boolean()).optional(),
  contactEmail: z.string().email().nullable().optional(),
  contactPhone: z.string().max(30).nullable().optional(),
  tinNumber: z.string().max(20).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  province: z.string().max(100).nullable().optional(),
  zipCode: z.string().max(10).nullable().optional(),
  payrollCycle: z.enum(["DAILY", "WEEKLY", "BI_WEEKLY", "SEMI_MONTHLY", "MONTHLY"]).optional(),
  payDay1: z.number().int().min(0).max(28).nullable().optional(),
  payDay2: z.number().int().min(0).max(28).nullable().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  const { id } = await params;

  try {
  const tenant = await prismaAdmin.tenant.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      tradeName: true,
      subdomain: true,
      industry: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      billingEmail: true,
      featureFlags: true,
      payrollCycle: true,
      payDay1: true,
      payDay2: true,
      thirteenthMonthBasis: true,
      statutoryCutoffRule: true,
      workingDaysDenominator: true,
      contactEmail: true,
      contactPhone: true,
      tinNumber: true,
      address: true,
      city: true,
      province: true,
      zipCode: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { employees: true, users: true, payrollBooks: true } },
    },
  });

  if (!tenant) return notFound("Tenant");
  return ok(tenant);
  } catch (e) {
    console.error("[GET /api/admin/tenants/[id]] Prisma error:", e);
    return serverError(e);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  const { id } = await params;

  const existing = await prismaAdmin.tenant.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, featureFlags: true, subscriptionTier: true },
  });
  if (!existing) return notFound("Tenant");

  const body = await req.json().catch(() => null);
  const parsed = patchTenantSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());

  const { featureFlagsPatch, trialEndsAt, ...rest } = parsed.data;

  // Merge featureFlags patch into existing flags
  const mergedFlags = featureFlagsPatch
    ? { ...(existing.featureFlags as Record<string, boolean>), ...featureFlagsPatch }
    : undefined;

  try {
    const updated = await prismaAdmin.tenant.update({
      where: { id },
      data: {
        ...rest,
        ...(trialEndsAt !== undefined ? { trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null } : {}),
        ...(mergedFlags !== undefined ? { featureFlags: mergedFlags as unknown as Prisma.InputJsonValue } : {}),
      },
      select: {
        id: true,
        name: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        featureFlags: true,
        updatedAt: true,
      },
    });

    await writeAuditLog({
      tenantId: id,
      actorUserId: ctx.userId,
      action: "UPDATE",
      entity: "Tenant",
      entityId: id,
      changes: { before: { subscriptionTier: existing.subscriptionTier }, after: { subscriptionTier: updated.subscriptionTier } },
      ipAddress: getClientIp(req),
    });

    return ok(updated, "Tenant updated");
  } catch (e: unknown) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return err("Subdomain already in use", 409);
    }
    return serverError(e);
  }
}
