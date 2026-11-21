/**
 * PAY-197 part 3: the final pay forms.
 *
 *   T1  the certificate of employment says who, position and dates (fails on
 *       main: no forms).
 *   T2  the quitclaim names the final pay received, with its payslip number,
 *       and is refused before final pay is finalized.
 */
import { describe, expect, it } from "vitest";
import { coeText, FormNotReadyError, quitclaimText, type FormFacts } from "@/lib/offboarding/forms";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const FACTS: FormFacts = {
  company: { name: "Tala Trading Inc.", address: "12 Shoe Avenue, Marikina City" },
  employee: { name: "Ana R. Santos", number: "E-1", position: "Accounting Clerk" },
  hireDate: d("2023-06-15"), lastWorkingDay: d("2026-11-14"),
  finalPay: { netCents: 3456789n, controlNumber: "PS-2026-000123", finalizedAt: d("2026-11-20") },
  issuedAt: d("2026-11-21"),
};

describe("PAY-197 final pay forms", () => {
  it("T1 certificate of employment", () => {
    expect(coeText(FACTS)[0]).toBe("This is to certify that Ana R. Santos was employed by Tala Trading Inc. as Accounting Clerk from June 15, 2023 to November 14, 2026.");
    expect(coeText(FACTS)[2]).toBe("Issued on November 21, 2026.");
  });
  it("T2 quitclaim and release", () => {
    expect(quitclaimText(FACTS)[0]).toContain("received the amount of ₱34,567.89 as my final pay (payslip PS-2026-000123)");
    expect(() => quitclaimText({ ...FACTS, finalPay: null })).toThrow(FormNotReadyError);
  });
});
