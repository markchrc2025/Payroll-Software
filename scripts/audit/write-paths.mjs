#!/usr/bin/env node
/**
 * PAY-72 (1.17, decision Q9b, Mark 17 Nov 2026: every write path has an
 * authenticated principal, including the pg-boss system principal).
 * REPORT ONLY: this lists every write path and the principal it checks; it
 * enforces nothing. Enforcement is the build half.
 *
 * Write paths:
 *   - every POST, PUT, PATCH and DELETE handler under src/app/api;
 *   - every pg-boss job handler under src/lib/jobs/handlers.
 *
 * Principals, by what the handler's own code (or a helper it imports from a
 * sibling _shared file) calls:
 *   USER_SESSION    getAuthContext, requirePermission, requireApprover
 *   ESS_SESSION     getEssContext (or the ESS passkey credential)
 *   CENTRAL_ADMIN   requireCentralPermission, getSuperAdminContext
 *   KIOSK_DEVICE    an "Authorization: Kiosk <deviceToken>" lookup
 *   PUBLIC_BY_DESIGN  a route with no principal on purpose (sign-in, password
 *                   reset, activation), each listed below with its reason
 *   NONE            nothing recognised: to be looked at
 *
 * Usage:
 *   node scripts/audit/write-paths.mjs            print the report
 *   node scripts/audit/write-paths.mjs --write    write docs/WRITE_PATH_AUDIT.md
 *   node scripts/audit/write-paths.mjs --check    exit 1 when that file is out of date
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = process.cwd();
const API = join(ROOT, "src/app/api");
const JOBS = join(ROOT, "src/lib/jobs/handlers");
const OUT = join(ROOT, "docs/WRITE_PATH_AUDIT.md");

/** Routes that are public on purpose, with the reason. Path is relative to src/app/api. */
export const PUBLIC_BY_DESIGN = {
  "auth/forgot-password/route.ts": "asks for a reset email; answers the same whether or not the account exists",
  "auth/reset-password/route.ts": "the single-use reset token is the principal",
  "auth/central-set-password/route.ts": "the single-use invitation token is the principal",
  "ess/forgot-password/route.ts": "asks for an ESS reset email",
  "ess/reset-password/route.ts": "the single-use reset token is the principal",
  "ess/activate/route.ts": "the single-use activation token is the principal",
  "ess/auth/route.ts": "ESS sign-in: the credentials are the principal",
  "ess/webauthn/authenticate/route.ts": "ESS passkey sign-in, step 1: issues a challenge",
  "ess/webauthn/authenticate/finish/route.ts": "ESS passkey sign-in, step 2: the signed challenge is the principal",
};

