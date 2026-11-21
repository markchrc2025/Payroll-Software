/**
 * PAY-197 part 2 (Mark, 20 Nov 2026, ruling 4): the separated employee uses
 * a separate, limited Offboarding portal reached by a sign-in link sent to the
 * personal email: offboarding forms and final documents only; it closes 90
 * days after final pay; ESS stays closed.
 *
 *   * HR sends the link (single use, 7 days). Only the token's SHA-256 is kept.
 *   * Using it starts a portal session (cookie, 12 hours at most, never past
 *     the portal's closing).
 *   * The portal is open until 90 days after the employee's final pay run is
 *     finalized; before that run is finalized it is open.
 *   * The forms: the exit questionnaire and the personal information form
 *     (forwarding address, personal email and phone, bank for the final pay,
 *     the account number encrypted at rest); a certificate of employment
 *     request; the final payslip once the final pay run is finalized.
 */
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import prismaAdmin from "@/lib/prisma-admin";
import { encrypt } from "@/lib/crypto";

type Tx = Prisma.TransactionClient;

export const PORTAL_COOKIE = "sentire_offboard";
export const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const PORTAL_OPEN_DAYS = 90;

export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

/** When the portal closes: 90 days after the final pay run was finalized; null while it is not. */
export async function portalClosesAt(tx: Tx, tenantId: string, employeeId: string): Promise<Date | null> {
  const sheet = await tx.payrollSheet.findFirst({
    where: { tenantId, employeeId, payrollBook: { runType: "FINAL_PAY", status: "FINALIZED" } },
    select: { payrollBook: { select: { finalizedAt: true } } },
    orderBy: { payrollBook: { finalizedAt: "desc" } },
  });
  const at = sheet?.payrollBook.finalizedAt;
  return at ? new Date(at.getTime() + PORTAL_OPEN_DAYS * 86_400_000) : null;
}

export class PortalError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

/** Issues a sign-in link for the case and retires the unused ones. Returns the raw token. */
export async function issuePortalLink(tx: Tx, tenantId: string, caseId: string, email: string, now = new Date()) {
  const c = await tx.offboardingCase.findFirst({ where: { id: caseId, tenantId } });
  if (!c) throw new PortalError("Offboarding case not found", 404);
  const closes = await portalClosesAt(tx, tenantId, c.employeeId);
  if (closes && closes <= now) throw new PortalError("The offboarding portal closed 90 days after final pay.");
  await tx.offboardingPortalLink.updateMany({ where: { caseId, usedAt: null, retiredAt: null }, data: { retiredAt: now } });
  const raw = newToken();
  await tx.offboardingPortalLink.create({ data: { tenantId, caseId, tokenHash: hashToken(raw), email, expiresAt: new Date(now.getTime() + LINK_TTL_MS) } });
  return raw;
}

/** Trades a link for a session. Runs before the tenant is known, as the owner (like ESS links). */
export async function startPortalSession(rawLink: string, now = new Date()): Promise<{ token: string; expiresAt: Date } | { refused: string }> {
  const link = await prismaAdmin.offboardingPortalLink.findUnique({ where: { tokenHash: hashToken(rawLink) }, include: { case: { select: { employeeId: true } } } });
  if (!link || link.retiredAt) return { refused: "This link is not valid. Ask HR for a new one." };
  if (link.usedAt) return { refused: "This link was already used. Ask HR for a new one." };
  if (link.expiresAt <= now) return { refused: "This link has expired. Ask HR for a new one." };
  const closes = await portalClosesAt(prismaAdmin as unknown as Tx, link.tenantId, link.case.employeeId);
  if (closes && closes <= now) return { refused: "The offboarding portal closed 90 days after your final pay." };
  const raw = newToken();
  const expiresAt = new Date(Math.min(now.getTime() + SESSION_TTL_MS, closes?.getTime() ?? Infinity));
  await prismaAdmin.$transaction([
    prismaAdmin.offboardingPortalLink.update({ where: { id: link.id }, data: { usedAt: now } }),
    prismaAdmin.offboardingPortalSession.create({ data: { tenantId: link.tenantId, caseId: link.caseId, tokenHash: hashToken(raw), expiresAt } }),
  ]);
  return { token: raw, expiresAt };
}

