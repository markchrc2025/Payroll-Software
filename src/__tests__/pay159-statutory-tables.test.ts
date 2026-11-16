/**
 * PAY-159 (Mark, 16 Nov 2026 23:22): "Since we're already done with SSS
 * Philhealth and Pagibig statutory rates. Why didn't you build the 'Statutory
 * Contribution' and 'Statutory Table' under Payroll in the sidebar??!?!"
 *
 * The Statutory Table page shows the company the tables its payroll uses,
 * read-only.
 *
 *   S1  every version is labelled: the one the resolver picked is in force; a
 *       later one is upcoming; an ended one is earlier; one that covers the
 *       date but lost to the company's own rate is "not used". Newest first,
 *       the company's own rate first on a tie; the last day in force is the
 *       day before the exclusive end date.
 *   S2  the BIR ranges shown are the ones the engine applies: every range's
 *       first and last centavo fall in that bracket under lookupBIR, and the
 *       tax at the start of a range is its fixed tax.
 *   S3  the Pag-IBIG ranges shown are the ones the engine applies: at both
 *       ends of a range computePagibig uses that range's rates.
 *   S4  the sidebar's Statutory Table is a real link to the page (no longer
 *       "Soon"), and the page and its API only read.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computePagibig, lookupBIR } from "@/lib/statutory/compute";
import {
  birRanges,
  lastDayInForce,
  pagibigRanges,
  tableVersions,
  versionStatus,
} from "@/lib/statutory/tables";
import type { BirWithholdingPayload, PagibigSchedulePayload } from "@/lib/statutory/types";
import { BIR, PAGIBIG } from "./fixtures/statutory-test-rules";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const rule = (id: string, tenantId: string | null, from: string, to: string | null) => ({
  id,
  tenantId,
  effectiveFrom: d(from),
  effectiveTo: to ? d(to) : null,
  legalBasis: `basis ${id}`,
  version: `v-${id}`,
  payload: { id },
});

/** A six-bracket monthly table (shapes only, not the legal rates). */
const SIX: BirWithholdingPayload["frequencies"]["MONTHLY"] = [
  { floor: 0, fixedTax: 0, plusRate: 0 },
  { floor: 2_083_300, fixedTax: 0, plusRate: 0.15 },
  { floor: 3_333_300, fixedTax: 187_500, plusRate: 0.2 },
  { floor: 6_666_700, fixedTax: 854_180, plusRate: 0.25 },
  { floor: 16_666_700, fixedTax: 3_354_180, plusRate: 0.3 },
  { floor: 66_666_700, fixedTax: 18_354_180, plusRate: 0.35 },
];

