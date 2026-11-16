---
name: unit-report
description: What a Sentire Payroll unit report must contain. Use when reporting the result of a unit, a fix or a PR, so the owner can verify it: A1 first, final suite and gate lines, T1 failing then passing, DEFINED vs EXECUTED counts, commit hash and a clean tree, and anything that was wrong.
---

# Reporting a unit (R128)

A report is how the owner checks the work without reading the code. Each item
below exists because its absence once hid a defect.

1. **A1 first.** The stop-check answer leads, because it can stop the unit.
2. **Final lines of every suite and every gate,** exit codes shown separately
   and unpiped (a pipe hides a failing exit code). For this repository the
   gates are the same as CI:
   - `npx vitest run --reporter=default --reporter=json --outputFile=vitest-results.json`
     on a fresh database with `TEST_DATABASE_URL` set;
   - the skip check: `numPendingTests + numTodoTests` must be 0 (a green run
     with skips is a failure: a database suite silently opted out);
   - `npx tsc --noEmit`;
   - `npx eslint --max-warnings 0` on every file the change touches;
   - `npx eslint src --quiet` (no lint errors anywhere in `src/`);
   - `node scripts/check-doc-refs.mjs --strict`.
3. **T1's FAILING output before its passing output.** A test written after the
   fix proves nothing about whether the fix does anything.
4. **DEFINED and EXECUTED counts as numbers** (for example "672 defined, 672
   executed, 0 skipped"), reconciled with the previous report: say what was
   added or removed and why the totals move by that much.
5. **The rendered output as text** wherever the unit produces one (a payslip
   line, a computed sheet, an API body), so the figures can be checked by hand.
6. **Every test named,** no gaps, with the file it lives in.
7. **Commit before reporting.** Paste the commit hash and the output of
   `git status --short` (expected: empty). A pass that reports green on an
   uncommitted tree has not finished.
8. **Anything I got wrong.** The most valuable line in the format. If it is
   empty after a large change, the rest deserves a slower read.

## Owner-facing format (Mark's standing instruction)

When writing to the owner, use these headings in this order, only the ones
needed: `# EXPLANATION` (prose, not bullets: what the work says and what it
does not), `# STEP BY STEP` (one action per step, its expected result, only
steps the owner can do now), `# PROMPT TO CLAUDE CODE` ("None" when the work is
done in-session). End with a status table of open items. No em dashes in
anything written for the owner.
