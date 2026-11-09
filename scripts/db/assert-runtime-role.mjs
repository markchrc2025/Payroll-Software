#!/usr/bin/env node
// Unit 0.7, B4: refuse to start unless the runtime role is one RLS constrains.
//
// The enable_rls migration claimed the app role's NOBYPASSRLS status was
// "verified at app startup". No such check existed, and production's runtime
// client connected as the owner, which every table's admin_bypass policy lets
// see all rows (#214). Run by scripts/start.sh after migrations and before the
// server. FAIL CLOSED: any failed check exits 1 and the server never starts.
//
// Connects with DATABASE_URL (the runtime client's URL) and checks the role it
// lands on, current_user:
//   1. DATABASE_URL is set and is not the same string as DIRECT_DATABASE_URL.
//   2. Not a superuser, not BYPASSRLS (either ignores every policy).
//   3. Does not own, or inherit the owner of, any public table (an owner can
//      ALTER TABLE ... DISABLE ROW LEVEL SECURITY).
//   4. No permissive USING (true) policy applies to it, directly, through a
//      role it inherits, or through PUBLIC. That is what admin_bypass is.
//   5. No tenant is pre-set for the session (ALTER ROLE ... SET
//      app.current_tenant_id would make every "bare" query a tenant query).
//   6. SELECT, INSERT, UPDATE and DELETE on every public table except
//      _prisma_migrations (a missing grant would surface as 500s later).
import { pathToFileURL } from "node:url";
import pg from "pg";

export async function checkRuntimeRole(client, env = process.env) {
  const failures = [];

  if (env.DIRECT_DATABASE_URL && env.DATABASE_URL === env.DIRECT_DATABASE_URL) {
    failures.push("DATABASE_URL is the same as DIRECT_DATABASE_URL (the owner).");
  }

  const me = (
    await client.query(
      `SELECT current_user AS role, r.rolsuper, r.rolbypassrls
         FROM pg_roles r WHERE r.rolname = current_user`,
    )
  ).rows[0];

  if (me.rolsuper) failures.push(`${me.role} is a superuser: RLS does not apply to it.`);
  if (me.rolbypassrls) failures.push(`${me.role} has BYPASSRLS: RLS does not apply to it.`);

  const owned = (
    await client.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
          AND pg_has_role(current_user, c.relowner, 'USAGE')
        ORDER BY 1`,
    )
  ).rows.map((r) => r.relname);
  if (owned.length && !me.rolsuper) {
    failures.push(`${me.role} owns ${owned.length} public table(s), e.g. ${owned.slice(0, 5).join(", ")}.`);
  }

  const open = (
    await client.query(
      `SELECT p.tablename, p.policyname, p.roles::text AS roles
         FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.permissive = 'PERMISSIVE' AND p.qual = 'true'
          AND EXISTS (
                SELECT 1 FROM unnest(p.roles) AS g(name)
                 WHERE CASE WHEN g.name = 'public' THEN true
                            ELSE pg_has_role(current_user, g.name, 'USAGE') END)
        ORDER BY 1, 2`,
    )
  ).rows;
  if (open.length && !me.rolsuper) {
    const eg = open.slice(0, 3).map((r) => `${r.tablename}.${r.policyname} ${r.roles}`);
    failures.push(`${open.length} USING (true) polic(ies) apply to ${me.role}, e.g. ${eg.join("; ")}.`);
  }

  const preset = (await client.query(`SELECT current_setting('app.current_tenant_id', true) AS t`)).rows[0].t;
  if (preset) failures.push(`app.current_tenant_id is already '${preset}' for ${me.role} at session start.`);

  const missing = (
    await client.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
          AND NOT (has_table_privilege(c.oid, 'SELECT') AND has_table_privilege(c.oid, 'INSERT')
               AND has_table_privilege(c.oid, 'UPDATE') AND has_table_privilege(c.oid, 'DELETE'))
        ORDER BY 1`,
    )
  ).rows.map((r) => r.relname);
  if (missing.length && !me.rolsuper) {
    failures.push(
      `${me.role} lacks SELECT/INSERT/UPDATE/DELETE on ${missing.length} table(s), e.g. ${missing.slice(0, 5).join(", ")}.`,
    );
  }

  return { role: me.role, failures };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("::error:: [assert-runtime-role] DATABASE_URL is not set.");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  let result;
  try {
    await client.connect();
    result = await checkRuntimeRole(client);
  } finally {
    await client.end().catch(() => {});
  }
  if (result.failures.length) {
    for (const f of result.failures) console.error(`::error:: [assert-runtime-role] ${f}`);
    console.error(
      `::error:: [assert-runtime-role] REFUSING TO START: DATABASE_URL must connect as payroll_app ` +
        `(or a login that inherits only it). See docs/RUNBOOK_RUNTIME_ROLE.md.`,
    );
    process.exit(1);
  }
  console.log(`[assert-runtime-role] runtime role OK: ${result.role} is constrained by RLS.`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => {
    console.error(`::error:: [assert-runtime-role] ${e && e.message ? e.message : e}`);
    process.exit(1);
  });
}
