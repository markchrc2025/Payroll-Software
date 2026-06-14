/**
 * Design tokens for the Sentire transactional email family.
 *
 * Mirrors docs/design_handoff_emails/README.md → "Design Tokens". Kept as plain
 * string constants so they can be interpolated into the inline styles that
 * email clients require (no CSS custom properties — Outlook/Word ignores them).
 */

export const COLOR = {
  ink: "#2A2420",
  muted: "#6B6259",
  muted2: "#978c80",
  line: "#ece6dd",
  bg: "#F7F4EF", // cream canvas
  paper: "#ffffff",
  acc: "#E8693A", // core orange — CTAs, badges
  accPress: "#C2552F", // links, pressed, default eyebrow
  accSoft: "#fdeee6", // icon tiles, orange pill bg
  sand: "#F2ECE4", // info panels
  sandLine: "#e4dbcd", // hairlines inside panels
  headerTxt: "#F7F3EF",
  headerSub: "#9c9085", // surface label
  legal: "#a89d90",
} as const;

/** Status tones — used by pills and callouts. */
export const TONE = {
  green: { text: "#1f7a4d", bg: "#e7f4ec" },
  amber: { text: "#9a6a12", bg: "#fbf1dc" },
  red: { text: "#b23b34", bg: "#fbe9e7" },
  orange: { text: "#C2552F", bg: "#fdeee6" },
} as const;

/** Callout boxes use a deeper title/body than the pill tones. */
export const CALLOUT = {
  amber: { bg: "#fbf1dc", title: "#8a5e10", body: "#6e4f17" },
  red: { bg: "#fbe9e7", title: "#9c352e", body: "#7d4a44" },
} as const;

export const FONT = {
  display: "'Instrument Sans',Arial,sans-serif",
  body: "'Hanken Grotesk',Arial,sans-serif",
  mono: "'JetBrains Mono','Courier New',monospace",
} as const;

export type PillTone = keyof typeof TONE;
export type CalloutTone = keyof typeof CALLOUT;
export type EyebrowTone = "orange" | "red";
