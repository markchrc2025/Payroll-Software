import type { NextRequest } from "next/server";
import prismaAdmin from "@/lib/prisma-admin";
import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { ok, err, unauthorized, serverError } from "@/lib/api-response";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { z } from "zod";

// amount is centavos (integer).
const createSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().int().positive(),
  method: z.enum(["MANUAL", "BANK_TRANSFER", "CASH", "CHECK"]).default("MANUAL"),
  reference: z.string().optional(),
  paidAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});

// POST /api/admin/billing/payments
// Records a manual payment (centavos) against an invoice. When the invoice is
// fully covered, its status flips to PAID. Gateway fields stay null for now.
export async function POST(req: NextRequest) {
  const ctx = await getSuperAdminContext();
  if (!ctx) return unauthorized();

  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return err("Invalid request", 400, parsed.error.flatten());

    const d = parsed.data;
    const amount = BigInt(d.amount);

    const invoice = await prismaAdmin.invoice.findUnique({
      where: { id: d.invoiceId },
      include: { payments: { select: { amount: true } } },
    });
    if (!invoice) return err("Invoice not found", 404);
    if (invoice.status === "VOID") return err("Cannot pay a voided invoice", 400);
    if (invoice.status === "PAID") return err("Invoice is already paid", 400);

    const result = await prismaAdmin.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tenantId: invoice.tenantId,
          invoiceId: invoice.id,
          amount,
          currency: invoice.currency,
          method: d.method,
          reference: d.reference,
          paidAt: d.paidAt ? new Date(d.paidAt) : new Date(),
          recordedById: ctx.userId,
          notes: d.notes,
        },
      });

      const paidSoFar =
        invoice.payments.reduce((sum, p) => sum + p.amount, 0n) + amount;
      const fullyPaid = paidSoFar >= invoice.total;

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

    // Serialize BigInt money to Number for the JSON response.
    return ok(
      {
        fullyPaid: result.fullyPaid,
        payment: { ...result.payment, amount: Number(result.payment.amount) },
        invoice: {
          ...result.invoice,
          subtotal: Number(result.invoice.subtotal),
          taxAmount: Number(result.invoice.taxAmount),
          total: Number(result.invoice.total),
        },
      },
      "Payment recorded",
      201,
    );
  } catch (e) {
    console.error("[billing/payments] POST", e);
    return serverError(e);
  }
}
