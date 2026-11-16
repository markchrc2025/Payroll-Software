---
name: unit-prompt
description: The Sentire Payroll unit format. Use when planning, writing or carrying out a build unit or a fix (a "unit prompt"), so every unit has a stop-check, a do-not-touch list, numbered tests with T1 seen to fail first, and a complete report.
---

# The unit format (Session Operating Agreement, 9 Aug 2026; R128)

Every piece of work on this repository is a unit. A unit follows this shape.
Deviating loses information the owner relies on. Each rule was earned by a
specific failure on an earlier product; the reasons are kept with the rules,
because a rule without its reason gets dropped the first time it is
inconvenient.

## Shape

```
[<UNIT ID> · SHORT TITLE IN CAPITALS]
Echo this label back at the top of the report.

ACKNOWLEDGING <previous unit>. Two or three things it got RIGHT, named
specifically (a finding, a correct refusal, a self-correction). Reconcile the
test counts with the previous report and say whether they reconcile.
<Rulings on questions the previous report raised, numbered R1, R2 ...>
─────────────────────────────────────────────
THE UNIT: one paragraph on why it exists and what it closes.
REPORT FIRST, THEN BUILD IN THE SAME PASS.
A1  THE STOP-CHECK. A question whose answer could invalidate the unit. Always
    include one. Phrase it "IF X, STOP AND TELL ME" and mean it. A stop-check
    that cannot stop anything is decoration.
A2… Further questions, each answerable FROM THE CODE, with file and line.
A5  REPORT ONLY: things to investigate and explicitly NOT build.
─────────────────────────────────────────────
BUILD
B1 … B2 …
─────────────────────────────────────────────
DO NOT TOUCH
 - An explicit list: other work's surfaces, anything already proven, anything
   frozen (applied migrations, sealed records, protected test files).
TESTS (numbered, no gaps, T1 matters most)
T1  The single most important assertion. SEEN TO FAIL FIRST (see
    test-conventions).
T2… …
REPORT (see unit-report)
```

## Rules that go with it

- **Never assume.** If something cannot be verified from what is in front of
  you, say "I cannot verify this from here".
- **Check the arithmetic by hand.** Add the columns, reconcile counts between
  runs. This has caught more real defects than any other habit.
- **A green test proves only what it exercises.** Ask for DEFINED and EXECUTED
  counts, not just passes. A test that disappears reads as green.
- **Watch for the guard conditioned on the wrong thing:** a check keyed to
  something that merely correlates with the rule. It passes every test and
  fails in production.
- **Never reorder the build plan without asking.** Units keep their numbers.
  Fixes go into the unit they belong to as AMENDMENT 1, AMENDMENT 2, PASS 2,
  never a new number.
- **Test on the real thing.** Most serious defects are found in a browser or on
  a device. If something has never been run by a human, say so every time it
  becomes relevant. Staging (docs/STAGING.md) and its QA connector are the
  real thing for payroll figures.
- **Say when you were wrong,** as a correction to the record, not an apology.
- **Protected tests.** If a change needs an existing assertion changed, and
  that assertion is protected by a ruling (for example the 3 Sep rule on
  `src/lib/payroll/__tests__/engine.test.ts`), stop and ask the owner first.
  Never change what a test expects just to make it pass.

## Standing domain rules (section 4 of the agreement)

- Sealed records (a finalized payroll run) are never modified or deleted. A
  correction is a new document. No backfill.
- A sealed document reproduces exactly as issued, from a snapshot taken at seal
  time, never from live data.
- Use the domain's date (pay period, pay date), never the calendar date.
- An applied migration is frozen. The fix is a second migration.
- Anything important crossing a process boundary needs a round-trip test AND a
  persistence test at the far end.
- A CHECK constraint rejects only on FALSE; NULL passes. Cover NULL explicitly.
- A unique index is not immutability. Immutable fields need a trigger that
  rejects value to different value and value to NULL, and permits NULL to value.
- Port collisions: report, never kill. Identify the PID and work around it.
- Statutory rates (SSS, PhilHealth, Pag-IBIG, BIR tables, 13th month, de
  minimis) are statute, not configuration: effective-dated, editable only by
  the software provider.
