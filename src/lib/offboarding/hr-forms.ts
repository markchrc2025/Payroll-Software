/**
 * PAY-197 (Mark, 20 Nov 2026 12:15: Offboarding is a main menu with a submenu
 * per part; 24 Nov: "Where's the other features I told you about?"). What HR
 * reads under each submenu, across every case:
 *   questionnaires    the exit questionnaire answers, with a summary
 *   personal-info     the personal information forms (bank account shown as
 *                     its last four digits only; the number stays encrypted)
 *   final-pay         per case: clearance, the final pay run and its net pay,
 *                     the DOLE 30-day mark, the certificate of employment and
 *                     the quitclaim
 */
import type { Prisma } from "@prisma/client";
import { daysSinceSeparation, FINAL_PAY_DAYS } from "./clearance";

type Tx = Prisma.TransactionClient;
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const name = (e: { firstName: string; lastName: string }) => `${e.lastName}, ${e.firstName}`;
const employee = { select: { id: true, employeeNumber: true, firstName: true, lastName: true } } as const;

export type FormKind = "questionnaires" | "personal-info" | "final-pay";
export const FORM_KINDS: FormKind[] = ["questionnaires", "personal-info", "final-pay"];

export async function questionnaires(tx: Tx, tenantId: string) {
  const cases = await tx.offboardingCase.findMany({
    where: { tenantId, exitQuestionnaireAt: { not: null } },
    include: { employee },
    orderBy: { exitQuestionnaireAt: "desc" },
  });
  const rows = cases.map((c) => {
    const a = (c.exitQuestionnaire ?? {}) as Record<string, string | undefined>;
    return {
      caseId: c.id, employeeNumber: c.employee.employeeNumber, name: name(c.employee),
      separationReason: c.separationReason, lastWorkingDay: day(c.lastWorkingDay), submittedAt: day(c.exitQuestionnaireAt),
      reasonForLeaving: a.reasonForLeaving ?? null, likedMost: a.likedMost ?? null, couldImprove: a.couldImprove ?? null,
      wouldRecommend: a.wouldRecommend ?? null, wouldReturn: a.wouldReturn ?? null, comments: a.comments ?? null,
    };
  });
  const count = (k: "wouldRecommend" | "wouldReturn") =>
    Object.fromEntries(["YES", "MAYBE", "NO"].map((v) => [v, rows.filter((r) => r[k] === v).length]));
  return { summary: { responses: rows.length, wouldRecommend: count("wouldRecommend"), wouldReturn: count("wouldReturn") }, rows };
}

export async function personalInfo(tx: Tx, tenantId: string) {
  const cases = await tx.offboardingCase.findMany({
    where: { tenantId, personalInfoAt: { not: null } },
    include: { employee },
    orderBy: { personalInfoAt: "desc" },
  });
  return {
    rows: cases.map((c) => {
      const i = (c.personalInfo ?? {}) as Record<string, string | undefined>;
      return {
        caseId: c.id, employeeNumber: c.employee.employeeNumber, name: name(c.employee), submittedAt: day(c.personalInfoAt),
        forwardingAddress: i.forwardingAddress ?? null, personalEmail: i.personalEmail ?? null, mobileNumber: i.mobileNumber ?? null,
        bankName: i.bankName ?? null, bankAccountName: i.bankAccountName ?? null,
        bankAccount: i.bankAccountLast4 ? `ending ${i.bankAccountLast4}` : null,
      };
    }),
  };
}

export async function finalPay(tx: Tx, tenantId: string) {
  const cases = await tx.offboardingCase.findMany({
    where: { tenantId },
    include: { employee, items: { select: { status: true } } },
    orderBy: { lastWorkingDay: "desc" },
  });
  const sheets = await tx.payrollSheet.findMany({
    where: { tenantId, employeeId: { in: cases.map((c) => c.employeeId) }, payrollBook: { runType: "FINAL_PAY" } },
    select: { employeeId: true, netPayCents: true, payrollBook: { select: { id: true, status: true, finalizedAt: true, periodEnd: true } } },
    orderBy: { createdAt: "desc" },
  });
  return {
    rows: cases.map((c) => {
      const s = sheets.find((x) => x.employeeId === c.employeeId && x.payrollBook.status !== "CANCELLED");
      const days = daysSinceSeparation(c.lastWorkingDay);
      const pending = c.items.filter((i) => i.status === "PENDING").length;
      return {
        caseId: c.id, employeeNumber: c.employee.employeeNumber, name: name(c.employee),
        separationReason: c.separationReason, lastWorkingDay: day(c.lastWorkingDay), caseStatus: c.status,
        clearance: { pending, total: c.items.length },
        daysSinceSeparation: days, dueInDays: s?.payrollBook.status === "FINALIZED" ? null : FINAL_PAY_DAYS - days,
        finalPayRun: s ? { bookId: s.payrollBook.id, status: s.payrollBook.status, finalizedAt: day(s.payrollBook.finalizedAt), netPayCents: s.netPayCents.toString() } : null,
        coeRequestedAt: day(c.coeRequestedAt), coeIssuedAt: day(c.coeIssuedAt),
        quitclaimReady: s?.payrollBook.status === "FINALIZED",
      };
    }),
  };
}

/** A case as HR sees it: the stored bank number never leaves the server, even encrypted. */
export function maskCase<T extends object>(c: T): T {
  const i = (c as { personalInfo?: unknown }).personalInfo as Record<string, unknown> | null | undefined;
  if (!i || typeof i !== "object") return c;
  const { bankAccountNumberEnc: _drop, ...rest } = i;
  void _drop;
  return { ...c, personalInfo: { ...rest, bankAccount: rest.bankAccountLast4 ? `ending ${String(rest.bankAccountLast4)}` : null } };
}
