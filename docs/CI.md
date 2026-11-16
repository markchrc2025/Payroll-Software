# What gates a pull request — and how to reproduce each gate locally

**Unit 0.17.** Before this, nothing did. Four workflows existed
(`db-backup`, `db-migrate`, `db-restore-drill`, `db-role-inventory`); all four
are `workflow_dispatch`/`schedule` and none runs the test suite, the type
checker, the linter or a build. `gh run list` confirms that no workflow run in
this repository's history was ever triggered by `pull_request` or `push`. Every
gate in every unit up to here was hand-run by an agent and reported in prose.

`.github/workflows/ci.yml` runs on **every pull request** and on **every push to
`main`**.

---

## READ THIS FIRST: CI is advisory on this repository

The CI job reports its verdict on the PR, but **nothing forces you to obey it.**
Branch protection and rulesets both require GitHub Pro/Team on a private
repository, and this repo is private on a personal account — the same plan
boundary that unit 0.8 hit when going private turned off secret scanning. The
API confirms it:

```
GET /repos/.../rulesets
  403  "Upgrade to GitHub Pro or make this repository public to enable this feature."
```

So there are **no required status checks**, and `gh pr merge --squash` will
merge a PR whose CI is red without complaint. The standing "auto-squash-merge"
rule in `CLAUDE.md` therefore now has something *behind* it, but still nothing
*in front of* it.

Until that changes, the discipline is human: **do not merge a red PR.** The
options for closing the gap are in "Making this enforceable" at the bottom.

---

## The gates, in order

The job stops at the first failure, so fix them top-down.

| # | Gate | Blocking? | Reproduce locally |
| --- | --- | --- | --- |
| 1 | `npm ci` installs cleanly | yes | `npm ci` |
| 2 | `TEST_DATABASE_URL` is set | yes | see below |
| 3 | The database actually answers | yes | see below |
| 3b | Migration roles exist | yes | see below |
| 4 | `prisma migrate deploy` succeeds | yes | `npx prisma migrate deploy` |
| 5 | No migration pending | yes | `npx prisma migrate status` |
| 6 | Test suite passes | yes | `npm test` |
| 7 | **Zero skipped tests** | yes | see below |
| 8 | `tsc --noEmit` clean | yes | `npx tsc --noEmit` |
| 9 | ESLint clean **on changed files** | yes | see below |
| 10 | Repo-wide lint total | **no** — informational | `npm run lint` |

### Reproducing the database gates

CI starts a throwaway `postgres:18` service (the same major version the
Sliplane server runs, and the same service-block pattern as
`db-restore-drill.yml`). Locally:

```bash
docker run -d --name payroll-ci-db \
  -e POSTGRES_PASSWORD=ci -e POSTGRES_DB=payroll_ci \
  -p 5432:5432 postgres:18

export TEST_DATABASE_URL=postgresql://postgres:ci@localhost:5432/payroll_ci
export DATABASE_URL=$TEST_DATABASE_URL
export DIRECT_DATABASE_URL=$TEST_DATABASE_URL

# The migration set is NOT self-contained — see below. Without this you get
#   ERROR: role "payroll_app" does not exist   at migration 4 of 87.
for r in owner payroll_app sentire_books_app; do
  docker exec payroll-ci-db psql -U postgres -d payroll_ci \
    -c "DO \$\$ BEGIN CREATE ROLE \"$r\"; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;"
done

npx prisma migrate deploy
npx prisma migrate status
npm test
docker rm -f payroll-ci-db
```

`prisma.config.ts` resolves the migration connection from
`DIRECT_DATABASE_URL`, falling back to `DATABASE_URL`, which is why all three
are exported.

### Reproducing the zero-skip assertion

```bash
npx vitest run --reporter=json --outputFile=vitest-results.json
node -e 'const r=require("./vitest-results.json");
  console.log(r.numTotalTests, "tests,", (r.numPendingTests||0)+(r.numTodoTests||0), "skipped")'
```

### Reproducing the changed-files lint

```bash
git fetch origin main
CHANGED=$(git diff --name-only --diff-filter=ACMR origin/main...HEAD -- '*.ts' '*.tsx' '*.mjs' '*.cjs')
npx eslint --max-warnings 0 --no-error-on-unmatched-pattern $CHANGED
```

---

## The migration set is not self-contained (found by CI's first run)

