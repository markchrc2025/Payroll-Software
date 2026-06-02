# Sentire Payroll — Tech Stack & Architecture
**Version 1.0 · June 2026**

> This document defines the complete technology stack, architectural decisions, and rationale for the Sentire Payroll HRIS & Payroll SaaS platform. All decisions align with the Sentire Payroll Master Blueprint v2.0.

---

## Quick Reference

| Layer | Technology | Hosting / Provider |
|---|---|---|
| Frontend Framework | Next.js 14+ (App Router) | Render |
| Language | TypeScript | — |
| UI Components | shadcn/ui + Tailwind CSS | — |
| Database | PostgreSQL (via Supabase) | Supabase (Singapore) |
| ORM | Prisma | — |
| Authentication | Supabase Auth | Supabase |
| Realtime | Supabase Realtime | Supabase |
| File Storage | Cloudflare R2 | Cloudflare |
| Caching | Upstash Redis | Upstash |
| Background Jobs | Inngest | Inngest Cloud |
| Maps (Geofence UI) | Leaflet + OpenStreetMap | Self-hosted tiles |
| GPS Geofencing Logic | Browser Geolocation API + Haversine | Client → Server |
| Email Notifications | Resend | Resend |
| SMS Notifications | Semaphore PH | Semaphore |
| PDF Generation | @react-pdf/renderer | Server-side |
| Excel / CSV | SheetJS (xlsx) | Server-side |
| ESS Mobile | Next.js PWA (next-pwa) | Render |
| Error Tracking | Sentry | Sentry Cloud |
| CI/CD | GitHub Actions | GitHub |

---

## 1. Architecture Overview

Sentire Payroll is a **multi-tenant SaaS** built on a monolithic Next.js application with a service-oriented backend. Each tenant (company) is isolated at the database level using Supabase Row Level Security (RLS). The platform serves two primary surfaces:

- **Admin Portal** — Desktop browser app for HR Managers, Supervisors, and Payroll teams
- **ESS (Employee Self-Service)** — Mobile PWA for all employees

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                              │
│  ┌─────────────────────┐   ┌──────────────────────────┐    │
│  │   Admin Portal       │   │     ESS Mobile PWA       │    │
│  │  (Desktop Browser)   │   │  (Mobile Browser / PWA)  │    │
│  └──────────┬──────────┘   └────────────┬─────────────┘    │
└─────────────┼───────────────────────────┼──────────────────┘
              │ HTTPS                     │ HTTPS
┌─────────────▼───────────────────────────▼──────────────────┐
│                   NEXT.JS APPLICATION                       │
│              (App Router + API Routes + Server Actions)     │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐  │
│  │  React UI    │  │  API Routes   │  │ Server Actions  │  │
│  │  shadcn/ui   │  │  (REST/JSON)  │  │  (mutations)    │  │
│  └──────────────┘  └───────┬───────┘  └────────┬────────┘  │
└──────────────────────────  ┼  ──────────────────┼──────────┘
                             │                    │
         ┌───────────────────┼────────────────────┼──────┐
         │            SERVICE LAYER                       │
         │  ┌─────────────┐ ┌──────────┐ ┌──────────┐   │
         │  │  Supabase   │ │ Upstash  │ │  Inngest │   │
         │  │(DB+Auth+RT) │ │  Redis   │ │  (Jobs)  │   │
         │  └─────────────┘ └──────────┘ └──────────┘   │
         │  ┌─────────────┐ ┌──────────┐ ┌──────────┐   │
         │  │Cloudflare R2│ │  Resend  │ │Semaphore │   │
         │  │  (Storage)  │ │  (Email) │ │  (SMS)   │   │
         │  └─────────────┘ └──────────┘ └──────────┘   │
         └────────────────────────────────────────────────┘
```

---

## 2. Frontend Layer

### Framework — Next.js 14+ (App Router)

The entire platform is built on **Next.js with the App Router**. This covers both the Admin Portal and the ESS PWA under a single codebase, separated by route groups:

```
/app
  /(admin)        → Admin Portal routes (HR, Payroll, Compliance)
  /(ess)          → ESS Mobile routes (Clock-in, Leave, Payslips, DTR)
  /api            → REST API routes (server-side logic)
