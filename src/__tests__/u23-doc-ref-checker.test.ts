/**
 * Unit 0.23: a `file:line` reference checker for docs (R110).
 *
 * Unit 0.11 found doc citations rotting on the first edit above them. The
 * checker parses `path:NN` citations in docs/** and checks each still points
 * at a tracked file and an existing line, and, where the doc writes
 * `(expects `token`)` after it, that the token is on the cited line.
 *
 *   D1  citation forms: single line, range, comma list, en dash, backtick
 *       spans with spaces in the path, and the optional expectation.
 *   D2  path resolution: exact, unique suffix, ambiguous, missing.
 *   D3  findings: missing-file, ambiguous, out-of-range, token-missing; a
 *       correct citation and a met expectation produce none.
 *   D4  the repository's own docs are clean (CI runs this with --strict), and
 *       the dated ledger docs/DECISIONS.md is excluded by default.
 *   D5  its first real catch: RUNBOOK_CREDENTIAL_ROTATION cited `auth.ts:35`,
 *       which matched two files and no longer pointed at a prismaAdmin call.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  parseLines,
  findCitations,
  resolvePath,
  checkDocs,
  EXCLUDED_DOCS,
} from "../../scripts/check-doc-refs.mjs";

const ROOT = resolve(__dirname, "../..");

describe("unit 0.23: citation parsing (D1)", () => {
  it("parses single lines, ranges, comma lists and en dashes", () => {
    expect(parseLines("54")).toEqual([[54, 54]]);
    expect(parseLines("20-22")).toEqual([[20, 22]]);
    expect(parseLines("12,115")).toEqual([[12, 12], [115, 115]]);
    expect(parseLines("3–5")).toEqual([[3, 5]]);
  });

  it("finds plain and backticked citations, including paths with spaces", () => {
    const md = [
      "See src/lib/prisma.ts:54 and `scripts/start.sh:20-22`.",
      "Also `.github/workflows/db-backup.yml:12,115` and `docs/Payroll Engine_Test_Spec.md:18`.",
    ].join("\n");
    expect(findCitations(md).map((c: { docLine: number; path: string; spec: string }) => [c.docLine, c.path, c.spec])).toEqual([
      [1, "scripts/start.sh", "20-22"],
      [1, "src/lib/prisma.ts", "54"],
      [2, ".github/workflows/db-backup.yml", "12,115"],
      [2, "docs/Payroll Engine_Test_Spec.md", "18"],
    ]);
  });

  it("reads an optional (expects `token`) after a citation", () => {
    const [c] = findCitations("Login: `src/auth.ts:100` (expects `prismaAdmin`) does it.");
    expect(c.expect).toBe("prismaAdmin");
  });

  it("does not take version numbers, times or URLs for citations", () => {
    expect(findCitations("Postgres 18.4 at 10:30, https://example.com:443/x, node v24.22.1")).toEqual([]);
  });
});

describe("unit 0.23: resolution and findings (D2, D3)", () => {
  const tracked = new Set(["src/auth.ts", "src/lib/auth.ts", "src/lib/prisma.ts", "docs/a.md"]);
  const files: Record<string, string> = {
    "src/lib/prisma.ts": "line1\nconst url = runtimeDatabaseUrl();\nline3\n",
  };
  const run = (md: string) =>
    checkDocs({ docs: ["docs/a.md"], tracked, read: (f: string) => (f === "docs/a.md" ? md : files[f]) });

  it("D2 resolves exact paths and unique suffixes; flags ambiguous and missing", () => {
    expect(resolvePath("src/lib/prisma.ts", tracked)).toEqual({ file: "src/lib/prisma.ts" });
    expect(resolvePath("prisma.ts", tracked)).toEqual({ file: "src/lib/prisma.ts" });
    expect(resolvePath("auth.ts", tracked).ambiguous).toEqual(["src/auth.ts", "src/lib/auth.ts"]);
    expect(resolvePath("gone.ts", tracked)).toEqual({});
  });

  it("D3 a correct citation and a met expectation are clean", () => {
    expect(run("`prisma.ts:2` (expects `runtimeDatabaseUrl`)").findings).toEqual([]);
  });

  it.each([
    ["`gone.ts:1`", "missing-file"],
    ["`auth.ts:1`", "ambiguous"],
    ["`prisma.ts:4`", "out-of-range"],
    ["`prisma.ts:1-9`", "out-of-range"],
    ["`prisma.ts:2` (expects `DIRECT_DATABASE_URL`)", "token-missing"],
  ])("D3 %s is %s", (md, kind) => {
    expect(run(md).findings.map((f: { kind: string }) => f.kind)).toEqual([kind]);
  });
});

describe("unit 0.23: this repository (D4, D5)", () => {
  it("D4 the docs are clean, and the dated ledger is excluded by default", () => {
    const out = JSON.parse(
      execFileSync("node", ["scripts/check-doc-refs.mjs", "--json"], { cwd: ROOT, encoding: "utf8" }),
    );
    expect(out.citations).toBeGreaterThan(40);
    expect(out.findings).toEqual([]);
    expect(EXCLUDED_DOCS.has("docs/DECISIONS.md")).toBe(true);
  });

  it("D5 the rotation runbook now cites the prismaAdmin login lookup exactly", () => {
    const tracked = new Set(
      execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean),
    );
    expect(resolvePath("auth.ts", tracked).ambiguous).toBeDefined();
    const md = readFileSync(join(ROOT, "docs/RUNBOOK_CREDENTIAL_ROTATION.md"), "utf8");
    const cites = findCitations(md).filter((c: { path: string }) => c.path.endsWith("auth.ts"));
    expect(cites.length).toBeGreaterThan(0);
    expect(cites.every((c: { path: string; expect: string | null }) => c.path === "src/auth.ts" && c.expect === "prismaAdmin")).toBe(true);
  });
});
