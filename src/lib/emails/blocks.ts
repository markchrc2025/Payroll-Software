/**
 * Reusable content blocks composed into each email's body. Each function returns
 * one or more full table rows (`<tr>…</tr>`) for insertion between the header and
 * the divider/footer that renderShell() supplies.
 *
 * Markup is reproduced faithfully from docs/design_handoff_emails/emails/*.html.
 * Inline styles are mandatory for email clients — do not refactor to classes.
 *
 * Callers are responsible for escaping merge-variable values (see util.ts);
 * `bodyHtml`/`valueHtml`-style params accept caller-built HTML on purpose.
 */

import { COLOR, FONT, TONE, CALLOUT, type PillTone, type CalloutTone, type EyebrowTone } from "./tokens";
import { ICON, type IconName } from "./assets";

// ── intro: eyebrow + H1 + paragraph + CTA button ─────────────────────────────
export function intro(o: {
  eyebrow: string;
  eyebrowTone?: EyebrowTone;
  h1: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
}): string {
  const eyebrowColor = o.eyebrowTone === "red" ? TONE.red.text : COLOR.accPress;
  return `    <tr><td class="px" style="padding:38px 36px 6px;text-align:left;">
      <div style="font-family:${FONT.body};font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${eyebrowColor};margin-bottom:12px;">${o.eyebrow}</div>
      <h1 style="margin:0 0 14px;font-family:${FONT.display};font-weight:600;font-size:26px;line-height:1.18;letter-spacing:-0.02em;color:${COLOR.ink};">${o.h1}</h1>
      <p style="margin:0 0 26px;font-family:${FONT.body};font-size:15px;line-height:1.62;color:${COLOR.muted};">${o.bodyHtml}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td bgcolor="${COLOR.acc}" style="background:${COLOR.acc};border-radius:11px;">
          <a href="${o.ctaUrl}" style="display:inline-block;padding:15px 34px;font-family:${FONT.display};font-weight:600;font-size:15px;color:#ffffff;letter-spacing:0.01em;white-space:nowrap;">${o.ctaLabel}</a>
        </td>
      </tr></table>
    </td></tr>`;
}

// ── featuresPanel: "What you can do" icon list ───────────────────────────────
export function featuresPanel(o: {
  kicker?: string;
  items: { icon: IconName; title: string; desc: string }[];
}): string {
  const kicker = o.kicker ?? "What you can do";
  const rows = o.items
    .map((it, i) => {
      const last = i === o.items.length - 1;
      return `      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="60" style="vertical-align:top;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="48" height="48" bgcolor="${COLOR.accSoft}" align="center" style="background:${COLOR.accSoft};border-radius:12px;"><img src="${ICON[it.icon]}" width="26" height="26" alt="" style="display:block;width:26px;height:26px;" /></td></tr></table></td>
        <td style="vertical-align:top;padding-left:14px;padding-bottom:${last ? 4 : 18}px;">
          <div style="font-family:${FONT.display};font-size:15px;font-weight:600;color:${COLOR.ink};line-height:1.4;">${it.title}</div>
          <div style="font-family:${FONT.body};font-size:13.5px;color:${COLOR.muted};line-height:1.5;">${it.desc}</div>
        </td>
      </tr></table>`;
    })
    .join("\n");
  return `    <tr><td class="px" style="padding:28px 36px 6px;">
      <div style="font-family:${FONT.body};font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${COLOR.muted2};padding-bottom:14px;">${kicker}</div>
${rows}
    </td></tr>`;
}

// ── stepsPanel: numbered sand panel ──────────────────────────────────────────
export function stepsPanel(o: {
  kicker: string;
  meta: string;
  title: string;
  steps: { title: string; desc: string }[];
}): string {
  const steps = o.steps
    .map((st, i) => {
      const hairline =
        i < o.steps.length - 1
          ? `\n        <div style="height:1px;background:${COLOR.sandLine};font-size:0;line-height:0;">&nbsp;</div>`
          : "";
      return `        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="40" style="vertical-align:top;padding:16px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="28" height="28" bgcolor="${COLOR.acc}" align="center" style="background:${COLOR.acc};border-radius:14px;font-family:${FONT.display};font-size:13px;font-weight:700;color:#ffffff;line-height:28px;">${i + 1}</td></tr></table></td>
          <td style="vertical-align:top;padding:16px 0 16px 4px;">
            <div style="font-family:${FONT.display};font-size:15px;font-weight:600;color:${COLOR.ink};line-height:1.4;">${st.title}</div>
            <div style="font-family:${FONT.body};font-size:13.5px;color:${COLOR.muted};line-height:1.55;padding-top:2px;">${st.desc}</div>
          </td>
        </tr></table>${hairline}`;
    })
    .join("\n");
  return `    <tr><td class="px" style="padding:32px 36px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.sand}" style="background:${COLOR.sand};border-radius:14px;"><tr><td style="padding:8px 26px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="vertical-align:middle;font-family:${FONT.body};font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${COLOR.muted2};padding:18px 0 2px;">${o.kicker}</td>
          <td align="right" style="vertical-align:middle;font-family:${FONT.body};font-size:11px;font-weight:600;color:${COLOR.legal};padding:18px 0 2px;">${o.meta}</td>
        </tr></table>
        <div style="font-family:${FONT.display};font-size:18px;font-weight:600;letter-spacing:-0.015em;color:${COLOR.ink};padding:2px 0 6px;">${o.title}</div>
${steps}
      </td></tr></table>
    </td></tr>`;
}

// ── note: a plain reassurance / info paragraph ───────────────────────────────
export function note(html: string): string {
  return `    <tr><td class="px" style="padding:18px 36px 2px;">
      <p style="margin:0;font-family:${FONT.body};font-size:14px;line-height:1.6;color:${COLOR.muted};">${html}</p>
    </td></tr>`;
}

