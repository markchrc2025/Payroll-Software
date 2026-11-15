/**
 * PAY-126: every font is served from the repo, so a production build makes no
 * request to Google Fonts (three production builds failed fetching them:
 * 10 Nov, 11 Nov 12:59 UTC and 12 Nov 04:00 UTC).
 *
 *   S1  no source file imports next/font/google.
 *   S2  every file layout.tsx loads exists, is a real woff2 file and sits beside
 *       its SIL Open Font License; all eight CSS variables the styles read are
 *       still defined.
 *   S3  the peso sign renders in the brand font. Google split each font into a
 *       "latin" file and a "latin-ext" file, and U+20B1 is only in latin-ext;
 *       the Inter added in #264 was latin-only, so the admin drew every ₱ in a
 *       fallback font. Each file here covers latin and latin-ext in one file.
 *       Instrument Sans and JetBrains Mono have no peso glyph in any file
 *       Google serves, so they are exempt; Geist and Geist Mono, second in
 *       their stacks, draw ₱ for them.
 *   S4  every font layout.tsx loads is read by some style (Fraunces was loaded
 *       and preloaded on every page with no reader, so it was removed), and the
 *       two fonts that only stand behind another font are not preloaded.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require("next/dist/compiled/@next/font/dist/fontkit").default as (
  buf: Buffer,
) => { hasGlyphForCodePoint(cp: number): boolean };

const LAYOUT = "src/app/layout.tsx";
const layout = readFileSync(LAYOUT, "utf8");
const fontPaths = [...layout.matchAll(/"(\.\/fonts\/[^"]+\.woff2)"/g)].map((m) =>
  join(dirname(LAYOUT), m[1]),
);

const NO_PESO_IN_TYPEFACE = ["instrument-sans", "jetbrains-mono"];

describe("PAY-126 fonts are self-hosted", () => {
  it("S1 no source file imports next/font/google", () => {
    const hits = execSync("git grep -l 'next/font/google' -- src ':!src/__tests__' || true", { encoding: "utf8" })
      .split("\n")
      .filter((f) => /\.(m?[jt]sx?|css)$/.test(f)); // code only; the fonts README names it in prose
    expect(hits, "files still importing next/font/google").toEqual([]);
  });

  it("S2 every loaded file exists, is woff2 and has its licence; all variables defined", () => {
    expect(fontPaths.length, "vacuity guard: layout loads local font files").toBeGreaterThanOrEqual(8);
    for (const p of fontPaths) {
      expect(existsSync(p), p).toBe(true);
      expect(readFileSync(p).subarray(0, 4).toString("latin1"), `${p} woff2 signature`).toBe("wOF2");
      expect(existsSync(join(dirname(p), "OFL.txt")), `${p} licence`).toBe(true);
    }
    for (const v of [
      "--font-geist-sans",
      "--font-geist-mono",
      "--font-plus-jakarta-sans",
      "--font-instrument-sans",
      "--font-hanken-grotesk",
      "--font-jetbrains-mono",
      "--font-inter",
    ]) {
      expect(layout, v).toContain(`variable: "${v}"`);
    }
  });

  it("S3 the peso sign is in every font whose typeface has one", () => {
    let checked = 0;
    for (const p of fontPaths) {
      const family = p.split("/").at(-2)!;
      if (NO_PESO_IN_TYPEFACE.includes(family)) continue;
      const font = fontkit(readFileSync(p));
      expect(font.hasGlyphForCodePoint(0x20b1), `${p} has ₱`).toBe(true);
      expect(font.hasGlyphForCodePoint(0x00f1), `${p} has ñ`).toBe(true);
      checked++;
    }
    expect(checked, "vacuity guard: peso checked in 6 files").toBe(6);
  });

  it("S4 every loaded font is used; fallback-only fonts are not preloaded", () => {
    const vars = [...layout.matchAll(/variable: "(--font-[a-z-]+)"/g)].map((m) => m[1]);
    expect(vars.length, "vacuity guard").toBeGreaterThanOrEqual(7);
    for (const v of vars) {
      const readers = execSync(`git grep -l -e 'var(${v}' -- src ':!src/app/layout.tsx' ':!src/__tests__' || true`, {
        encoding: "utf8",
      }).trim();
      expect(readers, `${v} is read by some style`).not.toBe("");
    }
    for (const name of ["geistSans", "geistMono"]) {
      const block = layout.match(new RegExp(`const ${name} = localFont\\(\\{([\\s\\S]*?)\\}\\);`));
      expect(block, `${name} call`).not.toBeNull();
      expect(block![1], `${name} not preloaded`).toContain("preload: false");
    }
  });
});
