/**
 * Timezone helpers for timekeeping, built on the platform `Intl` API
 * (IANA-aware, DST-correct) — no external dependency.
 *
 * Conventions:
 *  - A "local day" is represented as a Date at UTC midnight whose Y-M-D equals
 *    the local calendar date in the given zone (e.g. local 2026-06-24 →
 *    2026-06-24T00:00:00Z). This matches how `DTRRecord.date` is stored.
 *  - Wall-clock helpers return real UTC instants.
 */

export type TzTenant = {
  timezone: string;
  timekeepingTimezoneMode: "COMPANY" | "EMPLOYEE";
};
export type TzEmployee = { timezone: string | null };

/**
 * Resolve the effective IANA timezone for an employee's timekeeping:
 * COMPANY mode → tenant timezone; EMPLOYEE mode → employee's own (falling back
 * to the tenant timezone when the employee has no override).
 */
export function resolveTimezone(
  tenant: TzTenant,
  employee?: TzEmployee | null,
): string {
  if (tenant.timekeepingTimezoneMode === "EMPLOYEE") {
    return employee?.timezone ?? tenant.timezone;
  }
  return tenant.timezone;
}

const PARTS_FMT_CACHE = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let fmt = PARTS_FMT_CACHE.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    PARTS_FMT_CACHE.set(tz, fmt);
  }
  return fmt;
}

type LocalParts = { y: number; mo: number; d: number; h: number; mi: number; s: number };
function getLocalParts(instant: Date, tz: string): LocalParts {
  const parts = partsFormatter(tz).formatToParts(instant);
  const v: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") v[p.type] = p.value;
  let h = Number(v.hour);
  if (h === 24) h = 0; // some runtimes render midnight as "24"
  return {
    y: Number(v.year),
    mo: Number(v.month),
    d: Number(v.day),
    h,
    mi: Number(v.minute),
    s: Number(v.second),
  };
}

/** Offset in ms (local wall-clock − UTC) that `tz` is using at `instant`. */
function tzOffsetMs(instant: Date, tz: string): number {
  const p = getLocalParts(instant, tz);
  const asUTC = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return asUTC - instant.getTime();
}

/**
 * Convert a local wall-clock (in `tz`) to a real UTC instant. Single-offset
 * correction — exact for zones without DST (e.g. PH) and accurate elsewhere
 * outside the rare DST-transition hour.
 */
export function zonedTimeToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  tz: string,
): Date {
  const asUTC = Date.UTC(y, mo - 1, d, h, mi);
  const offset = tzOffsetMs(new Date(asUTC), tz);
  return new Date(asUTC - offset);
}

/**
 * The local calendar day for `instant` in `tz`, as a Date at UTC midnight whose
 * Y-M-D equals the local date. Use as the DTR `date` key.
 */
export function localDay(instant: Date, tz: string): Date {
  const p = getLocalParts(instant, tz);
  return new Date(Date.UTC(p.y, p.mo - 1, p.d));
}

/** UTC instant for a "HH:MM" wall-clock time on the given local day, in `tz`. */
export function atLocalWallClock(day: Date, hhmm: string, tz: string): Date {
  const [h, mi] = hhmm.split(":").map(Number);
  return zonedTimeToUtc(
    day.getUTCFullYear(),
    day.getUTCMonth() + 1,
    day.getUTCDate(),
    h,
    mi,
    tz,
  );
}

/** Weekday (0=Sun … 6=Sat) of the local calendar day for `instant` in `tz`. */
export function localWeekday(instant: Date, tz: string): number {
  const p = getLocalParts(instant, tz);
  return new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
}
