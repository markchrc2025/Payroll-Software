/**
 * Unit 0.16: a filename guard in the pre-commit hook and in CI.
 *
 * Unit 0.8's leak was two stray root files named after the psql command that
 * produced them, holding an HR admin's email, a roleId and a live tenantId.
 * Both were scanned with the 0.9 config and stock gitleaks: "no leaks found",
 * because none of that is a secret. Their names gave them away.
 *
 *   F1  names shaped like the 0.8 leak are refused (shape kept, identifiers
 *       replaced: the real names carry a live tenantId, and re-committing it
 *       in a test would repeat the leak). The real names were also checked
 *       locally against this script: both refused by four rules each.
 *   F2  every file tracked today passes, so only genuinely odd names block
 *       (vacuity guard: the corpus is the whole repository).
 *   F3  a new root file not on the allowlist is refused; an allowlisted one
 *       and any file in a folder pass.
 *   F4  Next.js route groups `(x)`, segments `[id]`, `@2x` assets and spaces
 *       in doc names are not false positives.
 *   F5  --staged sees only ADDED files: an existing odd name never blocks.
 *   F6  the real hook blocks such a commit, even with SKIP_SECRET_SCAN=1, and
 *       SKIP_FILENAME_GUARD=1 lets it through (deliberate bypass).
 *   F7  --range reports what a commit range adds (the CI step).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, beforeAll, afterAll } from "vitest";

import { checkPaths, TOP_LEVEL_ALLOWLIST } from "../../scripts/check-filenames.mjs";

const ROOT = resolve(__dirname, "../..");
const SCRIPT = join(ROOT, "scripts/check-filenames.mjs");
const HOOK = join(ROOT, ".githooks/pre-commit");

const rules = (p: string): string[] => checkPaths([p]).map((f) => String(f.rule));

describe("unit 0.16: which names are refused", () => {
  it.each([
    ['ql -h localhost -U payroll_user -d payroll_db -t -c SELECT id, email FROM "User" WHERE "tenantId" = \'ctenant0000\' LIMIT 5;'],
    ["psql -c SELECT 1"],
    ["pg_dump --data-only payroll_db"],
    ["out.txt; rm -rf ."],
    ["docs/notes $(whoami).md"],
  ])("F1 refuses %j", (name) => {
    expect(rules(name).length).toBeGreaterThan(0);
  });

  it("F1b the 0.8-shaped name trips every relevant rule", () => {
    const name = 'ql -h localhost -U payroll_user -d payroll_db -t -c SELECT id FROM "User" LIMIT 5;';
    expect(rules(name).sort()).toEqual(["quote-or-metachar", "shell-flag", "sql-keyword", "top-level-file"]);
  });

  it("F2 every file tracked today passes (the whole repository is the corpus)", () => {
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
    expect(tracked.length).toBeGreaterThan(500);
    expect(checkPaths(tracked)).toEqual([]);
  });

  it("F3 a new root file must be allowlisted; files in folders need not be", () => {
    expect(rules("notes.txt")).toEqual(["top-level-file"]);
    expect(rules("dump.sql")).toEqual(["top-level-file"]);
    expect(TOP_LEVEL_ALLOWLIST.has("package.json")).toBe(true);
    expect(rules("package.json")).toEqual([]);
    expect(rules("docs/notes.txt")).toEqual([]);
  });

  it.each([
    ["src/app/(dashboard)/employees/[id]/edit/page.tsx"],
    ["public/brand/logo@2x.png"],
    ["docs/Sentire Payroll Tech Stack & Architecture.md"],
    ["src/app/api/leave-transactions/[id]/delete/route.ts"],
    ["docs/Phase-1 plan.md"],
  ])("F4 accepts %j", (name) => {
    expect(rules(name)).toEqual([]);
  });
});

describe("unit 0.16: the hook and the CI range, in a real git repository", () => {
  let repo: string;
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } });
  const LEAKY = "ql -h localhost -U x -d y -t -c SELECT 1 LIMIT 5;";

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "u16-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "u16@test.local");
    git("config", "user.name", "u16");
    mkdirSync(join(repo, "scripts"));
    mkdirSync(join(repo, ".githooks"));
    copyFileSync(SCRIPT, join(repo, "scripts/check-filenames.mjs"));
    copyFileSync(HOOK, join(repo, ".githooks/pre-commit"));
    // An odd name that already exists must never block later commits.
    writeFileSync(join(repo, "package.json"), "{}\n");
    git("add", "package.json", "scripts", ".githooks");
    git("commit", "-q", "--no-verify", "-m", "base");
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  const runHook = (env: Record<string, string> = {}) =>
    spawnSync("bash", [".githooks/pre-commit"], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, SKIP_SECRET_SCAN: "1", ...env },
    });

  it("F5 --staged checks only added files", () => {
    writeFileSync(join(repo, "package.json"), '{"changed":true}\n');
    git("add", "package.json");
    const r = spawnSync("node", ["scripts/check-filenames.mjs", "--staged"], { cwd: repo, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/0 added path\(s\) checked, clean/);
    git("commit", "-q", "--no-verify", "-m", "modify");
  });

  it("F6 the hook blocks a command-named file, even with SKIP_SECRET_SCAN=1", () => {
    writeFileSync(join(repo, LEAKY), "id | email\n");
    git("add", "--", LEAKY);
    const blocked = runHook();
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toMatch(/\[filename-guard\] BLOCKED/);
    expect(blocked.stderr).toMatch(/shell-flag/);

    const bypassed = runHook({ SKIP_FILENAME_GUARD: "1" });
    expect(bypassed.status).toBe(0);
    git("rm", "-q", "--cached", "--", LEAKY);
    rmSync(join(repo, LEAKY));
  });

  it("F7 --range reports what the range adds (the CI step)", () => {
    const base = git("rev-parse", "HEAD").trim();
    writeFileSync(join(repo, "stray.txt"), "x\n");
    mkdirSync(join(repo, "docs"), { recursive: true });
    writeFileSync(join(repo, "docs/ok.md"), "x\n");
    git("add", "stray.txt", "docs/ok.md");
    git("commit", "-q", "--no-verify", "-m", "add");
    const r = spawnSync("node", ["scripts/check-filenames.mjs", "--range", `${base}..HEAD`], { cwd: repo, encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/"stray\.txt"\s+top-level-file/);
    expect(r.stderr).not.toMatch(/docs\/ok\.md/);
  });
});
