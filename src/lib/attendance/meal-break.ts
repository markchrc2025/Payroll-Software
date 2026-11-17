/**
 * PAY-146 (HR.my review D5, Mark chose B on 16 Nov 2026): meal breaks.
 *
 * Labor Code Art. 85 and its IRR (Book III, Rule I, Sec. 7): employees get at
 * least 60 minutes off for a meal; a shorter meal period of at least 20
 * minutes may be given but is then paid, and rest periods of 5 to 20 minutes
 * are working time. So an UNPAID break under 20 minutes is refused, and one
 * under 60 is allowed with a warning.
 *
 * An unpaid break is deducted only on days long enough to have one: when the
 * span from first in to last out is longer than the company's setting
 * (Tenant.breakDeductAfterMinutes, default 5 hours), and never more than the
 * span over that setting, so crossing it never leaves less than the setting.
 */

/** Break policies whose break is deducted from the day's span. */
export const UNPAID_SPAN_POLICIES = ["FIXED_DEDUCTION", "FLOATING"] as const;

export const DEFAULT_BREAK_DEDUCT_AFTER_MINUTES = 300;
export const MIN_UNPAID_BREAK_MINUTES = 20;
export const FULL_MEAL_BREAK_MINUTES = 60;

const unpaidPolicy = (policy: string) => (UNPAID_SPAN_POLICIES as readonly string[]).includes(policy) || policy === "TRACK_ACTUAL" || policy === "PUNCH_IN_OUT";

/** Why a shift's break cannot be saved, or null. 0 means the shift has no break. */
export function mealBreakProblem(breakMinutes: number, policy: string): string | null {
  if (!unpaidPolicy(policy) || breakMinutes === 0) return null;
  if (breakMinutes < MIN_UNPAID_BREAK_MINUTES) {
    return `An unpaid meal break must be at least ${MIN_UNPAID_BREAK_MINUTES} minutes. A shorter break is paid working time (Labor Code Art. 85). Use 0 for no break, or choose a paid break.`;
  }
  return null;
}

/** A warning to show (not block) for a short unpaid break, or null. */
export function mealBreakWarning(breakMinutes: number, policy: string): string | null {
  if (!unpaidPolicy(policy) || breakMinutes === 0) return null;
  if (breakMinutes >= MIN_UNPAID_BREAK_MINUTES && breakMinutes < FULL_MEAL_BREAK_MINUTES) {
    return `Under ${FULL_MEAL_BREAK_MINUTES} minutes: the law's normal meal break is ${FULL_MEAL_BREAK_MINUTES} minutes. A shorter one is allowed only in the cases the Labor Code lists, and it is then paid.`;
  }
  return null;
}

/** Minutes of unpaid break to deduct from a day's span. */
export function breakDeduction(spanMinutes: number, breakMinutes: number, deductAfterMinutes: number = DEFAULT_BREAK_DEDUCT_AFTER_MINUTES): number {
  if (breakMinutes <= 0 || spanMinutes <= deductAfterMinutes) return 0;
  return Math.min(breakMinutes, spanMinutes - deductAfterMinutes);
}
