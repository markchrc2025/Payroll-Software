/**
 * POST /api/ess/password
 *
 * Lets a signed-in employee set or change their ESS password. Requires a valid
 * ESS session; the password is bcrypt-hashed into Employee.essPasswordHash.
 *
 * Body: { newPassword: string (min 8) }
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { err, ok, serverError, unauthorized } from "@/lib/api-response";
import { getEssContext, hashEssPassword } from "@/lib/ess-auth";
import { withTenant } from "@/lib/with-tenant";

const Schema = z.object({ newPassword: z.string().min(8).max(72) });

export async function POST(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return err("Password must be at least 8 characters", 400, parsed.error.flatten());
  }

  try {
    const hash = await hashEssPassword(parsed.data.newPassword);
    await withTenant(ctx.tenantId, (tx) =>
      tx.employee.update({
        where: { id: ctx.employeeId },
        data: { essPasswordHash: hash },
      }),
    );
    return ok({ updated: true }, "Password updated");
  } catch (e) {
    console.error("[ess/password]", e);
    return serverError(e);
  }
}
