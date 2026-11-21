/**
 * Wave A1 (PAY-208, decision 4): an employee's payout bank or e-wallet is
 * picked from the company's Bank list. The picked item's name is copied into
 * bankName, which the payslip and the bank files already read, so nothing
 * downstream changes. bankName stays writable for records saved before the
 * list existed.
 */
import type { Prisma } from "@prisma/client";
import { listItems } from "@/lib/lookups/store";

type Tx = Prisma.TransactionClient;

export class BankRefusal extends Error {}

/** The bank columns to write for a bankId (null clears both). */
export async function resolveBank(tx: Tx, tenantId: string, bankId: string | null): Promise<{ bankId: string | null; bankName?: string | null }> {
  if (bankId === null) return { bankId: null };
  await listItems(tx, tenantId, "BANK"); // starts the list with its defaults
  const item = await tx.lookupItem.findFirst({
    where: { id: bankId, tenantId, list: "BANK", deletedAt: null, isActive: true },
    select: { id: true, name: true },
  });
  if (!item) throw new BankRefusal("That bank is not in the company's Bank list.");
  return { bankId: item.id, bankName: item.name };
}

/** The active Bank item whose code or name matches (case-insensitive), for codes from ESS requests and imports. */
export async function bankByCodeOrName(tx: Tx, tenantId: string, value: string) {
  const items = await listItems(tx, tenantId, "BANK");
  const v = value.trim().toLowerCase();
  return items.find((i) => i.code.toLowerCase() === v || i.name.toLowerCase() === v) ?? null;
}
