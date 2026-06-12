# Central Portal SSO (Sentire staff)

Single sign-on for the **Central Portal** (`/centralportal/login`) using Google
Workspace **or** Microsoft Entra ID.

## How it works

SSO here is **verify-then-match**, not self-signup:

1. The user clicks **Continue with company SSO** and authenticates with the IdP.
2. The IdP proves they own a verified email.
3. We look that email up against existing **Central admins** (`systemRole =
   SUPER_ADMIN`, no tenant). If a match exists, they're signed in; otherwise the
   attempt is rejected.

Accounts are never auto-created. This is also why a Sentire person who is *both*
an administrator *and* an employee keeps **two separate accounts** with the same
email — the admin one (no tenant) is the only one SSO here will match. Their
tenant-employee account is reached through the normal tenant login + company code.

The provider code is **env-gated**: with no OAuth env vars set, nothing changes.
Set the vars below and the button activates.

## Environment variables (set in Render)

### Common
| Variable | Value | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_CENTRAL_SSO` | `google` or `microsoft-entra-id` | **Build-time** — controls the button label/action. Redeploy after changing. |
| `CENTRAL_SSO_ALLOWED_DOMAIN` | `sentire.solutions` | Optional. Fences SSO to this email domain. |

### Google Workspace
| Variable | Value |
|----------|-------|
| `AUTH_GOOGLE_ID` | OAuth client ID |
| `AUTH_GOOGLE_SECRET` | OAuth client secret |

### Microsoft Entra ID
| Variable | Value |
|----------|-------|
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Application (client) ID |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Client secret value |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | `https://login.microsoftonline.com/<tenant-id>/v2.0` |

> `AUTH_SECRET` and `AUTH_URL` (the app's public URL) must already be configured
> for NextAuth — they are reused for the OAuth callback.

## Redirect / callback URI

Register **exactly** this URL in the OAuth app (swap in your live domain):

- Google: `https://<app-domain>/api/auth/callback/google`
- Entra:  `https://<app-domain>/api/auth/callback/microsoft-entra-id`

(e.g. `https://sentire-payroll.onrender.com/api/auth/callback/google`, plus a
second entry for any custom domain such as `app.sentire.solutions`.)

## Registration steps

### Google Workspace
1. Google Cloud Console → **APIs & Services → Credentials**.
2. **Create credentials → OAuth client ID → Web application**.
3. Add the **Authorized redirect URI** above.
4. Copy the client ID/secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
5. Set `NEXT_PUBLIC_CENTRAL_SSO=google` and (optionally)
   `CENTRAL_SSO_ALLOWED_DOMAIN=sentire.solutions`.

### Microsoft Entra ID
1. Entra admin center → **App registrations → New registration**.
2. Redirect URI type **Web** → the Entra callback URL above.
3. **Certificates & secrets → New client secret** → copy the *value*.
4. Fill `AUTH_MICROSOFT_ENTRA_ID_ID` / `_SECRET` / `_ISSUER` (issuer uses your
   directory/tenant ID).
5. Set `NEXT_PUBLIC_CENTRAL_SSO=microsoft-entra-id`.

## Known follow-up

On a rejected SSO attempt, NextAuth bounces to the configured sign-in page with
`?error=…`; both login screens read that and show a friendly banner. Refining the
exact error-redirect target for the admin screen is a small follow-up once we test
against a real OAuth app.

## Roadmap (not in this change)

- **Tenant-side** Google/Microsoft SSO — needs company-code-first so the email
  resolves to the right tenant.
- **Per-tenant enterprise SSO** (each customer's own Okta/Entra) — larger effort.
