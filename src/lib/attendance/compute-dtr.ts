/**
 * src/lib/attendance/compute-dtr.ts
 *
 * Pure function: given a list of AttendanceLogs for one (employeeId, date)
 * and the employee's ShiftSchedule, compute the DTRRecord fields.
 *
 * Rules:
 *  - Clock-in  = earliest IN punch within the calendar day window.
 *  - Clock-out = latest  OUT punch within the window.
 *  - If only IN present  → workedMinutes = 0, dayStatus = PRESENT (partial).
 *  - If no punches        → caller handles ABSENT.
 *  - FIXED shifts:
 *      lateMinutes      = max(0, actualIn − (expectedIn + gracePeriod)).
 *      undertimeMinutes = max(0, expectedOut − actualOut).
 *      workedMinutes    = actualOut − actualIn − breakMinutes (min 0).
 *  - FLEXIBLE shifts (timeIn/timeOut = null):
 *      lateMinutes      = max(0, actualIn − (coreTimeIn + grace)) when a core
 *                         window is defined; 0 when there is no core start.
 *      undertimeMinutes = max(requiredMinutes − workedMinutes, coreTimeOut − actualOut).
 *  - Break policies (all five):
 *      FIXED_DEDUCTION / FLOATING → span − breakMinutes.
 *      PAID_BREAK                 → span (no deduction).
 *      TRACK_ACTUAL / PUNCH_IN_OUT → sum of paired IN-OUT intervals.
 *  - Auto-OT: when otThresholdMinutes is set and workedMinutes exceeds it,
 *    otMinutes is flagged automatically (still requires approval to pay).
 *  - nsdMinutes = overlap of [actualIn, actualOut] with 22:00–06:00.
 */

import { zonedTimeToUtc, atLocalWallClock, localDay } from "@/lib/time/zone";

export interface AttendancePunch {
  punchType: "IN" | "OUT";
  punchedAt: Date;
}

/** Break-handling policy. Mirrors the Prisma `BreakPolicy` enum. */
export type BreakPolicy =
  | "FIXED_DEDUCTION"
  | "FLOATING"
  | "TRACK_ACTUAL"
  | "PUNCH_IN_OUT"
  | "PAID_BREAK";

export interface ShiftContext {
  /** "HH:MM" for FIXED shifts; null for FLEXIBLE (no fixed start). */
  timeIn: string | null;
  /** "HH:MM" for FIXED shifts; null for FLEXIBLE (no fixed end). */
  timeOut: string | null;
  /** "HH:MM" core-window start for FLEXIBLE shifts; null = no core start. */
  coreTimeIn: string | null;
  /** "HH:MM" core-window end for FLEXIBLE shifts; null = no core end. */
  coreTimeOut: string | null;
  /** Required hours/day for FLEXIBLE shifts (e.g. 8.0). Ignored for FIXED. */
  requiredHours: number | null;
  breakMinutes: number;
  crossesMidnight: boolean;
  /**
   * How the unpaid break is handled when computing worked minutes:
   *  - FIXED_DEDUCTION / FLOATING: deduct breakMinutes from the firstIN→lastOUT span.
   *  - PAID_BREAK: no deduction — the break is paid.
   *  - TRACK_ACTUAL / PUNCH_IN_OUT: sum each paired IN-OUT interval (employee
   *    clocks out for the break), so the break is whatever time was clocked out.
   */
  breakPolicy: BreakPolicy;
  /** Minutes after expectedIn before tardiness is recorded. 0 = strict. */
  gracePeriodMinutes: number;
  /** Auto-flag OT when workedMinutes exceeds this. null = manual pre-approval only. */
  otThresholdMinutes: number | null;
}

