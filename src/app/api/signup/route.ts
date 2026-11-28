/**
 * POST /api/signup — PAY-74 self-serve sign-up. Public (src/proxy.ts).
 * Stores the details and emails a confirmation link; nothing else is created
 * until the link is opened (POST /api/signup/verify).
 */
// @permission-exempt: public self-serve sign-up; limited per IP and per email (src/lib/onboarding/signup.ts)
import type { NextRequest } from "next/server";
import { z } from "zod";
import { err, ok, serverError } from "@/lib/api-response";
import { getClientIp } from "@/lib/audit";
import { requestSignup, SignupRefusal } from "@/lib/onboarding/signup";

const schema = z.object({
  companyName: z.string().trim().min(2, "Enter your company's name").max(200),
  firstName: z.string().trim().min(1, "Enter your first name").max(100),
  lastName: z.string().trim().min(1, "Enter your last name").max(100),
  email: z.string().trim().email("Enter a valid email address").max(200),
  password: z.string().min(10, "Use at least 10 characters").max(200),
  phone: z.string().trim().max(30).optional().nullable(),
  payrollCycle: z.enum(["WEEKLY", "SEMI_MONTHLY", "MONTHLY"]).optional(),
  acceptTerms: z.literal(true, { message: "Accept the terms to continue" }),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Please check the form.", 400, parsed.error.flatten());
  try {
    const { companyName, firstName, lastName, email, password, phone, payrollCycle } = parsed.data;
    const input = { companyName, firstName, lastName, email, password, phone, payrollCycle };
    await requestSignup(input, getClientIp(req));
    // The same answer whether or not an email was sent.
    return ok({ email: input.email.toLowerCase() }, "Check your email for the confirmation link.", 202);
  } catch (e) {
    if (e instanceof SignupRefusal) return err(e.message, e.status);
    return serverError(e);
  }
}
