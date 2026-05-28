/**
 * POST /api/ai/compliance — Compliance Helper
 *
 * Touchpoint: COMPLIANCE_HELPER
 * Model: Sonnet 4.5 (complex regulatory questions)
 * Permission: COMPLIANCE:READ
 * Feature flag: featureFlags.ai_enabled
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/require-permission";
import { checkAiGating, callAI } from "@/lib/ai/gateway";
import { complianceHelperSystemPrompt } from "@/lib/ai/prompts";
import { ok, err, forbidden, serverError } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";

const schema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(20),
});

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "COMPLIANCE", "READ");
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

  const tenant = await prismaAdmin.tenant.findUnique({
    where:  { id: ctx.tenantId },
    select: { name: true },
  });

  try {
    const result = await callAI({
      tenantId:     ctx.tenantId,
      userId:       ctx.userId,
      touchpoint:   "COMPLIANCE_HELPER",
      systemPrompt: complianceHelperSystemPrompt({ tenantName: tenant?.name ?? "your company" }),
      messages:     parsed.data.messages,
      // Compliance questions benefit from Sonnet's deeper reasoning
      model:        "claude-sonnet-4-5",
      refKey:       null,
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
