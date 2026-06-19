/**
 * src/lib/attendance/ot-policy.ts
 *
 * Per-shift overtime break-deduction rule. Overtime is always approved before
 * it is paid; this utility converts the *approved* raw OT minutes into the
 * *payable* OT minutes after applying the shift's mandatory-break policy.
 *
 *   SINGLE  — deduct `otBreakMinutes` once total OT reaches `otBreakTriggerHours`.
 *             e.g. trigger 6h, break 60m: 9h OT → 8h payable; 5h OT → 5h payable.
 *   TIERED  — deduct `otBreakMinutes` for every `otBreakBlockHours` block of OT.
 *             e.g. block 4h, break 60m: 9h OT → −2h → 7h payable.
 *   NONE    — no deduction.
 */

/** The subset of ShiftSchedule OT fields the break rule needs. */
export interface OtPolicyShift {
  otBreakMode: "NONE" | "SINGLE" | "TIERED";
  /** Decimal hours; tolerated as number | string | Prisma.Decimal-like | null. */
  otBreakTriggerHours: number | string | { toString(): string } | null;
  otBreakBlockHours: number | string | { toString(): string } | null;
  otBreakMinutes: number | null;
}

function toNum(v: number | string | { toString(): string } | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(n) ? n : 0;
}

/**
 * Apply the per-shift OT break-deduction rule to approved raw OT minutes.
 * @returns the payable OT minutes (never negative, never more than the input).
 */
export function applyOtBreakRule(rawOtMinutes: number, shift: OtPolicyShift): number {
  const raw = Math.max(0, Math.round(rawOtMinutes));
  const breakMin = shift.otBreakMinutes ?? 0;
  if (raw <= 0 || breakMin <= 0 || shift.otBreakMode === "NONE") return raw;

  if (shift.otBreakMode === "SINGLE") {
    const triggerMin = toNum(shift.otBreakTriggerHours) * 60;
    return triggerMin > 0 && raw >= triggerMin ? Math.max(0, raw - breakMin) : raw;
  }

  // TIERED
  const blockMin = toNum(shift.otBreakBlockHours) * 60;
  if (blockMin <= 0) return raw;
  const blocks = Math.floor(raw / blockMin);
  return Math.max(0, raw - blocks * breakMin);
}
