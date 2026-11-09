/**
 * POST /api/ess/reset-password — complete an ESS password reset.
 *
 * Public (token-authenticated). Validates the one-time token, sets the new
 * password, and emails a "password changed" security notice.
 *
 * Body: { token: string, password: string }
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { err, ok, serverError } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";
import { hashEssToken, hashEssPassword } from "@/lib/ess-auth";
import { sendEmployeeResetPasswordNotice } from "@/lib/emails";
import { securityContext } from "@/lib/security-context";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());
  const { token, password } = parsed.data;

  try {
    const tokenHash = hashEssToken(token);
    const record = await prismaAdmin.essPasswordReset.findUnique({
      where: { tokenHash },
      select: { id: true, employeeId: true, usedAt: true, expiresAt: true },
    });
    if (!record || record.usedAt !== null || record.expiresAt.getTime() <= Date.now()) {
      return err("This reset link is invalid or has expired. Request a new one.", 400);
    }

    const emp = await prismaAdmin.employee.findFirst({
      where: { id: record.employeeId, deletedAt: null },
      select: { id: true, workEmail: true, employmentStatus: true, essAccessStatus: true },
    });
    if (!emp) {
      return err("This reset link is invalid or has expired. Request a new one.", 400);
    }
    if (["RESIGNED", "TERMINATED", "RETIRED"].includes(emp.employmentStatus)) {
      return err("This account is no longer active. Please contact HR.", 403);
    }

    const passwordHash = await hashEssPassword(password);

    // Unit 0.15 review. One interactive transaction, in this order:
    //   1. CONSUME the token atomically (usedAt still null), so two requests
    //      racing with the same link cannot both set a password; the loser
    //      gets the same "invalid or expired" answer and writes nothing.
    //   2. Set the password. A reset on a not-yet-activated (INVITED) account
    //      also activates it: the link went to the work email, which is the
    //      same proof the activation link relies on.
    //   3. Revoke every open ESS session. A reset is what someone does when
    //      they think the account is compromised; sessions opened with the
    //      old password must not outlive it.
    //   4. Retire any other unused reset links for this employee.
    const consumed = await prismaAdmin.$transaction(async (tx) => {
      const now = new Date();
      const claim = await tx.essPasswordReset.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claim.count !== 1) return false;

      await tx.employee.update({
        where: { id: emp.id },
        data: {
          essPasswordHash: passwordHash,
          ...(emp.essAccessStatus === "INVITED"
            ? { essAccessStatus: "ACTIVE", essActivatedAt: now }
            : {}),
        },
      });
      await tx.essSession.updateMany({
        where: { employeeId: emp.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.essPasswordReset.updateMany({
        where: { employeeId: emp.id, usedAt: null },
        data: { usedAt: now },
      });
      return true;
    });
    if (!consumed) {
      return err("This reset link is invalid or has expired. Request a new one.", 400);
    }

    // Security notice (best-effort).
    if (emp.workEmail) {
      try {
        const { device, changedAt } = securityContext(req);
        await sendEmployeeResetPasswordNotice(emp.workEmail, {
          accountEmail: emp.workEmail,
          changedAt,
          device,
          secureUrl: `${APP_URL}/ess/login`,
        });
      } catch (e) {
        console.error("[ess/reset-password] notice email failed:", e);
      }
    }

    return ok({ success: true }, "Password updated — you can now sign in.");
  } catch (e) {
    console.error("[ess/reset-password]", e);
    return serverError(e);
  }
}
