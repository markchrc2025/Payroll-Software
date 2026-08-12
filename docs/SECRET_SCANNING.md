# Secret scanning (pre-commit) — unit 0.9

**One line:** every `git commit` in this repository is scanned for credentials
*before* the commit object exists, by a local gitleaks run over the staged diff.

---

## Why this exists

Unit 0.8 made the repository private. That was the right call — it stopped an
ongoing disclosure where CI logs printed the production database host, port,
database name and role inventory to a publicly readable Actions log.

It also **reduced** our automated secret detection. GitHub secret scanning and
push protection are free on **public** repositories; on a **private** repository
under a personal account they require paid Secret Protection. So going private
turned the server-side net off.

This hook is the compensating control: free, plan-independent, and it runs
*earlier* than the thing it replaces. Push protection catches a secret when you
push. This catches it before it is ever committed — so there is no bad commit to
rebase away, and no window in which the secret sits in your local history.

---

## What is installed

| Path | What it is |
|---|---|
| `.githooks/pre-commit` | The real hook. Tracked, reviewable, versioned. |
| `.githooks/gitleaks-report.tmpl` | Turns gitleaks' `leaks found: 1` into a file:line + rule you can act on. |
| `.gitleaks.toml` | Rules + allowlist. Extends the ~170 stock rules; adds the ones this project actually needs. |
| `scripts/install-git-hooks.sh` | Installs a shim at `.git/hooks/pre-commit`. Run by `npm install` / `npm ci` via `prepare`. |
| `scripts/install-gitleaks.sh` | Fetches a pinned, checksum-verified gitleaks 8.30.1 into `~/.cache/sentire-gitleaks/`. |
| `scripts/scan-secrets.sh` | The manual wider sweep — `npm run scan:secrets`. |
| `scripts/u09-secret-scan-tests.sh` | Acceptance tests: blocks a real secret, allows placeholders, bypass works. |

**A shim, not `core.hooksPath`.** This repository has four live git-lfs hooks in
`.git/hooks` (`post-checkout`, `post-commit`, `post-merge`, `pre-push`). Setting
`core.hooksPath` — which is what husky and lefthook both do — would have
silently disabled all four. Instead `.git/hooks/pre-commit` is a two-line shim
that `exec`s the tracked `.githooks/pre-commit`, so nothing else in `.git/hooks`
is disturbed and the logic still lives in version control.

**No new npm dependency.** gitleaks is a Go binary. Every npm wrapper for it
downloads the release tarball from a `postinstall` script, which would put a
network fetch inside `npm ci` — including the Railpack production build. The
binary is instead fetched lazily by the hook, on a developer machine, and cached
outside the repository at `~/.cache/sentire-gitleaks/8.30.1/gitleaks`. The build
never touches it.

### Fresh clone

```bash
git clone …
npm install          # `prepare` installs the hook shim
git commit …         # first commit fetches gitleaks (~7 MB, once per machine)
```

Nothing else to remember. If you want the binary up front:
`bash scripts/install-gitleaks.sh`.

---

## What it scans

Only the **staged diff** (`gitleaks git --pre-commit --staged`) — not the whole
repository, not your unstaged work. Cost is proportional to the change: ~600 ms
on an ordinary commit. A slow hook is a bypassed hook.

Detections are the stock gitleaks ruleset **plus** two rules written for this
project, because the stock set was measured and found to miss the credentials
that matter most here:

| | Stock gitleaks 8.30.1 | With `.gitleaks.toml` |
|---|---|---|
| `postgresql://user:PASSWORD@host/db` (the owner DB URL) | **miss** | caught (`sentire-db-uri-password`) |
| `AUTH_SECRET=…` | **miss** | caught (`sentire-named-app-secret`) |
| `GPG_PASSPHRASE=…` (backup encryption) | **miss** | caught (`sentire-named-app-secret`) |
| `ENCRYPTION_KEY=…` | caught | caught |
| `RESEND_API_KEY=re_…` | caught | caught |
| R2 / AWS secret access key | caught | caught |
| GitHub PAT, Stripe, Slack, private keys, … | caught | caught |

That first row is the point of the whole exercise. A stock-config gitleaks would
have let a committed `.env` containing the production owner connection string go
straight through.

The secret itself is **redacted** in the hook's output, so blocking a commit does
not paste the credential into your terminal scrollback.

---

## What it does NOT cover

Read this part. The gaps are specific and one of them is the leak that actually
happened.

### 1. PII. This would NOT have caught unit 0.8's leak.

