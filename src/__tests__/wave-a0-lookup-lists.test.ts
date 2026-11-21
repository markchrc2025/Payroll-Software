/**
 * Wave A (Soon plan, approved 21 Nov 2026): the lists each company keeps.
 *
 *   T1  eleven lists; the bank list has e-wallets as their own kind
 *       (decision 4); ethnicity and religion are marked sensitive and start
 *       empty (decision 5) (fails on main: no lists).
 *   T2  the built-in items follow the enums they replace: document
 *       categories, incident types, expense types' tax treatments.
 *   T3  a list's fields are checked: money in whole centavos, select values
 *       from the list, unknown fields dropped.
 *   T4  the sidebar's eleven "Soon" entries now open their lists.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DocumentCategory, ExpenseTaxTreatment, IncidentType } from "@prisma/client";
import { attributesSchema, LIST_KEYS, LISTS } from "@/lib/lookups/registry";

describe("Wave A lists", () => {
  it("T1 the lists", () => {
    expect(LIST_KEYS.sort()).toEqual(["BANK", "COURSE", "DOCUMENT_CATEGORY", "ETHNICITY", "EXPENSE_CATEGORY", "EXPENSE_TYPE", "INCIDENT_CATEGORY", "INCIDENT_DECISION", "INCIDENT_TYPE", "RELIGION", "TRAINER"]);
    const wallets = LISTS.BANK!.defaults.filter((d) => d.attributes?.kind === "EWALLET").map((d) => d.code);
    expect(wallets).toEqual(["GCASH", "MAYA"]);
    for (const k of ["ETHNICITY", "RELIGION"]) { expect(LISTS[k]!.sensitive).toBe(true); expect(LISTS[k]!.defaults).toEqual([]); }
  });

  it("T2 built-in items follow the enums", () => {
    expect(LISTS.DOCUMENT_CATEGORY!.defaults.map((d) => d.code).sort()).toEqual(Object.values(DocumentCategory).sort());
    expect(LISTS.INCIDENT_TYPE!.defaults.map((d) => d.code).sort()).toEqual(Object.values(IncidentType).sort());
    for (const d of LISTS.EXPENSE_TYPE!.defaults) expect(Object.values(ExpenseTaxTreatment)).toContain(d.attributes!.taxTreatment);
    expect(LISTS.DOCUMENT_CATEGORY!.defaults.every((d) => d.isSystem)).toBe(true);
  });

  it("T3 fields are checked", () => {
    const ec = attributesSchema(LISTS.EXPENSE_CATEGORY!);
    expect(ec.parse({ limitPerClaimCents: "500000", receiptRequired: true, extra: 1 })).toEqual({ limitPerClaimCents: "500000", receiptRequired: true });
    expect(ec.safeParse({ limitPerClaimCents: "50.00" }).success).toBe(false);
    expect(attributesSchema(LISTS.BANK!).safeParse({ kind: "CRYPTO" }).success).toBe(false);
  });

  it("T4 the sidebar opens the lists", () => {
    const nav = readFileSync("src/components/sidebar-nav.tsx", "utf8");
    for (const k of LIST_KEYS) expect(nav).toContain(`href: "/settings/lists/${k}"`);
    for (const slug of ["bank", "course", "trainer", "ethnicity", "religion", "document-category", "expense-category", "expense-type", "incident-category", "incident-type", "incident-decision"]) {
      expect(nav).not.toContain(`#soon-${slug}"`);
    }
    // 21 after Wave A0; Wave B (PAY-212) opened Education, Experience,
    // Training and Legal Documents (17); Wave C (PAY-213) opened Expense
    // Review and Leave Review (15), then Document Management and Review (13);
    // Wave D (PAY-214) opened the four reports (9); Wave E1 (PAY-215) the
    // Earning Policy (8); Wave E3 the Planner and Schedule (6); Wave F1
    // (PAY-216) Field Check-In (5).
    expect((nav.match(/comingSoon: true/g) ?? []).length).toBe(5);
  });
});
