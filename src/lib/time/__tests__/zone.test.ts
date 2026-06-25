import { describe, it, expect } from "vitest";
import {
  resolveTimezone,
  zonedTimeToUtc,
  localDay,
  atLocalWallClock,
  localWeekday,
} from "../zone";

const PH = "Asia/Manila";

describe("resolveTimezone", () => {
  it("COMPANY mode uses the tenant timezone", () => {
    expect(
      resolveTimezone(
        { timezone: PH, timekeepingTimezoneMode: "COMPANY" },
        { timezone: "Asia/Tokyo" },
      ),
    ).toBe(PH);
  });

  it("EMPLOYEE mode uses the employee timezone, falling back to tenant", () => {
    const t = { timezone: PH, timekeepingTimezoneMode: "EMPLOYEE" as const };
    expect(resolveTimezone(t, { timezone: "Asia/Tokyo" })).toBe("Asia/Tokyo");
    expect(resolveTimezone(t, { timezone: null })).toBe(PH);
    expect(resolveTimezone(t, null)).toBe(PH);
  });
});

describe("localDay (PH = UTC+8)", () => {
  it("attributes a 07:00 PHT punch to the correct calendar day", () => {
    // 2026-06-23T23:00:00Z === 2026-06-24 07:00 PHT
    expect(localDay(new Date("2026-06-23T23:00:00Z"), PH).toISOString()).toBe(
      "2026-06-24T00:00:00.000Z",
    );
  });

  it("keeps an afternoon punch on the same day", () => {
    // 2026-06-24T05:00:00Z === 2026-06-24 13:00 PHT
    expect(localDay(new Date("2026-06-24T05:00:00Z"), PH).toISOString()).toBe(
      "2026-06-24T00:00:00.000Z",
    );
  });
});

describe("atLocalWallClock (PH)", () => {
  const day = new Date("2026-06-23T00:00:00Z");
  it("maps 22:00 PHT to 14:00 UTC same day", () => {
    expect(atLocalWallClock(day, "22:00", PH).toISOString()).toBe(
      "2026-06-23T14:00:00.000Z",
    );
  });
  it("maps 06:00 PHT to 22:00 UTC the previous day", () => {
    expect(atLocalWallClock(day, "06:00", PH).toISOString()).toBe(
      "2026-06-22T22:00:00.000Z",
    );
  });
});

describe("zonedTimeToUtc (DST zone sanity)", () => {
  it("applies the summer offset for America/New_York (EDT, UTC-4)", () => {
    expect(zonedTimeToUtc(2026, 7, 1, 12, 0, "America/New_York").toISOString()).toBe(
      "2026-07-01T16:00:00.000Z",
    );
  });
});

describe("localWeekday", () => {
  it("returns the local weekday (2026-06-23 is a Tuesday in PH)", () => {
    expect(localWeekday(new Date("2026-06-23T05:00:00Z"), PH)).toBe(2);
  });
});
