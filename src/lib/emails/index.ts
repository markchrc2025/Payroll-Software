/**
 * Sentire transactional email family (post-redesign).
 *
 * Public entry point — import send functions from here:
 *   import { sendTenantOnboarding } from "@/lib/emails";
 *
 * Structure:
 *   tokens.ts / assets.ts / surfaces.ts  — design tokens, CDN asset URLs, surfaces
 *   layout.ts                            — the shared shell (header + footer + legal)
 *   blocks.ts                            — reusable content blocks
 *   templates.ts                         — the 11 render* fns → { subject, html }
 *   send.ts                              — the 11 send* fns (render + Resend dispatch)
 *
 * NOTE: the older pre-redesign templates still live in src/lib/email.ts
 * (sendPasswordResetEmail, sendWelcomeEmail, sendPayslipReadyEmail, …). The
 * three that overlap this family (password reset, password-changed, welcome)
 * are superseded by the templates here; migrating their call sites and folding
 * email.ts into this module is a recommended follow-up (see the PR description).
 */

export * from "./send";
export * as templates from "./templates";
export type { Surface } from "./surfaces";
export type { Rendered } from "./templates";
