/**
 * GET  /api/approval-workflows  — List all approval workflow templates for the tenant
 * POST /api/approval-workflows  — Create a new template
 *
 * A workflow's `approvers` is an ordered array of steps; each step has a role key
 * plus per-module toggles controlling which approval types it participates in.
 */

import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized, serverError } from "@/lib/api-response";
import { z } from "zod";

const VALID_NOTIFY = ["none", "final", "finalrej", "interim", "all"] as const;
const VALID_ROLES  = ["supervisor", "line_manager", "dept_head", "hr_manager", "ceo"] as const;

const stepSchema = z.object({
  roleKey:     z.enum(VALID_ROLES),
  forLeave:    z.boolean().default(true),
  forDtr:      z.boolean().default(true),
  forExpense:  z.boolean().default(true),
  forDocument: z.boolean().default(false),
});

const createSchema = z.object({
  code:        z.string().min(1).max(50).transform((v) => v.toUpperCase()),
  description: z.string().max(500).optional().nullable(),
  isActive:    z.boolean().optional().default(true),
  approvers:   z.array(stepSchema).default([]),
  notify:      z.enum(VALID_NOTIFY).default("none"),
  recipients:  z.array(z.enum(VALID_ROLES)).default([]),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const rows = await withTenant(auth.tenantId, (tx) =>
    tx.approvalWorkflow.findMany({
      where:   { tenantId: auth.tenantId, deletedAt: null },
      orderBy: { code: "asc" },
    })
  );

  return ok(rows);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  let { code, description, isActive, approvers, notify, recipients } = parsed.data;

  try {
    // Check active records for user-supplied codes (non-NEW).
    if (code !== "NEW") {
      const existing = await withTenant(auth.tenantId, (tx) =>
        tx.approvalWorkflow.findFirst({
          where: { tenantId: auth.tenantId, code, deletedAt: null },
        })
      );
      if (existing) return err(`Workflow with code "${code}" already exists`, 409);
    } else {
      // "NEW" is a system-generated placeholder — find a unique variant so
      // soft-deleted "NEW" rows don't violate the unique constraint.
      const taken = await withTenant(auth.tenantId, (tx) =>
        tx.approvalWorkflow.findMany({
          where: { tenantId: auth.tenantId, code: { startsWith: "NEW" } },
          select: { code: true },
        })
      );
      const takenSet = new Set(taken.map((r) => r.code));
      if (takenSet.has("NEW")) {
        let n = 2;
        while (takenSet.has(`NEW-${n}`)) n++;
        code = `NEW-${n}`;
      }
    }

    const row = await withTenant(auth.tenantId, (tx) =>
      tx.approvalWorkflow.create({
        data: {
          tenantId:    auth.tenantId,
          code,
          description: description ?? null,
          isActive,
          approvers,
          notify,
          recipients,
        },
      })
    );

    return ok(row, undefined, 201);
  } catch (e) {
    return serverError(e);
  }
}
