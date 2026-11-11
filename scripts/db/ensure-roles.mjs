#!/usr/bin/env node
// Unit 0.21: create the database roles the migration set depends on, if they
// are missing, BEFORE `prisma migrate deploy` runs.
//
// Why this exists: 35 statements across prisma/migrations GRANT to
// `payroll_app`, and no migration creates that role. Roles are cluster-level
// objects, so a fresh cluster (the 2.1 restore drill, a new environment, a CI
// container) dies on migration 4 of 87 with `role "payroll_app" does not
// exist`. A migration cannot fix this: it would have to sort before migrations
// that production has already applied.
//
// Contract:
//   - Connects with DIRECT_DATABASE_URL (the migrating role, same as
//     `prisma migrate deploy`). Unset: exit 1.
//   - Always ensures `payroll_app`. Extra role names may be passed as
//     arguments (the restore drill also needs the roles a dump references).
//   - A role that already exists is left exactly as it is. No ALTER ROLE, no
//     password, no attribute change. In production every role exists, so this
//     is a read-only no-op there and needs no extra privilege.
//   - A missing role is created NOLOGIN with every elevated attribute off.
//     Giving it LOGIN and a password is an operator step, never automatic.
//   - If a missing role cannot be created (the migrating role lacks
//     CREATEROLE), exit 1 with the exact statement a superuser must run.
//     Fail closed: start.sh then never reaches migrate or the server.
//
// Usage:
//   node scripts/db/ensure-roles.mjs                    # payroll_app
//   node scripts/db/ensure-roles.mjs owner sentire_books_app   # restore drill
import { pathToFileURL } from "node:url";
import pg from "pg";

const REQUIRED = ["payroll_app"];
const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

const CREATE_ATTRS = "NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION INHERIT";

export function rolesToEnsure(argv) {
  const names = [...REQUIRED, ...argv];
  for (const n of names) {
    if (!ROLE_NAME.test(n)) {
      throw new Error(`Refusing role name ${JSON.stringify(n)}: lowercase letters, digits and _ only.`);
    }
  }
  return [...new Set(names)];
}

export async function ensureRoles(client, names, log = console.log) {
  const result = { existing: [], created: [] };
  for (const name of names) {
    const found = await client.query(
      "SELECT rolcanlogin, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1",
      [name],
    );
    if (found.rowCount === 1) {
      const r = found.rows[0];
      log(
        `[ensure-roles] ${name}: exists (login=${r.rolcanlogin}, superuser=${r.rolsuper}, bypassrls=${r.rolbypassrls}), left unchanged`,
      );
      result.existing.push(name);
      continue;
    }
    try {
      // Name is validated by ROLE_NAME above and double-quoted here.
      await client.query(`CREATE ROLE "${name}" ${CREATE_ATTRS}`);
      log(`[ensure-roles] ${name}: CREATED (${CREATE_ATTRS})`);
      result.created.push(name);
    } catch (e) {
      if (e && e.code === "42710") {
        // duplicate_object: created concurrently between our check and CREATE.
        log(`[ensure-roles] ${name}: exists (created concurrently), left unchanged`);
        result.existing.push(name);
        continue;
      }
      const who = await client.query("SELECT current_user AS u").catch(() => ({ rows: [{ u: "?" }] }));
      const err = new Error(
        `role "${name}" is missing and ${who.rows[0].u} cannot create it (${e && e.code ? e.code + " " : ""}${e && e.message ? e.message : e}). ` +
          `Run once as a superuser: CREATE ROLE "${name}" ${CREATE_ATTRS};`,
      );
      err.cause = e;
      throw err;
    }
  }
  return result;
}

async function main() {
  const url = process.env.DIRECT_DATABASE_URL;
  if (!url) {
    console.error("::error:: [ensure-roles] DIRECT_DATABASE_URL is not set.");
    process.exit(1);
  }
  const names = rolesToEnsure(process.argv.slice(2));
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    await ensureRoles(client, names);
  } finally {
    await client.end().catch(() => {});
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => {
    console.error(`::error:: [ensure-roles] ${e && e.message ? e.message : e}`);
    process.exit(1);
  });
}
