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
# Data (PAY-140, 16 Nov 2026):
#   - STAGING_PG_DATA_DIR unset: created fresh at every start, as before.
#   - STAGING_PG_DATA_DIR set to a directory on a Dokploy VOLUME: the database
#     is kept across restarts and deploys. Migrations apply on top; the seed
#     only adds what is missing. A new major PostgreSQL version starts fresh.
#   - Reset on request: the QA connector's reset_staging tool writes
#     $STAGING_PG_DATA_DIR/RESET; the next start wipes and re-seeds.
# Role passwords are new at every start either way; the superuser has no
# password at all and is reached only over the private unix socket (peer).
# The PostgreSQL package comes from the staging app's build variable
# RAILPACK_DEPLOY_APT_PACKAGES=postgresql; production's image is unchanged.

staging_embedded_db() {
  local pgbin root data log pw_owner pw_app port
  port="${STAGING_PG_PORT:-5432}"
  pgbin="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
  if [ -z "$pgbin" ] || [ ! -x "$pgbin/initdb" ]; then
    echo "::error:: STAGING_EMBEDDED_DB=1 but PostgreSQL is not installed. Set RAILPACK_DEPLOY_APT_PACKAGES=postgresql on the staging app and redeploy." >&2
    return 1
  fi

  local persist="${STAGING_PG_DATA_DIR:-}"
  root="${persist:-/tmp/staging-pg}"
  data="$root/data"
  log="$root/postgres.log"
  local sock="$root/socket"
  local reused=0

  if [ -z "$persist" ]; then
    rm -rf "$root"
  elif [ -f "$root/RESET" ]; then
    echo "[staging] Reset requested (reset_staging): wiping the kept database"
    rm -rf "$data" "$root/RESET"
  elif [ -f "$data/PG_VERSION" ]; then
    local have want
    have="$(cat "$data/PG_VERSION")"
    want="$("$pgbin/postgres" --version | awk '{print $3}' | cut -d. -f1)"
    if [ "$have" = "$want" ]; then
      reused=1
    else
      echo "[staging] Kept database is PostgreSQL $have, this image has $want: starting fresh"
      rm -rf "$data"
    fi
  fi
  mkdir -p "$root" "$sock"
  rm -f "$log"

  gen() { node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))'; }
  pw_owner="$(gen)"
  pw_app="$(gen)"

  # initdb refuses to run as root; the postgresql package creates the user.
  # The database superuser is named after the OS user that runs postgres, so
  # peer authentication over the socket works without any password.
  local -a as_pg=()
  local superuser
  if [ "$(id -u)" = "0" ]; then
    chown -R postgres:postgres "$root"
    chmod 700 "$root" "$sock"
    as_pg=(runuser -u postgres --)
    superuser=postgres
  else
    superuser="$(id -un)"
  fi

  if [ "$reused" = "0" ]; then
    "${as_pg[@]}" "$pgbin/initdb" -D "$data" -U "$superuser" \
      --auth-local=peer --auth-host=scram-sha-256 --encoding=UTF8 --locale=C >/dev/null
  fi

  # TLS on, as on the shared server: the job queue (src/lib/jobs/client.ts)
  # always connects with ssl, and a server without it refuses. A throwaway
  # self-signed certificate is enough on 127.0.0.1 (openssl comes with the
  # postgresql package via ssl-cert); renewed at every start.
  openssl req -new -x509 -days 30 -nodes -subj "/CN=127.0.0.1" \
    -keyout "$data/server.key" -out "$data/server.crt" >/dev/null 2>&1
  chmod 600 "$data/server.key"
  [ "$(id -u)" = "0" ] && chown postgres:postgres "$data/server.key" "$data/server.crt"

  "${as_pg[@]}" "$pgbin/pg_ctl" -D "$data" -l "$log" -w \
    -o "-c listen_addresses=127.0.0.1 -c port=$port -c unix_socket_directories=$sock -c ssl=on" start >/dev/null

  # Passwords are hex, so they are safe inside SQL string literals.
  local -a su_psql=("${as_pg[@]}" "$pgbin/psql" -h "$sock" -p "$port" -U "$superuser" -d postgres -v ON_ERROR_STOP=1 -q)
  if [ "$reused" = "1" ]; then
    "${su_psql[@]}" <<SQL
ALTER ROLE payroll_owner PASSWORD '$pw_owner';
ALTER ROLE payroll_app   PASSWORD '$pw_app';
SQL
  else
    "${su_psql[@]}" <<SQL
CREATE ROLE payroll_owner LOGIN PASSWORD '$pw_owner' NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
CREATE ROLE payroll_app   LOGIN PASSWORD '$pw_app'   NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
CREATE DATABASE payroll_staging OWNER payroll_owner;
SQL
  fi

  export DIRECT_DATABASE_URL="postgresql://payroll_owner:${pw_owner}@127.0.0.1:${port}/payroll_staging"
  export DATABASE_URL="postgresql://payroll_app:${pw_app}@127.0.0.1:${port}/payroll_staging"
  if [ "$reused" = "1" ]; then
    export STAGING_PG_REUSED=1
    echo "[staging] Embedded PostgreSQL $("$pgbin/postgres" --version | awk '{print $3}') ready on 127.0.0.1 (kept database payroll_staging, $root)"
  else
    export STAGING_PG_REUSED=0
    echo "[staging] Embedded PostgreSQL $("$pgbin/postgres" --version | awk '{print $3}') ready on 127.0.0.1 (fresh database payroll_staging${persist:+, kept in $root})"
  fi
}