```

**Why Next.js:**
- Server-side rendering for fast initial loads on mobile ESS
- Server Actions for form mutations without boilerplate API routes
- File-based routing matches the module structure of the platform
- Single deployment handles both Admin and ESS surfaces

### Language — TypeScript

All code (frontend, backend, API routes) is written in **TypeScript**. This is non-negotiable for a payroll system where type errors on salary computations or statutory deductions can cause financial damage.

### UI — shadcn/ui + Tailwind CSS

- **shadcn/ui** — the component library. Provides Dialog, Table, Form, Select, Checkbox, Badge, and all other UI primitives. Components are copied into the codebase (not a dependency), so they can be customized freely.
- **Tailwind CSS** — utility-first CSS. All styling is done in Tailwind.
- **Brand colors** — Deep blue `#1E3A5F` and slate palette defined as Tailwind custom colors in `tailwind.config.ts`.

### State Management

- **TanStack Query (React Query)** — all server state (API data fetching, caching, background refetching)
- **React Hook Form + Zod** — all form state and validation. Zod schemas are the single source of truth for both client validation and server-side validation.
- No global client state library (Redux, Zustand) — server state via TanStack Query is sufficient.

### Key Frontend Libraries

| Library | Purpose |
|---|---|
| `@tanstack/react-query` | Server state, data fetching, cache |
| `react-hook-form` | Form state management |
| `zod` | Schema validation (client + server) |
| `react-leaflet` + `leaflet` | Interactive map for geofence setup |
| `date-fns` | Date manipulation (payroll cutoff calculations, Philippine holidays) |
| `@react-pdf/renderer` | Payslip and statutory report PDF generation |
| `xlsx` (SheetJS) | Bank advice file and Alphalist CSV/Excel generation |
| `next-pwa` | Service worker for ESS Mobile PWA |

---

## 3. Backend Layer

The backend runs as **Next.js API Routes and Server Actions** within the same Next.js application. There is no separate backend service.

### API Route Structure

```
/api
  /auth             → Login, session management (delegates to Supabase Auth)
  /employees        → Employee profile CRUD
  /attendance       → Clock-in/out, GPS validation, DTR computation
  /dtr              → DTR submission, approval chain, audit log
  /payroll          → Payroll run generation, Gross-to-Net engine
  /leaves           → Leave filing, balance management
  /overtime         → OT applications, approval, DTR sync
  /claims           → Expense claims, approval
  /holidays         → Holiday calendar management
  /compliance       → Statutory report generation (SSS, PhilHealth, etc.)
  /webhooks         → Inngest event receivers
```

### Payroll Computation Engine

The Gross-to-Net computation engine runs as a **server-side function** invoked by the payroll run API route. It is not run on the client.

- Executes the 10-step waterfall defined in Blueprint Section 1B
- Reads from Supabase (approved DTRs, statutory tables, holiday calendar)
- For large tenants (500+ employees), computation is offloaded to an **Inngest background job** (see Section 8) to avoid API timeout
- Outputs are written to `payroll_sheets` as immutable frozen records

### GPS Geofencing Logic

- **Client side:** `navigator.geolocation.getCurrentPosition()` fetches device coordinates
- **Server side:** Haversine distance calculation comparing device coordinates against branch geofence stored in Supabase
- The map (Leaflet + OpenStreetMap) is used **only on the Admin geofence setup screen** — not at clock-in time
- No external map API is called during clock-in; it is pure math

---

## 4. Database Layer

### Database — PostgreSQL via Supabase

**Supabase** is the managed PostgreSQL provider. The Singapore (`ap-southeast-1`) region is used for low latency from the Philippines.

**Why Supabase over self-managed PostgreSQL:**
- Row Level Security (RLS) enforces multi-tenant isolation at the database level — not just at the application layer
- Built-in Auth, Realtime, and Storage reduce the number of third-party services needed
- Managed backups, point-in-time recovery, and connection pooling (PgBouncer) are included

