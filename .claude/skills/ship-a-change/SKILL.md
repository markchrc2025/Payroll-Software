---
name: ship-a-change
description: The end-to-end flow for shipping any Sentire Payroll change (Mark, 16 Nov 2026) - branch, full local gate, PR, CI, staging check with the QA connector, automatic squash merge, production deploy check, staging sync, and Sentire Projects update. Use for every code change to this repository.
---

# Shipping a change

`main` deploys to production (payroll.sentire.solutions) automatically. The
owner's standing instructions (16 Nov 2026): when a test fails, fix what is
failing and test again until it passes (never by changing what a test
expects); merge every PR automatically once it is green, without asking.

## 1. Branch and build

- Branch from `origin/main`: `feat/…`, `fix/…`, `chore/…`, with the issue key
  (e.g. `feat/pay141-pay-schedules`).
- Next.js 16 here has breaking changes: read `node_modules/next/dist/docs/`
  before writing framework code.
- Stage files by name (`git add <paths>`), never `git add -A`.
- Migrations: a new folder, never an edit to an applied one. New tenant tables
  get the RLS shape (ENABLE, FORCE, `tenant_isolation`, `admin_bypass` for the
  owner, GRANT to `payroll_app` guarded on the role existing);
  `u07-t6-rls-catalogue` fails otherwise. Check the schema matches with
  `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma`.

## 2. The full local gate (same as CI; see unit-report)

Fresh database, all tests, zero skipped, `tsc --noEmit`, zero-warning lint on
changed files, `eslint src --quiet`, doc references. Fix and rerun until green.

## 3. PR and CI

Open the PR against `main` with what changes, what does not, and the tests.
Wait for `gates`, `integration (advisory)` and `secret scan`. If `gates` is
red, read the job log, fix, push, and wait again.

## 4. Staging check (the real thing)

- Merge the branch into `staging` (never force-push `staging`). The Payroll
  Staging app redeploys and re-seeds its throwaway database (docs/STAGING.md);
  every staging deploy resets its data.
- Use the Payroll Staging QA connector to run the scenario the change is
  about, and check the figures by hand.
- Do not finalize the seeded runs. Finalize anything on staging only with the
  owner's go-ahead.
- Put any staging settings you changed back the way you found them.

## 5. Merge and verify production

- Squash-merge the PR (`gh api -X PUT repos/<owner>/<repo>/pulls/<n>/merge
  -f merge_method=squash -f sha=<head>`), referencing the issue key in the
  title.
- Watch the production deploy in Dokploy until it is done; check the runtime
  log shows the migrations applied and `GET /api/health` returns 200.
- Merge `main` back into `staging`.

## 6. Record it

- Sentire Projects: move the issue (In review when the PR opens, Done when it
  is live), with a short factual comment: PR number, what changed, test
  counts, staging result. Every issue has a milestone; anything outside the
  current plan goes to Phase 0.
- `docs/DECISIONS.md`: an appended line (see decision-log).
- Tell the owner what shipped, in the owner-facing format (see unit-report).
