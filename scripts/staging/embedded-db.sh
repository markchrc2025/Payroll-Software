#!/usr/bin/env bash
# STAGING ONLY. Sourced by scripts/start.sh when STAGING_EMBEDDED_DB=1; never
# reached in production (the variable is set on the staging app alone).
#
# A private PostgreSQL inside this container, created fresh at every start:
#   - listens on 127.0.0.1 only, so nothing outside the container can reach it;
#   - three passwords are generated here, in memory, and never leave the
#     container (the superuser's is discarded once setup is done);
#   - the same two roles as production: payroll_owner owns the database and
#     runs migrations (DIRECT_DATABASE_URL), payroll_app is the RLS-constrained
#     runtime role (DATABASE_URL), so scripts/db/assert-runtime-role.mjs checks
#     staging exactly as it checks production.
#
# Why not the shared Postgres: roles are server-wide, and the migrations grant
# to a role literally named payroll_app, which on the shared server is
# production's. A staging database there would share production's runtime
# credential or entangle a staging role with production's grants.
#
# Data is disposable by design: restarting the app gives a clean, re-seeded
# staging. The PostgreSQL package comes from the staging app's build variable
# RAILPACK_DEPLOY_APT_PACKAGES=postgresql; production's image is unchanged.

staging_embedded_db() {
  local pgbin root data log pw_super pw_owner pw_app port
  port="${STAGING_PG_PORT:-5432}"
  pgbin="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
  if [ -z "$pgbin" ] || [ ! -x "$pgbin/initdb" ]; then
    echo "::error:: STAGING_EMBEDDED_DB=1 but PostgreSQL is not installed. Set RAILPACK_DEPLOY_APT_PACKAGES=postgresql on the staging app and redeploy." >&2
    return 1
  fi

  root=/tmp/staging-pg
  data="$root/data"
  log="$root/postgres.log"
  rm -rf "$root"
  mkdir -p "$root"

  gen() { node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))'; }
  pw_super="$(gen)"
  pw_owner="$(gen)"
  pw_app="$(gen)"

  # initdb refuses to run as root; the postgresql package creates the user.
  local -a as_pg=()
  if [ "$(id -u)" = "0" ]; then
    chown -R postgres:postgres "$root"
    as_pg=(runuser -u postgres --)
  fi

  local pwfile="$root/.pw"
  ( umask 077; printf '%s' "$pw_super" > "$pwfile" )
  [ "$(id -u)" = "0" ] && chown postgres:postgres "$pwfile"
  "${as_pg[@]}" "$pgbin/initdb" -D "$data" -U postgres --auth=scram-sha-256 \
    --pwfile="$pwfile" --encoding=UTF8 --locale=C >/dev/null
  rm -f "$pwfile"

  # TLS on, as on the shared server: the job queue (src/lib/jobs/client.ts)
  # always connects with ssl, and a server without it refuses. A throwaway
  # self-signed certificate is enough on 127.0.0.1 (openssl comes with the
  # postgresql package via ssl-cert). Plain connections keep working too.
  openssl req -new -x509 -days 30 -nodes -subj "/CN=127.0.0.1" \
    -keyout "$data/server.key" -out "$data/server.crt" >/dev/null 2>&1
  chmod 600 "$data/server.key"
  [ "$(id -u)" = "0" ] && chown postgres:postgres "$data/server.key" "$data/server.crt"

  "${as_pg[@]}" "$pgbin/pg_ctl" -D "$data" -l "$log" -w \
    -o "-c listen_addresses=127.0.0.1 -c port=$port -c unix_socket_directories=$root -c ssl=on" start >/dev/null

  # Passwords are hex, so they are safe inside SQL string literals.
  PGPASSWORD="$pw_super" "$pgbin/psql" -h 127.0.0.1 -p "$port" -U postgres -d postgres \
    -v ON_ERROR_STOP=1 -q <<SQL
CREATE ROLE payroll_owner LOGIN PASSWORD '$pw_owner' NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
CREATE ROLE payroll_app   LOGIN PASSWORD '$pw_app'   NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
CREATE DATABASE payroll_staging OWNER payroll_owner;
SQL
  pw_super=""

  export DIRECT_DATABASE_URL="postgresql://payroll_owner:${pw_owner}@127.0.0.1:${port}/payroll_staging"
  export DATABASE_URL="postgresql://payroll_app:${pw_app}@127.0.0.1:${port}/payroll_staging"
  echo "[staging] Embedded PostgreSQL $("$pgbin/postgres" --version | awk '{print $3}') ready on 127.0.0.1 (fresh database payroll_staging)"
}