### ORM — Prisma

**Prisma** is the ORM for all database access from Next.js.

- Type-safe database queries matching TypeScript models
- Schema defined in `prisma/schema.prisma` — single source of truth for the data model
- Migrations managed via `prisma migrate`
- Prisma Client is used in API routes and Server Actions

### Multi-Tenancy Strategy — Row Level Security (RLS)

Every table that stores tenant data has a `company_id` foreign key and an RLS policy:

```sql
-- Example: employees table
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation"
ON employees
USING (company_id = auth.jwt() ->> 'company_id');
```

This ensures that even if application-level logic has a bug, the database physically prevents one tenant from accessing another's data.

### Key Tables (aligned with Blueprint Section 4)

| Table | Description |
|---|---|
| `companies` | Root tenant node |
| `employee_profiles` | Core employee record |
| `branches` | Branch + geofence config (`geofence_lat`, `geofence_lng`, `geofence_radius_meters`) |
| `attendance_logs` | Raw clock-in/out (immutable) |
| `daily_time_records` | Computed DTR with Official, Manual, and Effective layers |
| `dtr_submissions` | Period-level DTR submission for approval chain |
| `dtr_audit_logs` | Immutable log of all DTR manual edits |
| `dtr_manual_reason_codes` | Lookup table for valid manual entry reasons |
| `payroll_books` | One per payroll period |
| `payroll_sheets` | Frozen Gross-to-Net snapshot per employee per period |
| `statutory_tables` | SSS, PhilHealth, Pag-IBIG, BIR TRAIN Law brackets |
| `holidays` | Holiday calendar with category, scope, and region |
| `leave_entitlements` | Leave balances per employee |
| `ot_applications` | OT requests and approval status |
| `expense_claims` | Expense reimbursement requests |
| `profile_update_requests` | Bank account / profile change requests (fraud prevention) |
| `assets` | Equipment assigned to employees |

---

## 5. Authentication

### Provider — Supabase Auth

Supabase Auth handles authentication for both surfaces:

| Surface | Auth Method |
|---|---|
| Admin Portal | Email + Password (company admin and HR staff) |
| ESS Mobile | Employee Number + Date of Birth (default) · PIN (returning users) |

### Session Architecture

- Admin Portal sessions use standard Supabase JWT tokens
- ESS sessions use a separate auth context scoped to the employee's `company_id` and `employee_id`
- JWT claims include `company_id`, `role` (ADMIN / HR / SUPERVISOR / MANAGER / EMPLOYEE), and `branch_id`
- RLS policies use these JWT claims to enforce access at the database level

### Role Hierarchy

```
SUPER_ADMIN     → Sentire master portal (manage all tenants)
COMPANY_ADMIN   → Full access to their company's tenant
HR_MANAGER      → All HR modules, payroll read
PAYROLL_MANAGER → Payroll run, statutory reports
SUPERVISOR      → DTR review + edit, leave/OT approval for their team
MANAGER         → DTR final approval, audit log access
EMPLOYEE        → ESS only (own records)
```

---

## 6. File Storage — Cloudflare R2

**Cloudflare R2** is used for all file storage. R2 is S3-compatible (zero egress fees), making it significantly cheaper than AWS S3 for a SaaS with frequent file downloads (payslips, reports).

### Storage Buckets

| Bucket | Contents | Access |
|---|---|---|
| `attendance-selfies` | Clock-in selfie photos (GPS + face capture) | Private — HR read, Employee read-own |
| `claim-receipts` | Expense claim receipt photos | Private — Finance + HR read |
| `employee-documents` | 201 files, medical certificates, IDs | Private — HR read, Employee read-own |
| `payroll-exports` | Bank advice files, statutory reports (PDF/Excel) | Private — HR + Payroll read |
| `payslips` | Generated payslip PDFs | Private — Employee read-own |

### File Access Pattern

Files are never served directly via public URLs. All access goes through a signed URL generated server-side per request, with a short expiry (15 minutes). This enforces RLS at the storage level.

