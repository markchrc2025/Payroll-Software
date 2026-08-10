#!/usr/bin/env bash
# u09 — acceptance tests for the pre-commit secret scan (unit 0.9).
#
#     bash scripts/u09-secret-scan-tests.sh
#
# These are SHELL tests, not vitest tests: vitest.config.ts only collects
# `src/**/*.test.ts`, and unit 0.9 is forbidden from touching src/. More to the
# point, the thing under test is `git commit` itself — it can only be tested by
# running it.
#
# The tests run inside a THROWAWAY CLONE under $TMPDIR, never in your working
# copy, so a failed run cannot leave a secret staged in the real repository.
#
#   T1  a realistic Postgres URI with an embedded password is BLOCKED,
#       and the same commit succeeds once the secret is removed
#   T2  the documented `<owner-pw>` placeholder is NOT blocked
#   T3  the emergency bypass works (--no-verify and SKIP_SECRET_SCAN=1)
set -uo pipefail

REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PASS=0; FAIL=0
ok()   { printf '\033[32mPASS\033[0m %s\n' "$*"; PASS=$((PASS+1)); }
bad()  { printf '\033[31mFAIL\033[0m %s\n' "$*"; FAIL=$((FAIL+1)); }
hdr()  { printf '\n\033[1m── %s ──\033[0m\n' "$*"; }

# A throwaway repository carrying the CURRENT working-tree copies of the hook,
# the config and the installers — deliberately not a clone, so the tests
# exercise the files as they are right now rather than as last committed.
mkdir -p "$WORK/repo/.githooks" "$WORK/repo/scripts"
cp "$REPO_ROOT/.gitleaks.toml"                "$WORK/repo/.gitleaks.toml"
cp "$REPO_ROOT/.githooks/pre-commit"          "$WORK/repo/.githooks/pre-commit"
cp "$REPO_ROOT/.githooks/gitleaks-report.tmpl" "$WORK/repo/.githooks/gitleaks-report.tmpl"
cp "$REPO_ROOT/scripts/install-git-hooks.sh"  "$WORK/repo/scripts/"
cp "$REPO_ROOT/scripts/install-gitleaks.sh"   "$WORK/repo/scripts/"
cd "$WORK/repo" || exit 1
git init --quiet .
git config user.email "u09-test@example.com"
git config user.name  "u09 test"
git config commit.gpgsign false

# Install exactly the way `npm install` would, then assert it really landed —
# a test suite that silently runs with no hook installed proves nothing.
bash scripts/install-git-hooks.sh
[ -x .git/hooks/pre-commit ] && ok "T0 hook installed by scripts/install-git-hooks.sh" \
                             || { bad "T0 hook was NOT installed — every test below is meaningless"; exit 1; }

git add -A && git commit -q -m "u09 fixture: hook, config, installers" || true

# ---------------------------------------------------------------------------
# T1 — a real secret is blocked
# ---------------------------------------------------------------------------
hdr "T1  a staged Postgres connection string with an embedded password is BLOCKED"

# Assembled at runtime so this test file itself never contains a committable
# credential-shaped literal.
PW='Hunter2-Tr0ub4dor-3xample'
printf 'DATABASE_URL="postgresql://payroll_owner:%s@db.internal.sliplane.app:5432/payroll?sslmode=require"\n' "$PW" > u09-leak.env.txt
git add u09-leak.env.txt

set +e
OUT="$(git commit -m "u09 T1: this must never land" 2>&1)"
RC=$?
set -e

printf '%s\n' "$OUT"
if [ $RC -ne 0 ]; then ok "T1a commit rejected (exit $RC)"; else bad "T1a commit SUCCEEDED — the hook did not block a live credential"; fi
printf '%s' "$OUT" | grep -q "COMMIT BLOCKED"           && ok "T1b block banner shown"       || bad "T1b no block banner"
printf '%s' "$OUT" | grep -q "sentire-db-uri-password"  && ok "T1c named the matching rule"  || bad "T1c rule id not reported"
printf '%s' "$OUT" | grep -q "$PW"                      && bad "T1d the password was PRINTED IN CLEAR — --redact is not working" \
                                                        || ok "T1d password redacted in the hook output"
git log --oneline -1 2>/dev/null | grep -q "u09 T1" \
  && bad "T1e the commit exists despite the block" || ok "T1e no commit was created"

