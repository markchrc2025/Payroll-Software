/**
 * GET  /api/job-types  — List all job types for the tenant
 * POST /api/job-types  — Create a new job type
 */

import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-response";
import { z } from "zod";
import { forbidUnless } from "@/lib/authz/route-permission";

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(150),
  description: z.string().max(500).optional().nullable(),
  // Wave F1 (PAY-216): employees of this job type work in the field.
  fieldWork: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // @permission-exempt: company reference data for dropdowns and screens, no employee records; changes to it are permission-checked (unit 0.25)

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
  // Unit 0.25: the caller's role must allow this, not just a sign-in.
  const denied = await forbidUnless(auth, ["SETTINGS", "CREATE"]);
  if (denied) return denied;

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
