import { type NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/require-permission";
import { withTenant } from "@/lib/with-tenant";
import { ok, err, serverError } from "@/lib/api-response";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createHolidaySchema = z.object({
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

  try {
    const holidays = await withTenant(ctx.tenantId, (tx) => {
      // Build date filter
      const where: Record<string, unknown> = {
        tenantId: ctx.tenantId,
        deletedAt: null,
      };

      if (yearStr) {
        const year = parseInt(yearStr, 10);
        if (!isNaN(year)) {
          const start = new Date(`${year}-01-01T00:00:00.000Z`);
          const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);
          if (monthStr) {
            const month = parseInt(monthStr, 10);
            if (!isNaN(month) && month >= 1 && month <= 12) {
              const mStart = new Date(Date.UTC(year, month - 1, 1));
              const mEnd = new Date(Date.UTC(year, month, 1));
              where.date = { gte: mStart, lt: mEnd };
            } else {
              where.date = { gte: start, lt: end };
            }
          } else {
            where.date = { gte: start, lt: end };
          }
        }
      }

      return tx.holiday.findMany({
        where: where as Parameters<typeof tx.holiday.findMany>[0]["where"],
        orderBy: { date: "asc" },
      });
    });

    return ok(holidays);
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

  try {
    const holiday = await withTenant(ctx.tenantId, (tx) =>
      tx.holiday.create({
        data: {
          tenantId: ctx.tenantId,
          name: data.name,
          category: data.category,
          date: new Date(`${data.date}T00:00:00.000Z`),
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
      })
    );

    return ok(holiday, "Holiday created", 201);
  } catch (e) {
    return serverError(e);
  }
}
