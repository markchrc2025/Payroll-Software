/**
 * Wave A2 (PAY-209, decision 6, Mark 21 Nov 2026): expense claims take their
 * category and type from the company's lists.
 *
 * - Category: what the money was for. Its receipt rule is enforced when the
 *   claim is submitted; its limits (per claim, per calendar month) are only
 *   flagged for the approver, never blocking (decision 6).
 * - Type: how the claim is paid and taxed. The type's tax treatment is the
 *   default at approval; an approver who picks another treatment gives a
 *   reason.
 *
 * `category` (the text column read by the reports) keeps the category's code.
 */
import type { ExpenseTaxTreatment, Prisma } from "@prisma/client";
import { listItems } from "@/lib/lookups/store";

type Tx = Prisma.TransactionClient;

export class ClaimListRefusal extends Error {
  constructor(message: string, public status = 422) { super(message); }
}

type Item = { id: string; code: string; name: string; attributes: Prisma.JsonValue };
const attrs = (i: Item) => (i.attributes && typeof i.attributes === "object" && !Array.isArray(i.attributes) ? i.attributes : {}) as Record<string, unknown>;

function find(items: Item[], id: string | null | undefined, text: string | null | undefined): Item | undefined {
  if (id) return items.find((i) => i.id === id);
  if (!text) return undefined;
  const t = text.trim().toLowerCase();
  return items.find((i) => i.code.toLowerCase() === t || i.name.toLowerCase() === t);
}

export const DEFAULT_TYPE_CODE = "REIMBURSEMENT";

/** The category and type columns for a new or edited claim. */
export async function resolveClaimLists(
  tx: Tx, tenantId: string,
  input: { categoryId?: string | null; category?: string | null; typeId?: string | null },
): Promise<{ categoryId: string; category: string; typeId: string }> {
  const [categories, types] = await Promise.all([listItems(tx, tenantId, "EXPENSE_CATEGORY"), listItems(tx, tenantId, "EXPENSE_TYPE")]);
  const cat = find(categories, input.categoryId, input.category);
  if (!cat) throw new ClaimListRefusal("Pick a category from the company's Expense Categories.");
  const type = input.typeId ? find(types, input.typeId, null) : types.find((t) => t.code === DEFAULT_TYPE_CODE) ?? types[0];
  if (!type) throw new ClaimListRefusal("Pick a type from the company's Expense Types.");
  return { categoryId: cat.id, category: cat.code, typeId: type.id };
}

export type LimitFlag =
  | { kind: "PER_CLAIM"; limitCents: string; amountCents: string }
  | { kind: "PER_MONTH"; limitCents: string; monthTotalCents: string; month: string };

const COUNTED = ["SUBMITTED", "APPROVED", "ATTACHED", "PAID"] as const;

type ClaimForCheck = { id: string; tenantId: string; employeeId: string; categoryId: string | null; amountCents: bigint; claimDate: Date; receiptKey: string | null };

async function categoryOf(tx: Tx, c: ClaimForCheck): Promise<Item | null> {
  if (!c.categoryId) return null;
  return tx.lookupItem.findFirst({ where: { id: c.categoryId, tenantId: c.tenantId }, select: { id: true, code: true, name: true, attributes: true } });
}

/** The limits a claim goes over, counting the employee's other live claims in the same category and month. */
export async function limitFlags(tx: Tx, c: ClaimForCheck): Promise<LimitFlag[]> {
  const cat = await categoryOf(tx, c);
  if (!cat) return [];
  const a = attrs(cat);
  const flags: LimitFlag[] = [];
  const perClaim = typeof a.limitPerClaimCents === "string" ? BigInt(a.limitPerClaimCents) : null;
  if (perClaim !== null && c.amountCents > perClaim) {
    flags.push({ kind: "PER_CLAIM", limitCents: perClaim.toString(), amountCents: c.amountCents.toString() });
  }
  const perMonth = typeof a.limitPerMonthCents === "string" ? BigInt(a.limitPerMonthCents) : null;
  if (perMonth !== null) {
    const y = c.claimDate.getUTCFullYear(), m = c.claimDate.getUTCMonth();
    const from = new Date(Date.UTC(y, m, 1)), to = new Date(Date.UTC(y, m + 1, 1));
    const others = await tx.expenseClaim.aggregate({
      where: { tenantId: c.tenantId, employeeId: c.employeeId, categoryId: c.categoryId, id: { not: c.id }, status: { in: [...COUNTED] }, claimDate: { gte: from, lt: to } },
      _sum: { amountCents: true },
    });
    const total = (others._sum.amountCents ?? 0n) + c.amountCents;
    if (total > perMonth) {
      flags.push({ kind: "PER_MONTH", limitCents: perMonth.toString(), monthTotalCents: total.toString(), month: `${y}-${String(m + 1).padStart(2, "0")}` });
    }
  }
  return flags;
}

/** At submission: a category that needs a receipt refuses a claim without one; limits are flagged. */
export async function checkOnSubmit(tx: Tx, c: ClaimForCheck): Promise<LimitFlag[]> {
  const cat = await categoryOf(tx, c);
  if (cat && attrs(cat).receiptRequired === true && !c.receiptKey) {
    throw new ClaimListRefusal(`${cat.name} claims need a receipt. Attach one, then submit.`);
  }
  return limitFlags(tx, c);
}

/**
 * The tax treatment at approval: the type's, unless the approver picks
 * another, which needs a reason.
 */
export async function treatmentOnApproval(
  tx: Tx, tenantId: string, typeId: string | null,
  chosen: ExpenseTaxTreatment | undefined, reason: string | undefined,
): Promise<{ taxTreatment: ExpenseTaxTreatment; taxTreatmentReason: string | null }> {
  const type = typeId ? await tx.lookupItem.findFirst({ where: { id: typeId, tenantId }, select: { id: true, code: true, name: true, attributes: true } }) : null;
  const fromType = type ? (attrs(type).taxTreatment as ExpenseTaxTreatment | undefined) : undefined;
  const taxTreatment = chosen ?? fromType;
  if (!taxTreatment) throw new ClaimListRefusal("Choose the tax treatment: this claim's type has none.");
  if (fromType && taxTreatment !== fromType) {
    if (!reason?.trim()) throw new ClaimListRefusal(`The type ${type!.name} is ${fromType}. Give a reason to approve it as ${taxTreatment}.`);
    return { taxTreatment, taxTreatmentReason: reason.trim() };
  }
  return { taxTreatment, taxTreatmentReason: null };
}
