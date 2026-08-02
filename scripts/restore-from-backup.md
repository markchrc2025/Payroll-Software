# Runbook — Restore from an off-platform backup

Two procedures:

- **A. Restore drill** — the routine "prove the backup works" exercise (monthly
  + on demand). Touches only a throwaway scratch DB.
- **B. Real restore** — recovering actual production data into a new database
  after a real loss.

See `docs/BACKUPS.md` for the overall design. Backups live in Cloudflare R2 as
`db/<timestamp>.dump.gpg` (custom-format `pg_dump`, gpg AES-256 encrypted), each
with a `db/<timestamp>.dump.manifest.json` beside it.

> ⚠️ You need **`BACKUP_GPG_PASSPHRASE`** to decrypt anything. Without it every
> dump is unrecoverable. Keep it in two independent places.

---

## A. Restore drill (routine)

**Easiest — no local setup:** GitHub → **Actions → DB Restore Drill → Run
workflow**. It restores the newest dump into a throwaway `postgres:17` and
asserts row counts. Success ends with `RESTORE VERIFICATION PASSED`.

**Locally** (needs Docker, PostgreSQL 17 client, aws-cli, gpg, and the `BACKUP_*`
values in your shell):

```bash
# 0) scratch Postgres 17
docker run -d --name scratch-pg -e POSTGRES_PASSWORD=scratch -e POSTGRES_DB=verifydb -p 5433:5432 postgres:17
export SCRATCH_DATABASE_URL="postgresql://postgres:scratch@localhost:5433/verifydb"

# 1) newest dump + manifest from R2
aws configure set default.s3.addressing_style path
export AWS_ACCESS_KEY_ID=$BACKUP_S3_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$BACKUP_S3_SECRET_ACCESS_KEY
export AWS_DEFAULT_REGION=auto AWS_REQUEST_CHECKSUM_CALCULATION=WHEN_REQUIRED AWS_RESPONSE_CHECKSUM_VALIDATION=WHEN_REQUIRED
KEY=$(aws s3api list-objects-v2 --bucket "$BACKUP_S3_BUCKET" --prefix 'db/' --endpoint-url "$BACKUP_S3_ENDPOINT" \
      --query 'reverse(sort_by(Contents[?ends_with(Key, `.dump.gpg`)], &LastModified))[0].Key' --output text)
aws s3 cp "s3://$BACKUP_S3_BUCKET/$KEY" db.dump.gpg --endpoint-url "$BACKUP_S3_ENDPOINT"
aws s3 cp "s3://$BACKUP_S3_BUCKET/${KEY%.gpg}.manifest.json" manifest.json --endpoint-url "$BACKUP_S3_ENDPOINT"

# 2) decrypt
gpg --batch --pinentry-mode loopback --passphrase "$BACKUP_GPG_PASSPHRASE" -o db.dump -d db.dump.gpg

# 3) roles so policies/grants restore, then restore
psql "$SCRATCH_DATABASE_URL" -c "DO \$\$ BEGIN CREATE ROLE payroll_user; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;"
psql "$SCRATCH_DATABASE_URL" -c "DO \$\$ BEGIN CREATE ROLE payroll_app;  EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;"
pg_restore --no-owner -d "$SCRATCH_DATABASE_URL" db.dump || echo "warnings are non-fatal"

# 4) verify
BACKUP_MANIFEST_FILE=manifest.json SCRATCH_DATABASE_URL="$SCRATCH_DATABASE_URL" npx tsx scripts/verify-backup.ts

docker rm -f scratch-pg   # cleanup
```

---

## B. Real restore (production recovery)

Restore into a **fresh, empty** database — never over a live one you still trust.

1. **Provision a new Postgres 17** (new Sliplane DB, or elsewhere) and get its
   owner connection string as `NEW_DATABASE_URL`.

2. **Pick the dump.** Newest is shown by the drill's list command above; for a
   specific point in time, list and choose:
   ```bash
   aws s3 ls "s3://$BACKUP_S3_BUCKET/db/" --endpoint-url "$BACKUP_S3_ENDPOINT"
   aws s3 cp "s3://$BACKUP_S3_BUCKET/db/<timestamp>.dump.gpg" db.dump.gpg --endpoint-url "$BACKUP_S3_ENDPOINT"
   ```

3. **Decrypt:**
   ```bash
   gpg --batch --pinentry-mode loopback --passphrase "$BACKUP_GPG_PASSPHRASE" -o db.dump -d db.dump.gpg
   ```

4. **Recreate the DB roles** the dump references, then restore. The dump owns
   objects as `payroll_user` and its RLS policies grant to `payroll_app`, so both
   roles must exist first (set real passwords/attributes to match your
   environment — including `BYPASSRLS` on the owner, as in production):
   ```bash
   psql "$NEW_DATABASE_URL" -c "CREATE ROLE payroll_user LOGIN BYPASSRLS PASSWORD '<owner-pw>';"
   psql "$NEW_DATABASE_URL" -c "CREATE ROLE payroll_app  LOGIN PASSWORD '<app-pw>';"
   pg_restore -d "$NEW_DATABASE_URL" db.dump        # keep ownership/policies for a faithful restore
   ```

5. **Sanity check** before cutover:
   ```bash
   psql "$NEW_DATABASE_URL" -c 'SELECT count(*) FROM "Employee"; SELECT count(*) FROM "PayrollSheet"; SELECT count(*) FROM "Invoice";'
   ```
   Compare against the dump's `manifest.json`.

6. **Cut over:** point `DATABASE_URL` / `DIRECT_DATABASE_URL` at the new DB and
   redeploy. Verify login and an employee profile before resuming payroll.

> RPO note: you lose at most one backup interval of data (see the cadence table
> in `docs/BACKUPS.md`) relative to the moment of loss. If Sliplane's own PITR is
> available and the loss is *not* provider-level, prefer Sliplane PITR for a
> tighter RPO and use this off-platform copy only for provider-loss scenarios.
