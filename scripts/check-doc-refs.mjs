#!/usr/bin/env node
// Unit 0.23: check `path:NN` citations in the docs still point at something.
//
// Unit 0.11 found documentation citing code by file and line, and the
// citations rotting on the first edit above them. This parses every
// `path:NN`, `path:NN-MM` and `path:NN,MM` citation in docs/**/*.md and checks:
//   missing-file   the path does not resolve to a tracked file
//   ambiguous      a bare file name matches more than one tracked file
//   out-of-range   the cited line is past the end of the file
//   token-missing  an explicit expectation is not on the cited line
//
// Explicit expectation (optional): write the citation as
//   `src/lib/prisma.ts:54` (expects `runtimeDatabaseUrl`)
// and the checker requires that token on line 54 (or within a cited range).
//
// docs/DECISIONS.md is EXCLUDED by default: it is an append-only ledger, and a
// citation there is true as of its date. Rewriting it to follow the code would
// destroy the record of what was believed when.
//
// Usage:
//   node scripts/check-doc-refs.mjs            # report, exit 0
//   node scripts/check-doc-refs.mjs --strict   # exit 1 on any finding
//   node scripts/check-doc-refs.mjs --json     # machine-readable
//   node scripts/check-doc-refs.mjs --all      # include docs/DECISIONS.md (informational)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const EXCLUDED_DOCS = new Set(["docs/DECISIONS.md"]);

const EXT = "ts|tsx|mts|mjs|cjs|js|jsx|sh|yml|yaml|md|sql|json|toml|prisma|css|html|tmpl";
// path:LINE, path:A-B (hyphen or en dash), path:A,B,C
const CITE = new RegExp(
  String.raw`(?<![\w/.\-\[\]()@])((?:[\w.\-\[\]()@]+/)*[\w.\-\[\]()@]+\.(?:${EXT})):(\d+(?:\s*[-–]\s*\d+)?(?:,\s*\d+(?:\s*[-–]\s*\d+)?)*)`,
  "g",
);
// A whole backtick span that is one citation may contain spaces in the path:
// `docs/Payroll Engine_Test_Spec.md:18`.
const TICKED = new RegExp(String.raw`^\s*(.+?\.(?:${EXT})):(\d+(?:\s*[-\u2013]\s*\d+)?(?:,\s*\d+(?:\s*[-\u2013]\s*\d+)?)*)\s*$`);
const EXPECT = /^`?\s*\(expects\s+`([^`]+)`\)/;

/** "12", "20-22", "12,115" -> [[12,12],[20,22],[12,12],[115,115]] */
export function parseLines(spec) {
  return spec.split(",").map((part) => {
    const [a, b] = part.split(/[-–]/).map((x) => parseInt(x.trim(), 10));
    return [a, Number.isFinite(b) ? b : a];
  });
}

export function findCitations(markdown) {
  const out = [];
  const lines = markdown.split("\n");
  lines.forEach((text, i) => {
    const push = (path, spec, endIdx) => {
      const exp = text.slice(endIdx).match(EXPECT);
      out.push({ docLine: i + 1, path, spec, ranges: parseLines(spec), expect: exp ? exp[1] : null });
    };
    // 1. Backtick spans that are exactly one citation (paths may have spaces).
    const taken = [];
    for (const m of text.matchAll(/`([^`]+)`/g)) {
      const t = m[1].match(TICKED);
      if (!t) continue;
      taken.push([m.index, m.index + m[0].length]);
      push(t[1].trim(), t[2], m.index + m[0].length);
    }
    // 2. Everything else, outside those spans.
    for (const m of text.matchAll(CITE)) {
      if (taken.some(([a, b]) => m.index >= a && m.index < b)) continue;
      push(m[1], m[2], m.index + m[0].length);
    }
  });
  return out;
}

/**
 * Resolve a cited path against the tracked files: exact repo-relative path,
 * else a unique suffix match ("prisma.ts" or "lib/prisma.ts").
 */
export function resolvePath(cited, tracked) {
  const clean = cited.replace(/^\.\//, "");
  if (tracked.has(clean)) return { file: clean };
  const hits = [...tracked].filter((t) => t === clean || t.endsWith("/" + clean));
  if (hits.length === 1) return { file: hits[0] };
  if (hits.length > 1) return { ambiguous: hits };
  return {};
}

export function checkDocs({ docs, tracked, read }) {
  const findings = [];
  let citations = 0;
  const lineCount = new Map();
  for (const doc of docs) {
    for (const c of findCitations(read(doc))) {
      citations++;
      const at = `${doc}:${c.docLine}`;
      const r = resolvePath(c.path, tracked);
      if (r.ambiguous) {
        findings.push({ at, cite: `${c.path}:${c.spec}`, kind: "ambiguous", detail: r.ambiguous.slice(0, 4).join(", ") });
        continue;
      }
      if (!r.file) {
        findings.push({ at, cite: `${c.path}:${c.spec}`, kind: "missing-file", detail: "no tracked file matches" });
        continue;
      }
      if (!lineCount.has(r.file)) lineCount.set(r.file, read(r.file).split("\n"));
      const body = lineCount.get(r.file);
      const n = body.length - (body[body.length - 1] === "" ? 1 : 0);
      const max = Math.max(...c.ranges.map(([, b]) => b));
      if (max > n || c.ranges.some(([a]) => a < 1)) {
        findings.push({ at, cite: `${c.path}:${c.spec}`, kind: "out-of-range", detail: `${r.file} has ${n} lines` });
        continue;
      }
      if (c.expect) {
        const hit = c.ranges.some(([a, b]) => body.slice(a - 1, b).some((l) => l.includes(c.expect)));
        if (!hit) {
          findings.push({ at, cite: `${c.path}:${c.spec}`, kind: "token-missing", detail: `expected \`${c.expect}\`` });
        }
      }
    }
  }
  return { citations, findings };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const tracked = new Set(
    execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean),
  );
  const all = args.has("--all"); // include the ledger too (informational: its citations are dated)
  const docs = [...tracked]
    .filter((f) => f.startsWith("docs/") && f.endsWith(".md") && (all || !EXCLUDED_DOCS.has(f)))
    .sort();
  const { citations, findings } = checkDocs({ docs, tracked, read: (f) => readFileSync(f, "utf8") });

  if (args.has("--json")) {
    console.log(JSON.stringify({ docs: docs.length, citations, findings }, null, 2));
  } else {
    for (const f of findings) console.log(`${f.at}  ${f.cite}  ${f.kind}: ${f.detail}`);
    console.log(
      `[doc-refs] ${docs.length} doc(s), ${citations} citation(s), ${findings.length} finding(s)` +
        (all ? " (ledger included)" : ` (excluded: ${[...EXCLUDED_DOCS].join(", ")})`),
    );
  }
  return args.has("--strict") && findings.length ? 1 : 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) process.exit(main());