---

## 7. Caching — Upstash Redis

**Upstash Redis** (serverless Redis) is used for application-level caching. Upstash is chosen over self-managed Redis because it requires zero infrastructure — it works as an HTTP API, compatible with serverless environments like Render.

### Cache Strategy

| Data | TTL | Invalidate When |
|---|---|---|
| Statutory tables (SSS, PhilHealth, Pag-IBIG, BIR) | 30 days | Sentire pushes a statutory update |
| Branch geofence config | 1 hour | HR edits the geofence |
| Employee profile + shift assignment | 15 minutes | Profile update approved |
| Holiday calendar (by year) | 24 hours | HR adds/edits a holiday |
| Leave balance summary | 5 minutes | Leave request approved/rejected |
| Finalized Payroll Sheets | Indefinite | Never — immutable by design |
| ESS session data | Per session TTL | On sign-out |

### Cache Keys Convention

```
sentire:{company_id}:statutory:{type}          → statutory tables
sentire:{company_id}:geofence:{branch_id}      → branch geofence
sentire:{company_id}:employee:{employee_id}    → employee profile
sentire:{company_id}:holidays:{year}           → holiday calendar
sentire:{company_id}:leave:{employee_id}       → leave balances
sentire:payroll_sheet:{payroll_sheet_id}       → finalized payslip
```

---

## 8. Background Jobs — Inngest

**Inngest** handles all asynchronous, long-running, or event-triggered background work. It is chosen over a self-managed BullMQ queue because it requires no Redis worker process — jobs are defined as code and triggered via HTTP events.

### Key Background Jobs

| Job | Trigger | What It Does |
|---|---|---|
| `payroll.run` | HR clicks "Generate New Run" | Executes Gross-to-Net for all active employees in the period. Runs async to avoid API timeout on large tenants. |
| `ot.approved` | OT application status → APPROVED | Syncs approved OT hours to the matching DTR row. Recalculates total hours. Writes to DTR_Audit_Log. |
| `dtr.submitted` | Employee submits period DTR | Sends notification to assigned Supervisor |
| `dtr.approved.supervisor` | Supervisor approves DTR | Sends notification to Manager |
| `payslip.publish` | Payroll finalized | Generates PDF payslip per employee, uploads to R2, marks as available in ESS |
| `statutory.update` | Sentire pushes rate update | Invalidates statutory cache for all tenants, notifies Company Admins |
| `employee.offboarded` | Offboarding initiated | Schedules ESS access revocation, triggers final pay computation |

---

## 9. Realtime — Supabase Realtime

**Supabase Realtime** powers live UI updates without polling for:

| Event | Who Sees It |
|---|---|
| OT application status changes | Employee ESS (their OT list updates live) |
| DTR submission status changes | Supervisor and Manager dashboards |
| Leave approval | Employee ESS (leave balance updates) |
| Payslip published | Employee ESS (new payslip notification) |
| Profile update request status | Employee ESS |

Realtime channels are scoped per `company_id` and `employee_id` to prevent cross-tenant leakage.

---

## 10. Notifications

### Email — Resend

**Resend** handles all transactional emails:
- Welcome / account activation email (new tenant onboarding)
- OT approval/rejection notification
- DTR approval notification
- Payslip availability notification
- Password reset

Templates are built with **React Email** (renders React components to HTML email).

### SMS — Semaphore PH

**Semaphore** handles all SMS notifications targeted at Philippine mobile numbers:
- ESS activation link (employee onboarding)
- OT approval/rejection (for employees without reliable email)
- Clock-in failure alert (geofence rejection notification — optional, configurable per tenant)

Semaphore is the most widely used Philippine SMS gateway with direct carrier connections to Globe, Smart, and DITO.

### Push Notifications — Web Push API

The ESS PWA registers a service worker that receives **Web Push notifications** via the standard Web Push API (no third-party push service needed):
- Payslip released notification
- Leave approved/rejected
- DTR submission reminder (end of cutoff period)

---

## 11. Maps & Geolocation

