/**
 * PAY-166 (Mark, 17 Nov 2026 12:36, Q5b): "sometimes, salary-increase is
 * retrospective ... to cover January to June actual worked days,
 * recomputation is valid and customizable." Sealed runs are never
 * recomputed: a retroactive increase is a batch of new documents.
 *
 * For each finalized REGULAR payslip of the employee whose period ends inside
 * the chosen dates, every chosen rate-based item is re-priced at the new rate
 * for the same days and hours actually paid: new = paid x new rate / the rate
 * on that payslip (its salary snapshot), rounded half-up to the centavo; the
 * difference is a line of a correction (PAY-68) of that payslip. Lates and
 * undertime, when chosen, cost more at the new rate, so they come back as a
 * negative line. Payslips already at or above the new rate are skipped.
 * The batch is approved by a second person and lands in a later draft run
 * as taxable adjustments, so tax and contributions follow the month it is
 * paid in.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { approveCorrection, CorrectionError, ITEM_LABEL, type CorrectionItem, type CorrectionLine } from "./corrections";

type Tx = Prisma.TransactionClient;

export const RETRO_ITEMS = ["BASIC", "OVERTIME", "NIGHT_DIFF", "HOLIDAY", "REST_DAY", "LATES"] as const;
export type RetroItem = (typeof RETRO_ITEMS)[number];
const COLUMN: Record<RetroItem, "basePayCents" | "otPayCents" | "nsdPayCents" | "holidayPayCents" | "restDayPayCents" | "lateUndertimeDeductionCents"> = {
  BASIC: "basePayCents", OVERTIME: "otPayCents", NIGHT_DIFF: "nsdPayCents", HOLIDAY: "holidayPayCents",
  REST_DAY: "restDayPayCents", LATES: "lateUndertimeDeductionCents",
};

export const retroPaySchema = z.object({
  employees: z.array(z.object({
    employeeId: z.string().min(1),
    /** The new basic salary, in the same unit as the payslips (per month for monthly, per day for daily). */
    newBasicSalaryCents: z.string().regex(/^\d{1,13}$/),
  })).min(1).max(500),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(z.enum(RETRO_ITEMS)).min(1).default(["BASIC", "OVERTIME", "NIGHT_DIFF", "HOLIDAY", "REST_DAY", "LATES"]),
  reason: z.string().trim().min(5).max(2000),
});
export type RetroPayInput = z.infer<typeof retroPaySchema>;

/** paid x (new / old) - paid, rounded half-up to the centavo. */
export function retroDifference(paidCents: bigint, oldRateCents: bigint, newRateCents: bigint): bigint {
  if (oldRateCents <= 0n || paidCents === 0n) return 0n;
  const num = paidCents * newRateCents;
  const repriced = (num * 2n + oldRateCents) / (2n * oldRateCents);
  return repriced - paidCents;
}

export interface RetroPayslip {
  sheetId: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  oldRateCents: string;
  newRateCents: string;
  lines: CorrectionLine[];
  totalCents: string;
}

export async function previewRetroPay(tx: Tx, tenantId: string, input: RetroPayInput): Promise<RetroPayslip[]> {
  const from = new Date(`${input.from}T00:00:00.000Z`);
  const to = new Date(`${input.to}T23:59:59.999Z`);
  if (from > to) throw new CorrectionError("The period starts after it ends.", 422);
  const out: RetroPayslip[] = [];
  for (const e of input.employees) {
    const newRate = BigInt(e.newBasicSalaryCents);
    const sheets = await tx.payrollSheet.findMany({
      where: { tenantId, employeeId: e.employeeId, payrollBook: { status: "FINALIZED", runType: "REGULAR", periodEnd: { gte: from, lte: to } } },
      include: { payrollBook: { select: { periodStart: true, periodEnd: true } } },
      orderBy: { payrollBook: { periodEnd: "asc" } },
    });
    for (const s of sheets) {
      const oldRate = s.basicSalaryCentsSnapshot;
      if (newRate <= oldRate) continue;
      const lines: CorrectionLine[] = [];
      for (const item of input.items) {
        const diff = retroDifference(s[COLUMN[item]], oldRate, newRate);
        if (diff === 0n) continue;
        lines.push({
          item: item as CorrectionItem,
          amountCents: (item === "LATES" ? -diff : diff).toString(),
          taxable: true,
          description: `retroactive increase, ${ITEM_LABEL[item as CorrectionItem].toLowerCase()} at the new rate`,
        });
      }
      if (!lines.length) continue;
      out.push({
        sheetId: s.id, employeeId: s.employeeId,
        periodStart: s.payrollBook.periodStart.toISOString().slice(0, 10), periodEnd: s.payrollBook.periodEnd.toISOString().slice(0, 10),
        oldRateCents: oldRate.toString(), newRateCents: newRate.toString(),
        lines, totalCents: lines.reduce((t, l) => t + BigInt(l.amountCents), 0n).toString(),
      });
    }
  }
  return out;
}

/** Saves the batch as draft corrections, one per payslip. */
export async function createRetroPay(tx: Tx, tenantId: string, userId: string | null, input: RetroPayInput) {
  const preview = await previewRetroPay(tx, tenantId, input);
  if (!preview.length) throw new CorrectionError("No finalized regular payslip in the period is below the new rate.", 422);
  const batchId = `retro_${randomUUID()}`;
  for (const p of preview) {
    await tx.payrollCorrection.create({
      data: {
        tenantId, employeeId: p.employeeId, originalSheetId: p.sheetId, kind: "RETRO_PAY", batchId,
        reason: `${input.reason} (retroactive increase ${input.from} to ${input.to})`,
        lines: p.lines as unknown as Prisma.InputJsonValue, netEffectCents: BigInt(p.totalCents), createdByUserId: userId,
      },
    });
  }
  return { batchId, payslips: preview.length, totalCents: preview.reduce((t, p) => t + BigInt(p.totalCents), 0n).toString() };
}

/**
 * Approves every draft of the batch and lands each employee's part in the
 * draft run picked for them (the same run for everyone when one id is given).
 */
export async function approveRetroPay(tx: Tx, tenantId: string, approverUserId: string | null, batchId: string, bookId: string) {
  const drafts = await tx.payrollCorrection.findMany({ where: { tenantId, batchId, status: "DRAFT" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!drafts.length) throw new CorrectionError("Nothing left to approve in this batch.", 409);
  const approved = [];
  for (const d of drafts) approved.push(await approveCorrection(tx, tenantId, approverUserId, d.id, bookId));
  return approved;
}
