/**
 * POST /api/profile-update-requests/[id]/approve
 *
 * PENDING → APPROVED.
 * Commits the requested field change atomically to the Employee row.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { requirePermission } from "@/lib/require-permission";
import { ok, err, notFound } from "@/lib/api-response";
import { bankByCodeOrName } from "@/lib/employees/bank";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "EMPLOYEES", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const pur = await tx.profileUpdateRequest.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!pur) return { notFound: true as const };
    if (pur.status !== "PENDING")
      return { notPending: true as const, status: pur.status };

    // Apply field change to Employee. Wave A1 (PAY-208): ESS asks for a bank
    // by its code (there is no bankCode column); it resolves to the company's
    // Bank list item, whose name the payslip and bank files read.
    let data: Record<string, unknown> = { [pur.field]: pur.newValue };
    if (pur.field === "bankCode") {
      const bank = await bankByCodeOrName(tx, auth.tenantId, pur.newValue);
      if (!bank) return { unknownBank: true as const, value: pur.newValue };
      data = { bankId: bank.id, bankName: bank.name };
    }
    await tx.employee.update({
      where: { id: pur.employeeId },
      data,
    });

    const updated = await tx.profileUpdateRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approverId: auth.userId,
        approvedAt: new Date(),
      },
    });
    return { notFound: false as const, notPending: false as const, row: updated };
  });

  if ("unknownBank" in result) return err(`"${result.value}" is not in the company's Bank list. Add it in Settings, Lists, Banks, or reject the request.`, 422);
  if (result.notFound) return notFound("Profile update request");
  if (result.notPending)
    return err(`Cannot approve a ${result.status} request`, 409);
  return ok(result.row, "Profile update request approved");
}
