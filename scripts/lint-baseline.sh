#!/usr/bin/env bash
# Lint baseline — one byte-identical normalisation for every track.
#
#   bash scripts/lint-baseline.sh                 # report this checkout
#   bash scripts/lint-baseline.sh <base-commit>   # and diff against that commit
#
# WHY THIS IS A COMMITTED SCRIPT AND NOT A COMMAND IN A REPORT
# Three tracks were each retyping the same `sed | md5sum` pipeline by hand. A
# baseline that depends on retyping a pipeline correctly is not a baseline. The
# normalisation lives here so every track produces the same bytes.
#
# WHAT IT REPORTS (per R83 — the hash alone is NOT enough)
#   COUNT — problems/errors/warnings. The md5 is not insertion-independent: one
#           finding appearing or disappearing anywhere shifts it without saying
#           how much moved. The count is what makes a change legible.
#   RAW   — md5 of eslint's output verbatim. A property of the PATH and the
#           commit together: ESLint pads columns to the longest absolute path,
#           so a different worktree yields a different raw hash for identical
#           findings (R48/R77).
#   NORM  — md5 after stripping the worktree root and collapsing runs of
#           whitespace. Worktree-independent; this is the durable value.
#
# THE BASE-COMMIT ARGUMENT (R117)
# "Diff the lint against main" goes VACUOUS the moment a unit merges, because
# the branch IS main and the diff is empty — the check stops working exactly
# when a unit closes. So the comparison is pinned to an explicit commit,
# defaulting to the merge-base with origin/main rather than to origin/main
# itself. Post-merge, pass the PRE-MERGE main sha.
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT" || exit 1

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

normalise() {  # <file> <root> -> stdout
  sed "s|$2/||g" "$1" | sed -E 's/[[:space:]]{2,}/ /g'
}

measure() {    # <label> -> prints COUNT/RAW/NORM, leaves output at $WORK/<label>.txt
  local label="$1"
  npm run lint > "$WORK/$label.txt" 2>&1
  normalise "$WORK/$label.txt" "$REPO_ROOT" > "$WORK/$label.norm.txt"
  local count
  count="$(grep -E '^✖' "$WORK/$label.txt" | sed 's/^✖ //')"
  [ -n "$count" ] || count="0 problems"
  printf '  COUNT : %s\n' "$count"
  printf '  RAW   : %s\n' "$(md5sum < "$WORK/$label.txt" | awk '{print $1}')"
  printf '  NORM  : %s\n' "$(md5sum < "$WORK/$label.norm.txt" | awk '{print $1}')"
}

HEAD_SHA="$(git rev-parse HEAD)"
DIRTY="$(git status --porcelain | wc -l)"

echo "=== lint baseline ==="
echo "  checkout : $REPO_ROOT"
echo "  HEAD     : $HEAD_SHA"
if [ "$DIRTY" -eq 0 ]; then
  echo "  tree     : CLEAN"
else
  echo "  tree     : DIRTY ($DIRTY changed) — the values below are NOT a baseline"
fi
if git rev-parse --verify -q origin/main >/dev/null 2>&1; then
  if [ "$HEAD_SHA" = "$(git rev-parse origin/main)" ]; then
    echo "  vs main  : HEAD == origin/main"
  else
    echo "  vs main  : HEAD != origin/main ($(git rev-parse --short origin/main))"
  fi
fi
echo
echo "current:"
measure current

BASE="${1:-}"
if [ -z "$BASE" ]; then
  BASE="$(git merge-base HEAD origin/main 2>/dev/null || true)"
  [ -n "$BASE" ] && echo && echo "(no base given; defaulting to merge-base $(git rev-parse --short "$BASE"))"
fi

if [ -z "$BASE" ]; then
  echo; echo "No base commit to compare against."; exit 0
fi

if ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  echo; echo "ERROR: '$BASE' is not a commit in this repository." >&2; exit 2
fi

if [ "$(git rev-parse "$BASE")" = "$HEAD_SHA" ]; then
  cat <<EOF

VACUOUS COMPARISON REFUSED (R117): the base commit IS HEAD, so the diff is empty
by construction. Post-merge, pass the PRE-MERGE main sha explicitly:

    bash scripts/lint-baseline.sh <pre-merge-main-sha>
EOF
  exit 2
fi

if [ "$DIRTY" -ne 0 ]; then
  echo; echo "Refusing to check out the base commit with a dirty tree. Commit or stash first." >&2; exit 2
fi

echo; echo "base $(git rev-parse --short "$BASE") ($(git log -1 --format=%s "$BASE" | cut -c1-60)):"
git checkout -q --detach "$BASE"
measure base
git checkout -q "$HEAD_SHA"

echo
if diff -q "$WORK/current.norm.txt" "$WORK/base.norm.txt" >/dev/null; then
  echo "VERDICT: normalised output IDENTICAL — this change moved no lint finding."
else
  echo "VERDICT: normalised output DIFFERS. What moved:"
  diff "$WORK/base.norm.txt" "$WORK/current.norm.txt" | grep -E '^[<>]' | head -40
fi
