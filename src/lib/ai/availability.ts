/**
 * Mark, 24 Nov 2026: "I want the AI Assistant to be removed. Will add it at a
 * later development." Every AI surface (the dashboard AI Assistant with HR
 * Chat, Compliance, Payslip Q&A and Usage, the anomaly check, and ESS chat)
 * is switched off here: the menu item is gone, the page answers 404 and every
 * AI API answers 404 before it reads a request or calls a model. The code is
 * kept for the later build (Phase 4, PAY-87: re-enabled, hardened,
 * tier-gated). Turning it back on is a code change reviewed like any other.
 */
export const AI_FEATURES_ENABLED = false;

export function aiUnavailable(): Response {
  return Response.json({ success: false, error: "Not found" }, { status: 404 });
}
