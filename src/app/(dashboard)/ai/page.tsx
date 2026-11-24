/**
 * Mark, 24 Nov 2026: the AI Assistant is removed until a later build. The
 * page answers 404 while AI is off; the assistant itself is kept in
 * AiAssistant.tsx for PAY-87.
 */
import { notFound } from "next/navigation";
import { AI_FEATURES_ENABLED } from "@/lib/ai/availability";
import { AiAssistant } from "./AiAssistant";

export default function AiPage() {
  if (!AI_FEATURES_ENABLED) notFound();
  return <AiAssistant />;
}
