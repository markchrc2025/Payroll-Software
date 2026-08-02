/**
 * verify-backup.ts — restore-drill assertion.
 *
 * Run by .github/workflows/db-restore-drill.yml AFTER the latest encrypted dump
 * has been decrypted and `pg_restore`d into a throwaway postgres:17 service.
 * Connects to that SCRATCH database only and asserts that the Employee /
 * PayrollSheet / Invoice row counts exactly match the dump-time manifest.
 * Exits non-zero on any mismatch (fails the drill).
 *
 * Read-only; never touches production. Counting runs as the scratch superuser,
 * which bypasses the restored RLS policies, so it sees every row.
 *
 * Env:
 *   SCRATCH_DATABASE_URL   connection string for the restored scratch DB
 *   BACKUP_MANIFEST_FILE   path to manifest.json (or BACKUP_MANIFEST_JSON inline)
 */

import { readFileSync } from "node:fs";
import { Client } from "pg";

interface Manifest {
  employeeCount: number;
  payrollSheetCount: number;
  invoiceCount: number;
}

function loadManifest(): Manifest {
  const inline = process.env.BACKUP_MANIFEST_JSON;
  const file = process.env.BACKUP_MANIFEST_FILE;
  const raw = inline ?? (file ? readFileSync(file, "utf8") : null);
  if (!raw) throw new Error("Set BACKUP_MANIFEST_FILE or BACKUP_MANIFEST_JSON");
  const m = JSON.parse(raw) as Partial<Manifest>;
  for (const k of ["employeeCount", "payrollSheetCount", "invoiceCount"] as const) {
    if (typeof m[k] !== "number") throw new Error(`Manifest missing numeric "${k}"`);
  }
  return m as Manifest;
}

async function main() {
  const url = process.env.SCRATCH_DATABASE_URL;
  if (!url) throw new Error("SCRATCH_DATABASE_URL is required");
  const manifest = loadManifest();

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const checks: Array<[string, number]> = [
      ["Employee", manifest.employeeCount],
      ["PayrollSheet", manifest.payrollSheetCount],
      ["Invoice", manifest.invoiceCount],
    ];

    let failed = false;
    for (const [table, expected] of checks) {
      const res = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM "${table}"`,
      );
      const actual = res.rows[0]?.n ?? -1;
      const ok = actual === expected;
      console.log(`${ok ? "✓" : "✗"} ${table}: restored=${actual} manifest=${expected}`);
      if (!ok) failed = true;
    }

    if (failed) {
      console.error("\nRESTORE VERIFICATION FAILED — restored counts do not match the manifest.");
      process.exit(1);
    }
    console.log("\nRESTORE VERIFICATION PASSED — backup restores cleanly and data is intact.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
