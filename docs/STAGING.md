# Payroll staging

A separate copy of Sentire Payroll for testing unmerged work (for example unit
1.8) on real screens with test data, and a QA connector that lets a Claude
session drive it. Production is never touched.

## What it is

| Part | Where | Notes |
|---|---|---|
| Staging app | Dokploy, project "Sentire Solutions", app "Payroll Staging" | Deploys the `staging` branch. |
| Web address | https://payroll-staging.apps.sentire.solutions | Sign in as the QA admin (below). |
| Database | Inside the staging container, 127.0.0.1 only | Kept across deploys when `STAGING_PG_DATA_DIR` is on a volume (below); otherwise created fresh at every start. Never the shared Postgres. |
| QA connector | https://payroll-qa-mcp.apps.sentire.solutions/mcp/&lt;QA_MCP_SECRET&gt; | MCP server, staging only. |

The `staging` branch is `main` plus whatever is under test, combined with
ordinary merges (never a force push). Nothing on it reaches `main` except
through the normal reviewed PR of each unit.

## Signing in

- Company code: `SENTIREQA`
- Email: `qa.admin@sentire.solutions`
- Password: the value of `STAGING_ADMIN_PASSWORD` in the staging app's
  Environment tab in Dokploy. It is generated there and never written in chat
  or in the repo.

## Test data

At every start the container creates the QA company "Sentire QA Co." with an
Administrator role, then seeds through the app's own API (so validation and
permissions apply exactly as for a real HR user):

| Employee | Pay setup | 1 to 15 Nov 2026 | 16 to 30 Nov 2026 |
|---|---|---|---|
| QA-01 | Monthly ₱30,000, semi-monthly, 5-day week | 10 days | 11 days |
| QA-02 | Monthly ₱25,000, semi-monthly, 6-day week | 11 days, 1 unpaid | 13 days |
| QA-03 | Daily ₱695, semi-monthly, 6-day week | 12 days | 13 days |
| QA-04 | Weekly ₱4,200, weekly, 6-day week | 9 to 15 Nov: 6 days | |
| QA-05 | Monthly ₱28,000, semi-monthly, hired 9 Nov | 5 days | 11 days |

Three draft runs are created: semi-monthly 1 to 15 Nov, semi-monthly 16 to 30
Nov (the second cutoff, where the default rule deducts SSS, PhilHealth and
Pag-IBIG) and weekly 9 to 15 Nov. The 2026 statutory tables (SSS, PhilHealth,
Pag-IBIG, BIR) are loaded at start.

**Keeping test data (PAY-140).** Set `STAGING_PG_DATA_DIR` to a directory on a
Dokploy volume (Payroll Staging, Advanced, Volumes: a named volume mounted at
`/var/lib/sentire-staging`, and `STAGING_PG_DATA_DIR=/var/lib/sentire-staging`).
Then the database survives restarts and deploys: migrations apply on top, the
company bootstrap refreshes the admin password and grants any new permission,
and the seed only adds what is missing (finalized runs and attendance edits
stay). The role passwords are new at every start, and the database superuser
has no password at all (reached only over the private socket). A new
PostgreSQL major version in the image starts a fresh database.

Without that variable, every restart and deploy recreates the database, as
before.

**Reset:** call the connector's `reset_staging`, then restart the staging app
in Dokploy; the database is wiped and re-seeded. Without a kept database, a
restart alone resets. `seed_scenario` restores the seeded employees' standard
attendance without wiping anything else.

## The QA connector

An MCP server inside the staging container (port 10001). It signs in as the QA
admin and calls the app's HTTP API. Its one database write is in
`create_ess_login` (below), as the RLS-limited runtime role with the QA tenant
set.

Tools: `staging_status`, `list_employees`, `set_attendance`, `import_punches`,
`create_payroll_run`, `recompute_payroll_run`, `get_payroll_run`,
`seed_scenario`, `reset_staging`, `create_ess_login`, `ess_request`,
`api_request` (any `/api/...` call except `/api/auth/...`).

ESS as an employee (PAY-180, Mark, 19 Nov 2026: staging-only tool):

- `create_ess_login {employeeNumber}` does in the database the step HR does by
  email (grant access, issue the one-time link), then claims the link through
  the real `POST /api/ess/activate`, so the app checks and hashes the PIN. An
  employee already using ESS with another PIN is refused unless `reset: true`.
- `ess_request {employeeNumber, method, path, body}` signs in through the real
  `POST /api/ess/auth` and calls `/api/ess/...` with the session. Sign-in,
  activation, PIN, password and passkey routes are refused.
- The PIN is derived from `QA_MCP_SECRET` and the employee number inside the
  connector. No PIN or session token is stored or returned; `token`, `pin` and
  password fields are hidden in answers. Code: `scripts/staging/ess-login.mjs`.

Safety, same pattern as the Sentire Dokploy connector:

- The URL is the key: `/mcp/<QA_MCP_SECRET>`. A wrong key or any other path is
  a 404. The secret is generated in Dokploy and must be at least 32 characters,
  or the connector does not start.
- It refuses to start unless `STAGING_EMBEDDED_DB=1` and the database is the
  embedded one on 127.0.0.1, so it cannot be pointed at production.
- 120 calls a minute; one JSON audit line per call in the staging app's logs.

To add it to Claude: Settings, Connectors, add a custom connector with the URL
above, taking the secret from the staging app's Environment tab.

## Environment (staging app only)

| Variable | Value |
|---|---|
| `STAGING_EMBEDDED_DB` | `1` |
| `RAILPACK_DEPLOY_APT_PACKAGES` | `postgresql` (installs Postgres in the staging image only) |
| `PORT` | `10000` |
| `QA_MCP_PORT` | `10001` |
| `AUTH_URL`, `NEXT_PUBLIC_APP_URL` | `https://payroll-staging.apps.sentire.solutions` |
| `AUTH_TRUST_HOST` | `true` |
| `STAGING_PG_DATA_DIR` | optional: a directory on a Dokploy volume, e.g. `/var/lib/sentire-staging`, to keep the database across deploys (PAY-140) |
| `AUTH_SECRET`, `ENCRYPTION_KEY`, `STAGING_ADMIN_PASSWORD`, `QA_MCP_SECRET` | generated in Dokploy |

`DATABASE_URL` and `DIRECT_DATABASE_URL` are not set on the app: the start
script creates them for the embedded database. Email, payment and other
third-party keys are deliberately absent; features that need them stay off on
staging.

Production never sets `STAGING_EMBEDDED_DB`, and every staging step in
`scripts/start.sh` is behind that check (pinned by
`src/__tests__/staging-qa-connector.test.ts`, Q8).
