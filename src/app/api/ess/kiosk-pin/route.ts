/**
 * POST /api/ess/kiosk-pin
 *
 * Allows an authenticated employee to set or clear their own kiosk PIN.
 *
 * Body:
 *   { "pin": "1234" }   — set a 4-8 digit PIN
 *   { "pin": null }     — clear the PIN
 *
 * Auth: Bearer <ess_token>
 */
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getEssContext } from "@/lib/ess-auth";
import { unauthorized, ok, err } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";

const schema = z.object({
  pin: z
    .string()
    .regex(/^\d{6}$/, "PIN must be exactly 6 digits")
    .nullable(),
});

export async function POST(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Invalid input", 422, parsed.error.flatten());
  const { pin } = parsed.data;

  const kioskPinHash = pin ? await bcrypt.hash(pin, 10) : null;

  await withTenant(ctx.tenantId, (tx) =>
    tx.employee.update({
      where: { id: ctx.employeeId },
      data: { kioskPinHash },
    }),
  );

  return ok({ cleared: pin === null }, pin === null ? "Kiosk PIN cleared" : "Kiosk PIN set successfully");
}
