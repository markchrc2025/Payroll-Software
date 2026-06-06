import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prismaAdmin from "@/lib/prisma-admin";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { ok, err, unauthorized, serverError, paginated } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { z } from "zod";

// GET /api/admin/billing/invoices?page=&limit=&tenantId=&status=
export async function GET(req: NextRequest) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 20)));
    const tenantId = searchParams.get("tenantId")?.trim();
    const status = searchParams.get("status")?.trim();

    const where: Prisma.InvoiceWhereInput = {};
    if (tenantId) where.tenantId = tenantId;
    if (status && status !== "ALL") where.status = status as Prisma.InvoiceWhereInput["status"];

    const [invoices, total] = await Promise.all([
      prismaAdmin.invoice.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          tenant: { select: { id: true, name: true } },
          payments: { select: { id: true, amount: true, paidAt: true, method: true } },
        },
      }),
      prismaAdmin.invoice.count({ where }),
    ]);

    return paginated(invoices, total, page, limit);
  } catch (e) {
    console.error("[billing/invoices] GET", e);
    return serverError();
  }
}

const createSchema = z.object({
  tenantId: z.string().min(1),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  dueAt: z.string().datetime().optional(),
  // If omitted, subtotal is derived from the tenant's current package + cycle.
  subtotal: z.number().nonnegative().optional(),
  issue: z.boolean().default(true), // false => leave as DRAFT
});

function genInvoiceNumber() {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `INV-${ym}-${rand}`;
}

// POST /api/admin/billing/invoices
// Issues an invoice for a tenant's current subscription period.
// Tax is snapshotted from the package's taxRate at issue time.
export async function POST(req: NextRequest) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return err("Invalid request", 400, parsed.error.flatten());

    const d = parsed.data;

    const sub = await prismaAdmin.tenantSubscription.findUnique({
      where: { tenantId: d.tenantId },
      include: { package: true },
    });
    if (!sub) return err("Tenant has no subscription to invoice", 400);

    const pkg = sub.package;
    const cyclePrice =
      sub.billingCycle === "ANNUAL" ? Number(pkg.annualPrice) : Number(pkg.monthlyPrice);
    const subtotalNum = d.subtotal ?? cyclePrice;
    const taxNum = +(subtotalNum * Number(pkg.taxRate)).toFixed(2);
    const totalNum = +(subtotalNum + taxNum).toFixed(2);

    const lineItems = [
      {
        description: `${pkg.name} (${sub.billingCycle.toLowerCase()})`,
        quantity: 1,
        unitPrice: subtotalNum,
        amount: subtotalNum,
      },
    ];

    const invoice = await prismaAdmin.invoice.create({
      data: {
        tenantId: d.tenantId,
        subscriptionId: sub.id,
        invoiceNumber: genInvoiceNumber(),
        periodStart: new Date(d.periodStart),
        periodEnd: new Date(d.periodEnd),
        subtotal: new Prisma.Decimal(subtotalNum),
        taxAmount: new Prisma.Decimal(taxNum),
        total: new Prisma.Decimal(totalNum),
        currency: pkg.currency,
        status: d.issue ? "OPEN" : "DRAFT",
        issuedAt: d.issue ? new Date() : null,
        dueAt: d.dueAt ? new Date(d.dueAt) : null,
        lineItems,
      },
    });

    await writeAuditLog({
      tenantId: d.tenantId,
      actorUserId: ctx.userId,
      action: "CREATE",
      entity: "Invoice",
      entityId: invoice.id,
      changes: { total: totalNum, status: invoice.status },
      ipAddress: getClientIp(req),
    });

    return ok(invoice, "Invoice created", 201);
  } catch (e) {
    console.error("[billing/invoices] POST", e);
    return serverError();
  }
}