hdr "T1f  the same commit SUCCEEDS once the secret is removed"
printf 'DATABASE_URL is supplied by the environment; see docs/SECRET_SCANNING.md\n' > u09-leak.env.txt
git add u09-leak.env.txt
set +e
OUT2="$(git commit -m "u09 T1f: secret removed" 2>&1)"; RC2=$?
set -e
printf '%s\n' "$OUT2"
if [ $RC2 -eq 0 ]; then ok "T1f clean commit accepted"; else bad "T1f clean commit was rejected (exit $RC2) — the hook blocks innocent work"; fi

# ---------------------------------------------------------------------------
# T2 — the documented placeholders are not blocked
# ---------------------------------------------------------------------------
hdr "T2  the documented <owner-pw> / <pw> placeholders are NOT blocked"

cat > u09-placeholder-doc.md <<'DOC'
# Restore drill notes (u09 fixture)

Recreate the roles on the fresh instance:

    psql "$NEW_DATABASE_URL" -c "CREATE ROLE owner LOGIN PASSWORD '<owner-pw>';"
    psql "$NEW_DATABASE_URL" -c "CREATE ROLE payroll_app LOGIN PASSWORD '<app-pw>';"

Dump from the old instance first:

    pg_dump "postgresql://postgres:<pw>@<HOST>:5432/<DB>" -Fc -f pre-rotation.dump

The scratch verification container uses a throwaway password:

    docker run -d --name scratch-pg -e POSTGRES_PASSWORD=scratch -p 5433:5432 postgres:18
DOC
git add u09-placeholder-doc.md
set +e
OUT3="$(git commit -m "u09 T2: placeholders only" 2>&1)"; RC3=$?
set -e
if [ $RC3 -eq 0 ]; then ok "T2 placeholder-only commit accepted (no false positive)"; else bad "T2 BLOCKED on placeholders — the allowlist is wrong:"; printf '%s\n' "$OUT3"; fi

# ---------------------------------------------------------------------------
# T3 — the emergency bypass works
# ---------------------------------------------------------------------------
hdr "T3  the emergency bypass works"

printf 'DATABASE_URL="postgresql://payroll_owner:%s@db.internal.sliplane.app:5432/payroll"\n' "$PW" > u09-bypass.env.txt
git add u09-bypass.env.txt
set +e
git commit -q --no-verify -m "u09 T3a: emergency bypass via --no-verify" >/dev/null 2>&1; RC4=$?
set -e
if [ $RC4 -eq 0 ]; then ok "T3a git commit --no-verify bypasses the hook"; else bad "T3a --no-verify did NOT get through — an unbypassable hook gets deleted"; fi

printf 'DATABASE_URL="postgresql://payroll_owner:%s@db.internal.sliplane.app:5433/payroll"\n' "$PW" > u09-bypass2.env.txt
git add u09-bypass2.env.txt
set +e
OUT5="$(SKIP_SECRET_SCAN=1 git commit -m "u09 T3b: bypass via SKIP_SECRET_SCAN" 2>&1)"; RC5=$?
set -e
if [ $RC5 -eq 0 ]; then ok "T3b SKIP_SECRET_SCAN=1 bypasses the hook"; else bad "T3b SKIP_SECRET_SCAN=1 did not bypass (exit $RC5)"; fi
printf '%s' "$OUT5" | grep -q "SKIPPED" && ok "T3c the bypass announces itself" || bad "T3c a silent bypass is a trap"

# ---------------------------------------------------------------------------
# T4 — the hook is fast enough not to be resented
# ---------------------------------------------------------------------------
hdr "T4  the hook is fast on an ordinary change"
printf 'just a line of prose\n' > u09-timing.md
git add u09-timing.md
START="$(date +%s%N)"
git commit -q -m "u09 T4: timing" >/dev/null 2>&1
ELAPSED_MS=$(( ( $(date +%s%N) - START ) / 1000000 ))
printf 'commit took %s ms\n' "$ELAPSED_MS"
[ "$ELAPSED_MS" -lt 3000 ] && ok "T4 commit under 3s (${ELAPSED_MS}ms)" || bad "T4 commit took ${ELAPSED_MS}ms — slow enough to get bypassed habitually"

printf '\n\033[1m%s passed, %s failed\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
