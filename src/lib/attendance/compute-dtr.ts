/**
 * src/lib/attendance/compute-dtr.ts
 *
 * Pure function: given a list of AttendanceLogs for one (employeeId, date)
 * and the employee's ShiftSchedule, compute the DTRRecord fields.
 *
 * Rules (Section 5.3 / 6.3):
 *  - Clock-in  = earliest IN punch within the calendar day window.
 *  - Clock-out = latest  OUT punch within the window.
 *  - If only IN present  → workedMinutes = 0, dayStatus = PRESENT (partial).
 *  - If no punches        → called when there are no logs; caller handles ABSENT.
 *  - lateMinutes          = max(0, actualIn − expectedIn).
 *  - undertimeMinutes     = max(0, expectedOut − actualOut).
 *  - workedMinutes        = actualOut − actualIn − breakMinutes (min 0).
 *  - nsdMinutes           = overlap of [actualIn, actualOut] with 22:00–06:00.
 *  - Cross-midnight shifts are handled by offsetting expectedOut by +1 day.
 */

export interface AttendancePunch {
  punchType: "IN" | "OUT";
  punchedAt: Date;
}

export interface ShiftContext {
  /** "HH:MM" e.g. "08:00" */
  timeIn: string;
  /** "HH:MM" e.g. "17:00" */
  timeOut: string;
  breakMinutes: number;
  crossesMidnight: boolean;
}

export interface DtrComputed {
  dayStatus: "PRESENT" | "ABSENT";
  workedMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
  nsdMinutes: number;
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
  // NSD spans two calendar windows per day:
  //   A) 22:00 on the same UTC date of `from`
  //   B) 00:00–06:00 on the same UTC date of `from`
  // We accumulate overlap across both.

  let total = 0;
  const base = new Date(from);
  base.setUTCHours(0, 0, 0, 0); // midnight of `from` day

  const nsdSegments: [Date, Date][] = [
    // 00:00–06:00 same day
    [atTime(base, 0, 0), atTime(base, 6, 0)],
    // 22:00 same day → 06:00 next day
    [atTime(base, 22, 0), new Date(atTime(base, 6, 0).getTime() + 86_400_000)],
  ];

  for (const [nsdStart, nsdEnd] of nsdSegments) {
    const start = Math.max(from.getTime(), nsdStart.getTime());
    const end = Math.min(to.getTime(), nsdEnd.getTime());
    if (end > start) total += Math.round((end - start) / 60_000);
  }

  return total;
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
    // No punches at all (or only OUTs with no IN) → absent
    return {
      dayStatus: "ABSENT",
      workedMinutes: 0,
      lateMinutes: 0,
      undertimeMinutes: 0,
      nsdMinutes: 0,
    };
  }

  const actualIn  = inPunches.reduce((a, b) =>
    a.punchedAt < b.punchedAt ? a : b,
  ).punchedAt;

  const hasOut     = outPunches.length > 0;
  const actualOut  = hasOut
    ? outPunches.reduce((a, b) => (a.punchedAt > b.punchedAt ? a : b)).punchedAt
    : null;

  if (!shift) {
    // Unscheduled — just record worked time, no late/undertime calculation.
    const workedMinutes =
      actualOut
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

  // Build expected timestamps from shift definition
  const { h: inH, m: inM }   = parseHHMM(shift.timeIn);
  const { h: outH, m: outM } = parseHHMM(shift.timeOut);
  const expectedIn  = atTime(dateUtcMidnight, inH, inM);
  let   expectedOut = atTime(dateUtcMidnight, outH, outM);
  if (shift.crossesMidnight && expectedOut <= expectedIn) {
    // e.g., shift 22:00 → 06:00: advance expectedOut by 1 day
    expectedOut = new Date(expectedOut.getTime() + 86_400_000);
  }

  const lateMinutes = Math.max(
    0,
    Math.round((actualIn.getTime() - expectedIn.getTime()) / 60_000),
  );

  const undertimeMinutes = actualOut
    ? Math.max(
        0,
        Math.round((expectedOut.getTime() - actualOut.getTime()) / 60_000),
      )
    : 0;

  const workedMinutes = actualOut
    ? Math.max(
        0,
        Math.round(
          (actualOut.getTime() - actualIn.getTime()) / 60_000 -
            shift.breakMinutes,
        ),
      )
    : 0;

  const nsdMinutes = actualOut ? nsdOverlapMinutes(actualIn, actualOut) : 0;

  return {
    dayStatus: "PRESENT",
    workedMinutes,
    lateMinutes,
    undertimeMinutes,
    nsdMinutes,
  };
}
