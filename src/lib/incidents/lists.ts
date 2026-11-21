/**
 * Wave A3 (PAY-210): incidents take their category, type and decision from
 * the company's lists (Incident Categories, Incident Types, Incident
 * Decisions).
 *
 * The type list starts with the built-in stages, which keep the enum column
 * `type` (read by the notices and the ESS screens). A type the company adds
 * is stored as OTHER in `type`, with the item in `typeId`.
 *
 * A decision is recorded when the incident is resolved. Its suspension days
 * and dismissal flag are copied onto the incident at that moment, so the
 * outcome stays as decided if the list item is later edited or deleted
 * (Wave G turns these into unpaid days and offboarding).
 */
import { IncidentType, type Prisma } from "@prisma/client";
import { listItems } from "@/lib/lookups/store";

type Tx = Prisma.TransactionClient;

export class IncidentListRefusal extends Error {}

const ENUM_TYPES = new Set<string>(Object.values(IncidentType));
const attrs = (j: Prisma.JsonValue) => (j && typeof j === "object" && !Array.isArray(j) ? j : {}) as Record<string, unknown>;

/** The type and category columns for a new or edited incident. */
export async function resolveIncidentLists(
  tx: Tx, tenantId: string,
  input: { type?: IncidentType; typeId?: string | null; categoryId?: string | null },
): Promise<{ type?: IncidentType; typeId?: string | null; categoryId?: string | null }> {
  const out: { type?: IncidentType; typeId?: string | null; categoryId?: string | null } = {};
  if (input.typeId || input.type) {
    const types = await listItems(tx, tenantId, "INCIDENT_TYPE");
    const item = input.typeId ? types.find((t) => t.id === input.typeId) : types.find((t) => t.code === input.type);
    if (input.typeId && !item) throw new IncidentListRefusal("Pick a type from the company's Incident Types.");
    out.type = item ? (ENUM_TYPES.has(item.code) ? (item.code as IncidentType) : IncidentType.OTHER) : input.type;
    out.typeId = item?.id ?? null;
  }
  if (input.categoryId !== undefined) {
    if (input.categoryId === null) out.categoryId = null;
    else {
      const cats = await listItems(tx, tenantId, "INCIDENT_CATEGORY");
      if (!cats.some((c) => c.id === input.categoryId)) throw new IncidentListRefusal("Pick a category from the company's Incident Categories.");
      out.categoryId = input.categoryId;
    }
  }
  return out;
}

/** The decision columns written when an incident is resolved. */
export async function resolveDecision(tx: Tx, tenantId: string, decisionId: string | null | undefined) {
  if (!decisionId) return { decisionId: null, decisionSuspensionDays: null, decisionIsDismissal: false };
  const items = await listItems(tx, tenantId, "INCIDENT_DECISION");
  const item = items.find((d) => d.id === decisionId);
  if (!item) throw new IncidentListRefusal("Pick a decision from the company's Incident Decisions.");
  const a = attrs(item.attributes);
  const days = typeof a.suspensionDays === "number" && a.suspensionDays > 0 ? Math.trunc(a.suspensionDays) : null;
  return { decisionId: item.id, decisionSuspensionDays: days, decisionIsDismissal: a.isDismissal === true };
}
