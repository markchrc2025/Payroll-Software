/**
 * PAY-191 (Mark, 18 Nov 2026): after the ESS functions pass, apply the Frappe
 * HR mobile UI patterns to Sentire ESS: a quick-links list, the employee's
 * requests as status cards that open a bottom sheet, and one bottom menu on
 * every screen. Built from the pattern, not Frappe's (GPL-3) code.
 *
 *   R1  (T1) leave, overtime, undertime and expense claims become one list,
 *       newest first, with the right title, line and status.
 *   R2  the home screen shows Quick links (only forms that work) and the
 *       Requests panel; the old tiles that led to "Available soon" are gone.
 *   R3  the standalone pages use the app's five places (Home, Pay, Leave,
 *       Time, Profile) and the app opens the tab it is sent to.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { statusLabel, toRequestItems } from "@/components/ess/requests";

describe("PAY-191 ESS requests and navigation", () => {
  it("R1 (T1) every request type becomes a card, newest first", () => {
    const items = toRequestItems(
      [{ id: "l1", leaveTypeId: "t", type: "USAGE", amount: 1, startDate: "2026-11-20T00:00:00.000Z", endDate: "2026-11-20T00:00:00.000Z", reason: "Errand", approvalStatus: "PENDING", createdAt: "2026-11-18T01:00:00.000Z", leaveType: { name: "Service Incentive Leave", code: "SIL", unit: "DAYS" } },
       { id: "l0", leaveTypeId: "t", type: "ACCRUAL", amount: 1, startDate: null, endDate: null, reason: null, approvalStatus: "APPROVED", createdAt: "2026-11-18T05:00:00.000Z", leaveType: { name: "SIL", code: "SIL", unit: "DAYS" } }],
      [{ id: "o1", date: "2026-11-17T00:00:00.000Z", hours: "2.00", justification: "Month-end", status: "APPROVED", rejectionReason: null, createdAt: "2026-11-18T03:00:00.000Z" }],
      [{ id: "u1", date: "2026-11-17T00:00:00.000Z", undertimeMinutes: 60, reason: "Doctor", status: "REJECTED", rejectionReason: "No slip", createdAt: "2026-11-18T00:30:00.000Z" }],
      [{ id: "c1", claimDate: "2026-11-17T00:00:00.000Z", category: "TRANSPORTATION", description: "Grab", amountCents: "35000", status: "SUBMITTED", createdAt: "2026-11-18T02:00:00.000Z" }],
    );
    expect(items.map((i) => [i.title, i.sub, i.status])).toEqual([
      ["Overtime", "Nov 17, 2026 · 2h", "Approved"],
      ["Expense: Transportation", "Nov 17, 2026 · ₱350.00", "Pending"],
      ["Service Incentive Leave", "Nov 20, 2026 · 1d", "Pending"],
      ["Undertime", "Nov 17, 2026 · 60 min", "Rejected"],
    ]);
    expect(items[3].fields).toContainEqual(["Why rejected", "No slip"]);
    expect(statusLabel("PAID")).toBe("Paid");
  });

  it("R2 the home screen has Quick links and Requests; no dead-end tiles", () => {
    const src = readFileSync("src/components/ess/screens.tsx", "utf8");
    const home = src.slice(src.indexOf("export function HomeScreen"), src.indexOf("// ============================ PAY"));
    expect(home).toMatch(/<QuickLinks/);
    expect(home).toMatch(/<RequestsPanel \/>/);
    expect(home).not.toMatch(/nav\.go\("request", "reimb"\)|nav\.go\("request", "coe"\)/);
    for (const label of ["Request leave", "File overtime", "File undertime", "Claim an expense", "My DTR", "View payslips"])
      expect(home).toContain(label);
  });

  it("R3 one menu: the standalone pages link to the app's five places", () => {
    const layout = readFileSync("src/app/(ess)/layout.tsx", "utf8");
    for (const href of ['"/ess"', '"/ess?tab=pay"', '"/ess?tab=leave"', '"/ess?tab=time"', '"/ess?tab=profile"'])
      expect(layout).toContain(`href: ${href}`);
    expect(layout).not.toMatch(/label: "My DTR"|label: "Payslips"/);
    expect(readFileSync("src/components/ess/EssApp.tsx", "utf8")).toMatch(/get\("tab"\)/);
  });
});
