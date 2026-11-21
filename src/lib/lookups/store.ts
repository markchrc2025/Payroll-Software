/**
 * Wave A: reading and writing the lists. A company's list starts with the
 * registry's defaults the first time it is opened (nothing is re-added once
 * the list has items, deleted ones included).
 */
import type { Prisma } from "@prisma/client";
import { attributesSchema, itemSchema, LISTS, type ListDefinition } from "./registry";

type Tx = Prisma.TransactionClient;

export class LookupError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export async function ensureDefaults(tx: Tx, tenantId: string, def: ListDefinition) {
  if (!def.defaults.length) return;
  const any = await tx.lookupItem.count({ where: { tenantId, list: def.key } });
  if (any) return;
  await tx.lookupItem.createMany({
    data: def.defaults.map((d, i) => ({
      tenantId, list: def.key, code: d.code, name: d.name, sortOrder: (i + 1) * 10,
      isSystem: d.isSystem ?? false, attributes: (d.attributes ?? {}) as Prisma.InputJsonValue,
    })),
    skipDuplicates: true,
  });
}

export async function listItems(tx: Tx, tenantId: string, list: string, includeInactive = false) {
  const def = LISTS[list]!;
  await ensureDefaults(tx, tenantId, def);
  return tx.lookupItem.findMany({
    where: { tenantId, list, deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

function parse(def: ListDefinition, body: unknown, partial: boolean) {
  const base = partial ? itemSchema.partial() : itemSchema;
  const r = base.safeParse(body);
  if (!r.success) throw new LookupError(r.error.issues[0]?.message ?? "Invalid item", 422);
  let attributes: Record<string, unknown> | undefined;
  if (r.data.attributes !== undefined) {
    const a = attributesSchema(def).safeParse(r.data.attributes);
    if (!a.success) throw new LookupError(a.error.issues[0]?.message ?? "Invalid field", 422);
    attributes = a.data;
  }
  return { ...r.data, attributes };
}

export async function createItem(tx: Tx, tenantId: string, list: string, body: unknown) {
  const def = LISTS[list]!;
  const data = parse(def, body, false);
  const clash = await tx.lookupItem.findFirst({ where: { tenantId, list, code: data.code! } });
  if (clash) throw new LookupError(`The code ${data.code} is already used in ${def.label}.`);
  return tx.lookupItem.create({ data: { tenantId, list, code: data.code!, name: data.name!, sortOrder: data.sortOrder ?? 0, isActive: data.isActive ?? true, attributes: (data.attributes ?? {}) as Prisma.InputJsonValue } });
}

export async function updateItem(tx: Tx, tenantId: string, list: string, id: string, body: unknown) {
  const def = LISTS[list]!;
  const item = await tx.lookupItem.findFirst({ where: { id, tenantId, list, deletedAt: null } });
  if (!item) throw new LookupError("Item not found", 404);
  const data = parse(def, body, true);
  if (item.isSystem && data.code && data.code !== item.code) throw new LookupError("A built-in item keeps its code.");
  if (data.code && data.code !== item.code && (await tx.lookupItem.findFirst({ where: { tenantId, list, code: data.code } }))) {
    throw new LookupError(`The code ${data.code} is already used in ${def.label}.`);
  }
  return tx.lookupItem.update({
    where: { id },
    data: {
      ...(data.code ? { code: data.code } : {}), ...(data.name ? { name: data.name } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}), ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.attributes ? { attributes: { ...(item.attributes as object), ...data.attributes } as Prisma.InputJsonValue } : {}),
    },
  });
}

export async function deleteItem(tx: Tx, tenantId: string, list: string, id: string) {
  const item = await tx.lookupItem.findFirst({ where: { id, tenantId, list, deletedAt: null } });
  if (!item) throw new LookupError("Item not found", 404);
  if (item.isSystem) throw new LookupError("A built-in item cannot be deleted; switch it off instead.");
  return tx.lookupItem.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
}
