# Migration Runbook — Render + Supabase + R2 → Sliplane

Moves the three infrastructure pieces onto Sliplane:

| Piece | From | To |
|---|---|---|
| Web service | Render (Node) | Sliplane **App Runtime** (this repo's `Dockerfile`) |
| Database | Supabase Postgres | Sliplane **Databases** (Postgres) |
| Object storage | Cloudflare R2 | Sliplane **Object Storage** (S3-compatible) |

> **Two things you give up vs. today — plan for them:**
> 1. **Egress cost** — R2 has zero egress; Sliplane storage bandwidth is metered. Payslip/photo/document serving is egress-heavy.
> 2. **Managed backups/PITR** — Supabase Pro gives point-in-time restore. On Sliplane Postgres you must **set up your own automated `pg_dump` backups** (see §5). Do not run production payroll without backups.

Do this **outside business hours**, and keep Render/Supabase/R2 running until the final DNS cutover so rollback is instant.

---

## 0. Code prerequisites (already in this repo)

- **`Dockerfile`** — Sliplane builds from it. Runs `prisma migrate deploy` then `next start`. pg-boss runs in-process → **run exactly ONE instance** (or move migrate + job workers to a single instance).
- **Configurable S3 endpoint** — `src/lib/r2.ts` now reads `S3_ENDPOINT`, `S3_REGION`, `S3_FORCE_PATH_STYLE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_PUBLIC_URL`, falling back to the old `R2_*` names. Point these at Sliplane storage.

---

## 1. Database — Supabase → Sliplane Postgres

**The gotcha: roles + RLS.** The app relies on:
- a **non-owner app role** (`payroll_app`) used for tenant-scoped queries — RLS `tenant_isolation` applies to it (GRANTs in migrations target it);
- the **owner role** used by `prismaAdmin` / migrations — the `admin_bypass` policy (migration `z2_admin_bypassrls`) is attached to whatever owns the tables.

A plain data restore that omits these roles/policies will either fail (`role "payroll_app" does not exist`) or silently break tenant isolation. Do it in this order:

```bash
# 0) Vars
SUPA="postgresql://postgres:<pw>@db.kwdoebvsxddjsprgdodk.supabase.co:5432/postgres"
SLIP="postgresql://<owner>:<pw>@<sliplane-db-host>:5432/<db>"

# 1) On Sliplane Postgres, create the app role BEFORE restoring (owner already
#    exists as the DB's main user). Match the password to your DATABASE_URL.
psql "$SLIP" -c "CREATE ROLE payroll_app LOGIN PASSWORD '<app-pw>';"

# 2) Dump Supabase (schema + data + policies + grants), excluding Supabase-only
#    schemas you don't use.
pg_dump "$SUPA" \
  --no-owner --no-privileges=false \
  --schema=public \
  --exclude-schema='auth' --exclude-schema='storage' --exclude-schema='realtime' \
  -Fc -f payroll.dump

# 3) Restore into Sliplane. --no-owner remaps ownership to the connecting owner.
pg_restore "$SLIP" --no-owner --clean --if-exists -d "<db>" payroll.dump

# 4) Verify migrations, RLS, and grants came across.
DIRECT_DATABASE_URL="$SLIP" npx prisma migrate status      # → up to date
psql "$SLIP" -c "SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' LIMIT 5;"
psql "$SLIP" -c "SELECT has_table_privilege('payroll_app','\"Employee\"','SELECT');"  # → t
```

Notes:
- If `pg_dump` on Supabase can't export roles, creating `payroll_app` manually (step 1) is enough — the table GRANTs are recreated by the restore.
- `_prisma_migrations` is included in the dump, so `migrate status` should show **up to date** with no re-run. `migrate deploy` at container start is then a no-op.
- Confirm the two connection strings you'll set as env:
  - `DATABASE_URL` → **`payroll_app`** role (tenant-scoped, RLS-subject).
  - `DIRECT_DATABASE_URL` → the **owner** role (used by `prismaAdmin` + migrate). ⚠️ In production the default `prisma` client falls back to `DIRECT_DATABASE_URL` only if set — keep `DATABASE_URL` = `payroll_app` so tenant isolation holds. Mirror exactly what Render uses today.

---

## 2. Object storage — R2 → Sliplane

```bash
# rclone remotes: one for R2, one for Sliplane (both S3-compatible).
# rclone config → set provider=Other, endpoint, access/secret keys for each.

rclone sync r2:sentirepayroll slip:<sliplane-bucket> --progress --checksum
# Verify object counts match:
rclone size r2:sentirepayroll ; rclone size slip:<sliplane-bucket>
```

Keys are preserved (`tenants/{tenantId}/...`), so nothing in the DB needs rewriting. Then set the app env (see §3). If you want public asset URLs, expose the Sliplane bucket and set `S3_PUBLIC_URL`; otherwise the app issues presigned GETs automatically.

---

## 3. Web service — Sliplane App Runtime

1. In the **Sentire Payroll** project → **Deploy App** → from GitHub repo `markchrc2025/Payroll-Software`, branch `main`, build = **Dockerfile**.
2. Set the port to **3000** and **run a single instance** (pg-boss in-process).
3. **Environment variables** (copy from Render, then change DB + storage):

   | Var | Value |
   |---|---|
   | `DATABASE_URL` | Sliplane Postgres — `payroll_app` role |
   | `DIRECT_DATABASE_URL` | Sliplane Postgres — owner role |
   | `ENCRYPTION_KEY` | **same** 32-byte base64 as today (must match, or encrypted fields won't decrypt) |
   | `NEXT_PUBLIC_APP_URL` | `https://payroll.sentire.solutions` |
   | `RESEND_API_KEY` | same |
   | `S3_ENDPOINT` | Sliplane object-storage S3 endpoint |
   | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Sliplane storage keys |
   | `S3_BUCKET` | Sliplane bucket name |
   | `S3_REGION` | as Sliplane specifies (else `auto`) |
   | `S3_FORCE_PATH_STYLE` | `true` (typical for self-hosted S3) |
   | `S3_PUBLIC_URL` | optional, if bucket is public |
   | `NEXTAUTH_SECRET` / OAuth creds, `BILLING_*`, `EMAIL_ASSET_BASE_URL` | copy from Render |

4. Deploy. Watch logs for: env-check banner, `prisma migrate deploy` (no-op), `[pg-boss] Workers registered`.
5. Hit the app's temporary Sliplane URL and run the smoke test (§4) **before** touching DNS.

---

## 4. Smoke test (on the Sliplane URL, pre-cutover)

- [ ] `/api/health` → healthy (no critical env problems).
- [ ] Log in (tenant admin).
- [ ] Open an employee profile (reads DB via RLS `withTenant`).
- [ ] Upload a profile photo → progress ring → green (writes to Sliplane storage).
- [ ] Open **201 File / Documents** → existing docs load (reads from copied storage).
- [ ] Central Portal loads (BYPASSRLS path via `prismaAdmin`).
- [ ] Trigger a test email (e.g. ESS forgot-password) → arrives.

---

## 5. Cutover + after

1. **DNS**: point `payroll.sentire.solutions` at Sliplane (CNAME/A per Sliplane's instructions); provision TLS there. Lower the DNS TTL a day before so the switch is fast.
2. Keep Render/Supabase/R2 **running** for ~48h as instant rollback (revert DNS).
3. **Set up automated backups** on Sliplane Postgres — a daily `pg_dump` to Sliplane object storage (or off-site) via a cron container. This replaces Supabase PITR and is **required** before you retire Supabase.
4. Once stable: decommission Render, Supabase, and the R2 bucket. (Keep one final R2/Supabase backup archived.)

## 6. Rollback

Nothing is destructive until step 5.4. If the Sliplane app misbehaves, **revert DNS** to Render — Supabase + R2 are untouched, so you're immediately back on the old stack. Any data written on Sliplane during the window would need reconciling, which is why cutover should be off-hours with low activity.
