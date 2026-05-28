/**
 * POST /api/ai/chat — HR Assistant (admin-facing)
 *
 * Touchpoint: HR_CHAT
 * Model: Haiku 4.5 (escalates to Sonnet on request)
 * Permission: any authenticated tenant user (no specific module required)
 * Feature flag: featureFlags.ai_enabled
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { checkAiGating, callAI } from "@/lib/ai/gateway";
import { hrChatSystemPrompt } from "@/lib/ai/prompts";
import { ok, err, unauthorized, forbidden, serverError } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role:    z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(50),
  /** Optionally escalate to Sonnet for complex questions */
  useSonnet: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  // Check AI gating (feature flag + daily cap)
  const gating = await checkAiGating(ctx.tenantId);
  if (!gating.allowed) {
    return forbidden(
      gating.reason === "daily_cap_exceeded"
        ? "AI daily usage cap reached. Resets at midnight UTC."
        : "AI Assistant is not enabled for your organisation.",
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) return err("Validation failed", 400, parsed.error.flatten());

  // Fetch tenant name for system prompt
  const tenant = await prismaAdmin.tenant.findUnique({
    where:  { id: ctx.tenantId },
    select: { name: true },
  });

  try {
    const result = await callAI({
      tenantId:     ctx.tenantId,
      userId:       ctx.userId,
      touchpoint:   "HR_CHAT",
      systemPrompt: hrChatSystemPrompt({ tenantName: tenant?.name ?? "your company" }),
      messages:     parsed.data.messages,
      model:        parsed.data.useSonnet ? "claude-sonnet-4-5" : "claude-haiku-4-5",
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
