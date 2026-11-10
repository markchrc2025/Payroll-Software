# Secret scanning (pre-commit) — unit 0.9

**One line:** credentials are scanned twice — locally by a pre-commit hook before
the commit exists, and again server-side in CI over every pull request, because
the local hook alone provably missed merge commits.

| | Local hook (unit 0.9) | CI job (unit 0.9 Am 2) |
|---|---|---|
| Runs on | `git commit` | every PR, and every push to `main` |
| Sees | the staged diff | the merged tree **and** every commit in the PR |
| Catches merge commits | **no** | yes |
| Bypassable | yes, `--no-verify` | no |
| Config | `.gitleaks.toml` | the same `.gitleaks.toml` |
| Blocks a merge | n/a | **no — advisory, see below** |

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
| `.github/workflows/ci.yml` (job `secret scan`) | The server-side scan — merge commits and `--no-verify` (unit 0.9 Am 2). |

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

## The CI scan (unit 0.9 Amendment 2)

`.github/workflows/ci.yml`, job **`secret scan`**, on every pull request and
every push to `main`.

### Why a server-side scan was needed

The local hook had two holes, and one of them was demonstrated rather than
theorised:

1. **Merge commits.** Git fires `pre-merge-commit` for an automatic merge, not
   `pre-commit`, and no `pre-merge-commit` hook is installed. A credential
   committed on a branch with `--no-verify` and then merged **with no bypass
   flag at all** lands unblocked, at exit 0. The local hook never sees it.
2. **`--no-verify`, and any machine where `npm install` never ran.** The hook is
   deliberately skippable (see below); a server-side scan is not.

### What it scans, and why it is two scans and not one

| Scan | Catches | Misses |
|---|---|---|
| `gitleaks dir .` — the tree that would be merged | a secret **present** in the code, including one committed before this PR and never removed | a secret added and then deleted within the same PR |
| `gitleaks git --log-opts=BASE..HEAD` — every commit the PR introduces | anything **introduced** by the PR, including added-then-deleted and merge commits | a secret that predates the PR |

Measured, not assumed. Building both cases in a scratch repository:

```
S1: secret merged in, still present in tree
  tree scan : leaks found: 1      range scan: leaks found: 1
S2: secret added then deleted in the SAME branch
  tree scan : no leaks found      range scan: leaks found: 1
```

Deleting a secret in a later commit does not unleak it — the blob still merges
into `main`'s history. **Neither scan is sound alone**, so the job runs both.

The whole-tree scan is affordable because the tree is clean: 5.79 MB in 1.7 s,
zero findings on `main`, and a full-history scan of all 381 commits is also
zero. A tree scan only becomes noisy once something real is in the tree — at
which point being noisy is correct.

### It cannot silently no-op

Three assertions run before any verdict is believed, on the same principle as
the zero-skip assertion in `docs/CI.md`:

1. **gitleaks installed and executable** — via the repo's own
   `scripts/install-gitleaks.sh`, so CI uses the identical pinned, sha256-verified
   8.30.1 as the local hook. A failed download or a checksum mismatch fails the
   job. There is no `|| true` anywhere in it.
2. **`.gitleaks.toml` present** — CI must scan with the *same* config as the
   hook. Two configs that drift are worse than one that is imperfect: a commit
   that passes locally and fails in CI teaches people to bypass locally.
3. **The commit range is non-empty** — an empty `BASE..HEAD` would scan nothing
   and pass trivially. This is the vacuity trap in a new costume, so it is
   asserted rather than trusted.

### Forks and cold caches

A pull request from a fork runs this job normally: the workflow uses
`pull_request` (not `pull_request_target`), so it executes against the fork's
code with a read-only token, which is all the job needs. There is no cached
binary to be missing — `scripts/install-gitleaks.sh` fetches and verifies the
pinned release on every run, and if that fetch fails the job goes **red**, never
green-with-a-skip.

### It is ADVISORY, like every other check here

There are no required status checks on this repository — branch protection needs
GitHub Pro on a private repo. A red secret scan does **not** prevent
`gh pr merge --squash`. See the first section of `docs/CI.md`. Until that
changes, the discipline is human.

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

**Implemented in unit 0.16.** `scripts/check-filenames.mjs` runs first in
`.githooks/pre-commit` (before gitleaks, and even with `SKIP_SECRET_SCAN=1`)
over the files a commit ADDS, and again in CI's `secret scan` job over the
files a pull request adds. It refuses names containing a command-line flag
(` -h `), an upper-case SQL keyword as a word (`SELECT`, `LIMIT`), a database
or network tool name (`psql`, `pg_dump`, `curl`), a quote or shell
metacharacter, a control character or a `.`/`..` segment, and any new file at
the repository root that is not on the allowlist in the script. Both of unit
0.8's real filenames are refused by four rules each; every file tracked at
the time passes. Bypass deliberately with `SKIP_FILENAME_GUARD=1` or
`git commit --no-verify`. It checks names only: a sensibly named file full of
personal data still passes, so "do not `git add -A`" still stands.

### 2. The LOCAL hook only sees the staged diff — CI is what covers the rest.
A secret in the working tree but never staged is invisible to the hook, as is
anything already in history, as are merge commits. The CI job closes the first
and third of those for anything arriving through a pull request. For history,
use `npm run scan:secrets` (tree) and `npm run scan:secrets -- history` (all
refs).

### 3. The local hook is bypassable — deliberately. CI is not, but CI cannot block a merge.
Anyone committing with `--no-verify`, or from a machine where `npm install`
never ran, is unprotected locally; the CI job catches them at the pull request.
But CI is **advisory** — no required status checks without GitHub Pro — so a red
secret scan does not stop `gh pr merge --squash`. The gate reports; a human still
has to obey it.

### 3b. Nothing scans a direct push to `main` before it lands.
The CI job runs on `push: main`, which is *after* the commit is already on the
branch. It will tell you a secret landed; it cannot stop it landing. Pull
requests are the only path where the scan runs before the merge.

### 4. It is not a replacement for rotation.
If it blocks you, the secret is already on your disk and probably in your editor
history. Blocking the commit is not containment. See
`docs/RUNBOOK_CREDENTIAL_ROTATION.md`.

### 5. Secrets that do not look like secrets.
A high-entropy string with no keyword near it, a password made of dictionary
words, a credential split across lines — all pass. Detection is pattern
matching, not comprehension.

### 6. Rules are only as good as their patterns, and stock patterns have edges.
Two measured examples from this project, both fixed in `.gitleaks.toml` and both
found only because someone tested rather than assumed:

- The stock ruleset does **not** flag a Postgres connection string with an
  embedded password — the single most valuable credential here (unit 0.9).
- The stock AWS rule is `(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}`. The
  suffix is the **base32** alphabet, so it excludes the digits 0, 1, 8 and 9.
  Real AWS key IDs are base32, so the rule is right for real keys — but a
  malformed or transcribed one slips through. Unit 0.9 Am 2 widened it to
  `[A-Z0-9]{16}` (rule `sentire-aws-access-key-id`).

The lesson generalises: **test a rule against a value you believe it should
catch before trusting it.** A rule you have never seen fire is a rule you have
not verified.

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
- **Full history, all refs (381 commits):** clean — 0 findings. This corroborates
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
