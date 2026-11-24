/** PAY-197: shared by the offboarding routes. */
import { z } from "zod";
import { daysSinceSeparation, FINAL_PAY_DAYS } from "./clearance";
import { maskCase } from "./hr-forms";

export const templateItemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(500).nullish(),
  signatoryUserId: z.string().min(1, "Pick the signatory"),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});
export function caseView(c: { lastWorkingDay: Date; items: { status: string }[] } & Record<string, unknown>) {
  const days = daysSinceSeparation(c.lastWorkingDay);
  return { ...maskCase(c), daysSinceSeparation: days, finalPayDueInDays: FINAL_PAY_DAYS - days, pendingItems: c.items.filter((i) => i.status === "PENDING").length };
}

