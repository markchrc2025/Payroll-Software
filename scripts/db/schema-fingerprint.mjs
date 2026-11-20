#!/usr/bin/env node
// PAY-58 (plan 1.3): schema drift check, report-only.
//
// "Report-only comparison of the live schema with what the migrations
// produce. Now concrete: 0.7 T6 found production appears to carry
// admin_bypass policies the migrations never create."
//
// A fingerprint is one sorted line per object in the public schema: tables,
// columns, indexes, constraints, row level security switches, policies,
// triggers, enum types and functions. prisma/schema-fingerprint.json is the
// fingerprint of a database built from the migrations and nothing else. The
// report compares a live database with it and lists:
//   missing:    in the migrations, not in the live database
//   unexpected: in the live database, not in the migrations
//
// Report-only: it prints, it never changes the database, and it always exits
// 0 in --report mode, so it can never stop the server from starting.
//
//   node scripts/db/schema-fingerprint.mjs --write    (DIRECT_DATABASE_URL: a migrations-only database)
//   node scripts/db/schema-fingerprint.mjs --report   (DIRECT_DATABASE_URL: the live database)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

export const REFERENCE_PATH = fileURLToPath(new URL("../../prisma/schema-fingerprint.json", import.meta.url));

const QUERIES = [
  // Tables and their row level security switches.
  `SELECT 'table ' || quote_ident(c.relname) || ' rls=' || c.relrowsecurity || ' force=' || c.relforcerowsecurity AS line
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'`,
  `SELECT 'column ' || quote_ident(table_name) || '.' || quote_ident(column_name) || ' ' || udt_name ||
          CASE WHEN is_nullable = 'YES' THEN ' null' ELSE ' not null' END ||
          COALESCE(' default ' || column_default, '') AS line
     FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'`,
  `SELECT 'index ' || indexdef AS line FROM pg_indexes
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  `SELECT 'constraint ' || quote_ident(c.relname) || ' ' || quote_ident(k.conname) || ' ' || pg_get_constraintdef(k.oid) AS line
     FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname <> '_prisma_migrations'
      -- Postgres 18 lists NOT NULL as a constraint; the column line already says it.
      AND k.contype <> 'n'`,
  // A policy granted to the role that owns the table is written "<owner>": the
  // owner is called postgres on a developer machine and something else on each
  // server, and that is not drift.
  `SELECT 'policy ' || quote_ident(p.tablename) || ' ' || quote_ident(p.policyname) || ' ' || p.permissive || ' ' || p.cmd ||
          ' to ' || (SELECT string_agg(CASE WHEN r = t.tableowner THEN '<owner>' ELSE r END, ',' ORDER BY 1)
                       FROM unnest(p.roles::text[]) AS r) ||
          COALESCE(' using ' || p.qual, '') || COALESCE(' check ' || p.with_check, '') AS line
     FROM pg_policies p JOIN pg_tables t ON t.schemaname = p.schemaname AND t.tablename = p.tablename
    WHERE p.schemaname = 'public'`,
  `SELECT 'trigger ' || pg_get_triggerdef(t.oid) AS line
     FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
  // PAY-204 (ruling 2): event triggers live outside any table, so they are
  // listed here; one that calls a function the migrations never create is drift.
  `SELECT 'event trigger ' || quote_ident(e.evtname) || ' on ' || e.evtevent || ' enabled=' || e.evtenabled::text ||
          ' calls ' || quote_ident(n.nspname) || '.' || quote_ident(p.proname) ||
          COALESCE(' when ' || array_to_string(e.evttags, ','), '') AS line
     FROM pg_event_trigger e JOIN pg_proc p ON p.oid = e.evtfoid JOIN pg_namespace n ON n.oid = p.pronamespace`,
  `SELECT 'enum ' || quote_ident(t.typname) || ' ' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS line
     FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' GROUP BY t.typname`,
  `SELECT 'function ' || quote_ident(p.proname) || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS line
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
    WHERE n.nspname = 'public' AND d.objid IS NULL`,
];

/** One sorted line per schema object. `client` is a connected pg client. */
export async function readFingerprint(client) {
  const lines = [];
  for (const sql of QUERIES) {
    const { rows } = await client.query(sql);
    for (const r of rows) lines.push(String(r.line).replace(/\s+/g, " ").trim());
  }
  return [...new Set(lines)].sort();
}

/** What the migrations have that the live database lacks, and the reverse. */
export function diffFingerprints(reference, live) {
  const ref = new Set(reference);
  const have = new Set(live);
  return {
    missing: reference.filter((l) => !have.has(l)),
    unexpected: live.filter((l) => !ref.has(l)),
  };
}

/** The report as lines of text. */
export function driftReport(reference, live) {
  const { missing, unexpected } = diffFingerprints(reference, live);
  const out = [];
  if (missing.length === 0 && unexpected.length === 0) {
    out.push(`[schema-drift] OK: the live schema matches the migrations (${reference.length} objects).`);
    return out;
  }
  out.push(`[schema-drift] DRIFT: ${missing.length} missing, ${unexpected.length} unexpected (reference has ${reference.length} objects). Report only; nothing was changed.`);
  for (const l of missing) out.push(`[schema-drift] missing: ${l}`);
  for (const l of unexpected) out.push(`[schema-drift] unexpected: ${l}`);
  // Said again at the end, where the tail of a log is read.
  out.push(`[schema-drift] END: ${missing.length} missing, ${unexpected.length} unexpected.`);
  return out;
}

export function loadReference(path = REFERENCE_PATH) {
  return JSON.parse(readFileSync(path, "utf8")).objects;
}

async function main(mode) {
  const url = process.env.DIRECT_DATABASE_URL;
  if (!url) throw new Error("DIRECT_DATABASE_URL is not set");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const live = await readFingerprint(client);
    if (mode === "--write") {
      writeFileSync(REFERENCE_PATH, `${JSON.stringify({ note: "Generated by scripts/db/schema-fingerprint.mjs --write from a migrations-only database. Do not edit by hand.", objects: live }, null, 1)}\n`);
      console.log(`[schema-drift] wrote ${live.length} objects to prisma/schema-fingerprint.json`);
    } else {
      for (const line of driftReport(loadReference(), live)) console.log(line);
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2] === "--write" ? "--write" : "--report";
  main(mode).catch((e) => {
    // Report-only: a failure to report must never stop the server.
    console.log(`[schema-drift] could not run: ${e?.message ?? e}`);
    process.exit(mode === "--write" ? 1 : 0);
  });
}
