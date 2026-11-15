/**
 * Payroll run page, reported by Mark on staging (15 Nov 2026):
 *
 *   - Clicking "Bank File" on a finalized run blanked the page ("This page
 *     couldn't load"). Base UI throws when a menu label (Menu.GroupLabel) is
 *     rendered outside a Menu.Group, and the Bank File menu had its label
 *     loose. The user menu already wrapped its label correctly.
 *   - There was no way for an admin to see a payslip: the rendered payslip
 *     only existed in the employee's ESS portal.
 *   - Employee sheets showed a cut database id instead of the employee.
 *
 *   B1  every dropdown label in the app sits inside a dropdown group, so no
 *       menu can crash its page this way again.
 *   B2  the run page offers a Payslip action only on finalized runs, loads
 *       the admin payslip endpoint and renders the same body as ESS.
 *   B3  the admin and ESS payslip endpoints both add YTD, tardiness and leave
 *       through the shared loader, so the two views show the same figures.
 *   B4  the run endpoint returns each sheet's employee name and number, and
 *       the page shows them.
 *
 * Checked in a real browser against a local staging build (headless Chrome):
 * Bank File opens with the six banks and no page error; the Payslip dialog
 * shows the employee's payslip with ₱ drawn by the Inter web font; the New
 * Movement picker lists the five QA employees.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(f, "utf8");

describe("payroll run page: bank file, payslips, names", () => {
  it("B1 every DropdownMenuLabel is inside a DropdownMenuGroup", () => {
    const files = execSync("git ls-files 'src/**/*.tsx'", { encoding: "utf8" })
      .split("\n")
      .filter((f) => f && !f.startsWith("src/components/ui/"));
    let labels = 0;
    const loose: string[] = [];
    for (const f of files) {
      const src = read(f);
      const re = /<(\/?)DropdownMenu(Group|Label)\b[^>]*?(\/?)>/g;
      let depth = 0;
      for (const m of src.matchAll(re)) {
        const [, closing, kind, selfClosing] = m;
        if (kind === "Group") {
          if (closing) depth--;
          else if (!selfClosing) depth++;
        } else if (!closing) {
          labels++;
          if (depth <= 0) loose.push(`${f}:${src.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    expect(labels).toBeGreaterThanOrEqual(2); // vacuity guard: user menu + bank file menu
    expect(loose).toEqual([]);
  });

  it("B2 finalized runs offer each employee's payslip, rendered like ESS", () => {
    const page = read("src/app/(dashboard)/payroll/[id]/page.tsx");
    expect(page).toMatch(/\{isFinalized && \(\s*<TableCell[\s\S]*?setPayslipFor\(s\.employeeId\)/);
    expect(page).toMatch(/fetch\(`\/api\/payroll\/runs\/\$\{id\}\/payslips\/\$\{payslipFor\}`\)/);
    expect(page).toMatch(/<PayslipDetailBody detail=\{payslip\}/);
    const ess = read("src/app/(ess)/ess/payslips/page.tsx");
    expect(ess).toMatch(/<PayslipDetailBody detail=\{detail\}/);
  });

  it("B3 both payslip endpoints add YTD, tardiness and leave through one loader", () => {
    for (const f of [
      "src/app/api/payroll/runs/[id]/payslips/[employeeId]/route.ts",
      "src/app/api/ess/payslips/[bookId]/route.ts",
    ]) {
      const src = read(f);
      expect(src).toMatch(/loadPayslipExtras\(tx, \{/);
      expect(src).toMatch(/return ok\(\{ \.\.\.payslip, \.\.\.extras \}\)/);
    }
  });

  it("B4 sheets carry the employee's name and number to the page", () => {
    const route = read("src/app/api/payroll/runs/[id]/route.ts");
    expect(route).toMatch(/employeeName: p \? `\$\{p\.firstName\} \$\{p\.lastName\}` : null/);
    expect(route).toMatch(/employeeNumber: p\?\.employeeNumber \?\? null/);
    const page = read("src/app/(dashboard)/payroll/[id]/page.tsx");
    expect(page).toMatch(/\{s\.employeeName \?\? s\.employeeId\.substring\(0, 12\)\}/);
  });
});
