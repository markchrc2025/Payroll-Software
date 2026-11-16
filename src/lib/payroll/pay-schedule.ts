/**
 * PAY-141: paydays and timekeeping (DTR) cutoff windows per pay cycle.
 *
 * Mark's rulings (16 Nov 2026):
 *   - Paydays and the DTR cutoff that feeds each payday are set per pay cycle.
 *     Semi-monthly example: payday 15th fed by the 26th to 10th, payday 30th
 *     fed by the 11th to 25th.
 *   - Monthly: one payday and one cutoff window (e.g. paid the 30th for the
 *     26th to 25th).
 *   - Weekly: payday is always Saturday; the cutoff is Saturday to Friday,
 *     ending the day before payday. Daily: paid daily.
 *   - A payday on a Sunday or a holiday moves to the working day before.
 *   - "30th" means the last day of the month (February, 31-day months).
 *   - New run: pick the cycle and the payday; the dates fill in and are locked.
 *
 * Three date ranges per payday:
 *   - payDate:   the day people are paid (moved back off Sundays and holidays).
 *   - cutoff:    the DTR window whose attendance (days worked, unpaid days,
 *                lates, overtime) the run uses.
 *   - pay period: the salary period (unit 1.8 contracted pay, PAY-133 SSS
 *                month): the half-month (semi-monthly) or month (monthly) that
 *                contains the cutoff's last day; for weekly and daily it is the
 *                cutoff itself. With the default schedule the cutoff and the
 *                pay period are the same dates, as before this unit.
 *
 * Pure: no database, no clock. Day-of-month values are 1 to 31; 30 and 31 mean
 * the month's last day; 29 in a 28-day February is the 28th.
 */

export type ScheduledCycle = "SEMI_MONTHLY" | "MONTHLY";

export interface PaySlot {
  /** Day of the month people are paid (30 or 31 = last day). */
  payDay: number;
  /** DTR cutoff window feeding this payday, as days of the month. */
  cutoffStartDay: number;
  cutoffEndDay: number;
}

export interface PayScheduleConfig {
  cycle: ScheduledCycle;
  /** SEMI_MONTHLY: two slots; MONTHLY: one. */
  slots: PaySlot[];
}

/** Used when a company has not saved a schedule: cutoff = pay period. */
export const DEFAULT_SCHEDULES: Record<ScheduledCycle, PayScheduleConfig> = {
  SEMI_MONTHLY: {
    cycle: "SEMI_MONTHLY",
    slots: [
      { payDay: 15, cutoffStartDay: 1, cutoffEndDay: 15 },
      { payDay: 30, cutoffStartDay: 16, cutoffEndDay: 30 },
    ],
  },
  MONTHLY: { cycle: "MONTHLY", slots: [{ payDay: 30, cutoffStartDay: 1, cutoffEndDay: 30 }] },
};

export interface PayDayOccurrence {
  cycle: "SEMI_MONTHLY" | "MONTHLY" | "WEEKLY" | "DAILY";
  /** 1-based slot (SEMI_MONTHLY 1 or 2; others 1). */
  slot: number;
  /** The scheduled payday before any Sunday or holiday move (YYYY-MM-DD). */
  nominalDate: string;
  /** The day people are paid (YYYY-MM-DD). */
  payDate: string;
  /** True when payDate was moved back from nominalDate. */
  moved: boolean;
  periodStart: string;
  periodEnd: string;
  cutoffStart: string;
  cutoffEnd: string;
}

// ---------------------------------------------------------------------------
// Calendar helpers (UTC dates, day granularity)
// ---------------------------------------------------------------------------
const DAY = 86_400_000;
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const parseYmd = (s: string) => new Date(`${s}T00:00:00.000Z`);
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** The date for `day` in month (y, m): 30 and 31 are the last day; others clamp. */
export function dayIn(y: number, m: number, day: number): Date {
  const norm = new Date(Date.UTC(y, m, 1));
  const yy = norm.getUTCFullYear();
  const mm = norm.getUTCMonth();
  const last = lastDayOf(yy, mm);
  const d = day >= 30 ? last : Math.min(day, last);
  return new Date(Date.UTC(yy, mm, d));
}

