---
name: decision-log
description: How docs/DECISIONS.md is kept in Sentire Payroll. Use whenever a ruling is made, a unit or issue closes, or a reading is taken without a ruling, and whenever a merge conflicts in the decision log.
---

# The decision log (docs/DECISIONS.md)

The decision log is the authoritative record of what was decided and why. It is
read by the owner and by every later session.

## Rules

- **Append-only.** Add a new dated line; never edit or delete an old one. Old
  entries stay stale on purpose: rewriting history to match the present is the
  same instinct the sealed-record rule exists to prevent. A correction is a new
  entry that names what it corrects.
- **One line per decision,** starting `- YYYY-MM-DD: <ISSUE or UNIT> <STATE>`
  (BUILT, CLOSED, CORRECTED, RULING). Say who decided and when ("Mark, 16 Nov
  10:39"), what was decided, how it was implemented (files), and the tests that
  prove it.
- **Readings taken without a ruling are labelled as such** ("Reading taken
  without a ruling: …, flagged to Mark"), so nobody mistakes them for the
  owner's decision.
- **Re-read the log against every ruling in the message** that closes a unit
  and append whatever is missing (R116). Do not just confirm: when a ruling
  arrives in the same message that approves a merge, the log entry may already
  be written without it.
- **It is the sanctioned keep-both-sides merge file.** Merges conflict here and
  only here; resolve by keeping both sides in date order. That is expected,
  not a failure.
- **No em dashes** in anything written for the owner, the log included (use a
  colon, a comma or a full stop).
- `scripts/check-doc-refs.mjs` skips this file on purpose: its `path:NN`
  citations are history and may no longer resolve.
