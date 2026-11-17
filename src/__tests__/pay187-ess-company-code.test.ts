/**
 * PAY-187 (ESS sandbox test, 18 Nov 2026): the ESS login filled the company
 * code with the first label of the address: "PAYROLL" on production
 * (payroll.sentire.solutions), "PAYROLLSTAGING" on staging, "127" locally.
 *
 *   C1  (T1) the app's own address, an IP or localhost fill in nothing.
 *   C2  a tenant's sub-host of the app fills in its code.
 *   C3  the login page uses this rule.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { companyCodeFromHost } from "@/lib/ess/company-code-from-host";

const PROD = "https://payroll.sentire.solutions";
const STAGING = "https://payroll-staging.apps.sentire.solutions";

describe("PAY-187 company code from the address", () => {
  it("C1 (T1) the app's own address, an IP or localhost fill in nothing", () => {
    expect(companyCodeFromHost("payroll.sentire.solutions", PROD)).toBeNull();
    expect(companyCodeFromHost("payroll-staging.apps.sentire.solutions", STAGING)).toBeNull();
    expect(companyCodeFromHost("127.0.0.1", "http://127.0.0.1:3100")).toBeNull();
    expect(companyCodeFromHost("localhost", "http://localhost:3000")).toBeNull();
    expect(companyCodeFromHost("other.example.com", PROD)).toBeNull();
    expect(companyCodeFromHost("payroll.sentire.solutions", undefined)).toBeNull();
  });
  it("C2 a tenant's sub-host of the app fills in its code", () => {
    expect(companyCodeFromHost("acme.payroll.sentire.solutions", PROD)).toBe("ACME");
    expect(companyCodeFromHost("sentire-qa.payroll.sentire.solutions", PROD)).toBe("SENTIREQA");
    expect(companyCodeFromHost("a.b.payroll.sentire.solutions", PROD)).toBeNull();
  });
  it("C3 the login page uses the rule, not the first label of any address", () => {
    const page = readFileSync("src/app/(ess)/ess/login/page.tsx", "utf8");
    expect(page).toMatch(/companyCodeFromHost\(window\.location\.hostname, process\.env\.NEXT_PUBLIC_APP_URL\)/);
    expect(page).not.toMatch(/hostname\.split\("\."\)/);
  });
});
