# Which documents can be trusted, and why — unit 0.11

Every broken control found in this project so far has had the same shape:

> **a property documented at the place that DEPENDS on it, rather than the place
> that PROVIDES it.**

`/api/health` claimed a freshness guarantee that lived in `getBackupFreshness`.
`instrumentation.ts` claimed a recovery guarantee that lived in the enqueue
helpers. The `enable_rls` migration claims a role check that lives "at app
startup". In each case the claim outlived the thing it described, because
nothing connected the two.

This document records what we decided to trust, what we corrected, and what we
know is still wrong but cannot fix from here.

---

## 1. The external feature inventory — ADVISORY AND EXTERNAL. Deliberately not imported.

`SENTIREPAYROLLFEATUREINVENTORY.md` is **not in this repository**: not tracked,
not on disk, and never committed in any branch (`git log --all --diff-filter=A`
returns nothing). R27 declared it untrusted after it described Authenticize SSO
as live when **b7538eb** had already removed it.

**Decision: leave it outside, and say so here.** It was tempting to import it so
it could be diffed and reviewed — but importing it would commit a document
nobody can verify, and an unverifiable document *inside* the repo carries more
authority than the same document outside it. It would be read as reviewed
because it sits next to reviewed things. That is the failure mode this whole
unit exists to correct, and the fix must not reproduce it.

**Therefore:**

- The external inventory is **advisory input**, never a source of truth.
- No plan, gate or unit may cite it as evidence. Cite code, a commit, or a
  measurement.
- Where a claim from it matters, restate it in-repo **next to the code that
  provides it**, with the evidence — as done throughout this unit.

If it is ever imported anyway, it must arrive with a per-claim verification pass
and a dated header saying who verified what. Importing it unverified is strictly
worse than the status quo.

---

## 2. Corrected in this unit (unit 0.11)

Each correction cites the commit or file:line that proves the new statement.

