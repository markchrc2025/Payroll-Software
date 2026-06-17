/**
 * GET  /api/job-types  — List all job types for the tenant
 * POST /api/job-types  — Create a new job type
 */

import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-response";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(150),
  description: z.string().max(500).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const jobTypes = await withTenant(auth.tenantId, (tx) =>
    tx.jobType.findMany({
      where: { tenantId: auth.tenantId, deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        _count: {
          select: {
            employees: { where: { deletedAt: null } },
            employmentTerms: true,
          },
        },
      },
    })
  );

  return ok(jobTypes);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body) return err("Invalid JSON body");

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 422, parsed.error.flatten());

  const result = await withTenant(auth.tenantId, async (tx) => {
    const existing = await tx.jobType.findFirst({
      where: {
        tenantId: auth.tenantId,
        name: { equals: parsed.data.name, mode: "insensitive" },
        deletedAt: null,
      },
    });
    if (existing) return { duplicate: true as const };
    return {
      duplicate: false as const,
      row: await tx.jobType.create({
        data: { ...parsed.data, tenantId: auth.tenantId },
      }),
    };
  });

  if (result.duplicate) return err(`Job type "${parsed.data.name}" already exists`, 409);
  return ok(result.row, "Job type created", 201);
}
