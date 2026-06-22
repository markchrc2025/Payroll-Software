import { type NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/require-permission";
import { withTenant } from "@/lib/with-tenant";
import { ok, err, notFound, serverError } from "@/lib/api-response";
import { toSkipSet, utcDateKey } from "@/lib/holidays/recurrence";

// ---------------------------------------------------------------------------
// Validation schema for PATCH (all fields optional)
// ---------------------------------------------------------------------------

const updateHolidaySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.enum(["LEGAL", "SPECIAL_NON_WORKING", "SPECIAL_ONE_TIME", "AREA_SPECIFIC"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional(),
  recurringAnnually: z.boolean().optional(),
  scope: z.enum(["COMPANY_WIDE", "BRANCH_SPECIFIC"]).optional(),
  branchIds: z.array(z.string()).optional(),
  region: z.string().max(100).nullable().optional(),
  provinceCity: z.string().max(200).nullable().optional(),
  proclamationReference: z.string().max(300).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isTentative: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// PATCH /api/holidays/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "SETTINGS", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }

  const parsed = updateHolidaySchema.safeParse(body);
  if (!parsed.success) {
    return err("Validation failed", 422, parsed.error.flatten());
  }

  const data = parsed.data;

  try {
    const updated = await withTenant(ctx.tenantId, async (tx) => {
      const existing = await tx.holiday.findFirst({
        where: { id, tenantId: ctx.tenantId, deletedAt: null },
      });
      if (!existing) return null;

      return tx.holiday.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.category !== undefined && { category: data.category }),
          ...(data.date !== undefined && { date: new Date(`${data.date}T00:00:00.000Z`) }),
          ...(data.recurringAnnually !== undefined && { recurringAnnually: data.recurringAnnually }),
          ...(data.scope !== undefined && { scope: data.scope }),
          ...(data.branchIds !== undefined && { branchIds: data.branchIds }),
          ...(data.region !== undefined && { region: data.region }),
          ...(data.provinceCity !== undefined && { provinceCity: data.provinceCity }),
          ...(data.proclamationReference !== undefined && { proclamationReference: data.proclamationReference }),
          ...(data.notes !== undefined && { notes: data.notes }),
          ...(data.isTentative !== undefined && { isTentative: data.isTentative }),
        },
      });
    });

    if (!updated) return notFound("Holiday");
    return ok(updated, "Holiday updated");
  } catch (e) {
    return serverError(e);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/holidays/[id]?mode=single|permanent&date=YYYY-MM-DD
//   mode=single     → cancel this year's occurrence only (recurring holidays):
//                     append `date` to skippedDates, keep the master recurring.
//   mode=permanent  → soft-delete the master record entirely (default).
// ---------------------------------------------------------------------------

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "SETTINGS", "DELETE");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") ?? "permanent";
  const dateParam = searchParams.get("date"); // occurrence date for mode=single

  try {
    const deleted = await withTenant(ctx.tenantId, async (tx) => {
      const existing = await tx.holiday.findFirst({
        where: { id, tenantId: ctx.tenantId, deletedAt: null },
      });
      if (!existing) return null;

      if (mode === "single" && existing.recurringAnnually) {
        // Cancel only the chosen year's occurrence by adding it to skippedDates.
        // The expansion logic skips this date but keeps every other year.
        const dateToSkip =
          dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
            ? dateParam
            : utcDateKey(existing.date);
        const next = toSkipSet(existing.skippedDates);
        next.add(dateToSkip);
        return tx.holiday.update({
          where: { id },
          data: { skippedDates: Array.from(next) },
        });
      }

      // Permanent: soft-delete the record entirely.
      return tx.holiday.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });

    if (!deleted) return notFound("Holiday");
    return ok({ id }, "Holiday deleted");
  } catch (e) {
    return serverError(e);
  }
}
