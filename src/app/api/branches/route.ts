/**
 * GET  /api/branches  — List all branches for the company
 * POST /api/branches  — Create a new branch
 */

import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized, serverError } from "@/lib/api-response";
import { z } from "zod";

const createBranchSchema = z.object({
  name: z.string().min(1, "Name is required").max(150),
  code: z.string().max(20).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  province: z.string().max(100).optional().nullable(),
  region: z.string().max(100).optional().nullable(),
  contactNumber: z.string().max(20).optional().nullable(),
  isHeadOffice: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const branches = await prisma.branch.findMany({
    where: { companyId: auth.companyId, deletedAt: null },
    orderBy: [{ isHeadOffice: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      city: true,
      province: true,
      region: true,
      isHeadOffice: true,
      _count: { select: { employees: { where: { deletedAt: null } } } },
    },
  });

  return ok(branches);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = createBranchSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  // Check for duplicate name within company
  const existing = await prisma.branch.findFirst({
    where: {
      companyId: auth.companyId,
      name: { equals: parsed.data.name, mode: "insensitive" },
      deletedAt: null,
    },
  });
  if (existing) return err(`Branch "${parsed.data.name}" already exists`, 409);

  const branch = await prisma.branch.create({
    data: {
      ...parsed.data,
      companyId: auth.companyId,
    },
  });

  return ok(branch, "Branch created", 201);
}
