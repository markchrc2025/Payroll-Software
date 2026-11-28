/**
 * POST /api/signup/verify { token } — PAY-74. Public (src/proxy.ts). Opening
 * the emailed link creates the company; opening it again shows the same one.
 */
// @permission-exempt: public; the single-use emailed link is the proof
import type { NextRequest } from "next/server";
import { z } from "zod";
import { err, ok, serverError } from "@/lib/api-response";
import { getClientIp } from "@/lib/audit";
import { SignupRefusal, verifySignup } from "@/lib/onboarding/signup";

const schema = z.object({ token: z.string().min(20).max(200) });

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("This link is not valid.", 400);
  try {
    return ok(await verifySignup(parsed.data.token, getClientIp(req)));
  } catch (e) {
    if (e instanceof SignupRefusal) return err(e.message, e.status);
    return serverError(e);
  }
}
