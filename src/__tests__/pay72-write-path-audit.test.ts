/**
 * PAY-72 (1.17, decision Q9b): the write-path principal audit, report only.
 *
 *   T1  the principal is read from what the handler calls; a handler that
 *       calls nothing recognised is NONE (fails on main: no audit).
 *   T2  every POST, PUT, PATCH and DELETE handler under src/app/api is in the
 *       report, counted apart from the script; today none is NONE.
 *   T3  every pg-boss job handler is in the report.
 *   T4  docs/WRITE_PATH_AUDIT.md is the script's current output.
 *   T5  PAY-205, the gate: no write handler checks a session without refusing
 *       a missing one, and every job that writes records the SYSTEM principal
 *       (fails on main: jobs record none).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditJobs, auditRoutes, classify, refuses, renderReport } from "../../scripts/audit/write-paths.mjs";

type Row = { route: string; method: string; principal: string; evidence: string };
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n)]));

describe("PAY-72 write-path principal audit", () => {
  it("T1 classify", () => {
    expect(classify("const auth = await getAuthContext(req);").principal).toBe("USER_SESSION");
    expect(classify("const g = await requireApprover(req, 'OT');").principal).toBe("USER_SESSION");
    expect(classify("const ess = await getEssContext(req);").principal).toBe("ESS_SESSION");
    expect(classify("await requireCentralPermission(req, 'X');").principal).toBe("CENTRAL_ADMIN");
    expect(classify("const deviceToken = h.slice(6)").principal).toBe("KIOSK_DEVICE");
    expect(classify("await prisma.user.update({ where: { id } })")).toEqual({ principal: "NONE", evidence: "" });
  });

  it("T2 every write handler is reported, and none is unowned", () => {
    const rows = auditRoutes() as Row[];
    let expected = 0;
    for (const f of files("src/app/api").filter((x) => x.endsWith("route.ts"))) {
      const src = readFileSync(f, "utf8");
      expected += (src.match(/export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\s*\(/g) ?? []).length;
      expected += (src.match(/export\s+const\s+(POST|PUT|PATCH|DELETE)\s*=/g) ?? []).length;
      // Re-exports would hide a handler from the audit; there must be none.
      expect(src).not.toMatch(/export\s*\{[^}]*\b(POST|PUT|PATCH|DELETE)\b/);
    }
    expect(rows.length).toBe(expected);
    expect(rows.filter((r) => r.principal === "NONE").map((r) => `${r.method} ${r.route}`)).toEqual([]);
    expect(rows.find((r) => r.route === "/api/kiosk/punch")?.principal).toBe("KIOSK_DEVICE");
    expect(rows.find((r) => r.route === "/api/admin/statutory/sss" && r.method === "POST")?.principal).toBe("CENTRAL_ADMIN");
    expect(rows.find((r) => r.route === "/api/ess/auth")?.principal).toBe("PUBLIC_BY_DESIGN");
  });

  it("T3 every job handler is reported", () => {
    const jobs = auditJobs() as { handler: string }[];
    expect(jobs.map((j) => j.handler).sort()).toEqual(
      readdirSync("src/lib/jobs/handlers").filter((n) => n.endsWith(".ts")).map((n) => `src/lib/jobs/handlers/${n}`).sort(),
    );
  });

  it("T4 the committed report is current", () => {
    expect(readFileSync("docs/WRITE_PATH_AUDIT.md", "utf8")).toBe(renderReport(auditRoutes(), auditJobs()));
    expect(execFileSync("node", ["scripts/audit/write-paths.mjs", "--check"], { encoding: "utf8" })).toContain("report is current");
  });

  it("T5 PAY-205 the gate", () => {
    expect(refuses("const auth = await getAuthContext(req);\n if (!auth) return unauthorized();")).toBe(true);
    expect(refuses("const guard = await requirePermission(req, 'X', 'Y');\n if (guard instanceof Response) return guard;")).toBe(true);
    expect(refuses("const auth = await getAuthContext(req);\n await prisma.x.update({ where: { id: auth?.userId } });")).toBe(false);
    const rows = auditRoutes() as (Row & { refuses: boolean | null })[];
    expect(rows.filter((r) => r.refuses === false).map((r) => `${r.method} ${r.route}`)).toEqual([]);
    const jobs = auditJobs() as { handler: string; writes: boolean; principal: string }[];
    expect(jobs.filter((j) => j.writes && j.principal !== "SYSTEM (recorded)").map((j) => j.handler)).toEqual([]);
    expect(jobs.filter((j) => j.writes)).toHaveLength(5);
  });
});
