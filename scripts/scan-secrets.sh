#!/usr/bin/env bash
# Manual, whole-repository secret scan (unit 0.9).  `npm run scan:secrets`
#
# The pre-commit hook only ever sees the staged diff. This is the periodic
# wider sweep:
#   npm run scan:secrets            # working tree
#   npm run scan:secrets -- history # every commit on every branch
#
# Exit code is gitleaks': 0 clean, 1 findings.
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT" || exit 1

BIN="${GITLEAKS_BIN:-}"
if [ -z "$BIN" ] || [ ! -x "$BIN" ]; then
  BIN="$(bash "$REPO_ROOT/scripts/install-gitleaks.sh" | tail -n 1)"
fi
[ -x "$BIN" ] || { echo "scan-secrets: no gitleaks binary available." >&2; exit 2; }

MODE="${1:-tree}"
case "$MODE" in
  history)
    echo "[scan-secrets] scanning FULL HISTORY (all refs)…"
    exec "$BIN" git . --log-opts="--all" --config .gitleaks.toml --no-banner --redact
    ;;
  tree)
    echo "[scan-secrets] scanning the working tree…"
    exec "$BIN" dir . --config .gitleaks.toml --no-banner --redact
    ;;
  *)
    echo "usage: npm run scan:secrets [-- history]" >&2
    exit 2
    ;;
esac