export interface PortalContext { tenantId: string; caseId: string; employeeId: string }

/** The portal session behind a request's cookie, or null. */
export async function getPortalSession(req: { cookies: { get(name: string): { value: string } | undefined } }, now = new Date()): Promise<PortalContext | null> {
  const raw = req.cookies.get(PORTAL_COOKIE)?.value;
  if (!raw) return null;
  const s = await prismaAdmin.offboardingPortalSession.findUnique({ where: { tokenHash: hashToken(raw) }, include: { case: { select: { employeeId: true } } } });
  if (!s || s.revokedAt || s.expiresAt <= now) return null;
  return { tenantId: s.tenantId, caseId: s.caseId, employeeId: s.case.employeeId };
}

export async function endPortalSession(raw: string | undefined) {
  if (!raw) return;
  await prismaAdmin.offboardingPortalSession.updateMany({ where: { tokenHash: hashToken(raw), revokedAt: null }, data: { revokedAt: new Date() } });
}

// ---------------------------------------------------------------------------
// The forms
// ---------------------------------------------------------------------------

const text = (max = 2000) => z.string().trim().max(max);

export const exitQuestionnaireSchema = z.object({
  reasonForLeaving: text(500).min(1, "Tell us why you are leaving"),
  likedMost: text().optional(),
  couldImprove: text().optional(),
  wouldRecommend: z.enum(["YES", "NO", "MAYBE"]),
  wouldReturn: z.enum(["YES", "NO", "MAYBE"]),
  comments: text().optional(),
});

export const personalInfoSchema = z.object({
  forwardingAddress: text(500).min(5, "Give the address where documents can reach you"),
  personalEmail: z.string().trim().email(),
  mobileNumber: text(30).min(7),
  bankName: text(120).optional(),
  bankAccountName: text(120).optional(),
  bankAccountNumber: z.string().trim().regex(/^[0-9 -]{4,34}$/, "Bank account number: digits only").optional(),
});

export async function savePersonalInfo(tx: Tx, ctx: PortalContext, input: z.infer<typeof personalInfoSchema>) {
  const { bankAccountNumber, ...rest } = input;
  const stored = {
    ...rest,
    ...(bankAccountNumber ? { bankAccountNumberEnc: encrypt(bankAccountNumber.replace(/[ -]/g, "")), bankAccountLast4: bankAccountNumber.replace(/[ -]/g, "").slice(-4) } : {}),
  };
  return tx.offboardingCase.update({ where: { id: ctx.caseId }, data: { personalInfo: stored, personalInfoAt: new Date() } });
}

/** What the portal shows: never more than the employee's own case. */
export async function portalSummary(tx: Tx, ctx: PortalContext) {
  const c = await tx.offboardingCase.findFirstOrThrow({
    where: { id: ctx.caseId, tenantId: ctx.tenantId },
    include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } }, items: { select: { name: true, status: true }, orderBy: { sortOrder: "asc" } } },
  });
  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, select: { name: true, tradeName: true } });
  const finalPay = await tx.payrollSheet.findFirst({
    where: { tenantId: ctx.tenantId, employeeId: ctx.employeeId, payrollBook: { runType: "FINAL_PAY", status: "FINALIZED" } },
    select: { payrollBookId: true }, orderBy: { payrollBook: { finalizedAt: "desc" } },
  });
  const info = (c.personalInfo ?? null) as Record<string, string> | null;
  return {
    company: tenant.tradeName || tenant.name,
    employee: c.employee,
    lastWorkingDay: c.lastWorkingDay,
    clearance: { status: c.status, items: c.items },
    exitQuestionnaireAt: c.exitQuestionnaireAt,
    personalInfo: info ? { ...info, bankAccountNumberEnc: undefined, bankAccount: info.bankAccountLast4 ? `ending ${info.bankAccountLast4}` : null } : null,
    personalInfoAt: c.personalInfoAt,
    coeRequestedAt: c.coeRequestedAt,
    finalPayslipBookId: finalPay?.payrollBookId ?? null,
    closesAt: await portalClosesAt(tx, ctx.tenantId, ctx.employeeId),
  };
}
