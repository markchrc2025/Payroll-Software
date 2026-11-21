/**
 * PAY-199 (ruling 5, Mark 20 Nov 2026; blank supplied 21 Nov): BIR 2316 on
 * the official layout. The certificate's items (bir-2316.ts, PAY-71) are
 * written onto the official blank (September 2021 ENCS) at the positions of
 * its boxes, measured from the PDF itself (612 x 936 pt, positions below are
 * from the top of the page, as measured). Nothing is added to the form.
 *
 * The employee's e-signature, when they have uploaded one in ESS, is drawn
 * over Item 54 (Conforme) with today's date; when the certificate qualifies
 * for substituted filing (no previous employer, tax withheld equals tax due),
 * also over Item 56. Items 53 and 55 carry the HR manager the employer
 * assigned as 2316 signatory (ruling 22 Nov 2026): name and position, and
 * that person's e-signature when uploaded, with the date at Item 53; Item 55
 * only under substituted filing. No signatory assigned: they stay blank.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { loadBlank2316 } from "./bir-2316-blank";
import { formatCentavos, type BirFormView } from "./bir-form";

const PAGE_H = 936;
const FONT = 8;

type Box = { x0: number; x1: number; top: number; bottom: number };
const box = (x0: number, x1: number, top: number, h = 15): Box => ({ x0, x1, top, bottom: top + h });

/** Amount boxes: Part IV-A (left) and Part IV-B (right). */
const AMOUNT: Record<string, Box> = {
  "9": box(209.9, 308.6, 272.3), "10": box(209.9, 308.6, 290.7),
  "19": box(207.4, 309.2, 512.2), "20": box(207.4, 309.2, 531.6), "21": box(207.4, 309.2, 551.1),
  "22": box(207.4, 309.2, 570.5), "23": box(207.8, 309.7, 589.6), "24": box(207.8, 309.7, 609.0),
  "25A": box(207.4, 309.2, 628.5), "25B": box(207.4, 309.2, 648.3), "26": box(207.4, 309.2, 667.7),
  "27": box(207.4, 309.1, 687.6), "28": box(207.4, 309.1, 707.1),
  "29": box(483.8, 585.6, 141.4), "30": box(483.8, 585.6, 160.5), "31": box(483.8, 585.6, 180.4),
  "32": box(483.8, 585.6, 200.6), "33": box(483.8, 585.6, 220.6), "34": box(483.9, 585.6, 240.1),
  "35": box(483.8, 585.6, 259.0), "36": box(483.8, 585.6, 278.5), "37": box(483.8, 585.6, 297.7),
  "38": box(484.2, 586.0, 316.7), "39": box(483.8, 585.6, 354.5), "40": box(483.8, 585.6, 374.0),
  "41": box(483.8, 585.6, 392.9), "42": box(483.8, 585.6, 412.4), "43": box(483.8, 585.6, 431.4),
  "44A": box(483.8, 585.6, 458.8), "44B": box(483.8, 585.6, 476.8), "45": box(483.4, 585.2, 503.1),
  "46": box(483.4, 585.2, 521.9), "47": box(483.4, 585.2, 541.4), "48": box(483.4, 585.2, 560.8),
  "49": box(483.8, 585.6, 580.2), "50": box(483.8, 585.6, 599.7), "51A": box(483.8, 585.6, 628.8),
  "51B": box(483.8, 585.6, 648.3), "52": box(483.8, 585.6, 667.4),
};

/** Free-text boxes. */
const TEXT: Record<string, Box> = {
  "4": box(42.2, 253.6, 148.5), "6": box(42.6, 253.6, 176.6), "6B": box(42.6, 253.6, 201.9),
  "6D": box(42.6, 309.4, 227.4), "13": box(42.2, 308.4, 361.0),
  "14": box(42.6, 253.6, 387.2), "17": box(42.2, 308.4, 457.1), "18": box(43.0, 254.1, 483.9),
};

