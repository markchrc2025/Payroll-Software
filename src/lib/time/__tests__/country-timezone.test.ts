import { describe, it, expect } from "vitest";
import { countryToTimezone, DEFAULT_TIMEZONE } from "../country-timezone";

describe("countryToTimezone", () => {
  it("maps Philippines to Asia/Manila", () => {
    expect(countryToTimezone("Philippines")).toBe("Asia/Manila");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(countryToTimezone("  philippines  ")).toBe("Asia/Manila");
  });

  it("maps other supported countries", () => {
    expect(countryToTimezone("Singapore")).toBe("Asia/Singapore");
    expect(countryToTimezone("Japan")).toBe("Asia/Tokyo");
    expect(countryToTimezone("United States")).toBe("America/New_York");
  });

  it("falls back to the default timezone for unknown/empty input", () => {
    expect(countryToTimezone("Atlantis")).toBe(DEFAULT_TIMEZONE);
    expect(countryToTimezone(null)).toBe(DEFAULT_TIMEZONE);
    expect(countryToTimezone(undefined)).toBe(DEFAULT_TIMEZONE);
    expect(countryToTimezone("")).toBe(DEFAULT_TIMEZONE);
  });
});
