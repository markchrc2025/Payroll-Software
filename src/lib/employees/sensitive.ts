/**
 * Wave A1 (PAY-208, decision 5, Mark 21 Nov 2026): ethnicity and religion are
 * sensitive personal information under the Data Privacy Act (RA 10173 s.3(l)).
 * They are optional, recorded only after the employee's consent is noted,
 * seen only by a role holding SENSITIVE_DATA:READ, changed only by a role
 * holding SENSITIVE_DATA:UPDATE, and never read by the payroll engine.
 *
 * The spouse's ethnicity and religion are the same kind of information about
 * another person, so the same rule covers them.
 */
import type { Prisma } from "@prisma/client";
import type { AuthContext } from "@/lib/auth";
import { holdsAny } from "@/lib/authz/route-permission";
import { listItems } from "@/lib/lookups/store";

type Tx = Prisma.TransactionClient;

export const SENSITIVE_FIELDS = ["ethnicity", "religion", "spouseEthnicity", "spouseReligion"] as const;
export type SensitiveField = (typeof SENSITIVE_FIELDS)[number];

const LIST_OF: Record<SensitiveField, "ETHNICITY" | "RELIGION"> = {
  ethnicity: "ETHNICITY", spouseEthnicity: "ETHNICITY",
  religion: "RELIGION", spouseReligion: "RELIGION",
};

export type SensitiveAccess = { read: boolean; write: boolean };

export async function sensitiveAccess(auth: AuthContext): Promise<SensitiveAccess> {
  const [read, write] = await Promise.all([
    holdsAny(auth, [["SENSITIVE_DATA", "READ"]]),
    holdsAny(auth, [["SENSITIVE_DATA", "UPDATE"]]),
  ]);
  return { read: read || write, write };
}

/** The record with the four fields blanked when the caller may not see them. */
export function redactSensitive<T extends Record<string, unknown>>(row: T, access: SensitiveAccess): T & { sensitiveHidden: boolean } {
  if (access.read) return { ...row, sensitiveHidden: false };
  const out: Record<string, unknown> = { ...row, sensitiveHidden: true };
  for (const f of SENSITIVE_FIELDS) if (f in out) out[f] = null;
  return out as T & { sensitiveHidden: boolean };
}

const blank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

export class SensitiveRefusal extends Error {
  constructor(message: string, public status: 403 | 422) { super(message); }
}

/**
 * Checks and shapes the sensitive part of a create or update.
 *
 * - A caller without SENSITIVE_DATA:UPDATE may not change any of the four
 *   fields (403). What such a caller sends is otherwise dropped: the edit form
 *   echoes back what it was shown (blanks, or the values a viewer may read),
 *   and that must not wipe or rewrite what is on file.
 * - A value needs the employee's consent: `sensitiveDataConsent: true` in the
 *   same request, or consent already on file (422 otherwise).
 * - Withdrawing consent (`sensitiveDataConsent: false`) clears all four fields.
 * - A new value must be an active item of the company's Ethnicity or Religion
 *   list; a value already on file may stay as it is.
 *
 * Returns the fields to write (the four, plus the consent columns).
 */
export async function shapeSensitiveWrite(
  tx: Tx,
  auth: AuthContext,
  input: Record<string, unknown>,
  existing: { sensitiveDataConsentAt: Date | null } & Partial<Record<SensitiveField, string | null>> | null,
  access: SensitiveAccess,
): Promise<Record<string, unknown>> {
  const consent = input.sensitiveDataConsent as boolean | undefined;
  const touched = SENSITIVE_FIELDS.filter((f) => f in input && input[f] !== undefined);
  const out: Record<string, unknown> = {};

  if (!access.write) {
    const changes = (f: SensitiveField) => !blank(input[f]) && String(input[f]).trim() !== (existing?.[f] ?? null);
    if (touched.some(changes) || consent !== undefined) {
      throw new SensitiveRefusal("Ethnicity and religion can be recorded only by a role with the sensitive-data permission.", 403);
    }
    return out; // blanks dropped
  }

  if (consent === false) {
    for (const f of SENSITIVE_FIELDS) out[f] = null;
    out.sensitiveDataConsentAt = null;
    out.sensitiveDataConsentByUserId = null;
    return out;
  }

  const consentOnFile = consent === true || !!existing?.sensitiveDataConsentAt;
  const lists: Partial<Record<"ETHNICITY" | "RELIGION", string[]>> = {};
  for (const f of touched) {
    const v = input[f];
    if (blank(v)) { out[f] = null; continue; }
    const value = String(v).trim();
    if (!consentOnFile) {
      throw new SensitiveRefusal("Note the employee's written consent before recording ethnicity or religion.", 422);
    }
    if (existing && existing[f] === value) { out[f] = value; continue; }
    const list = LIST_OF[f];
    lists[list] ??= (await listItems(tx, auth.tenantId, list)).map((i) => i.name);
    const match = lists[list]!.find((n) => n.toLowerCase() === value.toLowerCase());
    if (!match) {
      throw new SensitiveRefusal(`"${value}" is not in the company's ${list === "ETHNICITY" ? "Ethnicity" : "Religion"} list (Settings, Lists).`, 422);
    }
    out[f] = match;
  }
  if (consent === true && !existing?.sensitiveDataConsentAt) {
    out.sensitiveDataConsentAt = new Date();
    out.sensitiveDataConsentByUserId = auth.userId ?? null;
  }
  return out;
}

/** Removes the sensitive keys (and the consent flag) from a parsed body. */
export function withoutSensitive<T extends Record<string, unknown>>(data: T): Omit<T, SensitiveField | "sensitiveDataConsent"> {
  const copy: Record<string, unknown> = { ...data };
  for (const f of SENSITIVE_FIELDS) delete copy[f];
  delete copy.sensitiveDataConsent;
  return copy as Omit<T, SensitiveField | "sensitiveDataConsent">;
}
