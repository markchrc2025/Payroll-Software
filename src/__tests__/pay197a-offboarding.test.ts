/**
 * PAY-197 part 1 (Mark, 20 Nov 2026): Offboarding cases and clearance.
 *
 *   T1  days since the last working day, and the DOLE 30 days (fails on
 *       main: no offboarding module).
 *   T2  the Offboarding menu with its submenus; the pages call their APIs.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { daysSinceSeparation, FINAL_PAY_DAYS } from "@/lib/offboarding/clearance";

describe("PAY-197 offboarding", () => {
  it("T1 days since separation", () => {
    const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
    expect(daysSinceSeparation(d("2026-11-01"), new Date("2026-11-01T15:00:00Z"))).toBe(0);
    expect(daysSinceSeparation(d("2026-11-01"), d("2026-12-01"))).toBe(30);
    expect(daysSinceSeparation(d("2026-12-05"), d("2026-12-01"))).toBe(0);
    expect(FINAL_PAY_DAYS).toBe(30);
  });

  it("T2 menu and pages", () => {
    const nav = readFileSync("src/components/sidebar-nav.tsx", "utf8");
    expect(nav).toContain('label: "Offboarding"');
    expect(nav).toContain('{ href: "/offboarding", label: "Cases"');
    expect(nav).toContain('{ href: "/offboarding/checklist", label: "Clearance Checklist"');
    expect(readFileSync("src/app/(dashboard)/offboarding/page.tsx", "utf8")).toContain("/api/offboarding/my-items");
    expect(readFileSync("src/app/(dashboard)/offboarding/checklist/page.tsx", "utf8")).toContain("/api/offboarding/clearance-template");
  });
});
