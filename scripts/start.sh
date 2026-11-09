#!/usr/bin/env bash
# Production start command (0.2): apply pending DB migrations, THEN serve.
#
# Restores the migrate-on-boot step the old Dockerfile did before the Railpack
# move. FAIL-CLOSED: if `prisma migrate deploy` errors, the server never starts,
# /api/health never goes green, and Sliplane keeps the previous (healthy)
# version — a bad migration blocks the deploy instead of half-migrating a live
# app.
#
# Migrate connects as the OWNER role via DIRECT_DATABASE_URL — a DIRECT/session
# connection (required for Prisma's session-scoped advisory lock; a transaction
# pooler would hang), resolved in prisma.config.ts. The app runs as a single
# instance (pg-boss is in-process), so there is no cross-instance migrate race;
# even if two ever started, Prisma's advisory lock serialises them.
set -euo pipefail
cd "$(dirname "$0")/.."

BIN="./node_modules/.bin"

if [ -z "${DIRECT_DATABASE_URL:-}" ]; then
  echo "::error:: DIRECT_DATABASE_URL (owner, direct connection) is not set — 'prisma migrate deploy' would connect as the app role and fail. Set the owner direct URL in the Sliplane app env before deploying." >&2
  exit 1
fi

# 0.21: the migration set GRANTs to roles it never creates. Create any that are
# missing (NOLOGIN, no elevated attributes); a no-op where they already exist.
# Fail-closed like migrate: if a role is missing and cannot be created, stop.
echo "[start] Ensuring database roles the migrations depend on…"
node scripts/db/ensure-roles.mjs

echo "[start] Applying database migrations (prisma migrate deploy)…"
"$BIN/prisma" migrate deploy
echo "[start] Migrations up to date — starting Next.js"
exec "$BIN/next" start
