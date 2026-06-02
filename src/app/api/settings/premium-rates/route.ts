/**
 * /api/settings/premium-rates
 *   GET  — returns all 18 premium multiplier keys with their current rates
 *          (DOLE floor if no tenant override exists)
 *   PUT  — upserts tenant overrides; validates each rate >= DOLE floor
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, ok, unauthorized } from "@/lib/api-response";
import type { PremiumMultiplierKey } from "@prisma/client";

// ---------------------------------------------------------------------------
// DOLE statutory minimum floors (Art. 87–94, Labor Code, as amended)
// ---------------------------------------------------------------------------
export const DOLE_FLOORS: Record<PremiumMultiplierKey, number> = {
  OT:                          1.25,
  NSD:                         0.10,
  REST_DAY:                    1.30,
  REST_DAY_OT:                 1.69,
  SPECIAL_HOLIDAY:             1.30,
  SPECIAL_HOLIDAY_OT:          1.69,
  SPECIAL_HOLIDAY_REST_DAY:    1.50,
  SPECIAL_HOLIDAY_REST_DAY_OT: 1.95,
  REGULAR_HOLIDAY:             2.00,
  REGULAR_HOLIDAY_OT:          2.60,
  REGULAR_HOLIDAY_REST_DAY:    2.60,
  REGULAR_HOLIDAY_REST_DAY_OT: 3.38,
  DOUBLE_HOLIDAY:              3.00,
  DOUBLE_HOLIDAY_OT:           3.90,
  DOUBLE_HOLIDAY_REST_DAY:     3.90,
  DOUBLE_HOLIDAY_REST_DAY_OT:  5.07,
  HAZARD:                      1.25,
  NO_WORK_REGULAR_HOLIDAY:     1.00,
};

export const ALL_KEYS = Object.keys(DOLE_FLOORS) as PremiumMultiplierKey[];

// Build a per-key refinement: rate >= DOLE floor
const rateEntrySchema = z.object({
  multiplierKey: z.enum(ALL_KEYS as [PremiumMultiplierKey, ...PremiumMultiplierKey[]]),
  rate: z.number().positive(),
});

const putSchema = z.object({
  rates: z.array(rateEntrySchema),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const rows = await withTenant(auth.tenantId, (tx) =>
    tx.premiumRateConfig.findMany({
      where: { tenantId: auth.tenantId },
      select: { multiplierKey: true, rate: true },
    }),
  );

  // Merge DB overrides onto DOLE defaults
  const overrideMap = new Map(rows.map((r) => [r.multiplierKey, Number(r.rate)]));
  const result = ALL_KEYS.map((key) => ({
    multiplierKey: key,
    rate: overrideMap.get(key) ?? DOLE_FLOORS[key],
    doleFloor: DOLE_FLOORS[key],
    isCustom: overrideMap.has(key),
  }));

  return ok(result);
}

export async function PUT(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON", 400);
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.flatten().fieldErrors, 422);
  }

  // Validate each rate >= DOLE floor
  const violations: string[] = [];
  for (const entry of parsed.data.rates) {
    const floor = DOLE_FLOORS[entry.multiplierKey];
    if (entry.rate < floor) {
      violations.push(
        `${entry.multiplierKey}: ${entry.rate} is below DOLE minimum ${floor}`,
      );
    }
  }
  if (violations.length > 0) {
    return err({ message: "Rate below DOLE minimum", violations }, 422);
  }

  await withTenant(auth.tenantId, async (tx) => {
    for (const entry of parsed.data.rates) {
      await tx.premiumRateConfig.upsert({
        where: {
          tenantId_multiplierKey: {
            tenantId: auth.tenantId,
            multiplierKey: entry.multiplierKey,
          },
        },
        update: { rate: entry.rate },
        create: {
          tenantId: auth.tenantId,
          multiplierKey: entry.multiplierKey,
          rate: entry.rate,
        },
      });
    }
  });

  return ok({ saved: parsed.data.rates.length });
}