// ── fallback: "copy this link" + mono URL ────────────────────────────────────
export function fallback(url: string): string {
  return `    <tr><td class="px" style="padding:24px 36px 6px;">
      <p style="margin:0 0 7px;font-family:${FONT.body};font-size:13px;color:${COLOR.muted2};">Or copy this link into your browser:</p>
      <p style="margin:0;font-family:${FONT.mono};font-size:12.5px;line-height:1.55;word-break:break-all;"><a href="${url}" style="color:${COLOR.accPress};">${url}</a></p>
    </td></tr>`;
}

// ── noticeIntro: centered badge + H1 + paragraph ─────────────────────────────
export function noticeIntro(o: { icon: IconName; h1: string; bodyHtml: string }): string {
  return `    <tr><td class="px" style="padding:38px 36px 4px;text-align:center;">
      <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 18px;"><tr><td width="56" height="56" bgcolor="${COLOR.accSoft}" align="center" style="background:${COLOR.accSoft};border-radius:28px;"><img src="${ICON[o.icon]}" width="30" height="30" alt="" style="display:block;width:30px;height:30px;" /></td></tr></table>
      <h1 style="margin:0 0 12px;font-family:${FONT.display};font-weight:600;font-size:25px;line-height:1.18;letter-spacing:-0.02em;color:${COLOR.ink};">${o.h1}</h1>
      <p style="margin:0;font-family:${FONT.body};font-size:15px;line-height:1.62;color:${COLOR.muted};">${o.bodyHtml}</p>
    </td></tr>`;
}

type Row = { label: string; value: string };

function kvRows(rows: Row[], align: "left" | "right"): string {
  return rows
    .map((r, i) => {
      const topPad = i === 0 ? 3 : 11;
      const alignAttr = align === "right" ? ' align="right"' : "";
      const hairline =
        i < rows.length - 1
          ? `<tr><td colspan="2" style="font-size:0;line-height:0;"><div style="height:1px;background:${COLOR.sandLine};">&nbsp;</div></td></tr>`
          : "";
      return `        <tr>
          <td style="font-family:${FONT.body};font-size:13px;color:${COLOR.muted2};padding:${topPad}px 0 11px;width:140px;vertical-align:top;">${r.label}</td>
          <td${alignAttr} style="font-family:${FONT.display};font-size:13.5px;font-weight:600;color:${COLOR.ink};padding:${topPad}px 0 11px;vertical-align:top;">${r.value}</td>
        </tr>${hairline ? "\n        " + hairline : ""}`;
    })
    .join("\n");
}

// ── detailPanel: sand key/value panel (notices) ──────────────────────────────
export function detailPanel(rows: Row[]): string {
  return `    <tr><td class="px" style="padding:26px 36px 6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.sand}" style="background:${COLOR.sand};border-radius:14px;"><tr><td style="padding:14px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${kvRows(rows, "left")}
        </table>
      </td></tr></table>
    </td></tr>`;
}

// ── pill: status chip ────────────────────────────────────────────────────────
export function pill(text: string, tone: PillTone): string {
  const { text: c, bg } = TONE[tone];
  return `<span style="display:inline-block;font-family:${FONT.display};font-size:12px;font-weight:700;letter-spacing:0.01em;color:${c};background:${bg};border-radius:999px;padding:5px 12px;white-space:nowrap;">${text}</span>`;
}

// ── billingPanel: label + pill, big amount, key/value rows ────────────────────
export function billingPanel(o: {
  label: string;
  pillText: string;
  pillTone: PillTone;
  amount: string;
  rows: Row[];
}): string {
  return `    <tr><td class="px" style="padding:30px 36px 6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.sand}" style="background:${COLOR.sand};border-radius:14px;"><tr><td style="padding:22px 24px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="vertical-align:middle;font-family:${FONT.body};font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${COLOR.muted2};">${o.label}</td>
          <td align="right" style="vertical-align:middle;">${pill(o.pillText, o.pillTone)}</td>
        </tr></table>
        <div style="font-family:${FONT.display};font-size:34px;font-weight:600;letter-spacing:-0.02em;color:${COLOR.ink};padding:8px 0 16px;">${o.amount}</div>
        <div style="height:1px;background:${COLOR.sandLine};font-size:0;line-height:0;">&nbsp;</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;">
${kvRows(o.rows, "right")}
        </table>
      </td></tr></table>
    </td></tr>`;
}

// ── calloutBox / warnCallout: tinted warning box ─────────────────────────────
export function calloutBox(o: {
  tone: CalloutTone;
  title: string;
  bodyHtml: string;
  // notices use a slightly tighter outer padding than billing — see references.
  variant?: "billing" | "notice";
}): string {
  const { bg, title, body } = CALLOUT[o.tone];
  const outer = o.variant === "notice" ? "18px 36px 6px" : "20px 36px 4px";
  return `    <tr><td class="px" style="padding:${outer};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${bg}" style="background:${bg};border-radius:12px;"><tr><td style="padding:16px 20px;">
        <div style="font-family:${FONT.display};font-size:14px;font-weight:600;color:${title};line-height:1.4;padding-bottom:3px;">${o.title}</div>
        <div style="font-family:${FONT.body};font-size:13.5px;color:${body};line-height:1.55;">${o.bodyHtml}</div>
      </td></tr></table>
    </td></tr>`;
}

/** Inline link styled for the red warnCallout body (security action link). */
export function warnLink(label: string, url: string): string {
  return `<a href="${url}" style="color:${TONE.red.text};font-weight:600;">${label}</a>`;
}
