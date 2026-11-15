/**
 * PAY-127: the npm audit of the runtime tree (5 critical, 19 high on 682d832)
 * is down to one low advisory. Two of the fixes are easy to undo by accident:
 *
 *   D1  xlsx comes from vendor/xlsx-0.20.3.tgz, SheetJS's own build. The npm
 *       registry copy stopped at 0.18.5, which has a prototype-pollution and a
 *       ReDoS advisory with no fix there. Vendored, not installed from
 *       cdn.sheetjs.com, so a build needs no extra download (see PAY-126).
 *   D2  the compliance page's parse path still works on 0.20.3: a workbook
 *       written and read back the way ComplianceClient.tsx reads uploads.
 *   D3  shadcn (a CLI; its tree carried most of the highs) is a devDependency.
 *       Builds still install it: globals.css imports shadcn/tailwind.css.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

describe("PAY-127 dependency fixes stay in place", () => {
  it("D1 xlsx is the vendored SheetJS 0.20.3 build", () => {
    expect(pkg.dependencies.xlsx).toBe("file:vendor/xlsx-0.20.3.tgz");
    expect(existsSync("vendor/xlsx-0.20.3.tgz")).toBe(true);
    expect(XLSX.version).toBe("0.20.3");
  });

  it("D2 an uploaded workbook parses as the compliance page reads it", () => {
    const rows = [
      ["Range From", "Range To", "Employee Share"],
      ["0.00", "5249.99", "250.00"],
      ["₱5,250.00", "5749.99", "275.00"],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "SSS");
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const read = XLSX.read(buffer, { type: "array" });
    const ws = read.Sheets[read.SheetNames[0]];
    const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    expect(raw).toEqual(rows);
  });

  it("D3 shadcn is a devDependency, not a runtime one", () => {
    expect(pkg.dependencies.shadcn).toBeUndefined();
    expect(pkg.devDependencies.shadcn).toBeDefined();
    expect(readFileSync("src/app/globals.css", "utf8")).toContain('@import "shadcn/tailwind.css"');
  });
});
