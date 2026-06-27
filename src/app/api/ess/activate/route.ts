/**
 * POST /api/ess/activate — accept an ESS email invitation.
 *
 * Public (token-authenticated). Validates the one-time invite token, sets the
 * employee's ESS password, and activates their account.
 *
 * Body: { token: string, password: string }
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { err, ok, serverError } from "@/lib/api-response";
import { hashEssToken, hashEssPassword } from "@/lib/ess-auth";
import prismaAdmin from "@/lib/prisma-admin";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());
  const { token, password } = parsed.data;

  try {
    const tokenHash = hashEssToken(token);
    const invite = await prismaAdmin.essInvite.findUnique({
      where: { tokenHash },
      select: { id: true, employeeId: true, usedAt: true, expiresAt: true },
    });

    if (!invite || invite.usedAt !== null || invite.expiresAt.getTime() <= Date.now()) {
      return err("This activation link is invalid or has expired. Ask HR to resend your invite.", 400);
    }

    const emp = await prismaAdmin.employee.findFirst({
      where: { id: invite.employeeId, deletedAt: null },
      select: { id: true, employmentStatus: true, employeeNumber: true },
    });
    if (!emp) {
      return err("This activation link is invalid or has expired. Ask HR to resend your invite.", 400);
    }
    if (["RESIGNED", "TERMINATED", "RETIRED"].includes(emp.employmentStatus)) {
      return err("This account is no longer active. Please contact HR.", 403);
    }

    const passwordHash = await hashEssPassword(password);

    await prismaAdmin.$transaction([
      prismaAdmin.employee.update({
        where: { id: emp.id },
        data: {
          essPasswordHash: passwordHash,
          essAccessStatus: "ACTIVE",
          essActivatedAt: new Date(),
        },
      }),
      prismaAdmin.essInvite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return ok({ employeeNumber: emp.employeeNumber }, "Account activated — you can now sign in.");
  } catch (e) {
    console.error("[ess/activate]", e);
    return serverError(e);
  }
}