| Component | Technology | When Used |
|---|---|---|
| Geofence setup UI | Leaflet + react-leaflet + OpenStreetMap | Admin: Branch Settings → Configure Geofence |
| Address search (geocoding) | Nominatim (OpenStreetMap) via leaflet-geosearch | Admin: searching for a branch address to drop pin |
| Clock-in location detection | Browser Geolocation API (`navigator.geolocation`) | ESS: every clock-in attempt |
| Geofence distance calculation | Haversine formula (server-side TypeScript) | Server: validating clock-in location vs. branch radius |

**No paid map API is used.** The Google Maps Embed API was evaluated and rejected — it does not support interactive pin dragging or radius circle overlays, which are required for the geofence setup screen. Leaflet + OpenStreetMap provides full interactivity at zero cost with no API key.

Accuracy buffer logic (Blueprint Section 6):
```
effective_radius = geofence_radius_meters + Math.min(device_accuracy_meters, 30)
```

---

## 12. Document Generation

### Payslips & Reports — @react-pdf/renderer

Payslip PDFs and compliance documents (Quitclaim, BIR Form 2316) are generated server-side using `@react-pdf/renderer`. This library renders React component trees to PDF without a headless browser, making it fast and lightweight.

Generated PDFs are uploaded to Cloudflare R2 and served via signed URLs.

### Bank Files & Statutory Reports — SheetJS (xlsx)

Bank advice files (BDO, BPI, UnionBank, Metrobank) and statutory reports (SSS R-1A/R-3, PhilHealth ER2/RF1, Pag-IBIG MCRF, BIR Alphalist) are generated as `.xlsx` or `.csv` files using the `xlsx` library. Files are streamed directly to the browser as a download or saved to R2.

---

## 13. ESS Mobile PWA

The ESS is a **Progressive Web App** — it runs in the mobile browser and can be installed to the home screen without an App Store.

| Feature | Implementation |
|---|---|
| PWA shell | `next-pwa` — generates service worker and manifest |
| Offline capability | Service worker caches app shell and last-viewed payslips |
| Home screen install | `manifest.json` with Sentire branding, icons, and `display: standalone` |
| GPS clock-in | `navigator.geolocation` (browser built-in) |
| Selfie capture | `getUserMedia` API (browser camera access) |
| Push notifications | Web Push API via service worker |
| Responsive layout | Tailwind responsive utilities — card views replace horizontal tables on mobile |

The ESS PWA is served from the same Next.js application under the `/(ess)` route group. No separate deployment is needed.

---

## 14. Deployment & Infrastructure

### Application Hosting — Render

The Next.js application is deployed on **Render** as a **Web Service**.

- **Region:** Singapore (`ap-southeast-1`) — closest to Philippine users
- **Plan:** Starter ($7/month) for development, Standard ($25/month) for production
- **Build command:** `npm run build`
- **Start command:** `npm start`
- **Environment variables:** managed via Render's environment variable dashboard

### Database Hosting — Supabase

- **Region:** Singapore (`ap-southeast-1`)
- **Plan:** Pro ($25/month) — required for production (Free tier pauses after 1 week of inactivity)
- **Connection pooling:** PgBouncer (included in Supabase Pro)
- **Backups:** Daily automated backups with 7-day retention (Pro plan)
- **Point-in-time recovery:** Available on Pro plan

### File Storage — Cloudflare R2

- **Pricing:** $0.015/GB storage, $0 egress — zero cost for file downloads
- **Region:** Auto (Cloudflare global edge network)
- **Access:** Via AWS SDK v3 (`@aws-sdk/client-s3`) using R2's S3-compatible API

### Caching — Upstash Redis

- **Plan:** Pay-as-you-go (free tier: 10,000 requests/day — sufficient for development)
- **Region:** Singapore

### Background Jobs — Inngest

- **Plan:** Free tier (1M function runs/month) — sufficient for MVP
- **Integration:** Inngest SDK + Next.js API route as the event receiver (`/api/inngest`)

### Domain & DNS — Cloudflare

