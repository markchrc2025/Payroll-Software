/**
 * /api/payroll/statutory-tables (PAY-159)
 *
 *   GET ?asOf=YYYY-MM-DD  the SSS, PhilHealth, Pag-IBIG and BIR withholding
 *                         tables the company can see (Sentire's defaults and
 *                         its own rates, every version), each labelled; the
 *                         one marked IN_FORCE is the one getActiveRule, and so
 *                         the payroll engine, uses on that date. Defaults to
 *                         today in Manila.
 *
 * Read-only: statutory rates are Sentire's to change (Mark's ruling).
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, ok, unauthorized } from "@/lib/api-response";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getActiveRule, StatutoryRuleNotFoundError } from "@/lib/statutory/resolver";
import { parseStatutoryPayload } from "@/lib/statutory/types";
import {
  STATUTORY_TABLES,
  tableVersions,
  type StatutoryTablesResponse,
} from "@/lib/statutory/tables";

const asOfParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "asOf must be a date (YYYY-MM-DD)")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00.000Z`)), "asOf must be a real date");

/** Today's date in Manila, YYYY-MM-DD. */
function todayManila(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "READ"]);
  if (denied) return denied;

  const raw = new URL(req.url).searchParams.get("asOf") ?? todayManila();
  const parsed = asOfParam.safeParse(raw);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid asOf", 400);
  const asOf = new Date(`${parsed.data}T00:00:00.000Z`);

  const tables = await withTenant(auth.tenantId, async (tx) => {
    const out: StatutoryTablesResponse["tables"] = [];
    for (const t of STATUTORY_TABLES) {
      const rules = await tx.statutoryRule.findMany({
        where: { category: t.category, OR: [{ tenantId: auth.tenantId }, { tenantId: null }] },
        select: {
          id: true,
          tenantId: true,
          effectiveFrom: true,
          effectiveTo: true,
          legalBasis: true,
          version: true,
          payload: true,
        },
      });
      let inForceId: string | null = null;
      try {
        inForceId = (await getActiveRule(tx, auth.tenantId, t.category, asOf)).id;
      } catch (e) {
        if (!(e instanceof StatutoryRuleNotFoundError)) throw e;
      }
      out.push({
        category: t.category,
        key: t.key,
        label: t.label,
        versions: tableVersions(
          rules.map((r) => ({ ...r, payload: parseStatutoryPayload(t.category, r.payload) })),
          inForceId,
          asOf,
        ),
      });
    }
    return out;
  });

  return ok({ asOf: parsed.data, tables } satisfies StatutoryTablesResponse);
}
