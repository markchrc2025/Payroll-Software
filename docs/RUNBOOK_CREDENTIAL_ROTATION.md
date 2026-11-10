# Runbook — rotating the owner database credential

**Execute by hand. Nobody else holds this credential and it must stay that way.**

The repository was public while CI logs printed the production database host, port,
database name and full role inventory, and the owner password was pasted in
plaintext during unit 0.1's setup. That password protects every tenant's payroll.
This runbook rotates it.

> **PostgreSQL cannot hold two valid passwords for one role.** There is no
> zero-downtime rotation for a single role — `ALTER ROLE … PASSWORD` takes effect
> for the *next* connection. Plan a short window **outside business hours**.
> Existing pooled connections survive the change; new ones fail until the app is
> redeployed with the new value.

---

## 0. Pre-flight — do not skip

**0a. Resolve the fourth location before touching anything.**
Unit 0.8's A1 found a DB credential store beyond the three known ones:
the GitHub secret **`BACKUP_DATABASE_URL`**, consumed by `db-backup.yml` and
`db-role-inventory.yml`. `docs/BACKUPS.md` says it must hold `backup_ro` or the
`postgres` superuser, **not** owner — but that is documentation, and this project
has already been bitten twice by controls that documentation claimed existed.
Confirm what it actually holds. Read the value in
**Settings → Secrets and variables → Actions**, or run the read-only
`db-role-inventory.yml` workflow and read `connected_as` in its log.

- If `connected_as` is **not** the owner role → it is out of scope. Proceed.
- If it **is** the owner role → it becomes location #4 and must be updated in
  step 4b, or the backup and inventory workflows break silently the next time
  they run.

**0b. Confirm superuser access.** The owner role can change its own password
(`ALTER ROLE current_user PASSWORD …`), but if anything goes wrong you need
`postgres` to recover. Verify you can connect as `postgres` **now**, not later.

**0c. Take a backup first.** Unit 0.1 is deferred, so there is no automated
backup. Take a manual dump before rotating, as the `postgres` superuser
(the owner role cannot dump — `FORCE ROW LEVEL SECURITY` and no `BYPASSRLS`):

```bash
pg_dump "postgresql://postgres:<pw>@<HOST>:5432/<DB>" -Fc -f pre-rotation.dump
ls -lh pre-rotation.dump      # must be non-trivial in size
```
`*.dump` is gitignored as of unit 0.8 — keep it off the repo anyway.

**0d. Generate the new password.** Avoid `@ : / ? # & %` — they need percent-encoding
inside a URL and are a common source of "password is wrong" that is actually a
parsing bug:
```bash
LC_ALL=C tr -dc 'A-Za-z0-9._~-' </dev/urandom | head -c 40; echo
```

**0e. Stage every edit screen before starting.** Open the Sliplane env editor and
both GitHub secret pages in tabs, with the new value ready to paste. The window in
step 2→3 is however long you take to click.

---

## The four locations

| # | Location | Holds | Consumed by |
|---|---|---|---|
| 1 | Sliplane app env → `DATABASE_URL` | owner | `prisma.ts:54`, `prisma-admin.ts:19`, `jobs/client.ts:20` |
| 2 | Sliplane app env → `DIRECT_DATABASE_URL` | owner | same three, **preferred** over `DATABASE_URL`; plus `prisma migrate deploy` at boot |
| 3 | GitHub secret → `MIGRATE_DATABASE_URL` | owner | `db-migrate.yml` (manual dispatch only) |
| 4 | GitHub secret → `BACKUP_DATABASE_URL` | **verify in 0a** | `db-backup.yml`, `db-role-inventory.yml` |

Keep host, port, database name and `sslmode` **identical** in every value. Change
only the password.

---

## 1. Announce the window

Payroll is in scope. Confirm nobody is mid-payroll-run.

## 2. Change the password on the database — **window opens here**

```bash
psql "postgresql://postgres:<pw>@<HOST>:5432/<DB>" \
  -c "ALTER ROLE payroll_user WITH PASSWORD '<NEW-PASSWORD>';"
```

