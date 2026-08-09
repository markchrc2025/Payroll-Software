# Decision log

Append-only. One line per closed unit or reversed decision — newest at the bottom.
Never edit or delete an existing line; if a decision is reversed, append the reversal.

`.gitattributes` marks this file `merge=union` so concurrent appends on different
branches keep BOTH sides instead of conflicting. That only works if every entry is a
single self-contained line.

- 2026-08-09 — unit 0.2 CLOSED (PR #215): migrations now auto-apply on deploy via `scripts/start.sh` (fail-closed: migrate errors block the deploy and Sliplane keeps the previous version); Railpack's launch path verified empirically with the Railpack CLI run against this tree — no `railpack.json` resolves to `npm run start`, with it to `bash scripts/start.sh`, and Railpack detects Next (`nodeRuntime: next`) yet still honours the start script; `railpack.json` retained deliberately to drop the npm wrapper so `exec next start` is the container's direct child, giving clean SIGTERM delivery to in-process pg-boss.
