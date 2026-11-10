/**
 * PAY-54 (unit 0.7 follow-up): operator scripts connect ONLY as the owner role.
 *
 * After the runtime switch (#250, PAY-50) DATABASE_URL is payroll_app, which
 * RLS confines to one tenant and, with no tenant set, to nothing. Four
 * operator scripts fell back to DATABASE_URL when DIRECT_DATABASE_URL was
 * missing, so they would run against an apparently EMPTY database (a purge
 * that purges nothing, a statutory load that checks nothing) instead of
 * stopping.
 *
 *   O1  (static) no script or library falls back from DIRECT_DATABASE_URL to
 *       DATABASE_URL any more.
 *   O2  (real run) each script, started with only DATABASE_URL set, stops with
 *       the 0.7 message before it connects to anything.
 */
import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Each script with arguments that get it past its own argument checks. */
const SCRIPTS: [string, string[]][] = [
  ["scripts/create-super-admin.ts", ["--email=o2@pay54.test", "--firstName=O2", "--lastName=Test", "--password=not-a-real-one-0"]],
  ["scripts/load-statutory-2026.ts", ["--dry-run"]],
  ["scripts/purge-biometric.ts", ["--dry-run"]],
  ["scripts/purge-seeded-test-data.ts", []],
];

describe("PAY-54: operator scripts use the owner URL only", () => {
  it("O1 nothing falls back from DIRECT_DATABASE_URL to DATABASE_URL", () => {
    const files = execSync("git ls-files 'scripts/*' 'src/**/*.ts'", { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter((f) => /\.(ts|mjs|js)$/.test(f) && !f.includes("__tests__"));
    const fallback = /DIRECT_DATABASE_URL\s*(\?\?|\|\|)\s*process\.env\.DATABASE_URL/;
    expect(files.filter((f) => fallback.test(readFileSync(f, "utf8")))).toEqual([]);
  });

  it("O2 each script refuses to run with only DATABASE_URL set", () => {
    for (const [script, args] of SCRIPTS) {
      const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: "postgresql://payroll_app:x@127.0.0.1:1/none", DOTENV_CONFIG_PATH: "/nonexistent" };
      delete env.DIRECT_DATABASE_URL;
      const run = spawnSync("npx", ["tsx", script, ...args], { env, encoding: "utf8", timeout: 60_000 });
      expect(run.status, `${script} must exit non-zero`).not.toBe(0);
      expect(run.stderr + run.stdout, `${script} must name the missing owner URL`).toContain("DIRECT_DATABASE_URL is not set");
    }
  }, 240_000);
});
