/**
 * Shared factory for statutory admin routes.
 *
 * Each category (SSS, PhilHealth, Pag-IBIG, BIR, MinimumWage, DeMinis) has
 * identical CRUD mechanics — only the category constant and payload validator
 * differ.  This module exports helpers to avoid repeating that logic 6 times.
 */
import type { NextRequest } from "next/server";
import type { StatutoryCategory } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prismaAdmin from "@/lib/prisma-admin";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { ok, err, unauthorized, notFound, serverError, paginated } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { parseStatutoryPayload } from "@/lib/statutory/types";

// ---------------------------------------------------------------------------
// Shared create schema (payload validated by each route via parseStatutoryPayload)
// ---------------------------------------------------------------------------
export const createStatutoryRuleSchema = z.object({
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().nullable().optional(),
  legalBasis: z.string().min(1).max(500),
  version: z.string().min(1).max(100),
  payload: z.record(z.string(), z.unknown()),
});

export const patchStatutoryRuleSchema = z.object({
  effectiveTo: z.string().datetime().nullable().optional(),
  legalBasis: z.string().min(1).max(500).optional(),
});

// ---------------------------------------------------------------------------
// GET — list all global (tenantId IS NULL) rows for a category
// ---------------------------------------------------------------------------
export async function listStatutoryRules(
  req: NextRequest,
  category: StatutoryCategory,
) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  const url = new URL(req.url);
  const page  = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const skip  = (page - 1) * limit;

  const where = { category, tenantId: null };

  const [total, rows] = await Promise.all([
    prismaAdmin.statutoryRule.count({ where }),
    prismaAdmin.statutoryRule.findMany({
      where,
      orderBy: { effectiveFrom: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        category: true,
        effectiveFrom: true,
        effectiveTo: true,
        legalBasis: true,
        version: true,
        payload: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  return paginated(rows, total, page, limit);
}

// ---------------------------------------------------------------------------
// POST — create a new global rule for a category
// ---------------------------------------------------------------------------
export async function createStatutoryRule(
  req: NextRequest,
  category: StatutoryCategory,
) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = createStatutoryRuleSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());

  // Validate payload shape for category
  try {
    parseStatutoryPayload(category, parsed.data.payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(`Payload validation failed for ${category}: ${msg}`, 400);
  }

  try {
    const rule = await prismaAdmin.statutoryRule.create({
      data: {
        tenantId: null,
        category,
        effectiveFrom: new Date(parsed.data.effectiveFrom),
        effectiveTo: parsed.data.effectiveTo ? new Date(parsed.data.effectiveTo) : null,
        legalBasis: parsed.data.legalBasis,
        version: parsed.data.version,
        payload: parsed.data.payload as unknown as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        category: true,
        effectiveFrom: true,
        effectiveTo: true,
        legalBasis: true,
        version: true,
        payload: true,
        createdAt: true,
      },
    });

    // Use the seed tenant for audit (global rules don't belong to a tenant, 
    // but AuditLog requires a tenantId; we log against the first active tenant)
    const firstTenant = await prismaAdmin.tenant.findFirst({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (firstTenant) {
      await writeAuditLog({
        tenantId: firstTenant.id,
        actorUserId: ctx.userId,
        action: "CREATE",
        entity: "StatutoryRule",
        entityId: rule.id,
        changes: { category, version: rule.version },
        ipAddress: getClientIp(req),
      });
    }

    return ok(rule, "Statutory rule created", 201);
  } catch (e: unknown) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return err(`A rule with this version already exists for ${category}`, 409);
    }
    return serverError(e);
  }
}

// ---------------------------------------------------------------------------
// PATCH — update effectiveTo / legalBasis on an existing rule
// ---------------------------------------------------------------------------
export async function patchStatutoryRule(
  req: NextRequest,
  id: string,
  category: StatutoryCategory,
) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  const existing = await prismaAdmin.statutoryRule.findFirst({
    where: { id, category, tenantId: null },
    select: { id: true },
  });
  if (!existing) return notFound("StatutoryRule");

  const body = await req.json().catch(() => null);
  const parsed = patchStatutoryRuleSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());

  try {
    const updated = await prismaAdmin.statutoryRule.update({
      where: { id },
      data: {
        ...(parsed.data.effectiveTo !== undefined
          ? { effectiveTo: parsed.data.effectiveTo ? new Date(parsed.data.effectiveTo) : null }
          : {}),
        ...(parsed.data.legalBasis !== undefined
          ? { legalBasis: parsed.data.legalBasis }
          : {}),
      },
      select: {
        id: true,
        category: true,
        effectiveFrom: true,
        effectiveTo: true,
        legalBasis: true,
        version: true,
        updatedAt: true,
      },
    });
    return ok(updated, "Statutory rule updated");
  } catch (e) {
    return serverError(e);
  }
}

// ---------------------------------------------------------------------------
// DELETE — hard-delete (statutory rules are reference data; soft-delete not needed)
// ---------------------------------------------------------------------------
export async function deleteStatutoryRule(
  req: NextRequest,
  id: string,
  category: StatutoryCategory,
) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  const existing = await prismaAdmin.statutoryRule.findFirst({
    where: { id, category, tenantId: null },
    select: { id: true },
  });
  if (!existing) return notFound("StatutoryRule");

  try {
    await prismaAdmin.statutoryRule.delete({ where: { id } });
    return ok({ id }, "Statutory rule deleted");
  } catch (e) {
    return serverError(e);
  }
}
