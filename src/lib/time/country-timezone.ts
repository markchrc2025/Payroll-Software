/**
 * Maps a country (as stored on `Tenant.country`) to a default IANA timezone,
 * used to seed `Tenant.timezone` at creation. Countries spanning multiple zones
 * use their primary/most-populous zone; companies can override in settings.
 * Extend this map as new markets are onboarded.
 */
export const DEFAULT_TIMEZONE = "Asia/Manila";

const COUNTRY_TIMEZONE: Record<string, string> = {
  philippines: "Asia/Manila",
  singapore: "Asia/Singapore",
  "hong kong": "Asia/Hong_Kong",
  malaysia: "Asia/Kuala_Lumpur",
  indonesia: "Asia/Jakarta",
  thailand: "Asia/Bangkok",
  vietnam: "Asia/Ho_Chi_Minh",
  japan: "Asia/Tokyo",
  india: "Asia/Kolkata",
  australia: "Australia/Sydney",
  "united states": "America/New_York",
  "united kingdom": "Europe/London",
};

/** Resolve a default IANA timezone for a country name; falls back to PH time. */
export function countryToTimezone(country: string | null | undefined): string {
  if (!country) return DEFAULT_TIMEZONE;
  return COUNTRY_TIMEZONE[country.trim().toLowerCase()] ?? DEFAULT_TIMEZONE;
}
