/**
 * PAY-145: opening leave balances by CSV (Mark chose A on 16 Nov 2026).
 *
 *   T1  a row is read in the leave type's own unit, up to four decimals,
 *       commas allowed; a bad row lists every problem (fails on main: no
 *       importer).
 *   T2  the template has the columns in order and one row per employee and
 *       leave type.
 *   T3  the leave balances tab offers the template and the import.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEAVE_BALANCE_CSV_COLUMNS, csvRowToLeaveBalance, leaveBalanceTemplate, parseBalance } from "@/lib/leave/balance-import";

describe("PAY-145 leave balance import", () => {
  it("T1 reads a row", () => {
    expect(csvRowToLeaveBalance({ employee_number: " E-1 ", leave_type_code: "vl", year: "2026", opening_balance: "7.5" }, 2026))
      .toEqual({ ok: true, input: { employeeNumber: "E-1", leaveTypeCode: "VL", year: 2026, openingBalance: "7.5" } });
    expect(parseBalance("1,234.2500")).toBe("1234.2500");
    expect(parseBalance("007")).toBe("7");
    expect(parseBalance("0")).toBe("0");
    expect(parseBalance("-1")).toBeNull();
    expect(parseBalance("1.23456")).toBeNull();
    expect(parseBalance("10000")).toBeNull();
    expect(parseBalance("abc")).toBeNull();
    const bad = csvRowToLeaveBalance({ employee_number: "", leave_type_code: "", year: "26", opening_balance: "x" }, 2026);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toHaveLength(4);
    expect(csvRowToLeaveBalance({ employee_number: "E", leave_type_code: "VL", year: "2028", opening_balance: "1" }, 2026).ok).toBe(false);
  });

  it("T2 the template", () => {
    expect(LEAVE_BALANCE_CSV_COLUMNS).toEqual(["employee_number", "leave_type_code", "year", "opening_balance"]);
    expect(leaveBalanceTemplate(2026, [{ employeeNumber: "E-1", leaveTypeCode: "VL", openingBalance: "5" }, { employeeNumber: "E-1", leaveTypeCode: "SL" }]))
      .toBe("employee_number,leave_type_code,year,opening_balance\nE-1,VL,2026,5\nE-1,SL,2026,0\n");
  });

  it("T3 the balances tab offers it", () => {
    const page = readFileSync("src/app/(dashboard)/leave/page.tsx", "utf8");
    expect(page).toContain('data-testid="leave-balance-template"');
    expect(page).toContain('data-testid="leave-balance-import"');
    expect(page).toContain("/api/leave-balances/import");
  });
});
