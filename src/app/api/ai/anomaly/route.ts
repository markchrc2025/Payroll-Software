/**
 * POST /api/ai/anomaly — Payroll Anomaly Flagging
 *
 * Touchpoint: ANOMALY_FLAGGING
 * Model: Haiku 4.5 first pass; Sonnet if ?deep=1
 * Permission: PAYROLL:READ
 * Feature flag: featureFlags.ai_enabled
 *
 * Accepts a payrollBookId, fetches a summary of the run, and asks the model
 * to flag anomalies. Returns structured JSON anomalies array.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/require-permission";
import { checkAiGating, callAI } from "@/lib/ai/gateway";
import { anomalyFlaggingSystemPrompt } from "@/lib/ai/prompts";
import { ok, err, notFound, forbidden, serverError } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import prismaAdmin from "@/lib/prisma-admin";

const schema = z.object({
  payrollBookId: z.string().min(1),
  /** true = use Sonnet for a deeper second pass */
  deep:          z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "PAYROLL", "READ");
  if (guard instanceof Response) return guard;
  const { ctx } = guard;

  const gating = await checkAiGating(ctx.tenantId);
  if (!gating.allowed) {
    return forbidden(
      gating.reason === "daily_cap_exceeded"
        ? "AI daily usage cap reached."
        : "AI Assistant is not enabled for your organisation.",
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());

  // Fetch payroll run summary
  const book = await withTenant(ctx.tenantId, (tx) =>
    tx.payrollBook.findFirst({
      where:  { id: parsed.data.payrollBookId, tenantId: ctx.tenantId },
      select: {
        id:          true,
        status:      true,
        periodStart: true,
        periodEnd:   true,
        sheets: {
          select: {
            id:                     true,
            grossCompensationCents: true,
            netPayCents:            true,
            withholdingTaxCents:    true,
            sssEeCents:             true,
            philhealthEeCents:      true,
            pagibigEeCents:         true,
            employee: { select: { id: true, employeeNumber: true, firstName: true, lastName: true } },
          },
          take: 200, // cap for very large runs
        },
      },
    }),
  );
  if (!book) return notFound("PayrollBook");

  const tenant = await prismaAdmin.tenant.findUnique({
    where:  { id: ctx.tenantId },
    select: { name: true },
  });

  // Build a compact JSON summary for the model
  const sheetList = book.sheets;
  const runSummary = {
    bookId:      book.id,
    periodStart: book.periodStart,
    periodEnd:   book.periodEnd,
    status:      book.status,
    sheetCount:  sheetList.length,
    sheets:      sheetList.map((s) => ({
      employeeId:     s.employee.id,
      employeeNumber: s.employee.employeeNumber,
      name:           `${s.employee.firstName} ${s.employee.lastName}`,
      grossCents:     Number(s.grossCompensationCents),
      netCents:       Number(s.netPayCents),
      whtCents:       Number(s.withholdingTaxCents),
      sssCents:       Number(s.sssEeCents),
      phCents:        Number(s.philhealthEeCents),
      hdmfCents:      Number(s.pagibigEeCents),
    })),
  };

  try {
    const result = await callAI({
      tenantId:     ctx.tenantId,
      userId:       ctx.userId,
      touchpoint:   "ANOMALY_FLAGGING",
      systemPrompt: anomalyFlaggingSystemPrompt({ tenantName: tenant?.name ?? "your company" }),
      messages: [
        {
          role:    "user",
          content: `Analyse this payroll run for anomalies:\n${JSON.stringify(runSummary, null, 2)}`,
        },
      ],
      model:  parsed.data.deep ? "claude-sonnet-4-5" : "claude-haiku-4-5",
      refKey: parsed.data.payrollBookId,
    });

    // Try to parse structured output; fall back to raw text
    let anomalies: unknown[] = [];
    let summary = result.text;
    if (!result.stubbed && result.text) {
      try {
        const parsed2 = JSON.parse(result.text) as { anomalies?: unknown[]; summary?: string };
        anomalies = parsed2.anomalies ?? [];
        summary   = parsed2.summary ?? result.text;
      } catch {
        // keep raw text
      }
    }

    return ok({
      anomalies,
      summary,
      model:    result.model,
      stubbed:  result.stubbed,
    });
  } catch (e) {
    return serverError(e);
  }
}
