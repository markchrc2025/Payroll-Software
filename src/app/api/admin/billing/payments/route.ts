import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prismaAdmin from "@/lib/prisma-admin";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { ok, err, unauthorized, serverError } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { z } from "zod";

const createSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
  method: z.enum(["MANUAL", "BANK_TRANSFER", "CASH", "CHECK"]).default("MANUAL"),
  reference: z.string().optional(),
  paidAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});

// POST /api/admin/billing/payments
// Records a manual payment against an invoice. When the invoice is fully
// covered, its status flips to PAID. Gateway fields stay null for now.
export async function POST(req: NextRequest) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return err("Invalid request", 400, parsed.error.flatten());

    const d = parsed.data;

    const invoice = await prismaAdmin.invoice.findUnique({
      where: { id: d.invoiceId },
      include: { payments: { select: { amount: true } } },
    });
    if (!invoice) return err("Invoice not found", 404);
    if (invoice.status === "VOID") return err("Cannot pay a voided invoice", 400);

    const result = await prismaAdmin.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tenantId: invoice.tenantId,
          invoiceId: invoice.id,
          amount: new Prisma.Decimal(d.amount),
          currency: invoice.currency,
          method: d.method,
          reference: d.reference,
          paidAt: d.paidAt ? new Date(d.paidAt) : new Date(),
          recordedById: ctx.userId,
          notes: d.notes,
        },
      });

      const paidSoFar =
        invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0) + d.amount;
      const fullyPaid = paidSoFar + 1e-9 >= Number(invoice.total);

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: fullyPaid ? { status: "PAID", paidAt: new Date() } : {},
      });

      return { payment, invoice: updatedInvoice, fullyPaid };
    });

    await writeAuditLog({
      tenantId: invoice.tenantId,
      actorUserId: ctx.userId,
      action: "CREATE",
      entity: "Payment",
      entityId: result.payment.id,
      changes: { amount: d.amount, method: d.method, invoiceId: invoice.id, fullyPaid: result.fullyPaid },
      ipAddress: getClientIp(req),
    });

    return ok(result, "Payment recorded", 201);
  } catch (e) {
    console.error("[billing/payments] POST", e);
    return serverError();
  }
}
