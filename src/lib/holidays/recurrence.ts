/**
 * Recurring-holiday expansion.
 *
 * A holiday with `recurringAnnually = true` is stored ONCE (in any year) and is
 * understood to occur every year on the same UTC month+day. The calendar view
 * and the payroll engine call these helpers to expand such "master" rows into
 * concrete dated occurrences for a requested date range.
 *
 * Per-year cancellations are honored via `skippedDates` — a JSON array of
 * "YYYY-MM-DD" strings. Deleting a single occurrence of a recurring holiday
 * appends that year's date here (instead of soft-deleting the master).
 *
 * Non-recurring holidays pass through unchanged when their stored date falls
 * inside the range.
 */

export interface RecurrableHoliday {
  date: Date;
  recurringAnnually?: boolean | null;
  /** JSON array of "YYYY-MM-DD" strings whose occurrence is cancelled. */
  skippedDates?: unknown;
}

/** "YYYY-MM-DD" for the UTC date of a JS Date. */
export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Coerce a Prisma JSON value into a Set of "YYYY-MM-DD" skip keys. */
export function toSkipSet(skippedDates: unknown): Set<string> {
  if (!Array.isArray(skippedDates)) return new Set();
  return new Set(skippedDates.filter((x): x is string => typeof x === "string"));
}

/**
 * Returns the concrete occurrence dates (UTC midnight) of `holiday` that fall
 * within [rangeStart, rangeEnd] (inclusive), honoring skip exceptions.
 *
 * - Non-recurring: at most the stored date, if in range and not skipped.
 * - Recurring: one occurrence per calendar year spanned by the range.
 */
export function occurrencesInRange(
  holiday: RecurrableHoliday,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  const skip = toSkipSet(holiday.skippedDates);
  const out: Date[] = [];

  if (!holiday.recurringAnnually) {
    const d = holiday.date;
    if (d >= rangeStart && d <= rangeEnd && !skip.has(utcDateKey(d))) {
      out.push(d);
    }
    return out;
  }

  const month = holiday.date.getUTCMonth();
  const day = holiday.date.getUTCDate();
  for (let y = rangeStart.getUTCFullYear(); y <= rangeEnd.getUTCFullYear(); y++) {
    const occ = new Date(Date.UTC(y, month, day));
    if (occ >= rangeStart && occ <= rangeEnd && !skip.has(utcDateKey(occ))) {
      out.push(occ);
    }
  }
  return out;
}

/**
 * Expands a list of holiday masters into concrete occurrences within the range.
 * Each output element is the original master spread with `date` overridden to
 * the occurrence date. Sorted ascending by date.
 */
export function expandHolidays<T extends RecurrableHoliday>(
  holidays: T[],
  rangeStart: Date,
  rangeEnd: Date,
): T[] {
  const out: T[] = [];
  for (const h of holidays) {
    for (const occ of occurrencesInRange(h, rangeStart, rangeEnd)) {
      out.push({ ...h, date: occ });
    }
  }
  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out;
}