const RULES = [
  ["USER_SESSION", /\b(getAuthContext|requirePermission|requireApprover)\s*\(/],
  ["ESS_SESSION", /\b(getEssContext|essWebAuthnCredential)\s*\(/],
  ["CENTRAL_ADMIN", /\b(requireCentralPermission|getSuperAdminContext)\s*\(/],
  ["KIOSK_DEVICE", /deviceToken/],
];
const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/**
 * The body of `export async function NAME(` up to its matching brace, or of
 * `export const NAME = ...` up to the end of its statement; null when absent.
 */
function functionBody(src, name) {
  const arrow = new RegExp(`export\\s+const\\s+${name}\\s*=`).exec(src);
  if (arrow) {
    const end = src.indexOf("\n", arrow.index);
    return src.slice(arrow.index, end < 0 ? src.length : end);
  }
  const m = new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\s*\\(`).exec(src);
  if (!m) return null;
  const open = src.indexOf("{", src.indexOf(")", m.index));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

/** Local helpers a body calls, so `const ctx = await guard(req)` is followed one step. */
function withLocalHelpers(src, body) {
  let text = body;
  for (const call of new Set([...body.matchAll(/\b([a-zA-Z_]\w*)\s*\(/g)].map((x) => x[1]))) {
    const def = new RegExp(`(async\\s+)?function\\s+${call}\\s*\\(`).exec(src);
    if (!def || def.index === undefined) continue;
    const start = src.indexOf("{", src.indexOf(")", def.index));
    let depth = 0;
    for (let i = start; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) { text += src.slice(start, i + 1); break; }
    }
  }
  return text;
}

/** Text of sibling or parent `_shared` modules a route imports, which may hold the check. */
function sharedText(file, src) {
  let text = "";
  for (const m of src.matchAll(/from\s+["'](\.{1,2}\/[^"']*_shared)["']/g)) {
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      const p = join(dirname(file), m[1] + ext);
      if (existsSync(p)) { text += readFileSync(p, "utf8"); break; }
    }
  }
  return text;
}

export function classify(text) {
  for (const [kind, re] of RULES) {
    const hit = re.exec(text);
    if (hit) return { principal: kind, evidence: hit[1] ?? hit[0] };
  }
  return { principal: "NONE", evidence: "" };
}

export function auditRoutes() {
  const rows = [];
  for (const file of walk(API).filter((f) => f.endsWith("/route.ts"))) {
    const src = readFileSync(file, "utf8");
    const rel = relative(API, file).split("\\").join("/");
    for (const method of WRITE_METHODS) {
      const body = functionBody(src, method);
      if (body === null) continue;
      let found = classify(withLocalHelpers(src, body));
      if (found.principal === "NONE") {
        const viaShared = classify(sharedText(file, src));
        if (viaShared.principal !== "NONE") found = { ...viaShared, evidence: `${viaShared.evidence} (in _shared)` };
      }
      if (found.principal === "NONE" && PUBLIC_BY_DESIGN[rel]) found = { principal: "PUBLIC_BY_DESIGN", evidence: PUBLIC_BY_DESIGN[rel] };
      rows.push({ route: `/api/${rel.replace(/\/?route\.ts$/, "")}`, method, ...found });
    }
  }
  return rows;
}

export function auditJobs() {
  return walk(JOBS).filter((f) => f.endsWith(".ts")).map((file) => {
    const src = readFileSync(file, "utf8");
    const writes = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|\$executeRaw|finalizeRun|processRun|recomputeRun/.test(src);
    const tenantFromJob = /job\.data|\.data\s*;|\{\s*tenantId[^}]*\}\s*=\s*job/.test(src) || /data\.tenantId/.test(src);
    const recordsPrincipal = /SYSTEM_PRINCIPAL|systemPrincipal/.test(src);
    return {
      handler: relative(ROOT, file).split("\\").join("/"),
      writes,
      tenantFromJob,
      principal: recordsPrincipal ? "SYSTEM (recorded)" : "SYSTEM (not recorded)",
    };
  });
}

export function renderReport(routes, jobs) {
  const count = (k) => routes.filter((r) => r.principal === k).length;
  const kinds = ["USER_SESSION", "ESS_SESSION", "CENTRAL_ADMIN", "KIOSK_DEVICE", "PUBLIC_BY_DESIGN", "NONE"];
  const lines = [
    "# Write-path principal audit (report only)",
    "",
    "PAY-72 (1.17), decision Q9b (Mark, 17 Nov 2026): every write path has an authenticated principal, including the pg-boss system principal.",
    "Generated by `node scripts/audit/write-paths.mjs --write`; do not edit by hand. A test keeps it current.",
    "This report enforces nothing.",
    "",
    "## Summary",
    "",
    "| Principal | Write handlers |",
    "|---|---|",
    ...kinds.map((k) => `| ${k} | ${count(k)} |`),
    `| Total | ${routes.length} |`,
    "",
    `Job handlers: ${jobs.length}, of which ${jobs.filter((j) => j.writes).length} write and ${jobs.filter((j) => j.principal.endsWith("(recorded)")).length} record the system principal.`,
    "",
    "## Write handlers with no principal recognised",
    "",
    ...(count("NONE") ? routes.filter((r) => r.principal === "NONE").map((r) => `- ${r.method} ${r.route}`) : ["None."]),
    "",
    "## Public by design",
    "",
    ...routes.filter((r) => r.principal === "PUBLIC_BY_DESIGN").map((r) => `- ${r.method} ${r.route}: ${r.evidence}`),
    "",
    "## Job handlers (pg-boss)",
    "",
    "| Handler | Writes | Tenant from the job | Principal |",
    "|---|---|---|---|",
    ...jobs.map((j) => `| ${j.handler} | ${j.writes ? "yes" : "no"} | ${j.tenantFromJob ? "yes" : "no"} | ${j.principal} |`),
    "",
    "## Every write handler",
    "",
    "| Method | Route | Principal | Evidence |",
    "|---|---|---|---|",
    ...routes.map((r) => `| ${r.method} | ${r.route} | ${r.principal} | ${r.evidence} |`),
    "",
  ];
  return lines.join("\n");
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const report = renderReport(auditRoutes(), auditJobs());
  if (process.argv.includes("--write")) {
    writeFileSync(OUT, report);
    console.log(`[write-paths] wrote ${relative(ROOT, OUT)}`);
  } else if (process.argv.includes("--check")) {
    const have = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
    if (have !== report) {
      console.error("[write-paths] docs/WRITE_PATH_AUDIT.md is out of date: run node scripts/audit/write-paths.mjs --write");
      process.exit(1);
    }
    console.log("[write-paths] report is current");
  } else {
    process.stdout.write(report);
  }
}
