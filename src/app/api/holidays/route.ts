import { type NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/require-permission";
import { withTenant } from "@/lib/with-tenant";
import { ok, err, serverError } from "@/lib/api-response";
import { expandHolidays } from "@/lib/holidays/recurrence";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createHolidaySchema = z
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

// ---------------------------------------------------------------------------
// GET /api/holidays?year=2026&month=6
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "SETTINGS", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const { searchParams } = new URL(req.url);
  const yearStr = searchParams.get("year");
  const monthStr = searchParams.get("month");
  const year = yearStr ? parseInt(yearStr, 10) : NaN;

  try {
    // No year filter → return raw master rows (legacy behavior).
    if (isNaN(year)) {
      const holidays = await withTenant(ctx.tenantId, (tx) =>
        tx.holiday.findMany({
          where: { tenantId: ctx.tenantId, deletedAt: null },
          orderBy: { date: "asc" },
        })
      );
      return ok(holidays);
    }

    // Build the requested range (full year, or a single month when provided).
    const month = monthStr ? parseInt(monthStr, 10) : NaN;
    const hasMonth = !isNaN(month) && month >= 1 && month <= 12;
    const rangeStart = hasMonth
      ? new Date(Date.UTC(year, month - 1, 1))
      : new Date(Date.UTC(year, 0, 1));
    const rangeEnd = hasMonth
      ? new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)) // last day of month
      : new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    // Fetch non-recurring holidays inside the range PLUS every recurring master
    // (stored in any year); recurring masters are expanded into the range below.
    const masters = await withTenant(ctx.tenantId, (tx) =>
      tx.holiday.findMany({
        where: {
          tenantId: ctx.tenantId,
          deletedAt: null,
          OR: [
            { recurringAnnually: true },
            { date: { gte: rangeStart, lte: rangeEnd } },
          ],
        },
      })
    );

    return ok(expandHolidays(masters, rangeStart, rangeEnd));
  } catch (e) {
    return serverError(e);
  }
}

// ---------------------------------------------------------------------------
// POST /api/holidays
// ---------------------------------------------------------------------------

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

  const parsed = createHolidaySchema.safeParse(body);
  if (!parsed.success) {
    return err("Validation failed", 422, parsed.error.flatten());
  }

  const data = parsed.data;
  const holidayDate = new Date(`${data.date}T00:00:00.000Z`);

  try {
    const result = await withTenant(ctx.tenantId, async (tx) => {
      // Duplicate guard: block an identical holiday (same date + same name,
      // case-insensitive) within the tenant. Different holidays on the same
      // date (e.g. a double holiday, or two regional ones) are still allowed.
      const dup = await tx.holiday.findFirst({
        where: {
          tenantId: ctx.tenantId,
          deletedAt: null,
          date: holidayDate,
          name: { equals: data.name, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (dup) return { duplicate: true as const };

      const holiday = await tx.holiday.create({
        data: {
          tenantId: ctx.tenantId,
          name: data.name,
          category: data.category,
          date: holidayDate,
          recurringAnnually: data.recurringAnnually,
          scope: data.scope,
          branchIds: data.branchIds,
          region: data.region ?? null,
          provinceCity: data.provinceCity ?? null,
          proclamationReference: data.proclamationReference ?? null,
          notes: data.notes ?? null,
          isTentative: data.isTentative,
          createdByUserId: ctx.userId,
        },
      });
      return { duplicate: false as const, holiday };
    });

    if (result.duplicate)
      return err(`A holiday named "${data.name}" already exists on ${data.date}`, 409);

    return ok(result.holiday, "Holiday created", 201);
  } catch (e) {
    return serverError(e);
  }
}
