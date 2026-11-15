/**
 * PAY-126: no font is fetched from Google at build time. Every font comes from
 * src/app/fonts (next/font/local) with its licence beside it, so `next build`
 * needs no network for fonts and a font CDN hiccup cannot fail a deploy.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : sources(p);
    return /\.(tsx?|css)$/.test(name) ? [p] : [];
  });
}

describe("PAY-126 fonts are served from the repo", () => {
  it("nothing imports next/font/google", () => {
    const offenders = sources("src").filter((f) => readFileSync(f, "utf8").includes("next/font/google"));
    expect(offenders).toEqual([]);
  });

  it("every local font file named in the layout exists, with its licence", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const files = [...layout.matchAll(/"\.\/(fonts\/[^"]+\.woff2)"/g)].map((m) => m[1]);
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const f of files) {
      expect(existsSync(join("src/app", f)), f).toBe(true);
      expect(existsSync(join("src/app", f.split("/").slice(0, 2).join("/"), "OFL.txt")), f).toBe(true);
    }
  });

  it("keeps the CSS variables the styles use", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    for (const v of ["--font-geist-sans", "--font-geist-mono", "--font-plus-jakarta-sans", "--font-instrument-sans", "--font-hanken-grotesk", "--font-jetbrains-mono", "--font-inter"]) {
      expect(layout).toContain(`variable: "${v}"`);
    }
  });
});
