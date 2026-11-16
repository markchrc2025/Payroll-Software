/**
 * PAY-158 (Mark, 16 Nov 2026 23:22): "before I can see the preview of a line
 * item, I need to click the 'eye' button instead of just clicking the item
 * itself". On the payroll runs list only the eye button opened a run.
 *
 *   R1  a click anywhere on a run's row opens that run, and the row shows the
 *       pointer.
 *   R2  the pay period is a real link to the run, so Tab plus Enter, a middle
 *       click and "open in new tab" all work.
 *   R3  Ctrl or Cmd click and a middle click on the row open the run in a new
 *       tab; a click on a link or button inside the row, or the end of a text
 *       selection, does not navigate a second time.
 *   R4  the eye-only button is gone, and the loading and empty rows span the
 *       same number of columns as the header.
 *
 * The app has no DOM test runner, so these read the page source, like the
 * other page tests. Checked in a real browser on staging.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PAGE = "src/app/(dashboard)/payroll/page.tsx";
const src = readFileSync(PAGE, "utf8");

/** The JSX of the row rendered for each run in the runs table. */
function runRow(): string {
  const keyed = src.indexOf("key={run.id}");
  expect(keyed).toBeGreaterThan(0);
  const open = src.lastIndexOf("<TableRow", keyed);
  const close = src.indexOf("</TableRow>", keyed);
  expect(open).toBeGreaterThan(0);
  expect(close).toBeGreaterThan(keyed);
  return src.slice(open, close);
}

/** The body of the row click handler. */
function handler(): string {
  const m = src.match(/function openRun\([\s\S]*?\n {2}\}\n/);
  expect(m, "openRun handler").not.toBeNull();
  return m![0];
}

describe("PAY-158 payroll runs list: the row opens the run", () => {
  it("R1 a click anywhere on the row opens the run, with the pointer", () => {
    const row = runRow();
    expect(row).toMatch(/onClick=\{\(e\) => openRun\(e, run\.id\)\}/);
    expect(row).toMatch(/className="[^"]*\bcursor-pointer\b/);
    expect(handler()).toMatch(/router\.push\(href\)/);
    expect(src).toMatch(/import \{ useRouter \} from "next\/navigation";/);
  });

  it("R2 the pay period is a real link to the run", () => {
    const row = runRow();
    expect(row).toMatch(
      /<Link\s+href=\{`\/payroll\/\$\{run\.id\}`\}[^>]*>\s*\{formatPeriod\(run\.periodStart, run\.periodEnd\)\}\s*<\/Link>/,
    );
    // Keyboard users can see where they are.
    expect(row).toMatch(/<Link[^>]*focus-visible:/);
  });

  it("R3 new-tab clicks open a new tab; inner links, buttons and text selection are left alone", () => {
    const h = handler();
    expect(h).toMatch(/closest\("a, button"\)\) return;/);
    expect(h).toMatch(/getSelection\(\)\?\.toString\(\)\) return;/);
    expect(h).toMatch(/e\.metaKey \|\| e\.ctrlKey \|\| e\.button === 1/);
    expect(h).toMatch(/window\.open\(href, "_blank", "noopener"\)/);
    expect(runRow()).toMatch(/onAuxClick=\{\(e\) => openRun\(e, run\.id\)\}/);
  });

  it("R4 the eye-only button is gone and every row spans the header's columns", () => {
    expect(src).not.toMatch(/<Eye\b/);
    expect(src).not.toMatch(/\bEye,/);
    const header = src.slice(src.indexOf("<TableHeader>"), src.indexOf("</TableHeader>"));
    const columns = (header.match(/<TableHead\b/g) ?? []).length;
    expect(columns).toBe(6);
    expect(src).toMatch(new RegExp(`Array\\.from\\(\\{ length: ${columns} \\}\\)\\.map\\(\\(_, j\\)`));
    expect(src).toMatch(new RegExp(`colSpan=\\{${columns}\\}`));
  });
});