export interface DtrComputed {
  dayStatus: "PRESENT" | "ABSENT";
  workedMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
  nsdMinutes: number;
  /** True when there's a clock-in but no clock-out (forgotten OUT). */
  missingOut?: boolean;
  /**
   * Advisory only: worked minutes beyond the shift OT threshold. NEVER paid —
   * payable OT comes only from an approved OT application. Callers persist this
   * to DTRRecord.suggestedOtMinutes. Absence means 0.
   */
  suggestedOtMinutes?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse "HH:MM" into { h, m }. */
function parseHHMM(s: string): { h: number; m: number } {
  const [h, m] = s.split(":").map(Number) as [number, number];
  return { h, m };
}

/** Wall-clock time (h:m) on the local calendar day represented by
 *  `dateUtcMidnight`, resolved to a UTC instant in `tz`. */
function atTime(dateUtcMidnight: Date, h: number, m: number, tz: string): Date {
  return zonedTimeToUtc(
    dateUtcMidnight.getUTCFullYear(),
    dateUtcMidnight.getUTCMonth() + 1,
    dateUtcMidnight.getUTCDate(),
    h,
    m,
    tz,
  );
}

/** Night-shift-differential window, minutes-from-midnight. Defaults 22:00–06:00. */
export interface NsdWindow {
  /** Window start, minutes from midnight (e.g. 1320 = 22:00). */
  startMin: number;
  /** Window end, minutes from midnight (e.g. 360 = 06:00). */
  endMin: number;
}

const DEFAULT_NSD_WINDOW: NsdWindow = { startMin: 22 * 60, endMin: 6 * 60 };

/**
 * Overlap of [from, to] with the recurring nightly NSD window. The window may
 * wrap midnight (startMin > endMin, e.g. 22:00→06:00) or not (startMin < endMin).
 */
function nsdOverlapMinutes(
  from: Date,
  to: Date,
  window: NsdWindow = DEFAULT_NSD_WINDOW,
  tz = "UTC",
): number {
  const base = atLocalWallClock(localDay(from, tz), "00:00", tz);
  const at = (offsetMin: number) => base.getTime() + offsetMin * 60_000;

  const wraps = window.startMin > window.endMin;
  const segments: [number, number][] = wraps
    ? [
        // Tail of the previous night's window that lands on this morning.
        [at(0), at(window.endMin)],
        // This night's window, spilling into the next morning.
        [at(window.startMin), at(1440 + window.endMin)],
      ]
    : [
        [at(window.startMin), at(window.endMin)],
        [at(1440 + window.startMin), at(1440 + window.endMin)],
      ];

  let total = 0;
  for (const [segStart, segEnd] of segments) {
    const start = Math.max(from.getTime(), segStart);
    const end = Math.min(to.getTime(), segEnd);
    if (end > start) total += Math.round((end - start) / 60_000);
  }
  return total;
}

/** Parse "HH:MM" into minutes-from-midnight. Returns null on malformed input. */
export function parseWindowMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Compute worked minutes from punches using the specified break policy. */
function computeWorkedMinutes(
  inPunches: AttendancePunch[],
  outPunches: AttendancePunch[],
  actualIn: Date,
  actualOut: Date | null,
  breakPolicy: BreakPolicy,
  breakMinutes: number,
): number {
  if (!actualOut) return 0;

  // TRACK_ACTUAL / PUNCH_IN_OUT: employee clocks out for the break, so the
  // break is the time spent clocked out. Sum only paired IN-OUT intervals.
  if (breakPolicy === "TRACK_ACTUAL" || breakPolicy === "PUNCH_IN_OUT") {
    const sortedIns  = [...inPunches].sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
    const sortedOuts = [...outPunches].sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
    let total = 0;
    let outIdx = 0;
    for (const inPunch of sortedIns) {
      while (outIdx < sortedOuts.length && sortedOuts[outIdx].punchedAt <= inPunch.punchedAt) {
        outIdx++;
      }
      if (outIdx < sortedOuts.length) {
        total += Math.round(
          (sortedOuts[outIdx].punchedAt.getTime() - inPunch.punchedAt.getTime()) / 60_000,
        );
        outIdx++;
      }
    }
    return Math.max(0, total);
  }

  const spanMinutes = Math.round((actualOut.getTime() - actualIn.getTime()) / 60_000);

  // PAID_BREAK: the break is paid, so nothing is deducted from the span.
  if (breakPolicy === "PAID_BREAK") {
    return Math.max(0, spanMinutes);
  }

  // FIXED_DEDUCTION / FLOATING: span minus the fixed break amount.
  return Math.max(0, spanMinutes - breakMinutes);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Compute DTR fields for one employee/date from raw punches.
 *
 * @param dateUtcMidnight  The calendar date (UTC midnight).
 * @param punches          All AttendanceLogs for this employee+date (any order).
 * @param shift            The employee's active shift, or null (unscheduled).
 */
export function computeDtrFields(
  dateUtcMidnight: Date,
  punches: AttendancePunch[],
  shift: ShiftContext | null,
  nsdWindow: NsdWindow = DEFAULT_NSD_WINDOW,
  timezone = "UTC",
): DtrComputed {
  const inPunches  = punches.filter((p) => p.punchType === "IN");
  const outPunches = punches.filter((p) => p.punchType === "OUT");

  if (inPunches.length === 0) {
    return { dayStatus: "ABSENT", workedMinutes: 0, lateMinutes: 0, undertimeMinutes: 0, nsdMinutes: 0 };
  }

  const actualIn  = inPunches.reduce((a, b) => a.punchedAt < b.punchedAt ? a : b).punchedAt;
  const hasOut    = outPunches.length > 0;
  const actualOut = hasOut ? outPunches.reduce((a, b) => a.punchedAt > b.punchedAt ? a : b).punchedAt : null;

  if (!shift) {
    // Unscheduled — record worked time only, no late/undertime.
    const workedMinutes = actualOut
      ? Math.max(0, Math.round((actualOut.getTime() - actualIn.getTime()) / 60_000))
      : 0;
    return {
      dayStatus: "PRESENT",
      workedMinutes,
      lateMinutes: 0,
      undertimeMinutes: 0,
      nsdMinutes: actualOut ? nsdOverlapMinutes(actualIn, actualOut, nsdWindow, timezone) : 0,
      missingOut: !hasOut,
    };
  }

  const workedMinutes = computeWorkedMinutes(
    inPunches, outPunches, actualIn, actualOut,
    shift.breakPolicy, shift.breakMinutes,
  );
  const nsdMinutes = actualOut ? nsdOverlapMinutes(actualIn, actualOut, nsdWindow, timezone) : 0;

  // Auto-OT: flag excess minutes when threshold is configured. Advisory only —
  // this is a "file OT?" hint, never paid without an approved OT application.
  const suggestedOtMinutes =
    shift.otThresholdMinutes !== null && workedMinutes > shift.otThresholdMinutes
      ? workedMinutes - shift.otThresholdMinutes
      : undefined;

  // ── FLEXIBLE shift: no fixed start/end; measure against requiredHours,
  //    plus an optional core window (coreTimeIn/coreTimeOut) for late/undertime ──
  if (shift.timeIn === null || shift.timeOut === null) {
    const requiredMinutes =
      shift.requiredHours !== null ? Math.round(shift.requiredHours * 60) : 480;

    // Late: only when a core start is defined and the employee arrived after it
    // (plus grace). No core start → flexible arrival, no tardiness.
    let lateMinutes = 0;
    if (shift.coreTimeIn) {
      const { h, m } = parseHHMM(shift.coreTimeIn);
      const coreStart = atTime(dateUtcMidnight, h, m, timezone);
      const gracePeriodMs = (shift.gracePeriodMinutes ?? 0) * 60_000;
      lateMinutes = Math.max(
        0,
        Math.round((actualIn.getTime() - coreStart.getTime() - gracePeriodMs) / 60_000),
      );
    }

    // Undertime: the larger of the required-hours shortfall and (when a core end
    // is defined) leaving before the core window closes.
    let undertimeMinutes = Math.max(0, requiredMinutes - workedMinutes);
    if (shift.coreTimeOut && actualOut) {
      const { h, m } = parseHHMM(shift.coreTimeOut);
      let coreEnd = atTime(dateUtcMidnight, h, m, timezone);
      if (shift.crossesMidnight && shift.coreTimeIn) {
        const { h: ch, m: cm } = parseHHMM(shift.coreTimeIn);
        if (coreEnd <= atTime(dateUtcMidnight, ch, cm, timezone)) {
          coreEnd = new Date(coreEnd.getTime() + 86_400_000);
        }
      }
      const coreUndertime = Math.max(
        0,
        Math.round((coreEnd.getTime() - actualOut.getTime()) / 60_000),
      );
      undertimeMinutes = Math.max(undertimeMinutes, coreUndertime);
    }

    return {
      dayStatus: "PRESENT",
      workedMinutes,
      lateMinutes,
      undertimeMinutes,
      nsdMinutes,
      missingOut: !hasOut,
      ...(suggestedOtMinutes !== undefined && { suggestedOtMinutes }),
    };
  }

  // ── FIXED shift: expected time-in/out with grace period ──
  const { h: inH, m: inM }   = parseHHMM(shift.timeIn);
  const { h: outH, m: outM } = parseHHMM(shift.timeOut);
  const expectedIn  = atTime(dateUtcMidnight, inH, inM, timezone);
  let   expectedOut = atTime(dateUtcMidnight, outH, outM, timezone);
  if (shift.crossesMidnight && expectedOut <= expectedIn) {
    expectedOut = new Date(expectedOut.getTime() + 86_400_000);
  }

  const gracePeriodMs = (shift.gracePeriodMinutes ?? 0) * 60_000;
  const lateMinutes   = Math.max(
    0,
    Math.round((actualIn.getTime() - expectedIn.getTime() - gracePeriodMs) / 60_000),
  );

  const undertimeMinutes = actualOut
    ? Math.max(0, Math.round((expectedOut.getTime() - actualOut.getTime()) / 60_000))
    : 0;

  return {
    dayStatus: "PRESENT",
    workedMinutes,
    lateMinutes,
    undertimeMinutes,
    nsdMinutes,
    missingOut: !hasOut,
    ...(suggestedOtMinutes !== undefined && { suggestedOtMinutes }),
  };
}
