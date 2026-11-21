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
import { callerEmployeeId } from "@/lib/approvals/second-party";
import { isBackgroundField } from "@/lib/background/entry-view";
import { applyBackground, BackgroundEntryRefusal } from "@/lib/background/ess-entry";
import { PickRefusal } from "@/lib/lookups/record-picks";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(req, "EMPLOYEES", "APPROVE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;
  const { id } = await params;

  let result;
  try {
  result = await withTenant(auth.tenantId, async (tx) => {
    const pur = await tx.profileUpdateRequest.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!pur) return { notFound: true as const };
    if (pur.status !== "PENDING")
      return { notPending: true as const, status: pur.status };
    // Wave B: never one's own request (the rule every other approval follows).
    if ((await callerEmployeeId(tx, auth)) === pur.employeeId) return { self: true as const };

    // Apply field change to Employee. Wave A1 (PAY-208): ESS asks for a bank
    // by its code (there is no bankCode column); it resolves to the company's
    // Bank list item, whose name the payslip and bank files read.
    if (isBackgroundField(pur.field)) {
      // Wave B (PAY-212, decision 7): an employee's own education, experience
      // or training becomes a record once HR approves it.
      await applyBackground(tx, { tenantId: auth.tenantId, employeeId: pur.employeeId, field: pur.field, newValue: pur.newValue, approverUserId: auth.userId ?? null });
    } else {
      let data: Record<string, unknown> = { [pur.field]: pur.newValue };
      if (pur.field === "bankCode") {
        const bank = await bankByCodeOrName(tx, auth.tenantId, pur.newValue);
        if (!bank) return { unknownBank: true as const, value: pur.newValue };
        data = { bankId: bank.id, bankName: bank.name };
      }
      // Wave B: a birth date arrives as YYYY-MM-DD text; the column is a date
      // (approval failed on it before).
      if (pur.field === "birthDate") {
        const d = new Date(`${pur.newValue.slice(0, 10)}T00:00:00.000Z`);
        if (Number.isNaN(d.getTime())) return { badValue: true as const };
        data = { birthDate: d };
      }
      await tx.employee.update({
        where: { id: pur.employeeId },
        data,
      });
    }

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

  } catch (e) {
    if (e instanceof BackgroundEntryRefusal || e instanceof PickRefusal) return err(e.message, 422);
    throw e;
  }

  if ("self" in result) return err("You cannot approve your own profile request. Another HR user approves it.", 403);
  if ("badValue" in result) return err("The birth date in this request is not a date. Reject it and ask the employee to file it again.", 422);
  if ("unknownBank" in result) return err(`"${result.value}" is not in the company's Bank list. Add it in Settings, Lists, Banks, or reject the request.`, 422);
  if (result.notFound) return notFound("Profile update request");
  if (result.notPending)
    return err(`Cannot approve a ${result.status} request`, 409);
  return ok(result.row, "Profile update request approved");
}
