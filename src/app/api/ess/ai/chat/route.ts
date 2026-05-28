/**
 * POST /api/ess/ai/chat — HR/Payslip Assistant (employee-facing ESS)
 *
 * Touchpoint: HR_CHAT (general questions) or PAYSLIP_QA (payslip-specific)
 * Model: Haiku 4.5
 * Auth: ESS session (Bearer token)
 * Feature flag: featureFlags.ai_enabled
 *
 * The employee can ask general HR questions or payslip-specific questions.
 * If they provide a payslipId, the route automatically fetches the payslip
 * context and uses the PAYSLIP_QA system prompt; otherwise uses HR_CHAT.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getEssContext } from "@/lib/ess-auth";
import { checkAiGating, callAI } from "@/lib/ai/gateway";
import { hrChatSystemPrompt, payslipQaSystemPrompt } from "@/lib/ai/prompts";
import { ok, err, unauthorized, forbidden, notFound, serverError } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import prismaAdmin from "@/lib/prisma-admin";

const schema = z.object({
  messages:  z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(20),
  /** Optional: restrict to payslip Q&A for a specific sheet */
  payslipId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const ess = await getEssContext(req);
  if (!ess) return unauthorized();

  const gating = await checkAiGating(ess.tenantId);
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

  const tenant = await prismaAdmin.tenant.findUnique({
    where:  { id: ess.tenantId },
    select: { name: true },
  });
  const tenantName = tenant?.name ?? "your company";

  let systemPrompt: string;
  let messages = parsed.data.messages;
  let touchpoint: "HR_CHAT" | "PAYSLIP_QA" = "HR_CHAT";

  if (parsed.data.payslipId) {
    // Verify the employee owns this payslip
    const sheet = await withTenant(ess.tenantId, (tx) =>
      tx.payrollSheet.findFirst({
        where: { id: parsed.data.payslipId, tenantId: ess.tenantId, employeeId: ess.employeeId },
        select: {
          grossCompensationCents: true,
          netPayCents:            true,
          withholdingTaxCents:    true,
          sssEeCents:             true,
          philhealthEeCents:      true,
          pagibigEeCents:         true,
          payrollBook: { select: { periodStart: true, periodEnd: true } },
        },
      }),
    );
    if (!sheet) return notFound("PayrollSheet");

    const payslipContext = `Period: ${sheet.payrollBook.periodStart.toISOString().slice(0, 10)} – ${sheet.payrollBook.periodEnd.toISOString().slice(0, 10)}
Gross Pay: ₱${(Number(sheet.grossCompensationCents) / 100).toFixed(2)}
SSS EE: ₱${(Number(sheet.sssEeCents) / 100).toFixed(2)}
PhilHealth EE: ₱${(Number(sheet.philhealthEeCents) / 100).toFixed(2)}
Pag-IBIG EE: ₱${(Number(sheet.pagibigEeCents) / 100).toFixed(2)}
Withholding Tax: ₱${(Number(sheet.withholdingTaxCents) / 100).toFixed(2)}
Net Pay: ₱${(Number(sheet.netPayCents) / 100).toFixed(2)}`;

    systemPrompt = payslipQaSystemPrompt({ tenantName });
    messages = [
      { role: "user",      content: `[Payslip Context]\n${payslipContext}` },
      { role: "assistant", content: "I can see this payslip. What would you like to know?" },
      ...parsed.data.messages,
    ];
    touchpoint = "PAYSLIP_QA";
  } else {
    systemPrompt = hrChatSystemPrompt({ tenantName });
  }

  try {
    const result = await callAI({
      tenantId:     ess.tenantId,
      userId:       null,
      touchpoint,
      systemPrompt,
      messages,
      model:        "claude-haiku-4-5",
      refKey:       parsed.data.payslipId ?? null,
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
