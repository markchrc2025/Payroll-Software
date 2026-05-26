/**
 * GET  /api/departments  — List all departments for the company
 * POST /api/departments  — Create a new department
 */

import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized, serverError } from "@/lib/api-response";
import { z } from "zod";

const createDeptSchema = z.object({
  name: z.string().min(1, "Name is required").max(150),
  code: z.string().max(20).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  parentId: z.string().cuid().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const departments = await prisma.department.findMany({
    where: { companyId: auth.companyId, deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      description: true,
      parentId: true,
      _count: { select: { employees: { where: { deletedAt: null } } } },
    },
  });

  return ok(departments);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = createDeptSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  // Check for duplicate name within company
  const existing = await prisma.department.findFirst({
    where: {
      companyId: auth.companyId,
      name: { equals: parsed.data.name, mode: "insensitive" },
      deletedAt: null,
    },
  });
  if (existing) return err(`Department "${parsed.data.name}" already exists`, 409);

  const dept = await prisma.department.create({
    data: {
      ...parsed.data,
      companyId: auth.companyId,
    },
  });

  return ok(dept, "Department created", 201);
}
