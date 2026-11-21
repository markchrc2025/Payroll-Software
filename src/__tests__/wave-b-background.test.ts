/**
 * Wave B (PAY-212): the background pages' rules that need no database.
 *
 *   T1  expiry status against the as-of date and window (fails on main: no
 *       src/lib/background/report.ts).
 *   T2  the sidebar's four Employees entries open the pages.
 *   T3  a background Profile Request reads as one line for HR and ESS.
 *   T4  the CSV quotes what needs quoting and matches the page's columns.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/lookups/store", () => ({ listItems: vi.fn() }));
import { expiryStatus } from "@/lib/background/report";
import { backgroundCsv } from "@/lib/background/report-view";
import { describeBackground } from "@/lib/background/entry-view";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("Wave B background pages", () => {
  it("T1 expiry status", () => {
    const asOf = d("2026-11-21");
    expect(expiryStatus(d("2026-11-20"), asOf, 60)).toBe("Expired");
    expect(expiryStatus(d("2026-11-21"), asOf, 60)).toBe("Expiring");
    expect(expiryStatus(d("2027-01-20"), asOf, 60)).toBe("Expiring");
    expect(expiryStatus(d("2027-01-21"), asOf, 60)).toBe("Valid");
    expect(expiryStatus(null, asOf, 60)).toBe("No expiry");
  });

  it("T2 the sidebar opens the pages", () => {
    const nav = readFileSync("src/components/sidebar-nav.tsx", "utf8");
    for (const k of ["education", "experience", "training", "legal-documents"]) {
      expect(nav).toContain(`href: "/background/${k}"`);
      expect(nav).not.toContain(`"#soon-${k}"`);
    }
  });

  it("T3 a background request in one line", () => {
    expect(describeBackground("background.education", JSON.stringify({ school: "Ateneo GSB", degree: "MBA", startYear: "2022", endYear: "" }))).toBe("Ateneo GSB, MBA, 2022 to present");
    expect(describeBackground("background.experience", JSON.stringify({ companyName: "SGV", position: "Auditor", startDate: "2018-06-01" }))).toBe("Auditor, at SGV, 2018-06-01 to present");
    expect(describeBackground("background.training", JSON.stringify({ title: "OSH", hours: 40 }))).toBe("OSH, 40 hr");
  });

  it("T4 the CSV", () => {
    const csv = backgroundCsv({ kind: "training", title: "Training", asOf: "2026-11-21", withinDays: 60, counts: {},
      columns: [{ key: "employeeName", label: "Employee" }, { key: "title", label: "Training" }],
      rows: [{ employeeName: "Cruz, Ana", title: 'Say "hi"' }] });
    expect(csv).toBe('Employee,Training\r\n"Cruz, Ana","Say ""hi"""\r\n');
  });
});