The very first run of this pipeline failed at migration 4 of 87:

```
Error: P3018 — Database error code: 42704
ERROR: role "payroll_app" does not exist
```

35 statements across `prisma/migrations` `GRANT` to `payroll_app`, and the
`admin_bypass` policies reference `owner`. Neither role is created by any
migration, so **no fresh database can be migrated from the repository alone.**
The only place that knowledge was written down is
`scripts/restore-from-backup.md:48-50`, as a manual step in a runbook — which is
why it went unnoticed: production and staging were both restored from dumps that
already had the roles.

CI now performs the same idempotent pre-creation the restore drill does, so the
two agree and neither can drift without the other going red. The proper fix — a
migration that creates the roles, or a documented bootstrap script — belongs to
whoever owns `prisma/`.

---

## The lint baseline — `scripts/lint-baseline.sh`

Three tracks were each retyping the same `sed | md5sum` pipeline by hand to
report lint state. A baseline that depends on retyping a pipeline correctly is
not a baseline, so the normalisation is now committed:

```bash
bash scripts/lint-baseline.sh                 # report this checkout
bash scripts/lint-baseline.sh <base-commit>   # and diff against that commit
```

### What it reports, and why the hash alone is not enough

| Field | Meaning |
|---|---|
| **COUNT** | problems / errors / warnings. The md5 is **not insertion-independent** — one finding appearing or disappearing anywhere shifts it without saying how much moved. The count is what makes a change legible. |
| **RAW** | md5 of ESLint's output verbatim. A property of the **path and the commit together**: ESLint pads columns to the longest absolute path, so a different worktree gives a different raw hash for identical findings. |
| **NORM** | md5 after stripping the worktree root and collapsing whitespace runs. **Worktree-independent — this is the durable value.** |

It also prints the HEAD sha and refuses to present a dirty tree's numbers as a
baseline.

### The base-commit argument, and the trap it closes

"Diff the lint against `main`" goes **vacuous the moment a unit merges**, because
the branch *is* `main` and the diff is empty — the check stops working exactly
when a unit closes and someone most wants the answer. So the comparison is
pinned to an explicit commit, defaulting to the **merge-base** with `origin/main`
rather than to `origin/main` itself. Passing a base that equals HEAD is refused
outright rather than reported as "no change".

Post-merge, pass the **pre-merge `main` sha**:

```bash
bash scripts/lint-baseline.sh 4dfd70221b8501dc09315df15a0e93ce8f8064f3
```

### Authoritative baselines

Stated on merged `main` at the bottom of this document's history and in
`docs/DECISIONS.md`. Report all three values, always — count included.

---

## Why a green run with skipped tests is treated as a FAILURE

This is the point of the unit, so it is worth stating plainly.

A test suite that quietly opts out of its database-backed cases when the
database is missing produces a **green tick that means nothing**. That is worse
than having no CI, because the tick actively buys false confidence — a gate
that is vacuous in a new costume.

Three layers defend against it:

1. `TEST_DATABASE_URL` must be set and non-empty.
2. The database must **answer** a real query. A service block can start and
   still be unusable — wrong port, wrong database name, wrong password — and
   only a round trip catches that.
3. After the suite runs, the skip count (`numPendingTests + numTodoTests`) must
   be **zero**.

Layer 3 is the durable one: it holds no matter *how* a future test decides to
skip itself. Measured today, the suite has **no skip-gated tests at all** —
zero `skipIf`, `runIf`, `describe.skip` or `it.skip`, and zero tests that open a
database connection. Every test is pure or uses a stub. So layers 1–2 currently
guard the *environment* rather than any existing test, and layer 3 makes sure
that stays true as DB-backed tests get added.

If this gate ever fires, **fix the environment, not the assertion.**

---

## Why `next build` is not a gate

Measured on a 2-core / 7.9 GB box, on pristine `main`, with no heap cap:

| Command | Result | Peak |
| --- | --- | --- |
| `npx next build` | compiles in 104 s, then **`Next.js build worker exited with code: null and signal: SIGTERM`**, exit 1 | ~7.0 GB system-wide |
| `npx tsc --noEmit` | **exit 0 in 57 s**, no output | **877 MB** process RSS |

