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
    await prismaAdmin.$transaction([
      prismaAdmin.employee.update({
        where: { id: emp.id },
        data: {
          essPasswordHash: passwordHash,
          // A reset on a not-yet-activated account also activates it.
          ...(emp.essAccessStatus === "INVITED"
            ? { essAccessStatus: "ACTIVE", essActivatedAt: new Date() }
            : {}),
        },
      }),
      prismaAdmin.essPasswordReset.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

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
