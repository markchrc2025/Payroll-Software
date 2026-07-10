# Tenant workspace SSO (Authenticize)

Single sign-on for the **tenant workspace** (`/login`) using **Authenticize**,
kept strictly separate from [Central Portal SSO](./sso-central-portal.md).

## Model: Authenticize is an identity provider, not a user directory

Authenticize proves a person owns an email. It does **not** decide who may use
Sentire Payroll — that stays a Payroll decision, made against Payroll's own
`User` table, exactly as it was for Google/Microsoft. Having an Authenticize
account grants access to nothing on its own.

This realm is a **separate Authenticize application** from the Central Portal
one (its own `client_id`/`client_secret` and its own callback path), so the two
populations and their credentials never mix.

## How it works — company-code-first

A tenant email is only unique **within a tenant** (`@@unique([tenantId, email])`),
and the SSO flow carries no password to disambiguate. So the user picks their
workspace by **company code** — the same field the password login already
requires. The login screen stashes the code in a short-lived, lax cookie
(`tenant_sso_company`) before redirecting to Authenticize; the auth callbacks
read it and:

1. resolve the company code → one tenant,
2. match within that tenant by the linked Authenticize subject (fast path on
   repeat logins), else by email,
3. require the account to be an **active, non-deleted `TENANT_USER`**.

On first success the Authenticize subject is linked to the account
(`User.authenticizeUserId`, unique per tenant) for faster future logins.
Accounts are **never auto-provisioned**, and `SUPER_ADMIN` rows are never
matched here (they have `tenantId = null`).

## Environment variables (Sliplane, payroll service)

| Variable | Value | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_TENANT_SSO` | `authenticize` | **Build-time.** Replaces the placeholder Google/Microsoft buttons on `/login` with a working "Continue with Authenticize" button. Set before deploying. |
| `AUTH_AUTHENTICIZE_TENANT_ISSUER` | `https://auth.sentire.solutions` | The Authenticize issuer. |
| `AUTH_AUTHENTICIZE_TENANT_ID` | client ID | From the **tenant** application in the Authenticize dashboard. |
| `AUTH_AUTHENTICIZE_TENANT_SECRET` | client secret | Shown once; rotatable. |

`AUTH_URL`, `AUTH_SECRET` and `AUTH_TRUST_HOST` are shared with the rest of
NextAuth. `CENTRAL_SSO_ALLOWED_DOMAIN` does **not** apply here — tenant users
may use any email domain.

## Redirect / callback URI

Register **exactly** this URL on the tenant application in Authenticize (note
the distinct `authenticize-tenant` path — it is a different provider from the
Central Portal one):

- `https://payroll.sentire.solutions/api/auth/callback/authenticize-tenant`
- plus `http://localhost:3000/api/auth/callback/authenticize-tenant` for local dev.

## Registration steps

1. Authenticize dashboard → **Applications → Connect an app**.
2. Name it e.g. `Sentire Payroll — Tenants`, type **Web app**, keep **Skip
   consent** on. Add the callback URL(s) above.
3. Copy the client ID/secret into `AUTH_AUTHENTICIZE_TENANT_ID` /
   `AUTH_AUTHENTICIZE_TENANT_SECRET`, set `AUTH_AUTHENTICIZE_TENANT_ISSUER`, and
   add `authenticize` to `NEXT_PUBLIC_TENANT_SSO`.
4. Deploy. On `/login`, a user enters their **company code**, clicks **Continue
   with Authenticize**, signs in on Authenticize, and returns to their
   workspace — provided an active tenant account with that email exists in that
   company. Password login stays available as a fallback throughout.

## Migrating tenant users

Create each tenant user on Authenticize with the **same email** they use in
Payroll (invite email sets their password), then have them sign in via the
button once — the account links automatically. Their existing Payroll password
keeps working until then.
