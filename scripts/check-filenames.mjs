#!/usr/bin/env node
// Unit 0.16: refuse newly ADDED files whose NAMES look like a pasted command,
// and new files at the repository root that nobody has said belong there.
//
// Why a name check: unit 0.8's leak was two stray files at the repo root named
// after the shell command that produced them (`ql -h localhost -U payroll_user
// -d payroll_db -t -c SELECT ...`), and their CONTENTS were PII (an HR admin's
// email, a roleId, a live tenantId), not secrets. Both were scanned with the
// 0.9 config and with stock gitleaks: "no leaks found". No credential scanner
// would ever flag them. Their names gave them away immediately.
//
// Only ADDED paths are checked, so existing files never block a commit.
//
// Usage:
//   node scripts/check-filenames.mjs --staged         # pre-commit hook
//   node scripts/check-filenames.mjs --range A..B     # CI, the PR's commits
//   node scripts/check-filenames.mjs path [path ...]  # ad hoc
// Exit 0 clean, 1 findings, 2 usage error.
// Bypass, deliberately: SKIP_FILENAME_GUARD=1, or `git commit --no-verify`.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * Files allowed at the repository root. Adding one here is the deliberate act
 * the guard exists to force: a new root file is either config the project
 * needs, or something that was meant for a folder (or for nobody).
 */
export const TOP_LEVEL_ALLOWLIST = new Set([
  ".gitattributes",
  ".gitignore",
  ".gitleaks.toml",
  ".nvmrc",
  ".node-version",
  ".npmrc",
  ".editorconfig",
  ".prettierrc",
  ".prettierignore",
  ".env.example",
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "LICENSE",
  "ai_coding_prompt.md",
  "components.json",
  "eslint.config.mjs",
  "mockup.html",
  "next.config.ts",
  "next-env.d.ts",
  "package-lock.json",
  "package.json",
  "postcss.config.mjs",
  "prisma.config.ts",
  "railpack.json",
  "tsconfig.json",
  "vitest.config.ts",
]);

/** Each rule: [id, test(path) -> boolean, why]. Next.js route groups `(x)` and segments `[id]` are legitimate. */
const RULES = [
  ["shell-flag", (p) => /(^|\s)-{1,2}[A-Za-z][\w-]*(\s|$)/.test(p) && /\s/.test(p), "contains a command-line flag such as ' -h '"],
  ["sql-keyword", (p) => /(^|[\s/])(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|LIMIT|DROP|ALTER|GRANT|TRUNCATE)(\s|$)/.test(p), "contains an upper-case SQL keyword as a word"],
  ["db-tool", (p) => /(^|[\s/])(psql|pg_dump|pg_restore|mysql|mongosh|redis-cli|curl|wget)(\s|$)/i.test(p), "contains a database or network command name as a word"],
  // A lone "&" is allowed: "Tech Stack & Architecture.md" is a real doc name.
  ["quote-or-metachar", (p) => /['"`;|$<>\\*?=]|&&/.test(p), "contains a quote or shell metacharacter"],
  ["control-char", (p) => /[\u0000-\u001f\u007f]/.test(p), "contains a control character or newline"],
  ["dot-segment", (p) => p.split("/").some((s) => s === ".." || s === "."), "contains a . or .. path segment"],
];

export function checkPaths(paths) {
  const findings = [];
  for (const p of paths) {
    if (!p) continue;
    for (const [id, test, why] of RULES) {
      if (test(p)) findings.push({ path: p, rule: id, why });
    }
    if (!p.includes("/") && !TOP_LEVEL_ALLOWLIST.has(p)) {
      findings.push({
        path: p,
        rule: "top-level-file",
        why: "is a new file at the repository root that is not on the allowlist in scripts/check-filenames.mjs",
      });
    }
  }
  return findings;
}

function git(args) {
  // -z: NUL-separated, so names with spaces or newlines arrive intact.
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter(Boolean);
}

export function addedPaths(argv) {
  if (argv[0] === "--staged") return git(["diff", "--cached", "--name-only", "--diff-filter=A", "-z"]);
  if (argv[0] === "--range") {
    if (!argv[1] || !argv[1].includes("..")) throw new Error("--range needs BASE..HEAD");
    return git(["diff", "--name-only", "--diff-filter=A", "-z", argv[1]]);
  }
  return argv;
}

function main() {
  if (process.env.SKIP_FILENAME_GUARD === "1") {
    console.error("[filename-guard] SKIPPED via SKIP_FILENAME_GUARD=1.");
    return 0;
  }
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error("usage: check-filenames.mjs --staged | --range BASE..HEAD | path...");
    return 2;
  }
  const paths = addedPaths(argv);
  const findings = checkPaths(paths);
  if (findings.length === 0) {
    console.log(`[filename-guard] ${paths.length} added path(s) checked, clean.`);
    return 0;
  }
  console.error(`\n[filename-guard] BLOCKED: ${findings.length} problem(s) in the names of added files.\n`);
  for (const f of findings) console.error(`  ${JSON.stringify(f.path)}\n      ${f.rule}: ${f.why}`);
  console.error(
    [
      "",
      "WHAT TO DO",
      "  1. A file named like a command is usually command OUTPUT saved by accident.",
      "     Unstage it and delete it:  git rm --cached -- <file>  then remove it.",
      "     Check its CONTENTS too: such files often hold personal data, which no",
      "     secret scanner flags.",
      "  2. A real new root file: add its name to TOP_LEVEL_ALLOWLIST in",
      "     scripts/check-filenames.mjs, in the same commit, and say why.",
      "  3. Deliberately, having read the above:  git commit --no-verify",
      "",
    ].join("\n"),
  );
  return 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    process.exit(main());
  } catch (e) {
    console.error(`[filename-guard] ${e && e.message ? e.message : e}`);
    process.exit(2);
  }
}