/** The latest date on or before `limit` whose day-of-month resolves to `day`. */
function latestOnOrBefore(limit: Date, day: number): Date {
  const y = limit.getUTCFullYear();
  const m = limit.getUTCMonth();
  const here = dayIn(y, m, day);
  return here.getTime() <= limit.getTime() ? here : dayIn(y, m - 1, day);
}

/** Moves a payday back while it falls on a Sunday or a listed holiday. */
export function adjustPayDate(nominal: Date, holidays: ReadonlySet<string>): Date {
  let d = nominal;
  for (let i = 0; i < 14 && (d.getUTCDay() === 0 || holidays.has(ymd(d))); i++) d = addDays(d, -1);
  return d;
}

// ---------------------------------------------------------------------------
// Validation (also used by the settings API)
// ---------------------------------------------------------------------------

/**
 * Problems with a schedule, in plain words; empty when it can be used.
 * The cutoff windows must cover every day once: each window starts the day
 * after the other one ends (30 or 31 standing for month-end, so the next
 * window starts on the 1st).
 */
export function scheduleProblems(cfg: PayScheduleConfig): string[] {
  const out: string[] = [];
  const want = cfg.cycle === "SEMI_MONTHLY" ? 2 : 1;
  if (cfg.slots.length !== want) {
    out.push(cfg.cycle === "SEMI_MONTHLY" ? "Semi-monthly needs two paydays." : "Monthly needs one payday.");
    return out;
  }
  for (const s of cfg.slots) {
    for (const v of [s.payDay, s.cutoffStartDay, s.cutoffEndDay]) {
      if (!Number.isInteger(v) || v < 1 || v > 31) out.push("Days must be whole numbers from 1 to 31.");
    }
  }
  if (out.length) return [...new Set(out)];
  const next = (endDay: number) => (endDay >= 30 ? 1 : endDay + 1);
  if (cfg.cycle === "SEMI_MONTHLY") {
    const [a, b] = cfg.slots;
    if (a.payDay === b.payDay || (a.payDay >= 30 && b.payDay >= 30)) out.push("The two paydays must be different days.");
    if (b.cutoffStartDay !== next(a.cutoffEndDay) || a.cutoffStartDay !== next(b.cutoffEndDay)) {
      out.push("The two cutoffs must cover the whole month with no gap or overlap (each starts the day after the other ends).");
    }
  } else {
    const [a] = cfg.slots;
    if (a.cutoffStartDay !== next(a.cutoffEndDay)) {
      out.push("The cutoff must cover a whole month (it starts the day after it ends, e.g. 26th to 25th).");
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Occurrences
// ---------------------------------------------------------------------------

function scheduledOccurrence(
  cfg: PayScheduleConfig,
  slotIndex: number,
  y: number,
  m: number,
  holidays: ReadonlySet<string>,
): PayDayOccurrence {
  const slot = cfg.slots[slotIndex]!;
  const nominal = dayIn(y, m, slot.payDay);
  const cutoffEnd = latestOnOrBefore(nominal, slot.cutoffEndDay);
  const cutoffStart = latestOnOrBefore(cutoffEnd, slot.cutoffStartDay);
  const ey = cutoffEnd.getUTCFullYear();
  const em = cutoffEnd.getUTCMonth();
  let periodStart: Date;
  let periodEnd: Date;
  if (cfg.cycle === "MONTHLY") {
    periodStart = new Date(Date.UTC(ey, em, 1));
    periodEnd = new Date(Date.UTC(ey, em, lastDayOf(ey, em)));
  } else if (cutoffEnd.getUTCDate() <= 15) {
    periodStart = new Date(Date.UTC(ey, em, 1));
    periodEnd = new Date(Date.UTC(ey, em, 15));
  } else {
    periodStart = new Date(Date.UTC(ey, em, 16));
    periodEnd = new Date(Date.UTC(ey, em, lastDayOf(ey, em)));
  }
  const payDate = adjustPayDate(nominal, holidays);
  return {
    cycle: cfg.cycle,
    slot: slotIndex + 1,
    nominalDate: ymd(nominal),
    payDate: ymd(payDate),
    moved: payDate.getTime() !== nominal.getTime(),
    periodStart: ymd(periodStart),
    periodEnd: ymd(periodEnd),
    cutoffStart: ymd(cutoffStart),
    cutoffEnd: ymd(cutoffEnd),
  };
}

function weeklyOccurrence(saturday: Date, holidays: ReadonlySet<string>): PayDayOccurrence {
  const payDate = adjustPayDate(saturday, holidays);
  const start = ymd(addDays(saturday, -7));
  const end = ymd(addDays(saturday, -1));
  return {
    cycle: "WEEKLY",
    slot: 1,
    nominalDate: ymd(saturday),
    payDate: ymd(payDate),
    moved: payDate.getTime() !== saturday.getTime(),
    periodStart: start,
    periodEnd: end,
    cutoffStart: start,
    cutoffEnd: end,
  };
}

function dailyOccurrence(day: Date): PayDayOccurrence {
  const s = ymd(day);
  // Paid the day itself: no Sunday or holiday move (the day may be worked).
  return { cycle: "DAILY", slot: 1, nominalDate: s, payDate: s, moved: false, periodStart: s, periodEnd: s, cutoffStart: s, cutoffEnd: s };
}

/**
 * Every payday whose NOMINAL date is in [from, to], oldest first.
 * `config` is the company's schedule for SEMI_MONTHLY / MONTHLY (default when
 * absent); WEEKLY and DAILY follow the fixed rules.
 */
export function listPaydays(args: {
  cycle: "SEMI_MONTHLY" | "MONTHLY" | "WEEKLY" | "DAILY";
  config?: PayScheduleConfig | null;
  from: Date;
  to: Date;
  holidays?: ReadonlySet<string>;
}): PayDayOccurrence[] {
  const holidays = args.holidays ?? new Set<string>();
  const out: PayDayOccurrence[] = [];
  const from = args.from.getTime();
  const to = args.to.getTime();
  if (args.cycle === "WEEKLY") {
    let sat = addDays(args.from, (6 - args.from.getUTCDay() + 7) % 7);
    for (; sat.getTime() <= to; sat = addDays(sat, 7)) out.push(weeklyOccurrence(sat, holidays));
    return out;
  }
  if (args.cycle === "DAILY") {
    for (let d = args.from; d.getTime() <= to; d = addDays(d, 1)) out.push(dailyOccurrence(d));
    return out;
  }
  const cfg = args.config ?? DEFAULT_SCHEDULES[args.cycle];
  let y = args.from.getUTCFullYear();
  let m = args.from.getUTCMonth();
  for (let guard = 0; guard < 600; guard++) {
    const monthStart = Date.UTC(y, m, 1);
    if (monthStart > to) break;
    for (let i = 0; i < cfg.slots.length; i++) {
      const occ = scheduledOccurrence(cfg, i, y, m, holidays);
      const t = parseYmd(occ.nominalDate).getTime();
      if (t >= from && t <= to) out.push(occ);
    }
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return out.sort((a, b) => (a.nominalDate < b.nominalDate ? -1 : a.nominalDate > b.nominalDate ? 1 : a.slot - b.slot));
}

/** The occurrence for a scheduled (nominal) payday, or null if it is not one. */
export function resolvePayday(args: {
  cycle: "SEMI_MONTHLY" | "MONTHLY" | "WEEKLY" | "DAILY";
  config?: PayScheduleConfig | null;
  nominalDate: string;
  holidays?: ReadonlySet<string>;
}): PayDayOccurrence | null {
  const d = parseYmd(args.nominalDate);
  if (Number.isNaN(d.getTime())) return null;
  return (
    listPaydays({ cycle: args.cycle, config: args.config, from: d, to: d, holidays: args.holidays })
      .find((o) => o.nominalDate === args.nominalDate) ?? null
  );
}