| Document | Was | Now | Evidence |
|---|---|---|---|
| `MIGRATION_SLIPLANE.md:7,21,86` | builds from a `Dockerfile` | Railpack native build (`railpack.json` → `scripts/start.sh`) | `Dockerfile` deleted in **c9b6cc5** (PR #193); no `Dockerfile` on disk |
| `MIGRATION_SLIPLANE.md:65` | *"the default client falls back to `DIRECT_DATABASE_URL` only if set — keep `DATABASE_URL` = `payroll_app` so tenant isolation holds"* | precedence, not fallback: `DIRECT_DATABASE_URL` **wins whenever set**, and the isolation it promises does not hold (§3.2) | `src/lib/prisma.ts:54`; `scripts/start.sh:20-22`; `src/lib/with-tenant.ts:18`; `db-role-inventory.yml` output |
| `SYSTEM_DESIGN.md:5,56,162,183` | Render + Supabase | Sliplane + Sliplane Postgres | `railpack.json`, `docs/MIGRATION_SLIPLANE.md` |
| `SYSTEM_DESIGN.md:143` | *"`tsc`, ESLint, Vitest (225+), `next build` green before every merge"* | CI exists since unit 0.17, runs tsc/ESLint-on-diff/Vitest; `next build` deliberately excluded; **advisory, not blocking** | `gh run list` shows no `pull_request`/`push` run before 2026-09-01; `docs/CI.md`; suite is 387 tests |
| `SYSTEM_DESIGN.md:141` | migrations *"validated … + re-run + drift check before merge"* | CI does `migrate deploy` + `status`; **re-run and drift check NOT IMPLEMENTED** | `.github/workflows/ci.yml` |
| `Tech Stack:12,76` | "Next.js 14+" | Next.js 16.2.6 | `package.json:52` |
| `Tech Stack:12,28` | hosted on Render | Sliplane | as above |
| `Tech Stack:498` | *"Supabase JWT tokens validated on every API route"* | NextAuth v5; **no Supabase anywhere** | `package.json:53`; zero `@supabase` imports in `src/` |
| `Payroll Engine_Test_Spec.md:18` | *"CI blocks merge on any failing or missing-coverage engine test"* | no coverage gate exists, and CI cannot block a merge | `coverage` absent from `ci.yml`; `docs/CI.md` |

### Provenance of the corrections (R111)

Every row above is verified against **code in this repository** — a commit, a
`file:line`, or a measured command — with **one exception, flagged deliberately**:

> The **hosting-facts rows** (`SYSTEM_DESIGN.md:5,56,162,183`, `Tech Stack:12,28`
> → Sliplane / Sliplane Postgres 18) are **DOCUMENT-VERIFIED, NOT CODE-VERIFIED.**
> They rest on `railpack.json`, `docs/MIGRATION_SLIPLANE.md` and the CI service
> pin. Nobody with access to the running deployment has confirmed them. If
> production is not in fact on Sliplane Postgres 18, one confident wrong
> statement has been replaced with another.
>
> **They stay marked this way until someone confirms them against the live
> deployment.** Per R111, that caution is the ruling, not a caveat to be tidied
> away.

---

## 3. Known wrong, NOT fixed here — these belong to other tracks

Track C owns tooling, tests and docs. These claims live in code Track C does not
own, so they are recorded rather than edited.

### 3.1 `prisma/migrations/20260527070000_enable_rls/migration.sql:22` — a control that does not exist

> `-- must be non-superuser & NOBYPASSRLS — that is verified at app startup, not`

**No such check exists.** `src/instrumentation.ts` registers job workers and
nothing else; no file in `src/` queries `pg_roles`, `rolsuper` or
`rolbypassrls`. This is the filter's exact shape — a guarantee asserted at the
place that depends on it, located in a module that never implemented it. It is
load-bearing: Track A acted on this comment. **Owner: Track A (prisma/).**

### 3.2 RESOLVED 2026-09-01 — tenant isolation is NOT enforced at the database layer

**This is no longer a question.** Mark ran `.github/workflows/db-role-inventory.yml`
— the workflow unit 0.8 built for exactly this and never ran. Result:

```
connected_as | is_superuser | has_bypassrls | server_version
owner        | f            | f             | 18.4

Any role usable for pg_dump (superuser OR bypassrls)? → postgres only
RLS tables MISSING admin_bypass                       → 0 rows
```

So the owner role does **not** carry the `BYPASSRLS` attribute —
`docs/RUNBOOK_CREDENTIAL_ROTATION.md:41` was right about that. **But the
attribute is not what grants the bypass.** Every RLS table carries an
`admin_bypass` policy, created per unit 0.13 as:

```sql
CREATE POLICY admin_bypass ON <table> TO owner USING (true);
```

Permissive policies are **OR'd**, so for `owner` every table evaluates
`tenant_isolation OR true`. And the runtime client connects as `owner`
(`src/lib/prisma.ts:54` resolves `DIRECT_DATABASE_URL ?? DATABASE_URL`;
`scripts/start.sh:20-22` refuses to boot production without it;
`src/lib/with-tenant.ts:18` imports that same client and relies on RLS).

> **Confirmed, not inferred: tenant isolation is not enforced at the database
> layer.** Whatever isolation exists in production today is application-level
> filtering. **Fix: unit 0.7 (Track B, in flight).** Track C does not own
> `src/lib/prisma*.ts`.

#### The policy-versus-attribute distinction is also the root cause of unit 0.1's failure

The earlier claims were wrong about the **mechanism** and right about the
**effect** — but only for reads, and that difference is what broke backups:

| Path | Consults policies? | Outcome for `owner` |
|---|---|---|
| Ordinary query | yes | `tenant_isolation OR true` → **sees every row** |
| `pg_dump` | **no** — it sets `row_security = off` | **errors out** |

`pg_dump` does not evaluate `admin_bypass` at all; with `row_security = off` it
refuses rather than silently under-dumping. That is precisely why unit 0.1 failed
with *"query would be affected by row-level security policy for table
Announcement"*. **Same mechanism, opposite outcomes for reads and dumps** — which
is why "owner is BYPASSRLS" looked true from the application and false from the
backup job, and why nobody reconciled the two for months.

Corrected in this unit: `.github/workflows/db-backup.yml:12,115` and
`docs/SYSTEM_DESIGN.md:206-207`, which both attributed the bypass to a role
attribute rather than a policy.

---|---|
| `.github/workflows/db-backup.yml:12,115` | owner is **BYPASSRLS** |
| `docs/SYSTEM_DESIGN.md:206` | `prismaAdmin` is a **BYPASSRLS role** |
| `docs/RUNBOOK_CREDENTIAL_ROTATION.md:41` | owner has `FORCE ROW LEVEL SECURITY` and **no BYPASSRLS** |

Unit 0.8 already flagged the role inventory as unverified and built
`.github/workflows/db-role-inventory.yml` to settle it. **Run it before trusting
either reading.** If the owner does hold BYPASSRLS, tenant isolation does not
hold at runtime and that is a live security defect. **Owner: whoever owns
`src/lib/` — this is not a documentation bug.**

---

## 4. Keeping docs honest mechanically — proposed, not built

Nothing here is implemented in unit 0.11; B-list did not cover it.

1. **A file:line reference checker.** Docs in this repo cite `file:line`
   constantly, and line numbers rot on the first edit. A test that parses
   `path:NN` references out of `docs/**` and asserts the path exists — and
   optionally that the cited line still contains an expected token — would have
   caught most of this sweep. Cheap, and it fails loudly.
2. **Assert documented controls exist.** For every claim of the form "verified at
   X", a test that greps for the mechanism. The `enable_rls` comment above would
   have failed such a test from the day it was written.
3. **A grep gate on retired platform names.** `Render`, `Supabase`, `Dockerfile`
   and `next-pwa` are all gone; a CI grep with a small allowlist for historical
   sections would stop them creeping back.
4. **Pin version claims to `package.json`.** A test asserting that any doc naming
   a Next.js/Prisma/Node version matches the manifest.

The first is the highest value per line of code, and the only one that addresses
the *general* failure rather than today's instances.
