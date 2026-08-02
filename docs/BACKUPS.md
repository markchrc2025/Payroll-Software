# Database Backups — Sentire Payroll

Two independent layers protect the production database:

1. **Sliplane native backups / PITR** — protects against disk failure *within*
   Sliplane. Fine-grained recovery, but useless if the Sliplane **account or
   provider** is lost.
2. **Independent off-platform backup (this doc)** — a scheduled, encrypted
   `pg_dump` pushed to **Cloudflare R2** (a different provider), so a
   Sliplane-level failure never loses both the DB and its backup.

> **A backup you have never restored is not a backup.** The monthly restore
> drill (below) proves layer 2 actually works.

---

## How it works

| Piece | File | Runs where |
|---|---|---|
| Scheduled encrypted backup | `.github/workflows/db-backup.yml` | GitHub Actions |
| GFS retention prune (lock-aware) | `scripts/prune-backups.ts` | inside the backup job |
| Monthly + manual restore drill | `.github/workflows/db-restore-drill.yml` | GitHub Actions (throwaway `postgres:17`) |
| Restore verifier | `scripts/verify-backup.ts` | inside the drill job |
| Freshness heartbeat | `BackupRun` table → `/api/health` | written by the job, read by the app |
| Manual restore runbook | `scripts/restore-from-backup.md` | you, when recovering |

It runs on **GitHub Actions, not the app**: the app image is a Railpack native
build with no `pg_dump`, and a backup must keep working even if the app or the
whole Sliplane account is down. Three independent parties hold the pieces:
**GitHub** runs it, **Sliplane** holds the live DB, **Cloudflare R2** holds the
copy.

**RLS / role safety:** `pg_dump` only *reads*, via the owner (`BYPASSRLS`) role,
so it captures every row without weakening anything. No RLS policy or DB role is
altered. Restores only ever touch a throwaway scratch database.

---

## Required GitHub repo secrets (workflows only — never on the app)

Set under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `BACKUP_DATABASE_URL` | Sliplane **session-pooler** connection string (owner/BYPASSRLS role), reachable from GitHub runners. |
| `BACKUP_S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `BACKUP_S3_REGION` | `auto` |
| `BACKUP_S3_BUCKET` | `sentire-payroll-backups` |
| `BACKUP_S3_ACCESS_KEY_ID` | R2 API token access key (Object **Read & Write**, scoped to this bucket only) |
| `BACKUP_S3_SECRET_ACCESS_KEY` | R2 API token secret |
| `BACKUP_GPG_PASSPHRASE` | Symmetric AES-256 passphrase — **see the custody warning below** |

Optional tuning (workflow env, defaults shown): `BACKUP_KEEP_INTRADAY_HOURS=48`,
`BACKUP_RETENTION_DAILY=14`, `BACKUP_RETENTION_WEEKLY=8`.

### App env (optional)

The app holds **no** backup credentials. Freshness comes from the `BackupRun`
heartbeat row. The only optional app var is `BACKUP_MAX_AGE_HOURS` (default
`26`) — how old the newest backup may be before `/api/health` warns.

---

## ⚠️ Encryption passphrase custody — READ THIS

The dump is encrypted with `BACKUP_GPG_PASSPHRASE` before it leaves the runner.
**If you lose that passphrase, every backup is permanently unrecoverable — the
encrypted dumps are useless without it.**

- Store it in **at least two independent places** (e.g. your password manager
  **and** a sealed offline copy), separate from the GitHub secret.
- It is intentionally **not** the app's `ENCRYPTION_KEY`: restore happens outside
  the app, and the two must not be coupled.

---

## Cadence & RPO

The default schedule is **every 6 hours** (`cron: "0 */6 * * *"`) — the
**fail-safe** setting, giving ~6h RPO on the independent copy even if Sliplane
has no PITR.

Set the cadence to match Sliplane's native protection:

| Sliplane native PITR | Recommended cadence | RPO on the independent copy |
|---|---|---|
| **ON** (Sliplane covers fine-grained recovery) | daily is enough — the R2 dump is only the *provider-loss* floor | up to ~24h |
| **OFF / none** (R2 is your *only* recovery) | keep **every 6h** (or tighter) | ~6h |

To switch to daily, change the one cron line in `db-backup.yml` to
`"0 3 * * *"`.

> **Confirm Sliplane's PITR status** (Sliplane → Databases → the Postgres
> service → backups/PITR) and set the cadence accordingly. Until confirmed, the
> workflow ships the safe 6h default.

---

## Retention (GFS) & Object Lock

`scripts/prune-backups.ts` keeps, after each run:

- every dump from the last **48h** (intraday),
- the newest dump **per day for 14 days**,
- the newest dump **per week for 8 weeks**,

and deletes the rest (each dump plus its `.manifest.json`).

**Object Lock:** the bucket was created with Object Lock (EU jurisdiction,
~35-day default retention). The prune is **lock-aware** — any object still
within its retention window cannot be deleted, so the prune logs it as
`locked, kept` and moves on (never an error). This gives ransomware/tamper
resistance: **backups are immutable until their lock expires**, which also means
the *effective minimum retention is ~35 days* regardless of the GFS policy
above. The prune works identically if Object Lock is ever disabled.

---

## Freshness signal

After each successful run the workflow writes a `BackupRun` heartbeat row
(timestamps + object key + size + Employee/PayrollSheet/Invoice counts — **no
tenant PII**). `/api/health` reads the newest successful row and includes:

```json
"backup": { "status": "ok|stale|never|unknown", "lastBackupAt": "...", "ageHours": 3.2, "maxAgeHours": 26 }
```

`stale` or `never` also appears in the health `warnings` array. This read is
cached (60s), timeout-bounded, and fully guarded, so it can **never** flip
`/api/health` off its always-200 liveness — a DB blip just yields
`status: "unknown"`.

> First-run ordering: the `BackupRun` table ships as migration
> `20260802000000_backup_run`. Apply it to prod via the **`db-migrate`** GitHub
> workflow (the last manual-migration step; **task 0.2** removes it). Until it's
> applied, backups still run fine — the heartbeat insert is skipped with a
> warning and `/api/health` reports `backup.status = "unknown"`.

---

## Running the restore drill

- **Automatic:** the 1st of each month (`db-restore-drill.yml`).
- **Manual:** GitHub → Actions → **DB Restore Drill** → *Run workflow*.

It pulls the newest dump, decrypts, restores into a throwaway `postgres:17`, and
runs `scripts/verify-backup.ts`, which asserts the restored Employee /
PayrollSheet / Invoice counts equal the dump-time manifest. Green = your backup
is real and restorable. For a real (production) restore, follow
`scripts/restore-from-backup.md`.

---

## Manual backup drill (first-time verification)

1. Set the seven `BACKUP_*` secrets.
2. Apply the `BackupRun` migration via the `db-migrate` workflow.
3. GitHub → Actions → **DB Backup** → *Run workflow*. Confirm a
   `db/<timestamp>.dump.gpg` object appears in R2 and `/api/health` shows a fresh
   `backup` block.
4. GitHub → Actions → **DB Restore Drill** → *Run workflow*. Confirm it ends with
   `RESTORE VERIFICATION PASSED`.
