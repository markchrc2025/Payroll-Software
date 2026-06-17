/**
 * GET    /api/leave-workflows/[id]  — Fetch one template
 * PATCH  /api/leave-workflows/[id]  — Update
 * DELETE /api/leave-workflows/[id]  — Soft-delete (blocks if assigned to employees)
 */

import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-response";
import { z } from "zod";

const VALID_NOTIFY = ["none", "final", "finalrej", "interim", "all"] as const;
const VALID_ROLES  = ["supervisor", "line_manager", "dept_head", "hr_manager", "ceo"] as const;

const patchSchema = z.object({
  code:        z.string().min(1).max(50).transform((v) => v.toUpperCase()).optional(),
  description: z.string().max(500).optional().nullable(),
  isActive:    z.boolean().optional(),
  approvers:   z.array(z.enum(VALID_ROLES)).optional(),
  notify:      z.enum(VALID_NOTIFY).optional(),
  recipients:  z.array(z.enum(VALID_ROLES)).optional(),
});

async function resolve(id: string, tenantId: string) {
  return withTenant(tenantId, (tx) =>
    tx.leaveWorkflow.findFirst({
      where: { id, tenantId, deletedAt: null },
    })
  );
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await params;
  const row = await resolve(id, auth.tenantId);
  if (!row) return err("Not found", 404);
  return ok(row);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await params;
  const row = await resolve(id, auth.tenantId);
  if (!row) return err("Not found", 404);

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const v = parsed.data;

  // Unique-code check if code is changing
  if (v.code && v.code !== row.code) {
    const clash = await withTenant(auth.tenantId, (tx) =>
      tx.leaveWorkflow.findFirst({
        where: { tenantId: auth.tenantId, code: v.code!, deletedAt: null, NOT: { id } },
      })
    );
    if (clash) return err(`Workflow with code "${v.code}" already exists`, 409);
  }

  const updated = await withTenant(auth.tenantId, (tx) =>
    tx.leaveWorkflow.update({
      where: { id },
      data: {
        ...(v.code        !== undefined && { code: v.code }),
        ...(v.description !== undefined && { description: v.description ?? null }),
        ...(v.isActive    !== undefined && { isActive: v.isActive }),
        ...(v.approvers   !== undefined && { approvers: v.approvers }),
        ...(v.notify      !== undefined && { notify: v.notify }),
        ...(v.recipients  !== undefined && { recipients: v.recipients }),
      },
    })
  );

  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { id } = await params;
  const row = await resolve(id, auth.tenantId);
  if (!row) return err("Not found", 404);

  // Block deletion if any employment term is currently using this workflow's code
  const inUse = await withTenant(auth.tenantId, (tx) =>
    tx.employmentTerm.count({
      where: { tenantId: auth.tenantId, leaveWorkflowKey: row.code },
    })
  );
  if (inUse > 0) {
    return err(
      `Cannot delete: "${row.code}" is assigned to ${inUse} employment term${inUse > 1 ? "s" : ""}`,
      409
    );
  }

  await withTenant(auth.tenantId, (tx) =>
    tx.leaveWorkflow.update({ where: { id }, data: { deletedAt: new Date() } })
  );

  return ok({ id });
}
