/**
 * POST /api/ess/forgot-password — request an ESS password-reset link.
 *
 * Public. Body: { companyCode, employeeNumber }. If the employee exists, has
 * ESS access, and a work email on file, we email them a one-time reset link.
 * Always responds 200 with a generic message — never reveals whether an
 * account exists.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { err, ok } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";
import { generateEssToken, hashEssToken } from "@/lib/ess-auth";
import { sendEmployeeResetPassword } from "@/lib/emails";

const schema = z.object({
  companyCode: z.string().min(1),
  employeeNumber: z.string().min(1),
});

const EXPIRES_MS = 60 * 60 * 1000; // 1 hour (matches the email copy)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const GENERIC = "If that account exists and has an email on file, a reset link has been sent.";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());
  const { companyCode, employeeNumber } = parsed.data;

  try {
    const tenant = await prismaAdmin.tenant.findFirst({
      where: { companyCode: companyCode.trim().toUpperCase(), deletedAt: null },
      select: { id: true },
    });
    if (tenant) {
      const emp = await prismaAdmin.employee.findFirst({
        where: { tenantId: tenant.id, employeeNumber, deletedAt: null },
        select: {
          id: true, firstName: true, workEmail: true,
          essAccessStatus: true, employmentStatus: true,
        },
      });
      const eligible =
        emp &&
        emp.workEmail &&
        (emp.essAccessStatus === "ACTIVE" || emp.essAccessStatus === "INVITED") &&
        !["RESIGNED", "TERMINATED", "RETIRED"].includes(emp.employmentStatus);

      if (eligible && emp) {
        const rawToken = generateEssToken();
        const tokenHash = hashEssToken(rawToken);
        // Invalidate any prior unused reset tokens for this employee.
        await prismaAdmin.essPasswordReset.updateMany({
          where: { employeeId: emp.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        await prismaAdmin.essPasswordReset.create({
          data: {
            tenantId: tenant.id,
            employeeId: emp.id,
            tokenHash,
            expiresAt: new Date(Date.now() + EXPIRES_MS),
          },
        });
        try {
          await sendEmployeeResetPassword(emp.workEmail!, {
            firstName: emp.firstName,
            resetUrl: `${APP_URL}/ess/reset-password?token=${rawToken}`,
          });
        } catch (e) {
          console.error("[ess/forgot-password] email failed:", e);
          // Swallow — still return the generic message (no enumeration / no leak).
        }
      }
    }
  } catch (e) {
    console.error("[ess/forgot-password]", e);
    // Still return 200 — don't leak errors.
  }

  return ok(null, GENERIC);
}
