/**
 * AI Gateway — Sentire Payroll
 * -----------------------------
 * Single entry point for every Claude call. Records token usage in `AiUsage`
 * so we can attribute spend per tenant per touchpoint, and so we can enforce
 * future per-tenant budget caps. Defaults to Haiku 4.5; callers escalate to
 * Sonnet only when the touchpoint demands deeper reasoning.
 *
 * Real Anthropic SDK integration ships in Phase F. For now this scaffold
 * normalises the call shape and logs cost so the rest of the codebase can
 * already depend on it.
 */

import prisma from "@/lib/prisma";
import type { AiTouchpoint } from "@prisma/client";

export type AiModel = "claude-haiku-4.5" | "claude-sonnet-4.5";

export type AiCallInput = {
  tenantId: string;
  touchpoint: AiTouchpoint;
  /** Anthropic-style messages array. Loosely typed to avoid coupling. */
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  model?: AiModel;
  /** Stable reference (e.g. payslipId, employeeId) for traceability. */
  refKey?: string;
  /** Soft per-call budget cap in micro-USD. Logged when exceeded. */
  maxCostMicroUsd?: number;
};

export type AiCallOutput = {
  text: string;
  model: AiModel;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: bigint;
};

// Cost table (micro-USD per token). Update when Anthropic publishes new pricing.
// Source: anthropic.com/pricing (2025-Q4) — values in micro-USD per token.
const PRICING: Record<AiModel, { input: number; output: number }> = {
  "claude-haiku-4.5": { input: 1, output: 5 },     // $0.001 / $0.005 per 1K
  "claude-sonnet-4.5": { input: 3, output: 15 },   // $0.003 / $0.015 per 1K
};

function computeCost(model: AiModel, inputTokens: number, outputTokens: number): bigint {
  const p = PRICING[model];
  return BigInt(inputTokens * p.input + outputTokens * p.output);
}

/**
 * Invoke Claude. Stub implementation: returns an empty completion and
 * records a zero-token usage row so callers can be wired ahead of the
 * Anthropic SDK rollout. Replace the body with a real fetch in Phase F.
 */
export async function callAI(input: AiCallInput): Promise<AiCallOutput> {
  const model: AiModel = input.model ?? "claude-haiku-4.5";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Dev-mode: log the would-be call and return a placeholder
    const inputTokens = 0;
    const outputTokens = 0;
    const costMicroUsd = 0n;
    await prisma.aiUsage.create({
      data: {
        tenantId: input.tenantId,
        touchpoint: input.touchpoint,
        model,
        inputTokens,
        outputTokens,
        costMicroUsd,
        refKey: input.refKey ?? null,
      },
    });
    return { text: "", model, inputTokens, outputTokens, costMicroUsd };
  }

  // Phase F TODO: real Anthropic call. The shape below is what we plan to log.
  const inputTokens = 0;
  const outputTokens = 0;
  const text = "";
  const costMicroUsd = computeCost(model, inputTokens, outputTokens);

  await prisma.aiUsage.create({
    data: {
      tenantId: input.tenantId,
      touchpoint: input.touchpoint,
      model,
      inputTokens,
      outputTokens,
      costMicroUsd,
      refKey: input.refKey ?? null,
    },
  });

  return { text, model, inputTokens, outputTokens, costMicroUsd };
}
