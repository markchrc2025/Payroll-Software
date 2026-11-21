/**
 * PAY-68 (1.13, Q1b, Mark 17 Nov 2026: a correction is a new document, never
 * an edit; Frappe's Payroll Correction is not the model, 1.13 keeps its own
 * rule). Reference points kept from R120 / REP-8: a cumulative-reversal
 * guard, landing forward, and a correction that can itself be corrected.
 *
 *   * A correction points at one payslip of a FINALIZED run (sealed, PAY-67)
 *     and carries lines: an item, a signed amount (its effect on pay:
 *     positive pays more, negative takes back) and whether it is taxable.
 *   * The guard: all corrections of a payslip together (every one not
 *     cancelled, this one included) may not take back more of an item than
 *     the payslip paid, may not refund more lates than were deducted, and may
 *     not take the payslip's net below zero.
 *   * A second person approves it (PAYROLL:APPROVE, never its author). It then
 *     gets its control number (PC-YYYY-NNNN, gapless, PAY-69) and lands
 *     forward: one payroll adjustment per line in a later DRAFT run of the
 *     same employee. When that run is finalized, the correction is sealed
 *     with it.
 *   * An approved correction's figures never change (a database trigger). To
 *     change one, correct it with another correction.
 */
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { claimNumbers, formatControlNumber } from "./control-numbers";

type Tx = Prisma.TransactionClient;

/** Correctable items and the payslip column that holds what was paid. */
export const CORRECTION_ITEMS = {
  BASIC: "basePayCents",
  OVERTIME: "otPayCents",
  NIGHT_DIFF: "nsdPayCents",
  HOLIDAY: "holidayPayCents",
  REST_DAY: "restDayPayCents",
  HAZARD: "hazardPayCents",
  ALLOWANCE: "taxableAllowancesCents",
  LATES: "lateUndertimeDeductionCents",
  OTHER: null,
} as const;
export type CorrectionItem = keyof typeof CORRECTION_ITEMS;

export const ITEM_LABEL: Record<CorrectionItem, string> = {
  BASIC: "Basic pay", OVERTIME: "Overtime", NIGHT_DIFF: "Night differential", HOLIDAY: "Holiday pay",
  REST_DAY: "Rest day pay", HAZARD: "Hazard pay", ALLOWANCE: "Taxable allowances", LATES: "Lates and undertime", OTHER: "Other",
};

export const correctionLineSchema = z.object({
  item: z.enum(Object.keys(CORRECTION_ITEMS) as [CorrectionItem, ...CorrectionItem[]]),
  amountCents: z.string().regex(/^-?\d{1,13}$/, "amountCents must be whole centavos").refine((v) => !/^-?\d+$/.test(v) || BigInt(v) !== 0n, "amountCents cannot be zero"),
  taxable: z.boolean().default(true),
  description: z.string().max(200).optional(),
});
export type CorrectionLine = z.infer<typeof correctionLineSchema>;

export const createCorrectionSchema = z.object({
  originalSheetId: z.string().min(1),
  correctsId: z.string().min(1).optional(),
  reason: z.string().trim().min(5, "Give the reason (at least 5 characters)").max(2000),
  lines: z.array(correctionLineSchema).min(1).max(30),
});

export class CorrectionError extends Error {
  constructor(message: string, public status = 409, public problems: string[] = []) { super(message); }
}

type SheetFigures = Record<string, unknown> & { netPayCents: bigint };

const peso = (c: bigint) => {
  const a = c < 0n ? -c : c;
  return `${c < 0n ? "-" : ""}${(a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(a % 100n).toString().padStart(2, "0")}`;
};

