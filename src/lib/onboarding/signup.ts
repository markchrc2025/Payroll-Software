/**
 * PAY-74: self-serve sign-up (Mark, 28 Nov 2026).
 *
 *   requestSignup  stores the details (the password already hashed) with a
 *                  one-time link, and emails the link. Nothing else is
 *                  created. At most 5 sign-ups an hour from one IP address
 *                  (refused), and at most 3 unconfirmed an hour for one email
 *                  address (quietly not sent again).
 *   verifySignup   opening the link creates the company, its Administrator
 *                  and the owner, seeds the defaults, and marks the sign-up
 *                  used, all in one transaction. Opening it again shows the
 *                  same company; it never makes a second one.
 *
 * An email address may own more than one company: sign-in takes the company
 * code when an email is in several (src/auth.ts).
 */
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PayFrequency } from "@prisma/client";
import prismaAdmin from "@/lib/prisma-admin";
import { writeAuditLog } from "@/lib/audit";
import { logSubscriptionEvent, writeCentralAudit } from "@/lib/central/audit";
import { sendSignupReady, sendSignupVerify } from "@/lib/emails";
import { createCompanyWithOwner, seedTenantDefaults } from "./provision";

export class SignupRefusal extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export const SIGNUP_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_PER_IP_PER_HOUR = 5;
export const MAX_PENDING_PER_EMAIL_PER_HOUR = 3;

export type SignupInput = {
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string | null;
  payrollCycle?: PayFrequency;
};

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Returns the raw token for tests; the route never shows it. */
export async function requestSignup(input: SignupInput, ip: string | null, now = new Date()): Promise<{ sent: boolean; token?: string }> {
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const email = input.email.trim().toLowerCase();

  if (ip) {
    const fromIp = await prismaAdmin.tenantSignup.count({ where: { ipAddress: ip, createdAt: { gte: hourAgo } } });
    if (fromIp >= MAX_PER_IP_PER_HOUR) {
      throw new SignupRefusal("Too many sign-ups from your network. Please try again in an hour.", 429);
    }
  }
  const pending = await prismaAdmin.tenantSignup.count({ where: { email, verifiedAt: null, createdAt: { gte: hourAgo } } });
  if (pending >= MAX_PENDING_PER_EMAIL_PER_HOUR) return { sent: false };

  const token = randomBytes(32).toString("base64url");
  const pendingRow = await prismaAdmin.tenantSignup.create({
    data: {
      email,
      companyName: input.companyName.trim(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone?.trim() || null,
      passwordHash: await bcrypt.hash(input.password, 12),
      payrollCycle: input.payrollCycle ?? "SEMI_MONTHLY",
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + SIGNUP_TTL_MS),
      ipAddress: ip,
    },
  });
  try {
    await sendSignupVerify(email, {
      firstName: input.firstName.trim(),
      companyName: input.companyName.trim(),
      verifyUrl: `${appUrl()}/signup/verify?token=${token}`,
    });
  } catch (e) {
    // The link never reached anyone: drop the sign-up so it does not count
    // against the limits, and say so plainly (not "Internal server error").
    // Found on production on 28 Nov 2026: Resend refused the sentire.solutions
    // sender (domain not verified).
    console.error("[signup] the confirmation email could not be sent:", e);
    await prismaAdmin.tenantSignup.delete({ where: { id: pendingRow.id } }).catch(() => {});
    throw new SignupRefusal("We couldn't send the confirmation email just now. Please try again in a few minutes.", 503);
  }
  return { sent: true, token };
}

export type SignupResult = { companyName: string; companyCode: string; email: string; created: boolean };

export async function verifySignup(token: string, ip: string | null = null, now = new Date()): Promise<SignupResult> {
  if (!token || token.length < 20) throw new SignupRefusal("This link is not valid.", 400);
  const tokenHash = hashToken(token);

  const result = await prismaAdmin.$transaction(async (tx) => {
    const claimed = await tx.tenantSignup.updateMany({
      where: { tokenHash, verifiedAt: null, expiresAt: { gt: now } },
      data: { verifiedAt: now },
    });
    const s = await tx.tenantSignup.findUnique({ where: { tokenHash } });
    if (!s) throw new SignupRefusal("This link is not valid.", 400);
    if (claimed.count === 0) {
      if (s.provisionedTenantId) {
        const t = await tx.tenant.findUnique({ where: { id: s.provisionedTenantId }, select: { name: true, companyCode: true } });
        return { companyName: t?.name ?? s.companyName, companyCode: t?.companyCode ?? "", email: s.email, created: false, tenantId: s.provisionedTenantId, ownerId: null as string | null };
      }
      throw new SignupRefusal("This link has expired. Please sign up again.", 410);
    }
    const { tenant, owner } = await createCompanyWithOwner(tx, {
      name: s.companyName,
      payrollCycle: s.payrollCycle,
      contactPhone: s.phone,
      owner: { firstName: s.firstName, lastName: s.lastName, email: s.email, passwordHash: s.passwordHash, phone: s.phone },
    });
    await seedTenantDefaults(tx, tenant.id, owner.id);
    await tx.tenantSignup.update({ where: { id: s.id }, data: { provisionedTenantId: tenant.id } });
    return { companyName: tenant.name, companyCode: tenant.companyCode ?? "", email: s.email, created: true, tenantId: tenant.id, ownerId: owner.id, firstName: s.firstName };
  });

  if (result.created) {
    await writeAuditLog({
      tenantId: result.tenantId,
      actorUserId: result.ownerId,
      action: "CREATE",
      entity: "Tenant",
      entityId: result.tenantId,
      changes: { name: result.companyName, source: "self-serve sign-up" },
      ipAddress: ip,
    });
    await logSubscriptionEvent({ tenantId: result.tenantId, type: "TRIAL_STARTED", detail: "self-serve sign-up", actorUserId: result.ownerId });
    await writeCentralAudit({ actorName: result.email, action: "signed up", target: result.companyName, kind: "TENANT", tenantId: result.tenantId, ipAddress: ip });
    try {
      await sendSignupReady(result.email, {
        firstName: "firstName" in result ? (result.firstName as string) : "",
        companyName: result.companyName,
        companyCode: result.companyCode,
        loginUrl: `${appUrl()}/login`,
      });
    } catch (e) {
      console.error("[signup] the welcome email failed:", e);
    }
  }
  return { companyName: result.companyName, companyCode: result.companyCode, email: result.email, created: result.created };
}
