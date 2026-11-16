---
name: test-conventions
description: How tests are written in Sentire Payroll. Use when adding or changing tests: file prefixes per unit or issue, seen-to-fail-first, real-Postgres suites that must never skip in CI, statutory fixtures, and what a payroll test must prove.
---

# Test conventions (R128)

## File names carry their owner's prefix

Every test file starts with the unit or issue it belongs to, so two pieces of
work can never overwrite each other's tests (this once happened and was caught
by luck):

- a build unit: `src/__tests__/u<unit>-<topic>.test.ts`, e.g.
  `u1-8-salary-type-engine.test.ts`;
- a tracked issue: `src/__tests__/pay<number>-<topic>.test.ts`, e.g.
  `pay133-sss-basis.test.ts`, with a `-db` suffix for the real-database suite.

The file header lists what it proves as numbered items (T1, T2 … or a letter
per area, e.g. M1, E1, D1) and states the ruling or issue behind it.

## Seen to fail first

T1, the assertion that matters most, is run against the code BEFORE the fix
and its failing output is kept for the report. A test written after the fix
proves nothing about whether the fix does anything. If the change is new
behaviour with nothing to fail against, say so explicitly.

## Real Postgres, never skipped in CI

- Database suites use `const describeDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;`,
  make their own tenant with a random suffix, and delete everything they
  created in `afterAll` (children before parents).
- CI sets `TEST_DATABASE_URL` and fails the run if ANY test is skipped. Locally,
  run the suite against a fresh database the same way:
  ```
  createdb payroll_ci_local
  TEST_DATABASE_URL=... DATABASE_URL=... DIRECT_DATABASE_URL=... TZ=Asia/Manila node scripts/db/ensure-roles.mjs
  ... npx prisma migrate deploy
  ... npx vitest run --reporter=json --outputFile=/tmp/vitest-results.json
  ```
  and check `numPendingTests + numTodoTests === 0`.
- Route handlers are tested by calling the exported handler with a
  `NextRequest`; mock only `@/lib/auth`, `@/lib/authz/route-permission`,
  `@/lib/require-permission`, the job queue and the audit writer. Everything
  else runs for real.
- Payroll runs in tests go through the real `createDraftRun`, `recomputeRun`,
  `queueRun` + `processRun` in `src/lib/payroll/persist.ts`. Finalized history
  can be set with SQL on the book's status.

## Statutory fixtures

Engine tests take rule payloads from `src/__tests__/fixtures/statutory-test-rules.ts`
(shapes only, not real rates). A database suite inserts them as
tenant-scoped `StatutoryRule` rows; the de minimis rule must carry at least one
item.

## What a payroll test must prove

- Figures to the centavo, with the arithmetic written in the test (e.g.
  `1_250_000n - 114_943n // one day at 25,000 x 12 / 261, HALF-UP`).
- Both directions of a rule: what is included AND what is excluded (overtime
  not in the SSS base, an unapproved DTR record ignored).
- The invariant that must not move (e.g. PhilHealth stays on the contract when
  SSS changes).
- Never change what an existing test expects in order to make a change pass.
  If an assertion is protected by a ruling, stop and ask.
