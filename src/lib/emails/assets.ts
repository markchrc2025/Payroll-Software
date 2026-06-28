/**
 * Absolute URLs for email assets (logo mark + monoline icons).
 *
 * Mail clients DROP relative paths, so every <img> must use an absolute URL.
 * The files live in the app at public/email-assets/, so by default they're
 * served from the app's own origin — no CDN/bucket setup required. Override
 * EMAIL_ASSET_BASE_URL only if you want to serve them from a dedicated CDN.
 *
 * Resolution order:
 *   1. EMAIL_ASSET_BASE_URL                (explicit, preferred)
 *   2. R2_PUBLIC_URL + "/email-assets"     (reuse the app's R2 public domain)
 *   3. NEXT_PUBLIC_APP_URL + "/email-assets"   (the app serves public/ — default)
 *   4. https://assets.sentire.solutions/email-assets   (last-resort default)
 *
 * Files (committed at public/email-assets/, exact names — see README "Assets"):
 *   sentire-mark-dark-1024.png
 *   icon-clock.png  icon-payslip.png  icon-leave.png
 *   icon-check.png  icon-shield.png   icon-key.png
 */

const stripTrailingSlash = (s: string) => s.replace(/\/$/, "");

function resolveBase(): string {
  if (process.env.EMAIL_ASSET_BASE_URL) return stripTrailingSlash(process.env.EMAIL_ASSET_BASE_URL);
  if (process.env.R2_PUBLIC_URL) return `${stripTrailingSlash(process.env.R2_PUBLIC_URL)}/email-assets`;
  if (process.env.NEXT_PUBLIC_APP_URL) return `${stripTrailingSlash(process.env.NEXT_PUBLIC_APP_URL)}/email-assets`;
  return "https://assets.sentire.solutions/email-assets";
}

const BASE = resolveBase();

const asset = (file: string) => `${BASE}/${file}`;

export const LOGO_MARK = asset("sentire-mark-dark-1024.png");

/** Monoline icons keyed by the name used in blocks/templates. */
export const ICON = {
  clock: asset("icon-clock.png"),
  payslip: asset("icon-payslip.png"),
  leave: asset("icon-leave.png"),
  check: asset("icon-check.png"),
  shield: asset("icon-shield.png"),
  key: asset("icon-key.png"),
} as const;

export type IconName = keyof typeof ICON;