- DNS managed via Cloudflare (same account as R2)
- SSL/TLS: Cloudflare handles HTTPS termination
- Target domains:
  - `app.sentire.ph` → Admin Portal (Render)
  - `ess.sentire.ph` → ESS Mobile PWA (Render, same app)
  - `{tenant}.sentire.ph` → Tenant-specific ESS links (optional subdomain routing)

---

## 15. Development Tooling

| Tool | Purpose |
|---|---|
| TypeScript | Type safety across the entire codebase |
| ESLint + `eslint-config-next` | Linting |
| Prettier | Code formatting |
| Husky + lint-staged | Pre-commit hooks (lint + format before every commit) |
| Prisma Studio | Visual database browser for development |
| Supabase CLI | Local Supabase instance for development (`supabase start`) |
| Sentry | Error tracking and performance monitoring (both server and client) |
| GitHub Actions | CI/CD pipeline (lint → type-check → build → deploy to Render) |

### Local Development Environment

```bash
# Run local Supabase (PostgreSQL + Auth + Storage)
supabase start

# Run Next.js dev server
npm run dev

# Inngest dev server (local job execution)
npx inngest-cli@latest dev
```

---

## 16. Security Architecture

| Concern | Implementation |
|---|---|
| Multi-tenant data isolation | Supabase RLS — enforced at database level, not just application |
| API authentication | Supabase JWT tokens validated on every API route |
| File access control | Signed URLs with 15-minute expiry — no public bucket access |
| Bank account fraud prevention | Profile Update Request workflow — changes require HR Admin approval before commit |
| Geofence tampering prevention | Haversine distance computed server-side — client only sends coordinates |
| Payslip access | PIN-protected on ESS — payslip PDF served via signed URL only after PIN verification |
| Secrets management | All API keys in environment variables — never in source code |
| Audit logging | DTR_Audit_Log is append-only — no UPDATE or DELETE allowed by application code |
| ESS session security | Short-lived JWT tokens — ESS sessions expire after 8 hours of inactivity |
| HTTPS | Enforced everywhere — Cloudflare handles TLS termination |

---

## 17. Cost Estimate (Monthly, Production)

| Service | Plan | Est. Cost |
|---|---|---|
| Render (Next.js app) | Standard | $25 |
| Supabase (Database + Auth + Realtime) | Pro | $25 |
| Cloudflare R2 (Storage) | Pay-as-you-go | ~$5–15 |
| Upstash Redis (Cache) | Pay-as-you-go | ~$0–5 |
| Inngest (Background jobs) | Free → Starter | $0–25 |
| Resend (Email) | Free → Pro | $0–20 |
| Semaphore PH (SMS) | Pay-per-SMS | ~$5–15 |
| Sentry (Error tracking) | Developer (free) | $0 |
| **Total estimate** | | **~$60–130/month** |

> Cost scales primarily with Supabase database size and Cloudflare R2 storage as tenant count and employee count grow. The architecture is designed to stay under $150/month for the first 10–20 tenants.

---

## 18. Future Considerations (Not Yet Implemented)

| Item | Notes |
|---|---|
| Dedicated microservice for Payroll Engine | For very large tenants (5,000+ employees), the Gross-to-Net loop may need to move to a dedicated compute service. Inngest jobs are the first step toward this. |
| Mobile native app (React Native) | The ESS PWA covers MVP needs. If Apple App Store / Google Play presence becomes a requirement, React Native with Expo is the natural extension given the existing React codebase. |
| OpenID Connect / SSO | For enterprise clients who want Single Sign-On via Google Workspace or Microsoft Entra. Supabase Auth supports OIDC providers. |
| Data residency (Philippines) | If DICT or future Philippine data privacy regulations require data to be stored in-country, a local PostgreSQL provider (e.g., Vultr Manila) would replace Supabase. The Prisma + RLS architecture makes this swap straightforward. |
| Automated BIR e-Filing | BIR's eFPS API integration for direct electronic filing of 1601-C and Alphalist reports. |

---

*Sentire Software · Tech Stack & Architecture v1.0 · June 2026*
