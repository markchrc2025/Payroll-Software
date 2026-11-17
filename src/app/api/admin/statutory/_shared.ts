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
import { birTableProblems, type BirTableInput } from "@/lib/statutory/bir-table";

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

  // PAY-161: a new BIR table must be one the engine can apply as written:
  // every pay frequency, starting at ₱0, floors going up. Checked on publish
  // only, so versions already stored (and the payroll that reads them) are
  // untouched.
  if (category === "BIR_WITHHOLDING_TABLE") {
    const problems = birTableProblems(parsed.data.payload as BirTableInput);
    if (problems.length > 0) {
      return err(`The BIR table has ${problems.length} problem(s): ${problems.join(" ")}`, 400, { problems });
    }
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
// DELETE — hard-delete, REFUSED once the rule's window overlaps a payroll period
// ---------------------------------------------------------------------------

/**
 * Find a PayrollBook whose period overlaps this rule's effective window (unit 1.2).
 *
 * Reference data stops being reference data the moment it has priced a payslip:
 * deleting such a rule makes the period it covered unrecomputable, which
 * retroactively falsifies documents that were correct when issued.
 *
 * OVERLAP, not exact match, and deliberately conservative. The resolver selects
 * on `periodEnd` alone (asOf = periodEnd), so the tightest possible test would be
 * "is any book's periodEnd inside [effectiveFrom, effectiveTo)". We use the wider
 * overlap test because a tenant override can shadow a global rule for part of a
 * window, so a narrow test could clear a rule that did in fact price something.
 * For a destructive, irreversible operation, refusing too often is the correct
 * direction to be wrong in.
 *
 * NOTE — this is a PROXY, not a fact. Nothing on PayrollBook or PayrollSheet
 * records which StatutoryRule version produced a given sheet (there is no FK and
 * no version string in `statutoryBreakdown`), so "this rule priced a payslip"
 * cannot currently be answered exactly. See the unit report.
 */
export type BookClient = {
  payrollBook: {
    findFirst: (args: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
      orderBy?: Record<string, string>;
    }) => Promise<{
      id: string;
      tenantId: string;
      periodStart: Date;
      periodEnd: Date;
      status: string;
      runType: string;
    } | null>;
  };
};

export async function findConflictingBook(
  rule: {
    tenantId: string | null;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  },
  client: BookClient = prismaAdmin as unknown as BookClient,
) {
  return client.payrollBook.findFirst({
    where: {
      // A global rule (tenantId NULL) applies to every tenant; a tenant override
      // only to its own.
      ...(rule.tenantId ? { tenantId: rule.tenantId } : {}),
      // A CANCELLED book never priced anything.
      status: { not: "CANCELLED" },
      periodEnd: { gte: rule.effectiveFrom },
      ...(rule.effectiveTo ? { periodStart: { lt: rule.effectiveTo } } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      runType: true,
    },
    orderBy: { periodEnd: "asc" },
  });
}

export async function deleteStatutoryRule(
  req: NextRequest,
  id: string,
  category: StatutoryCategory,
) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  const existing = await prismaAdmin.statutoryRule.findFirst({
    where: { id, category, tenantId: null },
    select: { id: true, tenantId: true, version: true, effectiveFrom: true, effectiveTo: true },
  });
  if (!existing) return notFound("StatutoryRule");

  try {
    const conflict = await findConflictingBook(existing);
    if (conflict) {
      const from = existing.effectiveFrom.toISOString().slice(0, 10);
      const to = existing.effectiveTo ? existing.effectiveTo.toISOString().slice(0, 10) : "open-ended";
      const bookFrom = conflict.periodStart.toISOString().slice(0, 10);
      const bookTo = conflict.periodEnd.toISOString().slice(0, 10);
      return err(
        `Cannot delete ${category} rule "${existing.version}" (effective ${from} → ${to}): ` +
          `its window overlaps payroll book ${conflict.id} ` +
          `(tenant ${conflict.tenantId}, ${conflict.runType}, ${conflict.status}, period ${bookFrom} → ${bookTo}). ` +
          `Deleting it would make that period unrecomputable. ` +
          `To supersede this rule, publish a NEW version and set this one's effectiveTo instead.`,
        409,
      );
    }

    await prismaAdmin.statutoryRule.delete({ where: { id } });
    return ok({ id }, "Statutory rule deleted");
  } catch (e) {
    return serverError(e);
  }
}
