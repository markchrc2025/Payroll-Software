/**
 * AI Gateway — Sentire Payroll (Phase V)
 * ----------------------------------------
 * Single entry point for every Claude call. Handles:
 *
 *  1. Feature-flag gating  — tenant must have `featureFlags.ai_enabled === true`
 *  2. Daily budget cap     — configurable via AI_DAILY_CAP_MICRO_USD (default $5/day)
 *  3. Real Anthropic calls — uses @anthropic-ai/sdk; stubs gracefully when no key
 *  4. Prompt caching       — system prompts marked `cache_control: { type: "ephemeral" }`
 *  5. Usage metering       — every call writes an AiUsage row (via prismaAdmin, BYPASSRLS)
 *
 * Model defaults:
 *  - Haiku 4.5   — high-volume touchpoints (chat, doc extraction, payslip Q&A)
 *  - Sonnet 4.5  — low-volume complex reasoning (compliance helper, anomaly second-pass)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AiTouchpoint } from "@prisma/client";
import prismaAdmin from "@/lib/prisma-admin";

export type AiModel = "claude-haiku-4-5" | "claude-sonnet-4-5";

// ── Pricing ─────────────────────────────────────────────────────────────────
// micro-USD per token (1 USD = 1_000_000 µUSD). Source: anthropic.com/pricing
const PRICING: Record<AiModel, { input: number; cacheRead: number; output: number }> = {
  "claude-haiku-4-5":  { input: 1,  cacheRead: 0.1,  output: 5  },
  "claude-sonnet-4-5": { input: 3,  cacheRead: 0.3,  output: 15 },
};

function computeCost(
  model: AiModel,
  inputTokens: number,
  cachedTokens: number,
  outputTokens: number,
): bigint {
  const p = PRICING[model];
  const billableInput = Math.max(0, inputTokens - cachedTokens);
  return BigInt(
    Math.round(
      billableInput * p.input +
      cachedTokens * p.cacheRead +
      outputTokens * p.output,
    ),
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

export type AiMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiCallInput = {
  tenantId: string;
  userId?: string | null;
  touchpoint: AiTouchpoint;
  /**
   * System prompt (will have cache_control: ephemeral applied automatically).
   * Omit for simple completions.
   */
  systemPrompt?: string;
  /** Conversation messages (user + assistant turns). */
  messages: AiMessage[];
  model?: AiModel;
  /** Hard per-call output token limit. */
  maxOutputTokens?: number;
  /** Stable reference key (e.g. payslipId, payrollBookId). */
  refKey?: string | null;
};

export type AiCallOutput = {
  text: string;
  model: AiModel;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costMicroUsd: bigint;
  /** true when the call was a no-op stub (no API key or cap exceeded) */
  stubbed: boolean;
};

export type AiGatingResult =
  | { allowed: true }
  | { allowed: false; reason: "feature_disabled" | "daily_cap_exceeded" | "no_tenant" };

// ── Gating helpers ───────────────────────────────────────────────────────────

/** Daily cap in micro-USD. Override via AI_DAILY_CAP_MICRO_USD env var. */
function getDailyCap(): bigint {
  const raw = process.env.AI_DAILY_CAP_MICRO_USD;
  return raw ? BigInt(raw) : 5_000_000n; // default $5/day
}

/**
 * Check feature flag + daily budget cap for a tenant.
 * Uses prismaAdmin so it can read across RLS boundaries.
 */
export async function checkAiGating(tenantId: string): Promise<AiGatingResult> {
  const tenant = await prismaAdmin.tenant.findUnique({
    where:  { id: tenantId },
    select: { featureFlags: true },
  });
  if (!tenant) return { allowed: false, reason: "no_tenant" };

  const flags = (tenant.featureFlags ?? {}) as Record<string, boolean>;
  if (!flags.ai_enabled) return { allowed: false, reason: "feature_disabled" };

  // Daily cap check — sum all usage rows today
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const agg = await prismaAdmin.aiUsage.aggregate({
    where: { tenantId, createdAt: { gte: todayStart } },
    _sum:  { costMicroUsd: true },
  });
  const spent = (agg._sum.costMicroUsd as bigint | null) ?? 0n;
  if (spent >= getDailyCap()) return { allowed: false, reason: "daily_cap_exceeded" };

  return { allowed: true };
}

// ── Main gateway ─────────────────────────────────────────────────────────────

let _client: Anthropic | null = null;
function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!_client) _client = new Anthropic({ apiKey: key });
  return _client;
}

/**
 * Invoke Claude via the metering gateway.
 *
 * If `ANTHROPIC_API_KEY` is absent, returns a stub (empty text, zero tokens)
 * and still writes an AiUsage row so tests can verify gating logic.
 *
 * Does NOT enforce gating — callers must call `checkAiGating` first (so they
 * can return a meaningful HTTP error before the DB write).
 */
export async function callAI(input: AiCallInput): Promise<AiCallOutput> {
  const model: AiModel = input.model ?? "claude-haiku-4-5";
  const maxOutputTokens = input.maxOutputTokens ?? 1024;
  const start = Date.now();

  const client = getClient();

  let text        = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let stubbed     = true;

  if (client) {
    try {
      // Build system block with prompt caching if a system prompt is provided
      const systemBlocks: Anthropic.TextBlockParam[] = input.systemPrompt
        ? [
            {
              type:          "text",
              text:          input.systemPrompt,
              cache_control: { type: "ephemeral" },
            } satisfies Anthropic.TextBlockParam & { cache_control: { type: "ephemeral" } },
          ]
        : [];

      const resp = await client.messages.create({
        model,
        max_tokens: maxOutputTokens,
        ...(systemBlocks.length > 0 ? { system: systemBlocks } : {}),
        messages: input.messages.map((m) => ({
          role:    m.role,
          content: m.content,
        })),
      });

      // Extract text from first content block
      const firstBlock = resp.content[0];
      text = firstBlock?.type === "text" ? firstBlock.text : "";

      inputTokens  = resp.usage.input_tokens ?? 0;
      outputTokens = resp.usage.output_tokens;
      // cache_read_input_tokens is the number of tokens served from cache
      cachedTokens = resp.usage.cache_read_input_tokens ?? 0;
      stubbed      = false;
    } catch (err) {
      console.error("[ai-gateway] Anthropic call failed:", err);
      // Degrade gracefully — fall through with stub output
    }
  }

  const costMicroUsd = computeCost(model, inputTokens, cachedTokens, outputTokens);
  const latencyMs    = Date.now() - start;

  // Write metering row (non-blocking, fire-and-forget)
  prismaAdmin.aiUsage
    .create({
      data: {
        tenantId:     input.tenantId,
        userId:       input.userId ?? null,
        touchpoint:   input.touchpoint,
        model,
        inputTokens,
        outputTokens,
        cachedTokens,
        costMicroUsd,
        latencyMs,
        refKey: input.refKey ?? null,
      },
    })
    .catch((e) => console.error("[ai-gateway] Failed to write AiUsage:", e));

  return { text, model, inputTokens, outputTokens, cachedTokens, costMicroUsd, stubbed };
}