/** Boxes split into cells, one character a cell. */
type Cells = { x0: number; x1: number; n: number }[];
const TIN_CELLS: Cells = [{ x0: 86.2, x1: 124.1, n: 3 }, { x0: 135.9, x1: 173.8, n: 3 }, { x0: 185.6, x1: 223.5, n: 3 }, { x0: 235.2, x1: 306.1, n: 5 }];
const TIN_TOP: Record<string, number> = { "3": 122.7, "12": 335.2, "16": 431.4 };
const ZIP: Record<string, [number, number, number]> = { "6A": [261.4, 309.4, 176.7], "6C": [261.5, 309.4, 201.8], "14A": [259.3, 307.3, 388.1], "18A": [259.8, 307.7, 484.0] };

export interface FillOptions {
  /** The employee's e-signature (PNG or JPEG). */
  signature?: { bytes: Uint8Array; mimeType: string } | null;
  /** The date written beside the signatures (defaults to today). */
  signedOn?: Date;
  /** The employer's 2316 signatory (Items 53 and 55). */
  employerSignatory?: { name: string; position: string; signature: { bytes: Uint8Array; mimeType: string } | null } | null;
}

const valueOf = (form: BirFormView, no: string) => {
  for (const s of form.sections) for (const l of s.lines) if (l.no === no) return l;
  return null;
};

function baseline(b: Box) {
  return PAGE_H - b.bottom + (b.bottom - b.top - FONT) / 2 + 1.5;
}

function textIn(page: PDFPage, font: PDFFont, b: Box, text: string, align: "left" | "right" = "left") {
  let size = FONT;
  const room = b.x1 - b.x0 - 6;
  while (size > 5 && font.widthOfTextAtSize(text, size) > room) size -= 0.5;
  const w = font.widthOfTextAtSize(text, size);
  const x = align === "right" ? b.x1 - 3 - w : b.x0 + 3;
  page.drawText(text, { x, y: baseline(b), size, font, color: rgb(0, 0, 0) });
}

