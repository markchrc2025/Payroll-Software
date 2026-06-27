/**
 * PATCH /api/org-chart/reassign — Re-assign an employee's reporting line.
 *
 * Body: { employeeId, targetEmployeeId?: string|null, targetPositionId?: string|null }
 *  - targetEmployeeId  → employee reports to a person (sets immediateSupervisorId)
 *  - targetPositionId  → employee reports to a (vacant) role (sets reportsToPositionId)
 *  - both null         → employee becomes a top-level node (clears both)
 *
 * Enforces the no-cycle rule server-side: you cannot make someone report to a
 * node that currently sits within their own subtree (directly or transitively).
 */

import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-response";
import { z } from "zod";

const schema = z
  .object({
    employeeId: z.string(),
    targetEmployeeId: z.string().nullable().optional(),
    targetPositionId: z.string().nullable().optional(),
  })
  .refine((v) => !(v.targetEmployeeId && v.targetPositionId), {
    message: "Provide either a target employee or a target position, not both",
  });

export async function PATCH(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const { employeeId, targetEmployeeId, targetPositionId } = parsed.data;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) return { ok: false as const, error: "Employee not found in your tenant" as const, status: 404 };

    // Build the current effective-manager map for the whole tenant so we can
    // walk the hierarchy and reject cycles.
    const all = await tx.employee.findMany({
      where: { tenantId: auth.tenantId, deletedAt: null },
      select: { id: true, employeeNumber: true, immediateSupervisorId: true, reportsToPositionId: true, positionId: true },
    });

    // positionId → incumbent employee id (deterministic: lowest employeeNumber)
    const incumbentOf = new Map<string, string>();
    for (const e of all) {
      if (!e.positionId) continue;
      const cur = incumbentOf.get(e.positionId);
      if (!cur) incumbentOf.set(e.positionId, e.id);
      else {
        const curEmp = all.find((x) => x.id === cur);
        if (curEmp && e.employeeNumber < curEmp.employeeNumber) incumbentOf.set(e.positionId, e.id);
      }
    }

    const byId = new Map(all.map((e) => [e.id, e]));
    const effectiveManager = (id: string): string | null => {
      const e = byId.get(id);
      if (!e) return null;
      if (e.immediateSupervisorId) return e.immediateSupervisorId;
      if (e.reportsToPositionId) return incumbentOf.get(e.reportsToPositionId) ?? null;
      return null;
    };

    // Is `ancestorId` an ancestor of `nodeId` in the current tree?
    const isAncestor = (ancestorId: string, nodeId: string): boolean => {
      const seen = new Set<string>();
      let cur = effectiveManager(nodeId);
      while (cur) {
        if (cur === ancestorId) return true;
        if (seen.has(cur)) break; // defensive: pre-existing cycle
        seen.add(cur);
        cur = effectiveManager(cur);
      }
      return false;
    };

    let data: { immediateSupervisorId: string | null; reportsToPositionId: string | null };

    if (targetEmployeeId) {
      if (targetEmployeeId === employeeId) return { ok: false as const, error: "An employee cannot report to themselves" as const, status: 409 };
      const target = await tx.employee.findFirst({
        where: { id: targetEmployeeId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!target) return { ok: false as const, error: "Target employee not found in your tenant" as const, status: 404 };
      if (isAncestor(employeeId, targetEmployeeId)) {
        return { ok: false as const, error: "That move would create a reporting cycle" as const, status: 409 };
      }
      data = { immediateSupervisorId: targetEmployeeId, reportsToPositionId: null };
    } else if (targetPositionId) {
      const position = await tx.position.findFirst({
        where: { id: targetPositionId, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!position) return { ok: false as const, error: "Target position not found in your tenant" as const, status: 404 };
      // If the role is currently filled, treat its incumbent as the manager for
      // the purpose of cycle detection and self-report.
      const inc = incumbentOf.get(targetPositionId) ?? null;
      if (inc === employeeId) return { ok: false as const, error: "An employee cannot report to their own role" as const, status: 409 };
      if (inc && isAncestor(employeeId, inc)) {
        return { ok: false as const, error: "That move would create a reporting cycle" as const, status: 409 };
      }
      data = { immediateSupervisorId: null, reportsToPositionId: targetPositionId };
    } else {
      // Clear → top-level node.
      data = { immediateSupervisorId: null, reportsToPositionId: null };
    }

    await tx.employee.update({ where: { id: employeeId }, data });
    return { ok: true as const };
  });

  if (!result.ok) return err(result.error, result.status);
  return ok({ employeeId, targetEmployeeId: targetEmployeeId ?? null, targetPositionId: targetPositionId ?? null });
}
