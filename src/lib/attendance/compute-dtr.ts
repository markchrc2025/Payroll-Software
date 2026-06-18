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
 *      lateMinutes      = 0 (no fixed start time).
 *      undertimeMinutes = max(0, requiredMinutes − workedMinutes).
 *  - Auto-OT: when otThresholdMinutes is set and workedMinutes exceeds it,
 *    otMinutes is flagged automatically (still requires approval to pay).
 *  - nsdMinutes = overlap of [actualIn, actualOut] with 22:00–06:00.
 */

export interface AttendancePunch {
  punchType: "IN" | "OUT";
  punchedAt: Date;
}

export interface ShiftContext {
  /** "HH:MM" for FIXED shifts; null for FLEXIBLE (no fixed start). */
  timeIn: string | null;
  /** "HH:MM" for FIXED shifts; null for FLEXIBLE (no fixed end). */
  timeOut: string | null;
  /** Required hours/day for FLEXIBLE shifts (e.g. 8.0). Ignored for FIXED. */
  requiredHours: number | null;
  breakMinutes: number;
  crossesMidnight: boolean;
  /**
   * FIXED_DEDUCTION (default): auto-deduct breakMinutes from firstIN→lastOUT span.
   * TRACK_ACTUAL: sum each paired IN-OUT interval; break = time spent clocked out.
   */
  breakPolicy: "FIXED_DEDUCTION" | "TRACK_ACTUAL";
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
  /** Set when auto-OT threshold is exceeded. Callers treat absence as 0. */
  otMinutes?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse "HH:MM" into { h, m }. */
function parseHHMM(s: string): { h: number; m: number } {
  const [h, m] = s.split(":").map(Number) as [number, number];
  return { h, m };
}

/** Set hours/minutes on a Date, preserving the date part (UTC). */
function atTime(dateUtcMidnight: Date, h: number, m: number): Date {
  const d = new Date(dateUtcMidnight);
  d.setUTCHours(h, m, 0, 0);
  return d;
}

/** NSD window: 22:00 to 06:00 next day. */
function nsdOverlapMinutes(from: Date, to: Date): number {
  let total = 0;
  const base = new Date(from);
  base.setUTCHours(0, 0, 0, 0);

  const nsdSegments: [Date, Date][] = [
    [atTime(base, 0, 0), atTime(base, 6, 0)],
    [atTime(base, 22, 0), new Date(atTime(base, 6, 0).getTime() + 86_400_000)],
  ];

  for (const [nsdStart, nsdEnd] of nsdSegments) {
    const start = Math.max(from.getTime(), nsdStart.getTime());
    const end = Math.min(to.getTime(), nsdEnd.getTime());
    if (end > start) total += Math.round((end - start) / 60_000);
  }

  return total;
}

/** Compute worked minutes from punches using the specified break policy. */
function computeWorkedMinutes(
  inPunches: AttendancePunch[],
  outPunches: AttendancePunch[],
  actualIn: Date,
  actualOut: Date | null,
  breakPolicy: "FIXED_DEDUCTION" | "TRACK_ACTUAL",
  breakMinutes: number,
): number {
  if (!actualOut) return 0;

  if (breakPolicy === "TRACK_ACTUAL") {
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

  // FIXED_DEDUCTION: span minus fixed break
  return Math.max(
    0,
    Math.round((actualOut.getTime() - actualIn.getTime()) / 60_000 - breakMinutes),
  );
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
      nsdMinutes: actualOut ? nsdOverlapMinutes(actualIn, actualOut) : 0,
    };
  }

  const workedMinutes = computeWorkedMinutes(
    inPunches, outPunches, actualIn, actualOut,
    shift.breakPolicy, shift.breakMinutes,
  );
  const nsdMinutes = actualOut ? nsdOverlapMinutes(actualIn, actualOut) : 0;

  // Auto-OT: flag excess minutes when threshold is configured.
  const otMinutes =
    shift.otThresholdMinutes !== null && workedMinutes > shift.otThresholdMinutes
      ? workedMinutes - shift.otThresholdMinutes
      : undefined;

  // ── FLEXIBLE shift: no fixed start/end; measure against requiredHours ──
  if (shift.timeIn === null || shift.timeOut === null) {
    const requiredMinutes =
      shift.requiredHours !== null ? Math.round(shift.requiredHours * 60) : 480;
    const undertimeMinutes = Math.max(0, requiredMinutes - workedMinutes);

    return {
      dayStatus: "PRESENT",
      workedMinutes,
      lateMinutes: 0,
      undertimeMinutes,
      nsdMinutes,
      ...(otMinutes !== undefined && { otMinutes }),
    };
  }

  // ── FIXED shift: expected time-in/out with grace period ──
  const { h: inH, m: inM }   = parseHHMM(shift.timeIn);
  const { h: outH, m: outM } = parseHHMM(shift.timeOut);
  const expectedIn  = atTime(dateUtcMidnight, inH, inM);
  let   expectedOut = atTime(dateUtcMidnight, outH, outM);
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
    ...(otMinutes !== undefined && { otMinutes }),
  };
}
