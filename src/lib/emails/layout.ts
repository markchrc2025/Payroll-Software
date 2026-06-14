/**
 * The shared email shell — every one of the 11 emails renders through this.
 *
 * Anatomy (see README "Shell anatomy"): cream canvas → 600px white card with
 * the ink header band (logo + surface label) → body blocks → divider → footer →
 * legal line outside the card.
 *
 * ⚠️ Fidelity invariants that MUST be preserved:
 *   • card table uses border-collapse:separate;border-spacing:0  (rounded corners)
 *   • single @media max-width:480px query (NOT 600 — would trigger at own width)
 *   • hidden preheader <div> + zero-width-joiner/nbsp padding
 */

import { COLOR, FONT } from "./tokens";
import { LOGO_MARK } from "./assets";
import { SURFACES, type Surface } from "./surfaces";

// zwnj+nbsp padding that stops clients pulling body copy into the inbox preview.
const PREHEADER_PAD = "&zwnj;&nbsp;".repeat(6);

export type Shell = {
  title: string; // <title> + a11y
  preheader: string; // inbox preview text (plain copy)
  surface: Surface;
  body: string; // concatenated block <tr> rows
  footerLines: string[]; // footer paragraphs (HTML allowed)
  legal: string; // legal line below the card (HTML allowed)
};

export function renderShell(s: Shell): string {
  const surface = SURFACES[s.surface];

  const footer = s.footerLines
    .map(
      (line, i) =>
        `<p style="margin:${i === 0 ? "0 0 6px" : "0"};font-family:${FONT.body};font-size:12.5px;line-height:1.6;color:${COLOR.muted2};">${line}</p>`,
    )
    .join("\n      ");

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="x-apple-disable-message-reformatting" />
<title>${s.title}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@500;600;700&family=Hanken+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />
<style>
  body { margin:0; padding:0; background:${COLOR.bg}; -webkit-text-size-adjust:100%; }
  table { border-collapse:collapse; }
  img { border:0; line-height:100%; outline:none; -ms-interpolation-mode:bicubic; }
  a { text-decoration:none; }
  @media only screen and (max-width:480px){
    .card { width:100% !important; }
    .px { padding-left:24px !important; padding-right:24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COLOR.bg};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${COLOR.bg};">${s.preheader} ${PREHEADER_PAD}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.bg};">
<tr><td align="center" style="padding:36px 16px 40px;">

  <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${COLOR.paper};border:1px solid ${COLOR.line};border-radius:16px;border-collapse:separate;border-spacing:0;overflow:hidden;">

    <tr><td bgcolor="${COLOR.ink}" style="background:${COLOR.ink};padding:22px 36px;border-radius:16px 16px 0 0;" class="px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="left" style="vertical-align:middle;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="vertical-align:middle;padding-right:11px;"><img src="${LOGO_MARK}" width="30" height="30" alt="Sentire" style="display:block;width:30px;height:30px;" /></td>
            <td style="vertical-align:middle;font-family:${FONT.display};font-weight:600;font-size:21px;letter-spacing:-0.02em;color:${COLOR.headerTxt};">Sentire</td>
          </tr></table>
        </td>
        <td align="right" style="vertical-align:middle;font-family:${FONT.display};font-size:11px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${COLOR.headerSub};">${surface.label}</td>
      </tr></table>
    </td></tr>

${s.body}

    <tr><td class="px" style="padding:4px 36px 0;"><div style="height:1px;background:${COLOR.line};font-size:0;line-height:0;">&nbsp;</div></td></tr>
    <tr><td class="px" style="padding:20px 36px 30px;border-radius:0 0 16px 16px;">
      ${footer}
    </td></tr>

  </table>

  <table role="presentation" width="600" class="card" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;"><tr>
    <td style="padding:18px 20px 0;text-align:center;font-family:${FONT.body};font-size:11.5px;line-height:1.6;color:${COLOR.legal};">${s.legal}</td>
  </tr></table>

</td></tr>
</table>
</body>
</html>`;
}

/** Convenience: a footer "support" line with the surface's mailto link. */
export function supportLine(prefix: string, surface: Surface): string {
  const { support } = SURFACES[surface];
  return `${prefix} <a href="mailto:${support}" style="color:${COLOR.accPress};font-weight:600;">${support}</a>`;
}
