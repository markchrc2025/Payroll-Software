/**
 * GET  /api/leave-workflows  — List all leave workflow templates for the tenant
 * POST /api/leave-workflows  — Create a new template
 */

import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-response";
import { z } from "zod";

const VALID_NOTIFY = ["none", "final", "finalrej", "interim", "all"] as const;
const VALID_ROLES  = ["supervisor", "line_manager", "dept_head", "hr_manager", "ceo"] as const;

const createSchema = z.object({
  code:        z.string().min(1).max(50).transform((v) => v.toUpperCase()),
  description: z.string().max(500).optional().nullable(),
  isActive:    z.boolean().optional().default(true),
  approvers:   z.array(z.enum(VALID_ROLES)).default([]),
  notify:      z.enum(VALID_NOTIFY).default("none"),
  recipients:  z.array(z.enum(VALID_ROLES)).default([]),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const rows = await withTenant(auth.tenantId, (tx) =>
    tx.leaveWorkflow.findMany({
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

  const { code, description, isActive, approvers, notify, recipients } = parsed.data;

  const existing = await withTenant(auth.tenantId, (tx) =>
    tx.leaveWorkflow.findFirst({
      where: { tenantId: auth.tenantId, code, deletedAt: null },
    })
  );
  if (existing) return err(`Workflow with code "${code}" already exists`, 409);

  const row = await withTenant(auth.tenantId, (tx) =>
    tx.leaveWorkflow.create({
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
}