The build does not fail on a code problem — it compiles successfully and is
then killed during its TypeScript phase, which it runs in a separate worker
while still holding the compiled module graph. The *same* type check, run
standing alone, costs 877 MB.

A GitHub-hosted standard runner on a **private** repository has 2 cores and
**7 GB** of RAM (the 4-core/16 GB runners are for public repositories). That is
less headroom than the box that already dies, so `next build` in CI would be a
flaky-red gate — and a flaky gate gets ignored, which is the failure mode this
whole unit exists to prevent.

**What we lose:** `tsc --noEmit` does not catch what only a real build catches —
server/client boundary violations, bad route exports, RSC-specific build
errors. That risk is not unmitigated: the production build still runs on every
deploy, and unit 0.2 made it fail closed, so a build-breaking change blocks the
deploy instead of half-shipping. It just fails later than we would like.

Revisit if the repo goes public (bigger runners) or if a larger runner is ever
paid for.

---

## Why the lint gate is scoped to changed files

`npm run lint` reports **851 problems (772 errors, 79 warnings)** on pristine
`main`. Attributed by directory:

| Directory | Problems | Errors |
| --- | ---: | ---: |
| `docs/` (design-handoff `.jsx` mockups) | 803 | 765 |
| `src/` | 48 | 7 |
| **Total** | **851** | **772** |

Almost all of it is in static design mockups that are never imported, built or
deployed. The 7 real errors in `src/` are five `prefer-const` on one line of
`src/app/api/approval-workflows/route.ts` and two react-hooks
"cannot access variable before it is declared" in
`src/app/(kiosk)/remotekiosk/page.tsx`.

The options considered:

- **`--max-warnings N`** — does nothing here. These are *errors*, not warnings.
- **A baseline/snapshot file** — ESLint has no native baseline, so this means a
  third-party tool or a hand-rolled comparator, and a snapshot that goes stale.
- **A repo-wide count ratchet** ("must not exceed 851") — attractive, but it
  couples three parallel tracks together: a warning added by Track A would fail
  Track B's unrelated PR. Rejected for that reason.
- **Scope to changed files** — ✅ **chosen.** Green on arrival, no cross-track
  coupling, and it holds the line where it matters: code you touched must be
  clean. Touching one of the two dirty files does make your PR red, which is
  the correct incentive.

The repo-wide number is still printed on every run, so the debt stays visible
and can be paid down deliberately.

**Update, 16 Nov 2026 (PAY-131).** `src/` is now at zero lint errors: the
`prefer-const` errors were cleared earlier, and the last two (the kiosk page's
camera functions used in an effect before their declaration) are fixed. A
second blocking step, `npx eslint src --quiet`, keeps all of `src/` free of
errors, including files a PR does not touch, which the changed-files gate
cannot see. Warnings in `src/` and everything in `docs/` mockups stay
informational.

---

## Doc citations (unit 0.23)

`node scripts/check-doc-refs.mjs --strict` runs in `gates` and blocks. It parses
every `path:NN`, `path:A-B` and `path:A,B` citation in `docs/**/*.md` and fails
when the path does not resolve to exactly one tracked file (a bare file name
must be unique), or the cited line is past the end of the file. Writing
`` `src/auth.ts:107` (expects `prismaAdmin`) `` also requires that token on the
cited line, which is what catches a citation that still resolves but now points
at the wrong code. `docs/DECISIONS.md` is excluded: it is append-only and its
citations are true as of their date. `--all` includes it, for information
(10 Nov 2026: 52 ledger citations, 17 no longer resolve). To relax the gate, drop
`--strict` from the step; the report still prints.

## Making this enforceable (not done in 0.17)

In rough order of cost:

1. **GitHub Pro (~$4/month)** — unlocks branch protection on private repos, so
   `CI / gates` can become a required status check. This also unlocks the
   Secret Protection gap from unit 0.8. Cheapest real fix.
2. **Make the repository public** — free protection and free secret scanning,
   but this is a payroll system holding a real tenant's data model; not a
   trade to make casually.
3. **A local `pre-push` hook** running the same gates — free and immediate, but
   client-side and bypassable with `--no-verify`, exactly like the unit 0.9
   secret scan. It would catch honest mistakes, not determined ones.

---

## Files this unit added

| Path | Role |
| --- | --- |
| `.github/workflows/ci.yml` | The pipeline |
| `docs/CI.md` | This document |