Unit 0.8's real incident was two stray files committed by `git add -A`, one of
them containing `psql` output with a **real HR Admin's email address**, that
user's `roleId`, the role name, and a live `tenantId` in the filename.

Both blobs were extracted from history and scanned with this exact
configuration. Result: **no leaks found** — with the stock ruleset too.

An email address is not a secret. A cuid tenant id is not a secret. No
credential scanner, local or server-side, would have flagged those files; GitHub
push protection would not have flagged them either, which is why "we lost push
protection" was never the whole story for that incident.

**Proposed follow-up (NOT implemented in unit 0.9):** the failure shape was
`git add -A` sweeping up junk, and junk is recognisable by its *filename* long
before its contents. A path guard in the same hook, rejecting newly-added files
whose names contain shell/SQL fragments (` -h `, `SELECT `, `LIMIT `, `psql`,
embedded quotes) or that are unrecognised top-level files, would have blocked
both files by name. That is a filename rule, not a secret rule, and it belongs in
its own unit — proposed here so it is not forgotten.

Until then, the honest mitigation is behavioural: **do not `git add -A`.** Stage
by path, or read `git status` before every commit.

### 2. It only sees the staged diff.
A secret already in the working tree but never staged is invisible to it, as is
anything already in history. Use `npm run scan:secrets` (tree) and
`npm run scan:secrets -- history` (all refs) for those.

### 3. It runs locally, so it can be bypassed — deliberately.
See below. Anyone committing with `--no-verify`, or from a machine where
`npm install` never ran, is unprotected. This is a developer-machine control,
not a server-side gate.

### 4. It is not a replacement for rotation.
If it blocks you, the secret is already on your disk and probably in your editor
history. Blocking the commit is not containment. See
`docs/RUNBOOK_CREDENTIAL_ROTATION.md`.

### 5. Secrets that do not look like secrets.
A high-entropy string with no keyword near it, a password made of dictionary
words, a credential split across lines — all pass. Detection is pattern
matching, not comprehension.

---

## Emergency bypass

**A hook you cannot skip gets deleted, and a deleted hook protects nothing.**
Both of these work, and using one is a legitimate decision, not a workaround:

```bash
git commit --no-verify -m "…"          # git's own escape hatch, skips all hooks
SKIP_SECRET_SCAN=1 git commit -m "…"   # skips only the secret scan; prints a warning
```

Use them when you have **read the finding** and know the value is not a live
credential — a test fixture, a documentation placeholder, a false positive you
have not had time to allowlist properly.

If you bypass because the value *is* real: rotate it.

---

## When it cries wolf

A scanner that fires on innocent code gets disabled within a week, so treat a
false positive as a defect in `.gitleaks.toml`, not as noise to be endured.

Add the **narrowest** entry that fixes it, in the matching block:

- `[[allowlists]]` with `paths` — a whole file that is inherently placeholder
  material (a runbook, a fixture, a design mockup).
- `[[allowlists]]` with `regexTarget = "secret"` — a placeholder *value*.
- `[[allowlists]]` with `regexTarget = "line"` — a specific known-safe line
  pattern (this is how `key: "includeIn13thMonth"` in the pay-components page is
  suppressed without blinding the scanner to that whole file).
- `[rules.allowlist]` under a specific rule — when only that rule is wrong.

Say **why** in a comment, then re-run `bash scripts/u09-secret-scan-tests.sh` to
confirm you have not also allowlisted a real secret.

The already-known-safe items are annotated in `.gitleaks.toml`: the `<pw>` /
`<owner-pw>` placeholders in the rotation, migration and restore docs; the
throwaway `POSTGRES_PASSWORD: scratch` of the restore-drill container; the env
fixtures in `src/lib/__tests__/env-check.test.ts`; the fabricated reset token in
the design-handoff email mockups; and `.next/` build output.

---

## Current state

As of unit 0.9, with this configuration:

- **Working tree:** clean — 0 findings.
- **Full history, all refs (363 commits):** clean — 0 findings. This corroborates
  unit 0.8's conclusion that no credential is reachable in history, by a
  different method. The single hit in the raw history scan was
  `selfieKey: "smoke-z16-selfie-recent"` in the long-deleted
  `scripts/smoke-z.ts` — an R2 object key from a smoke test, not a credential,
  and now allowlisted by name.

Re-check either at any time:

```bash
npm run scan:secrets              # working tree
npm run scan:secrets -- history   # every commit on every ref
```