function cellsIn(page: PDFPage, font: PDFFont, cells: Cells, top: number, chars: string[]) {
  let k = 0;
  for (const c of cells) {
    const w = (c.x1 - c.x0) / c.n;
    for (let i = 0; i < c.n; i++, k++) {
      const ch = chars[k];
      if (!ch) continue;
      const cw = font.widthOfTextAtSize(ch, FONT);
      page.drawText(ch, { x: c.x0 + w * i + (w - cw) / 2, y: baseline(box(0, 0, top)), size: FONT, font });
    }
  }
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").split("");

/** The certificate written onto the official blank. */
export async function fill2316(form: BirFormView, opts: FillOptions = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await loadBlank2316());
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const v = (no: string) => valueOf(form, no)?.value ?? null;

  // Item 1, the year; Item 2, the period (MM/DD to MM/DD).
  cellsIn(page, font, [{ x0: 124.8, x1: 195.7, n: 4 }], 94.3, digits(v("1")));
  const period = v("2");
  if (period) {
    const [from, to] = period.split(" to ");
    cellsIn(page, font, [{ x0: 386.8, x1: 456.7, n: 4 }], 94.6, digits(from));
    cellsIn(page, font, [{ x0: 512.4, x1: 582.3, n: 4 }], 94.6, digits(to));
  }
  // TINs: 3 + 3 + 3 + 5 cells.
  for (const [no, top] of Object.entries(TIN_TOP)) {
    const t = v(no);
    if (t) cellsIn(page, font, TIN_CELLS, top, digits(t));
  }
  // Item 5, RDO Code (3 cells); ZIP codes (4 cells).
  if (v("5")) cellsIn(page, font, [{ x0: 264.5, x1: 302.5, n: 3 }], 148.5, (v("5") ?? "").split(""));
  for (const [no, [x0, x1, top]] of Object.entries(ZIP)) {
    const z = v(no);
    if (z) cellsIn(page, font, [{ x0, x1, n: 4 }], top, z.replace(/\s/g, "").slice(0, 4).split(""));
  }
  // Item 7, date of birth: MM DD | YYYY.
  const dob = digits(v("7"));
  if (dob.length === 8) cellsIn(page, font, [{ x0: 46.9, x1: 97.2, n: 4 }, { x0: 97.2, x1: 147.6, n: 4 }], 254.1, dob);
  // Item 8, contact number: 11 cells.
  const phone = digits(v("8"));
  if (phone.length) cellsIn(page, font, [{ x0: 167.2, x1: 309.4, n: 11 }], 254.2, phone.slice(0, 11));
  // Free text.
  for (const [no, b] of Object.entries(TEXT)) {
    const t = v(no);
    if (t) textIn(page, font, b, t);
  }
  // Item 11 (MWE) and Item 15 (Main Employer): an X in the box.
  if (v("11") === "X") page.drawText("X", { x: 38.5, y: PAGE_H - 321, size: 9, font: bold });
  if (v("15") === "Main Employer") page.drawText("X", { x: 120, y: PAGE_H - 417, size: 9, font: bold });
  // Amounts, right-aligned.
  for (const [no, b] of Object.entries(AMOUNT)) {
    const line = valueOf(form, no);
    if (line?.kind === "money" && line.value !== null) textIn(page, font, b, formatCentavos(line.value), "right");
  }

  // The employee's conformity (Item 54) and, for substituted filing, Item 56.
  const name = v("4");
  const sig = opts.signature ?? null;
  const signedOn = opts.signedOn ?? new Date();
  const mmddyyyy = digits(`${String(signedOn.getUTCMonth() + 1).padStart(2, "0")}${String(signedOn.getUTCDate()).padStart(2, "0")}${signedOn.getUTCFullYear()}`);
  const substituted = (v("22") === null || v("22") === "0") && v("24") !== null && v("24") === v("26");
  // The signature sits on the signature line (its bottom at `lineTop`), over the printed name.
  const signAt = async (centerX: number, lineTop: number, which = sig) => {
    if (!which) return;
    const img = which.mimeType === "image/png" ? await doc.embedPng(which.bytes) : await doc.embedJpg(which.bytes);
    const maxW = 110, maxH = lineTop > 850 ? 11 : 16;
    const s = Math.min(maxW / img.width, maxH / img.height);
    page.drawImage(img, { x: centerX - (img.width * s) / 2, y: PAGE_H - lineTop, width: img.width * s, height: img.height * s });
  };
  if (sig) {
    await signAt(179.8, 799);
    cellsIn(page, font, [{ x0: 416.1, x1: 466.6, n: 4 }, { x0: 466.6, x1: 517.0, n: 4 }], 787.1, mmddyyyy);
    if (substituted) await signAt(451.1, 894.5);
  }
  // The employer's signatory: Item 53, and Item 55 under substituted filing.
  const es = opts.employerSignatory ?? null;
  if (es) {
    await signAt(201.2, 768.5, es.signature);
    if (es.signature) cellsIn(page, font, [{ x0: 415.7, x1: 466.1, n: 4 }, { x0: 466.1, x1: 516.6, n: 4 }], 756.7, mmddyyyy);
    if (substituted) await signAt(179.8, 880.5, es.signature);
    const label = `${es.name}, ${es.position}`;
    page.drawText(label, { x: 201.2 - font.widthOfTextAtSize(label, 7) / 2, y: PAGE_H - 768.5, size: 7, font });
    if (substituted) page.drawText(label, { x: 179.8 - font.widthOfTextAtSize(label, 7) / 2, y: PAGE_H - 880.5, size: 7, font });
  }
  // The printed name last, so an image with a white background never hides it.
  if (name) {
    const w = font.widthOfTextAtSize(name, 7);
    page.drawText(name, { x: 179.8 - w / 2, y: PAGE_H - 799, size: 7, font });
    if (substituted) page.drawText(name, { x: 451.1 - font.widthOfTextAtSize(name, 7) / 2, y: PAGE_H - 894.5, size: 7, font });
  }
  // Plain object streams, so the result can be checked for its image and text.
  return doc.save({ useObjectStreams: false });
}