/** The cumulative-reversal guard. `all` is every line of every live correction of the payslip, the new one included. */
export function guardProblems(sheet: SheetFigures, all: CorrectionLine[]): string[] {
  const problems: string[] = [];
  const effect = new Map<CorrectionItem, bigint>();
  let net = 0n;
  for (const l of all) {
    const a = BigInt(l.amountCents);
    effect.set(l.item, (effect.get(l.item) ?? 0n) + a);
    net += a;
  }
  for (const [item, total] of effect) {
    const col = CORRECTION_ITEMS[item];
    if (!col) continue;
    const paid = BigInt((sheet[col] as bigint | null | undefined) ?? 0n);
    if (item === "LATES") {
      if (total > paid) problems.push(`${ITEM_LABEL[item]}: corrections refund ${peso(total)}, but only ${peso(paid)} was deducted.`);
    } else if (paid + total < 0n) {
      problems.push(`${ITEM_LABEL[item]}: corrections take back ${peso(-total)}, but the payslip paid ${peso(paid)}.`);
    }
  }
  if (sheet.netPayCents + net < 0n) problems.push(`Net pay: corrections take back ${peso(-net)}, more than the payslip's net of ${peso(sheet.netPayCents)}.`);
  return problems;
}

async function liveLines(tx: Tx, originalSheetId: string, exceptId?: string): Promise<CorrectionLine[]> {
  const rows = await tx.payrollCorrection.findMany({
    where: { originalSheetId, status: { not: "CANCELLED" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { lines: true },
  });
  return rows.flatMap((r) => r.lines as unknown as CorrectionLine[]);
}

async function loadOriginal(tx: Tx, tenantId: string, sheetId: string) {
  const sheet = await tx.payrollSheet.findFirst({ where: { id: sheetId, tenantId }, include: { payrollBook: { select: { status: true, periodEnd: true } } } });
  if (!sheet) throw new CorrectionError("Payslip not found", 404);
  if (sheet.payrollBook.status !== "FINALIZED") throw new CorrectionError("Only a payslip of a finalized run is corrected; change a draft directly.", 409);
  return sheet;
}

export async function createCorrection(tx: Tx, tenantId: string, userId: string | null, input: z.infer<typeof createCorrectionSchema>) {
  const sheet = await loadOriginal(tx, tenantId, input.originalSheetId);
  if (input.correctsId) {
    const prior = await tx.payrollCorrection.findFirst({ where: { id: input.correctsId, tenantId } });
    if (!prior || prior.originalSheetId !== sheet.id) throw new CorrectionError("The correction being corrected belongs to another payslip.", 422);
    if (prior.status !== "APPROVED") throw new CorrectionError("Only an approved correction is corrected; change or cancel a draft instead.", 409);
  }
  const problems = guardProblems(sheet as unknown as SheetFigures, [...(await liveLines(tx, sheet.id)), ...input.lines]);
  if (problems.length) throw new CorrectionError("The correction would reverse more than the payslip paid.", 422, problems);
  return tx.payrollCorrection.create({
    data: {
      tenantId, employeeId: sheet.employeeId, originalSheetId: sheet.id, correctsId: input.correctsId ?? null,
      reason: input.reason, lines: input.lines as unknown as Prisma.InputJsonValue,
      netEffectCents: input.lines.reduce((t, l) => t + BigInt(l.amountCents), 0n), createdByUserId: userId,
    },
  });
}

/** Lands an approved correction in a later draft run of the same employee. */
async function land(tx: Tx, tenantId: string, correction: { id: string; employeeId: string; controlNumber: string | null; lines: unknown; originalSheetId: string }, bookId: string) {
  const [book, original] = await Promise.all([
    tx.payrollBook.findFirst({ where: { id: bookId, tenantId } }),
    tx.payrollSheet.findFirst({ where: { id: correction.originalSheetId }, include: { payrollBook: { select: { periodEnd: true } } } }),
  ]);
  if (!book) throw new CorrectionError("Payroll run not found", 404);
  if (book.status !== "DRAFT") throw new CorrectionError("A correction lands in a draft run.", 409);
  if (book.runType === "YEAR_END") throw new CorrectionError("A correction does not land in a Year-End run.", 409);
  if (!original || book.periodStart <= original.payrollBook.periodEnd) throw new CorrectionError("A correction lands forward: pick a run that starts after the corrected payslip's period.", 409);
  if (!(await tx.payrollSheet.findFirst({ where: { payrollBookId: bookId, employeeId: correction.employeeId }, select: { id: true } }))) {
    throw new CorrectionError("The employee has no payslip in that draft run.", 409);
  }
  const lines = correction.lines as unknown as CorrectionLine[];
  for (const l of lines) {
    const a = BigInt(l.amountCents);
    await tx.payrollAdjustment.create({
      data: {
        tenantId, employeeId: correction.employeeId, payrollBookId: bookId, correctionId: correction.id,
        kind: a > 0n ? "ADDITION" : "DEDUCTION", amountCents: a > 0n ? a : -a, isTaxable: l.taxable,
        reason: `Correction ${correction.controlNumber}: ${ITEM_LABEL[l.item]}${l.description ? `, ${l.description}` : ""}`,
      },
    });
  }
  await tx.payrollCorrection.update({ where: { id: correction.id }, data: { targetBookId: bookId } });
}

export async function approveCorrection(tx: Tx, tenantId: string, approverUserId: string | null, id: string, bookId: string) {
  const c = await tx.payrollCorrection.findFirst({ where: { id, tenantId } });
  if (!c) throw new CorrectionError("Correction not found", 404);
  if (c.status !== "DRAFT") throw new CorrectionError(`This correction is ${c.status.toLowerCase()}.`, 409);
  if (c.createdByUserId && c.createdByUserId === approverUserId) throw new CorrectionError("A correction is approved by someone other than its author.", 403);
  const sheet = await loadOriginal(tx, tenantId, c.originalSheetId);
  const problems = guardProblems(sheet as unknown as SheetFigures, [...(await liveLines(tx, sheet.id, c.id)), ...(c.lines as unknown as CorrectionLine[])]);
  if (problems.length) throw new CorrectionError("The correction would reverse more than the payslip paid.", 422, problems);
  const now = new Date();
  const year = now.getUTCFullYear();
  const controlNumber = formatControlNumber("PAYROLL_CORRECTION", year, await claimNumbers(tx, tenantId, "PAYROLL_CORRECTION", year, 1));
  const approved = await tx.payrollCorrection.update({
    where: { id }, data: { status: "APPROVED", controlNumber, approvedByUserId: approverUserId, approvedAt: now },
  });
  await land(tx, tenantId, approved, bookId);
  return tx.payrollCorrection.findUniqueOrThrow({ where: { id } });
}

/** Lands an approved correction again, after the draft it was in was discarded. */
export async function relandCorrection(tx: Tx, tenantId: string, id: string, bookId: string) {
  const c = await tx.payrollCorrection.findFirst({ where: { id, tenantId } });
  if (!c) throw new CorrectionError("Correction not found", 404);
  if (c.status !== "APPROVED") throw new CorrectionError("Only an approved correction lands.", 409);
  if (c.targetBookId) throw new CorrectionError("This correction has already landed.", 409);
  await land(tx, tenantId, c, bookId);
  return tx.payrollCorrection.findUniqueOrThrow({ where: { id } });
}

export async function cancelCorrection(tx: Tx, tenantId: string, id: string) {
  const c = await tx.payrollCorrection.findFirst({ where: { id, tenantId }, include: { targetBook: { select: { status: true } } } });
  if (!c) throw new CorrectionError("Correction not found", 404);
  if (c.status === "CANCELLED") return c;
  if (c.targetBook?.status === "FINALIZED") throw new CorrectionError("This correction was paid in a finalized run; correct it with a new correction.", 409);
  if (c.targetBookId) await tx.payrollAdjustment.deleteMany({ where: { correctionId: c.id, payrollBookId: c.targetBookId } });
  return tx.payrollCorrection.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), targetBookId: null } });
}
