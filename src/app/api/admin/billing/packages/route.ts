import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prismaAdmin from "@/lib/prisma-admin";
import { requireCentralPermission } from "@/lib/central-permission";
import { ok, err, serverError } from "@/lib/api-response";
import { writeCentralAudit } from "@/lib/central/audit";
import { getClientIp } from "@/lib/audit";
import { z } from "zod";

// Money is stored as BigInt centavos; serialize to Number for JSON responses.
function serialize(p: { monthlyPrice: bigint; annualPrice: bigint } & Record<string, unknown>) {
  return { ...p, monthlyPrice: Number(p.monthlyPrice), annualPrice: Number(p.annualPrice) };
}

// GET /api/admin/billing/packages — full package catalog (published + drafts).
export async function GET() {
  const ctx = await requireCentralPermission("BILLING", "READ");
  if (ctx instanceof Response) return ctx;

  try {
    let packages = await prismaAdmin.billingPackage.findMany({
      orderBy: [{ sortOrder: "asc" }, { monthlyPrice: "asc" }],
    });

    // Bootstrap the three starter packages at zero price on first load.
    if (packages.length === 0) {
      await prismaAdmin.billingPackage.createMany({
        data: [
          { tier: "STARTER", name: "Starter", sortOrder: 0 },
          { tier: "GROWTH", name: "Growth", sortOrder: 1 },
          { tier: "PRO", name: "Pro", sortOrder: 2 },
        ],
      });
      packages = await prismaAdmin.billingPackage.findMany({
        orderBy: [{ sortOrder: "asc" }, { monthlyPrice: "asc" }],
      });
    }

    return ok(packages.map(serialize));
  } catch (e) {
    console.error("[billing/packages] GET", e);
    return serverError(e);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).nullable().optional(),
  tier: z.enum(["STARTER", "GROWTH", "PRO"]).nullable().optional(),
  monthlyPrice: z.number().int().nonnegative().default(0),
  annualPrice: z.number().int().nonnegative().default(0),
  taxRateBps: z.number().int().min(0).max(10000).default(0),
  currency: z.string().min(1).max(8).default("PHP"),
  isPublished: z.boolean().default(true),
  features: z.array(z.string().max(120)).max(20).default([]),
});

// POST /api/admin/billing/packages — create a new package.
export async function POST(req: NextRequest) {
  const ctx = await requireCentralPermission("BILLING", "MANAGE");
  if (ctx instanceof Response) return ctx;

  try {
    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return err("Invalid request", 400, parsed.error.flatten());
    const d = parsed.data;

    const last = await prismaAdmin.billingPackage.aggregate({ _max: { sortOrder: true } });
    const created = await prismaAdmin.billingPackage.create({
      data: {
        name: d.name,
        description: d.description ?? null,
        tier: d.tier ?? null,
        monthlyPrice: BigInt(d.monthlyPrice),
        annualPrice: BigInt(d.annualPrice),
        taxRateBps: d.taxRateBps,
        currency: d.currency,
        isPublished: d.isPublished,
        features: d.features as unknown as Prisma.InputJsonValue,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
    });

    await writeCentralAudit({
      actorUserId: ctx.userId,
      action: "created package",
      target: created.name,
      kind: "BILLING",
      ipAddress: getClientIp(req),
    });

    return ok(serialize(created), "Package created", 201);
  } catch (e) {
    console.error("[billing/packages] POST", e);
    return serverError(e);
  }
}
