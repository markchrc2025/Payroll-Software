/**
 * PAY-197 part 2: the portal is reachable without a staff or ESS sign-in
 * (it has its own), and its writes count as a principal in the audit.
 *
 *   T1  the proxy lets /offboard-portal and /api/offboard-portal/ through
 *       (fails on main: no portal).
 *   T2  the page, and HR's "Send portal link".
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PAY-197 portal wiring", () => {
  it("T1 public paths and the audit", () => {
    const proxy = readFileSync("src/proxy.ts", "utf8");
    expect(proxy).toContain('path.startsWith("/api/offboard-portal/")');
    expect(proxy).toContain('path.startsWith("/offboard-portal")');
    const audit = readFileSync("docs/WRITE_PATH_AUDIT.md", "utf8");
    expect(audit).toContain("| PORTAL_SESSION | 3 |");
    expect(audit).toContain("offboarding portal sign-in: the single-use link is the principal");
  });
  it("T2 page and link", () => {
    expect(readFileSync("src/app/offboard-portal/page.tsx", "utf8")).toContain("/api/offboard-portal/session");
    expect(readFileSync("src/app/(dashboard)/offboarding/page.tsx", "utf8")).toContain('data-testid="send-portal-link"');
  });
});