describe("PAY-159 statutory tables", () => {
  it("S1 every version is labelled, newest first, the company's own rate first on a tie", () => {
    const asOf = d("2026-11-17");
    const rules = [
      rule("g2025", null, "2025-01-01", "2026-01-01"),
      rule("g2026", null, "2026-01-01", null),
      rule("own", "t1", "2026-06-01", null),
      rule("g2027", null, "2027-01-01", null),
      rule("ownJan", "t1", "2026-01-01", "2026-06-01"),
    ];
    const v = tableVersions(rules, "own", asOf);
    expect(v.map((x) => [x.id, x.status, x.companyRate])).toEqual([
      ["g2027", "UPCOMING", false],
      ["own", "IN_FORCE", true],
      ["ownJan", "EARLIER", true],
      ["g2026", "REPLACED", false],
      ["g2025", "EARLIER", false],
    ]);
    expect(v.find((x) => x.id === "g2025")).toMatchObject({ effectiveFrom: "2025-01-01", lastDay: "2025-12-31" });
    expect(v.find((x) => x.id === "own")).toMatchObject({ lastDay: null, legalBasis: "basis own", version: "v-own" });
    expect(v.find((x) => x.id === "own")!.payload).toEqual({ id: "own" });

    // Nothing in force (no rule covers the date): nothing is labelled in force.
    expect(versionStatus(rule("x", null, "2026-01-01", null), null, d("2025-06-01"))).toBe("UPCOMING");
    expect(tableVersions(rules, null, d("2024-01-01")).some((x) => x.status === "IN_FORCE")).toBe(false);
    // The exclusive end date: a rule ending 2026-01-01 is earlier on 1 Jan, not on 31 Dec.
    expect(versionStatus(rules[0]!, null, d("2026-01-01"))).toBe("EARLIER");
    expect(versionStatus(rules[0]!, null, d("2025-12-31"))).toBe("REPLACED");
    expect(lastDayInForce(d("2024-03-01"))).toBe("2024-02-29");
  });

  it("S2 the BIR ranges are the brackets lookupBIR applies", () => {
    const tables: Array<[string, BirWithholdingPayload["frequencies"]["MONTHLY"]]> = [
      ["six-bracket monthly", SIX],
      ...Object.entries(BIR.frequencies).map(([k, t]) => [`fixture ${k}`, t!] as [string, typeof SIX]),
    ];
    let checked = 0;
    for (const [name, brackets] of tables) {
      const payload = { frequencies: { SEMI_MONTHLY: brackets, MONTHLY: brackets } } as BirWithholdingPayload;
      const ranges = birRanges(brackets);
      expect(ranges, name).toHaveLength(brackets.length);
      expect(ranges[0]!.from, name).toBe(0);
      expect(ranges.at(-1)!.to, name).toBeNull();
      for (const r of ranges) {
        const atStart = lookupBIR(payload, "MONTHLY", BigInt(r.from));
        expect(atStart.bracket.floor, `${name} from ${r.from}`).toBe(BigInt(r.from));
        expect(atStart.tax, `${name} tax at ${r.from}`).toBe(BigInt(r.fixedTax));
        expect(atStart.bracket.plusRate).toBe(r.plusRate);
        const end = r.to ?? r.from + 10_000_000;
        expect(lookupBIR(payload, "MONTHLY", BigInt(end)).bracket.floor, `${name} to ${end}`).toBe(BigInt(r.from));
        if (r.to !== null) {
          expect(lookupBIR(payload, "MONTHLY", BigInt(r.to + 1)).bracket.floor).toBe(BigInt(r.to + 1));
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(12); // vacuity guard
  });

  it("S3 the Pag-IBIG ranges are the brackets computePagibig applies", () => {
    const three: PagibigSchedulePayload = {
      mfsCap: 1_000_000,
      brackets: [
        { upTo: 100_000, eeRate: 0.005, erRate: 0.01 },
        { upTo: 150_000, eeRate: 0.01, erRate: 0.02 },
        { upTo: null, eeRate: 0.02, erRate: 0.02 },
      ],
    };
    let checked = 0;
    for (const p of [PAGIBIG, three]) {
      const ranges = pagibigRanges(p);
      expect(ranges[0]!.from).toBe(0);
      expect(ranges.at(-1)!.to).toBeNull();
      for (const r of ranges) {
        for (const pay of [r.from, r.to ?? r.from + 5_000_000]) {
          const c = computePagibig(p, BigInt(pay));
          const mfs = Math.min(pay, p.mfsCap);
          expect(c.employee, `EE at ${pay}`).toBe(BigInt(Math.round(mfs * r.eeRate)));
          expect(c.employer, `ER at ${pay}`).toBe(BigInt(Math.round(mfs * r.erRate)));
          checked++;
        }
      }
    }
    expect(checked).toBe(10);
    expect(pagibigRanges(PAGIBIG).map((r) => [r.from, r.to])).toEqual([
      [0, 150_000],
      [150_001, null],
    ]);
  });

  it("S4 the sidebar links to the page, and the page and API only read", () => {
    const nav = readFileSync("src/components/sidebar-nav.tsx", "utf8");
    expect(nav).toMatch(/\{ href: "\/payroll\/statutory-tables", label: "Statutory Table", icon: "payrules" \}/);
    expect(nav).not.toMatch(/soon-statutory-table/);

    const PAGE = "src/app/(dashboard)/payroll/statutory-tables/page.tsx";
    const ROUTE = "src/app/api/payroll/statutory-tables/route.ts";
    expect(existsSync(PAGE)).toBe(true);
    const page = readFileSync(PAGE, "utf8");
    expect(page).toMatch(/fetch\(`\/api\/payroll\/statutory-tables\?asOf=\$\{asOf\}`\)/);
    expect(page).not.toMatch(/method:\s*"(POST|PUT|PATCH|DELETE)"/);
    const route = readFileSync(ROUTE, "utf8");
    expect(route.match(/export async function (\w+)/g)).toEqual(["export async function GET"]);
    expect(route).toMatch(/forbidUnless\(auth, \["PAYROLL", "READ"\]\)/);
    // In force means what the payroll engine resolves, not a second rule.
    expect(route).toMatch(/getActiveRule\(tx, auth\.tenantId, t\.category, asOf\)/);
  });
});
