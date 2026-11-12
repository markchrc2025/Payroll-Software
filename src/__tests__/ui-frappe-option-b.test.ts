/**
 * Admin UI in the Frappe UI style, Option B (Mark, 12 Nov 2026): neutral greys,
 * Sentire orange as the accent only, Inter, compact controls. Design: Sentire
 * Designs, "Sentire Payroll Admin Frappe Style" (padmin-frappe.css).
 *
 *   F1  the admin layout switches the style on (.sx-frappe on its root).
 *   F2  the style is scoped to the admin: its tokens live under
 *       html:has(.sx-frappe), and :root keeps the warm tokens that ESS, sign-in,
 *       Central and the kiosk still use.
 *   F3  Inter is served from the repo (next/font/local, with its licence), so
 *       the new font adds no build-time download from Google (PAY-126).
 *   F4  admin-only code carries none of the retired neutral colours (the warm
 *       beige/brown and the blue-grey palettes) and no all-caps labels, so the
 *       old look cannot drift back in page by page.
 */
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("Frappe UI style, Option B", () => {
  it("F1 the admin layout renders the .sx-frappe container", () => {
    const layout = read("src/app/(dashboard)/layout.tsx");
    expect(layout).toMatch(/className="sx-frappe\b/);
  });

  it("F2 the tokens are scoped to the admin; :root keeps the warm tokens", () => {
    const css = read("src/app/globals.css");
    const scoped = css.match(/html:has\(\.sx-frappe\)\s*\{([^}]*)\}/);
    expect(scoped, "an html:has(.sx-frappe) token block").not.toBeNull();
    const block = scoped![1];
    // vacuity guard: the block really carries the neutral palette
    for (const t of ["--background: #FFFFFF", "--foreground: #171717", "--line: #E8E8E8", "--primary-foreground: #2A2420", "--font-sans: var(--font-inter)"]) {
      expect(block).toContain(t);
    }
    const root = css.match(/:root\s*\{([^}]*)\}/)![1];
    expect(root).toContain("--background:            #F6F2EC");
    expect(root).toContain("--sidebar:                    #2E241C");
    expect(root).not.toContain("--font-inter");
  });

  it("F3 Inter comes from the repo, with its licence", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('from "next/font/local"');
    expect(layout).toMatch(/variable: "--font-inter"/);
    expect(layout).not.toMatch(/\bInter\b[^"]*from "next\/font\/google"/);
    for (const f of ["inter-latin-wght-normal.woff2", "inter-latin-wght-italic.woff2", "OFL.txt"]) {
      expect(existsSync(`src/app/fonts/inter/${f}`), f).toBe(true);
    }
  });

  it("F4 admin-only code has no retired neutral colours and no all-caps labels", () => {
    const files = execSync(
      "git ls-files 'src/app/(dashboard)/**' src/components/attendance src/components/branches src/components/employees " +
        "src/components/holidays src/components/movements src/components/shifts src/components/sidebar-nav.tsx",
      { encoding: "utf8" },
    )
      .split("\n")
      .filter((f) => /\.(tsx?|css)$/.test(f));
    expect(files.length).toBeGreaterThan(50); // vacuity guard: the scan really covers the admin

    const RETIRED = [
      // warm beige and brown
      "ECE6DD", "2A2420", "9B9085", "6B6259", "F6F2EC", "F1ECE4", "DDD3C6", "8A7E6F", "CFC6BA",
      // blue-grey
      "E8EBF1", "4A586B", "6B7A8D", "111827", "8E9AAC", "F5F6FA", "F8F9FC", "9AA5B4", "0E1B2E",
    ];
    // #2A2420 survives on purpose only as the dark text on orange (Option B's on-accent colour)
    const ALLOWED_ON_ACCENT = /color: "#2A2420"/g;
    const hits: string[] = [];
    for (const f of files) {
      const src = read(f).replace(ALLOWED_ON_ACCENT, "");
      for (const hex of RETIRED) {
        if (new RegExp(`#${hex}(?![0-9A-Fa-f])`, "i").test(src)) hits.push(`${f}: #${hex}`);
      }
      if (/className=["{`][^"`]*\buppercase\b/.test(src)) hits.push(`${f}: uppercase label`);
    }
    expect(hits).toEqual([]);
  });
});