**Verify immediately — new password works, old one is dead:**
```bash
# must SUCCEED and print payroll_user
psql "postgresql://payroll_user:<NEW-PASSWORD>@<HOST>:5432/<DB>" -tAc "SELECT current_user;"

# must FAIL with: password authentication failed
psql "postgresql://payroll_user:<OLD-PASSWORD>@<HOST>:5432/<DB>" -tAc "SELECT 1;" ; echo "exit=$?"
```
If the old password still works, the `ALTER ROLE` did not apply — **stop and fix
before continuing**, or you will believe you have rotated when you have not.

## 3. Update Sliplane — **window closes when this deploy goes healthy**

Update **both** `DATABASE_URL` and `DIRECT_DATABASE_URL` in the app's environment,
then deploy. Both must change. Because `prisma.ts:54` and `prisma-admin.ts:19` read
`DIRECT_DATABASE_URL ?? DATABASE_URL`, updating only one leaves the other stale and
the failure mode depends on which — do not update them one at a time.

**Verify — read the runtime log, in this order:**
```
[start] Applying database migrations (prisma migrate deploy)…
No pending migrations to apply.
[start] Migrations up to date — starting Next.js
✓ Ready in <n>ms
```
If instead you see
`::error:: DIRECT_DATABASE_URL (owner, direct connection) is not set` the variable
did not save. If you see a Prisma `P1000: Authentication failed`, the password in
the env does not match the one set in step 2.

**This step is fail-closed by design (unit 0.2).** A wrong password blocks the
deploy and Sliplane keeps serving the previous container. You cannot half-rotate
into a broken running app — the worst case is that the *new* deploy never starts.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://payroll.sentire.solutions/api/health   # 200
```
Then log in as a tenant admin in a browser. `src/auth.ts:100` (expects `prismaAdmin`) uses `prismaAdmin`, so a
successful login is what actually proves the rotated credential reached the admin
client — the health endpoint alone does not.

## 4. Update the GitHub secrets

**4a. `MIGRATE_DATABASE_URL`** — Settings → Secrets and variables → Actions.

Verify with a **non-destructive dry run**: Actions → *DB Migrate (manual break-glass / status)*
→ Run workflow → **`dry_run` = true**. It runs `prisma migrate status` and applies
nothing. Expect `Database schema is up to date!`. A `P1000` means the secret is wrong.

**4b. `BACKUP_DATABASE_URL`** — only if step 0a showed it holds the owner role.
Verify by dispatching the read-only *DB Role Inventory (diagnostic)* workflow and
confirming it connects.

## 5. Close out

- Confirm no plaintext copy of the new password remains: not in chat history, not
  in a scratch file, not in shell history.
  ```bash
  history | grep -i 'ALTER ROLE' && history -d <n>   # or: unset HISTFILE for the session
  ```
- Delete `pre-rotation.dump` once the app is confirmed healthy, or move it to
  encrypted storage. It contains every tenant's payroll in plaintext.
- Record the rotation date in `docs/DECISIONS.md`.

---

## What breaks during the window, and why

| Consumer | Effect between step 2 and step 3 |
|---|---|
| Runtime requests (`prisma`) | Existing pooled connections keep working; **new** connections fail. Errors appear gradually, not instantly — do not read early success as "no impact". |
| Login (`prismaAdmin`, `src/auth.ts:100` (expects `prismaAdmin`)) | Fails once it needs a new connection. |
| pg-boss (`jobs/client.ts:20`) | Uses LISTEN/NOTIFY on a long-lived connection. On its next reconnect it fails and job workers stop. Recovers on redeploy. |
| Migrate-at-boot (`scripts/start.sh`) | If the container restarts mid-window it fails closed and the deploy is blocked — protective, not a fault. |
| `db-migrate.yml` | Manual dispatch only. No impact unless dispatched. |
| `db-backup.yml`, `db-restore-drill.yml` | Disabled (unit 0.1 deferred). No impact. |

## Rollback

Before step 4: re-run step 2 with the **old** password, then redeploy Sliplane with
the old values. After step 4: reverse the secrets too. There is no state to unwind —
a password rotation is idempotent and carries no schema change.

## If you are locked out

Recover as `postgres`. If the `postgres` password is also unknown, Sliplane's
database console is the remaining route. This is why step 0b is not optional.
