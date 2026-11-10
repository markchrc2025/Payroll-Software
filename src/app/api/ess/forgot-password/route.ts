/**
 * POST /api/ess/forgot-password: request an ESS reset link (Forgot PIN).
 *
 * Public. Body: { companyCode, employeeNumber }. If the employee exists, has an
 * ACTIVE ESS account and the email their record chooses for ESS links is on
 * file (personal by default, work once HR switches it; unit 0.15 Am 3), we
 * email them a one-time link to set a new PIN (1 hour; earlier unused links
 * are retired). Using it also lifts a wrong-attempt lock.
 * Always responds 200 with a generic message — never reveals whether an
 * account exists.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { err, ok } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";
import { issueReset } from "@/lib/ess-credential-links";
import { sendEmployeeResetPassword } from "@/lib/emails";

const schema = z.object({
  companyCode: z.string().min(1),
  employeeNumber: z.string().min(1),
});

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
        select: { id: true, firstName: true },
      });
      // Unit 0.15 Amendment 1, ruling B7: reset links go ONLY to ACTIVE,
      // employed accounts with a link email on file (checked inside issueReset). An
      // account HR invited but the employee never activated gets nothing
      // here: its only way in is the invitation. Same generic answer either way.
      const issued = emp
        ? await prismaAdmin.$transaction((tx) => issueReset(tx, { tenantId: tenant.id, employeeId: emp.id }))
        : null;
      if (emp && issued) {
        try {
          await sendEmployeeResetPassword(issued.email, {
            firstName: emp.firstName,
            resetUrl: `${APP_URL}/ess/reset-password?token=${issued.rawToken}`,
          });
        } catch (e) {
          console.error("[ess/forgot-password] email failed:", e);
          // Swallow: still return the generic message (no enumeration, no leak).
        }
      }
    }
  } catch (e) {
    console.error("[ess/forgot-password]", e);
    // Still return 200 — don't leak errors.
  }

  return ok(null, GENERIC);
}
