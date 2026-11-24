/**
 * Menu split (Mark, 25 Nov 2026 00:15): "Employer" becomes "Organization",
 * Assets moves to Employee, and the set-up pages leave the menus for one
 * Settings hub of cards, with the company lists on one tabbed page.
 */
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIST_KEYS } from "@/lib/lookups/registry";
import { LIST_TAB_ORDER, SETTINGS_GROUPS, SETTINGS_HUB_HREF, SETTINGS_LISTS_HREF, SETTINGS_PATHS } from "@/lib/settings-hub";

const nav = readFileSync("src/components/sidebar-nav.tsx", "utf8");
const section = (label: string) => {
  const start = nav.indexOf(`label: "${label}",\n    items:`);
  expect(start, `section ${label}`).toBeGreaterThan(-1);
  const rest = nav.slice(start);
  return rest.slice(0, rest.indexOf("\n  },"));
};
const hrefs = (text: string) => [...text.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);

const SETUP_HREFS = [
  "/settings/ownership", "/settings/employee-id", "/settings/storage", "/settings/roles",
  "/approval-roles", "/approval-workflows",
  "/settings/pay-rules", "/settings/premium-rates", "/settings/holidays", "/settings/bir-signatory",
  "/settings/kiosk",
];

describe("menu split", () => {
  it("T1 the Organization menu replaces Employer, in the approved order", () => {
    expect(nav).not.toContain('label: "Employer"');
    expect(hrefs(section("Organization"))).toEqual([
      "/settings", "/branches", "/work-locations", "/departments", "/positions", "/levels", "/job-types-statuses", "/org-chart",
    ]);
  });

  it("T2 Assets is in the Employee menu", () => {
    expect(hrefs(section("Employee"))).toContain("/assets");
    expect(nav.match(/href: "\/assets"/g)?.length).toBe(1);
  });

  it("T3 set-up pages and lists left the menus; one Settings entry opens the hub", () => {
    for (const h of SETUP_HREFS) expect(nav).not.toContain(`href: "${h}"`);
    expect(nav).not.toContain('href: "/settings/lists/');
    expect(section("Settings")).toContain("href: SETTINGS_HUB_HREF");
    expect(SETTINGS_HUB_HREF).toBe("/setup");
    expect(nav).toContain("also: SETTINGS_PATHS");
  });

  it("T4 the hub has the approved groups and cards, each page existing", () => {
    expect(SETTINGS_GROUPS.map((g) => g.title)).toEqual(["Company", "Approvals", "Payroll setup", "Attendance", "Lists"]);
    const cards = SETTINGS_GROUPS.flatMap((g) => g.links.map((l) => l.href));
    expect(cards).toEqual([...SETUP_HREFS, SETTINGS_LISTS_HREF]);
    for (const h of cards) expect(existsSync(`src/app/(dashboard)${h}/page.tsx`), h).toBe(true);
    expect(existsSync("src/app/(dashboard)/setup/page.tsx")).toBe(true);
    for (const h of cards) expect(SETTINGS_PATHS).toContain(h);
  });

  it("T5 the Lists page has a tab for every list, in the approved order", () => {
    expect(LIST_TAB_ORDER.slice(0, 11)).toEqual([
      "BANK", "COURSE", "TRAINER", "ETHNICITY", "RELIGION", "DOCUMENT_CATEGORY",
      "EXPENSE_CATEGORY", "EXPENSE_TYPE", "INCIDENT_CATEGORY", "INCIDENT_TYPE", "INCIDENT_DECISION",
    ]);
    expect([...LIST_TAB_ORDER].sort()).toEqual([...LIST_KEYS].sort());
    const page = readFileSync("src/app/(dashboard)/setup/lists/page.tsx", "utf8");
    expect(page).toContain("<ListEditor key={current} list={current} />");
  });
});
