import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import {
  ok,
  err,
  unauthorized,
  paginated,
  serverError,
} from "@/lib/api-response";
import {
  createExpenseClaimSchema,
  listExpenseClaimsSchema,
} from "@/lib/validations/expense-claim";
import { toCentavos } from "@/lib/money";
import { serializeExpenseClaim } from "@/lib/payroll/serialize";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { searchParams } = req.nextUrl;
  const query = listExpenseClaimsSchema.safeParse(
    Object.fromEntries(searchParams),
  );
  if (!query.success)
    return err("Invalid query parameters", 400, query.error.flatten());

  const { page, limit, employeeId, status, dateFrom, dateTo } = query.data;
  const skip = (page - 1) * limit;

  try {
    return await withTenant(auth.tenantId, async (tx) => {
      const where = {
        tenantId: auth.tenantId,
        ...(employeeId ? { employeeId } : {}),
        ...(status ? { status } : {}),
        ...(dateFrom || dateTo
          ? {
              claimDate: {
                ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                ...(dateTo ? { lte: new Date(dateTo) } : {}),
              },
            }
          : {}),
      };

      const [total, items] = await Promise.all([
        tx.expenseClaim.count({ where }),
        tx.expenseClaim.findMany({
          where,
          orderBy: { claimDate: "desc" },
          skip,
          take: limit,
          include: { employee: { select: { id: true, firstName: true, lastName: true } } },
        }),
      ]);

      return paginated(
        items.map((c) => serializeExpenseClaim(c)),
        total,
        page,
        limit,
      );
    });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON", 400);
  }

  const parsed = createExpenseClaimSchema.safeParse(body);
  if (!parsed.success)
    return err("Validation error", 400, parsed.error.flatten());

  const d = parsed.data;

  try {
    return await withTenant(auth.tenantId, async (tx) => {
      // Ensure employee belongs to tenant
      const employee = await tx.employee.findFirst({
        where: { id: d.employeeId, tenantId: auth.tenantId },
      });
      if (!employee) return err("Employee not found", 404);

      const claim = await tx.expenseClaim.create({
        data: {
          tenantId: auth.tenantId,
          employeeId: d.employeeId,
          category: d.category,
          description: d.description,
          amountCents: toCentavos(d.amount),
          receiptKey: d.receiptKey,
          claimDate: new Date(d.claimDate),
          status: "DRAFT",
        },
      });

      return ok(serializeExpenseClaim(claim), undefined, 201);
    });
  } catch (e) {
    return serverError(e);
  }
}
