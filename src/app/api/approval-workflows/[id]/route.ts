/**
 * GET    /api/approval-workflows/[id]  — Fetch one template
 * PATCH  /api/approval-workflows/[id]  — Update
 * DELETE /api/approval-workflows/[id]  — Soft-delete (blocks if assigned to placements/levels)
 */

import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-response";
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

const patchSchema = z.object({
  code:        z.string().min(1).max(50).transform((v) => v.toUpperCase()).optional(),
  description: z.string().max(500).optional().nullable(),
  isActive:    z.boolean().optional(),
  approvers:   z.array(stepSchema).optional(),
  notify:      z.enum(VALID_NOTIFY).optional(),
  recipients:  z.array(z.enum(VALID_ROLES)).optional(),
});

async function resolve(id: string, tenantId: string) {
  return withTenant(tenantId, (tx) =>
    tx.approvalWorkflow.findFirst({
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
      tx.approvalWorkflow.findFirst({
        where: { tenantId: auth.tenantId, code: v.code!, deletedAt: null, NOT: { id } },
      })
    );
    if (clash) return err(`Workflow with code "${v.code}" already exists`, 409);
  }

  const updated = await withTenant(auth.tenantId, (tx) =>
    tx.approvalWorkflow.update({
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

  // Block deletion if any placement or level is currently using this workflow.
  const [placementUse, levelUse] = await withTenant(auth.tenantId, (tx) =>
    Promise.all([
      tx.placement.count({ where: { tenantId: auth.tenantId, workflowId: id } }),
      tx.jobLevel.count({ where: { tenantId: auth.tenantId, defaultWorkflowId: id } }),
    ])
  );
  if (placementUse > 0 || levelUse > 0) {
    const parts: string[] = [];
    if (placementUse > 0) parts.push(`${placementUse} placement${placementUse > 1 ? "s" : ""}`);
    if (levelUse > 0) parts.push(`${levelUse} level${levelUse > 1 ? "s" : ""}`);
    return err(`Cannot delete: "${row.code}" is assigned to ${parts.join(" and ")}`, 409);
  }

  await withTenant(auth.tenantId, (tx) =>
    tx.approvalWorkflow.update({ where: { id }, data: { deletedAt: new Date() } })
  );

  return ok({ id });
}
