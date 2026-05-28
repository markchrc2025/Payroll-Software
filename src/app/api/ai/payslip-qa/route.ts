/**
 * POST /api/ai/payslip-qa — Payslip Q&A (admin context)
 *
 * Touchpoint: PAYSLIP_QA
 * Model: Haiku 4.5
 * Permission: PAYROLL:READ
 * Feature flag: featureFlags.ai_enabled
 *
 * The caller provides:
 *  - payslipId (PayrollSheet ID) to look up and attach as context
 *  - messages  (user question)
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/require-permission";
import { checkAiGating, callAI } from "@/lib/ai/gateway";
import { payslipQaSystemPrompt } from "@/lib/ai/prompts";
import { ok, err, notFound, forbidden, serverError } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import prismaAdmin from "@/lib/prisma-admin";

const schema = z.object({
  payslipId: z.string().min(1),
  messages:  z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(20),
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

  // Fetch payslip snapshot to inject as context
  const sheet = await withTenant(ctx.tenantId, (tx) =>
    tx.payrollSheet.findFirst({
      where: { id: parsed.data.payslipId, tenantId: ctx.tenantId },
      select: {
        id:                    true,
        grossCompensationCents: true,
        netPayCents:           true,
        withholdingTaxCents:   true,
        sssEeCents:            true,
        philhealthEeCents:     true,
        pagibigEeCents:        true,
        employee:    { select: { firstName: true, lastName: true, employeeNumber: true } },
        payrollBook: { select: { periodStart: true, periodEnd: true } },
      },
    }),
  );
  if (!sheet) return notFound("PayrollSheet");

  const tenant = await prismaAdmin.tenant.findUnique({
    where:  { id: ctx.tenantId },
    select: { name: true },
  });

  // Inject payslip snapshot into messages as system context
  const payslipContext = `Employee: ${sheet.employee.firstName} ${sheet.employee.lastName} (${sheet.employee.employeeNumber})
Period: ${sheet.payrollBook.periodStart.toISOString().slice(0, 10)} – ${sheet.payrollBook.periodEnd.toISOString().slice(0, 10)}
Gross Pay: ₱${(Number(sheet.grossCompensationCents) / 100).toFixed(2)}
SSS EE: ₱${(Number(sheet.sssEeCents) / 100).toFixed(2)}
PhilHealth EE: ₱${(Number(sheet.philhealthEeCents) / 100).toFixed(2)}
Pag-IBIG EE: ₱${(Number(sheet.pagibigEeCents) / 100).toFixed(2)}
Withholding Tax: ₱${(Number(sheet.withholdingTaxCents) / 100).toFixed(2)}
Net Pay: ₱${(Number(sheet.netPayCents) / 100).toFixed(2)}`;

  // Prepend snapshot as a user-context message before the conversation
  const messagesWithContext = [
    { role: "user" as const, content: `[Payslip Context]\n${payslipContext}` },
    { role: "assistant" as const, content: "I can see this payslip. What would you like to know?" },
    ...parsed.data.messages,
  ];

  try {
    const result = await callAI({
      tenantId:     ctx.tenantId,
      userId:       ctx.userId,
      touchpoint:   "PAYSLIP_QA",
      systemPrompt: payslipQaSystemPrompt({ tenantName: tenant?.name ?? "your company" }),
      messages:     messagesWithContext,
      model:        "claude-haiku-4-5",
      refKey:       parsed.data.payslipId,
    });

    return ok({
      text:         result.text,
      model:        result.model,
      inputTokens:  result.inputTokens,
      outputTokens: result.outputTokens,
      stubbed:      result.stubbed,
    });
  } catch (e) {
    return serverError(e);
  }
}
