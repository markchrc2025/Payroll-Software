/**
 * PAY-162 (Mark, 17 Nov 2026 10:13): "Permanently delete that /admin."
 *
 * The old /admin pages (Dashboard, Tenants, Statutory Rules, Audit Log) were
 * a leftover from the original code, never linked, replaced by the Central
 * Portal (/centralportal).
 *
 *   A1  (T1) no page in the app is served under /admin any more.
 *   A2  their sidebar and the two APIs only they used (/api/admin/dashboard,
 *       /api/admin/audit-log) are gone.
 *   A3  nothing in the app links or redirects to /admin.
 *   A4  the data APIs the Central Portal uses are still there.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

/** The URL path a page or route file serves: route groups "(x)" do not count. */
function urlOf(file: string): string {
  const rel = file.replace(/^src\/app/, "").split("/").slice(0, -1);
  return "/" + rel.filter((seg) => seg && !/^\(.*\)$/.test(seg)).join("/");
}

describe("PAY-162 the old /admin pages are deleted", () => {
  const app = files("src/app");

  it("A1 (T1) no page is served under /admin", () => {
    const pages = app.filter((f) => /\/(page|layout|route)\.tsx?$/.test(f));
    expect(pages.length).toBeGreaterThan(50); // vacuity guard
    const admin = pages.filter((f) => /^\/admin(\/|$)/.test(urlOf(f)));
    expect(admin).toEqual([]);
    expect(existsSync("src/app/(admin)")).toBe(false);
  });

  it("A2 their sidebar and the two APIs only they used are gone", () => {
    expect(existsSync("src/components/admin")).toBe(false);
    expect(existsSync("src/app/api/admin/dashboard")).toBe(false);
    expect(existsSync("src/app/api/admin/audit-log")).toBe(false);
  });

  it("A3 nothing links or redirects to /admin", () => {
    const src = files("src").filter((f) => /\.(ts|tsx|mjs)$/.test(f) && !f.includes("__tests__"));
    const hits = src.filter((f) => /["'`]\/admin(\/|["'`?])/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  it("A4 the Central Portal's data APIs stay", () => {
    for (const r of [
      "statutory/sss",
      "statutory/philhealth",
      "statutory/pagibig",
      "statutory/bir",
      "statutory/deminimis",
      "statutory/minwage",
      "tenants",
      "billing/invoices",
      "support/tickets",
      "central-users",
      "central-roles",
    ]) {
      expect(existsSync(`src/app/api/admin/${r}/route.ts`), r).toBe(true);
    }
  });
});
