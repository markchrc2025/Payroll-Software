/**
 * POST /api/holidays/bulk
 *
 * Insert multiple holidays in a single transaction (all-or-nothing). Rows that
 * duplicate an existing holiday (same date + case-insensitive name) — or an
 * earlier row in the same batch — are skipped, not inserted. Returns a summary
 * of how many were created and which were skipped.
 *
 * Body: { rows: Array<{ name, category, date, ...optional }> }
 */
import { type NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/require-permission";
import { withTenant } from "@/lib/with-tenant";
import { ok, err, serverError } from "@/lib/api-response";

const bulkRowSchema = z
  .object({
    name: z.string().min(1).max(200),
    category: z.enum(["LEGAL", "SPECIAL_NON_WORKING", "SPECIAL_ONE_TIME", "AREA_SPECIFIC"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    recurringAnnually: z.boolean().default(false),
    scope: z.enum(["COMPANY_WIDE", "BRANCH_SPECIFIC"]).default("COMPANY_WIDE"),
    branchIds: z.array(z.string()).default([]),
    region: z.string().max(100).nullable().optional(),
    provinceCity: z.string().max(200).nullable().optional(),
    proclamationReference: z.string().max(300).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    isTentative: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.scope === "BRANCH_SPECIFIC" && data.branchIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["branchIds"],
        message: "Select at least one branch for a branch-specific holiday",
      });
    }
    if (data.category === "AREA_SPECIFIC" && !data.region?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["region"],
        message: "Region is required for an area-specific holiday",
      });
    }
  });

const bulkSchema = z.object({
  rows: z.array(bulkRowSchema).min(1).max(100),
});

/** Dedup key: UTC date + lowercased name. */
function dupKey(dateIso: string, name: string): string {
  return `${dateIso}|${name.trim().toLowerCase()}`;
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "SETTINGS", "CREATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return err("Validation failed", 422, parsed.error.flatten());
  }
  const { rows } = parsed.data;

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      // Existing holidays on any of the incoming dates → dedup against them.
      const dates = Array.from(
        new Set(rows.map((r) => new Date(`${r.date}T00:00:00.000Z`).toISOString())),
      ).map((iso) => new Date(iso));

      const existing = await tx.holiday.findMany({
        where: { tenantId: ctx.tenantId, deletedAt: null, date: { in: dates } },
        select: { date: true, name: true },
      });
      const existingKeys = new Set(
        existing.map((h) => dupKey(h.date.toISOString().slice(0, 10), h.name)),
      );

      const seen = new Set<string>();
      const toCreate: typeof rows = [];
      const skipped: { date: string; name: string }[] = [];

      for (const r of rows) {
        const key = dupKey(r.date, r.name);
        if (existingKeys.has(key) || seen.has(key)) {
          skipped.push({ date: r.date, name: r.name.trim() });
          continue;
        }
        seen.add(key);
        toCreate.push(r);
      }

      if (toCreate.length > 0) {
        await tx.holiday.createMany({
          data: toCreate.map((r) => ({
            tenantId: ctx.tenantId,
            name: r.name.trim(),
            category: r.category,
            date: new Date(`${r.date}T00:00:00.000Z`),
            recurringAnnually: r.recurringAnnually,
            scope: r.scope,
            branchIds: r.branchIds,
            region: r.region ?? null,
            provinceCity: r.provinceCity ?? null,
            proclamationReference: r.proclamationReference ?? null,
            notes: r.notes ?? null,
            isTentative: r.isTentative,
            createdByUserId: ctx.userId,
          })),
        });
      }

      return { created: toCreate.length, skipped };
    });

    return ok(result, `Created ${result.created}, skipped ${result.skipped.length}`, 201);
  } catch (e) {
    return serverError(e);
  }
}
