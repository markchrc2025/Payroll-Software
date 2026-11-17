/**
 * PAY-161 (Mark, 17 Nov 2026 10:13): "Add in the Central Portal the BIR
 * Editor in Compliance because there's no BIR section here!"
 *
 *   B1  the publish check accepts the TRAIN table as stored and names every
 *       way a table cannot be applied: a missing pay frequency, a first
 *       bracket not at ₱0, floors not going up, fixed tax or rate going down,
 *       a rate over 100%, a blank cell.
 *   B2  Excel: one row per bracket (Frequency, From, Fixed tax, Rate) with
 *       headers, labels written any way, ₱, commas and % reads back to the
 *       same table; the download layout round-trips exactly; a sheet with no
 *       bracket rows is refused.
 *   B3  "In effect" follows the payroll: a version starting later is
 *       upcoming, an ended one is not in effect, and on a tie the first row
 *       (newest first, the payroll's order) wins.
 *   B4  the Compliance page has a BIR card that publishes through the BIR
 *       API, the API runs the same check on new BIR tables, and the page has
 *       no em dashes.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BIR_SHEET_HEADER,
  birTableFromRows,
  birTablePayload,
  birTableProblems,
  birTableToRows,
  type BirTableInput,
} from "@/lib/statutory/bir-table";
import { versionInEffect } from "@/lib/statutory/tables";
import { lookupBIR } from "@/lib/statutory/compute";
import { BirWithholdingPayload } from "@/lib/statutory/types";

/** The TRAIN 2023-onward table as stored on staging and production. */
const TRAIN = {
  frequencies: {
    DAILY: [
      { floor: 0, fixedTax: 0, plusRate: 0 },
      { floor: 68500, fixedTax: 0, plusRate: 0.15 },
      { floor: 109600, fixedTax: 6165, plusRate: 0.2 },
      { floor: 219200, fixedTax: 28085, plusRate: 0.25 },
      { floor: 547900, fixedTax: 110260, plusRate: 0.3 },
      { floor: 2191800, fixedTax: 603430, plusRate: 0.35 },
    ],
    WEEKLY: [
      { floor: 0, fixedTax: 0, plusRate: 0 },
      { floor: 480800, fixedTax: 0, plusRate: 0.15 },
      { floor: 769300, fixedTax: 43270, plusRate: 0.2 },
      { floor: 1538500, fixedTax: 197120, plusRate: 0.25 },
      { floor: 3846200, fixedTax: 774050, plusRate: 0.3 },
      { floor: 15384700, fixedTax: 4235600, plusRate: 0.35 },
    ],
    SEMI_MONTHLY: [
      { floor: 0, fixedTax: 0, plusRate: 0 },
      { floor: 1041700, fixedTax: 0, plusRate: 0.15 },
      { floor: 1666700, fixedTax: 93750, plusRate: 0.2 },
      { floor: 3333300, fixedTax: 427080, plusRate: 0.25 },
      { floor: 8333300, fixedTax: 1677080, plusRate: 0.3 },
      { floor: 33333300, fixedTax: 9177080, plusRate: 0.35 },
    ],
    MONTHLY: [
      { floor: 0, fixedTax: 0, plusRate: 0 },
      { floor: 2083300, fixedTax: 0, plusRate: 0.15 },
      { floor: 3333300, fixedTax: 187500, plusRate: 0.2 },
      { floor: 6666700, fixedTax: 854170, plusRate: 0.25 },
      { floor: 16666700, fixedTax: 3354170, plusRate: 0.3 },
      { floor: 66666700, fixedTax: 18354170, plusRate: 0.35 },
    ],
  },
} satisfies BirTableInput;

const clone = (): BirTableInput => JSON.parse(JSON.stringify(TRAIN));

describe("PAY-161 BIR withholding tax editor", () => {
  it("B1 the publish check accepts TRAIN and names every unusable table", () => {
    expect(birTableProblems(TRAIN)).toEqual([]);
    expect(BirWithholdingPayload.parse(birTablePayload(TRAIN))).toEqual(TRAIN);

    const missing = clone();
    delete missing.frequencies.WEEKLY;
    expect(birTableProblems(missing)).toEqual(["Weekly: add at least one bracket."]);

    const start = clone();
    start.frequencies.MONTHLY![0]!.floor = 100;
    expect(birTableProblems(start)).toContain("Monthly: the first bracket must start at ₱0.00.");

    const order = clone();
    order.frequencies.SEMI_MONTHLY![2]!.floor = 1000000; // below bracket 2's 10,417.00
    expect(birTableProblems(order)).toContain(
      'Semi-monthly, bracket 3: "From" ₱10,000.00 must be above bracket 2\'s ₱10,417.00.',
    );

    const fixed = clone();
    fixed.frequencies.DAILY![3]!.fixedTax = 1;
    expect(birTableProblems(fixed)).toContain("Daily, bracket 4: fixed tax is lower than bracket 3's.");

    const rate = clone();
    rate.frequencies.WEEKLY![5]!.plusRate = 1.5;
    expect(birTableProblems(rate)).toContain("Weekly, bracket 6: rate must be between 0% and 100%.");

    const down = clone();
    down.frequencies.MONTHLY![4]!.plusRate = 0.1;
    expect(birTableProblems(down)).toContain("Monthly, bracket 5: rate is lower than bracket 4's.");

    const blank = clone();
    blank.frequencies.MONTHLY![1]!.fixedTax = NaN;
    blank.frequencies.MONTHLY![1]!.plusRate = NaN;
    expect(birTableProblems(blank)).toEqual(
      expect.arrayContaining([
        "Monthly, bracket 2: fixed tax must be ₱0.00 or more.",
        "Monthly, bracket 2: rate must be between 0% and 100%.",
      ]),
    );
  });

  it("B2 Excel reads back to the same table, written any way", () => {
    const rows = birTableToRows(TRAIN);
    expect(rows[0]).toEqual([...BIR_SHEET_HEADER]);
    expect(rows).toHaveLength(1 + 24);
    expect(rows[8]).toEqual(["Weekly", 4808, 0, 15]);
    const back = birTableFromRows(rows);
    expect("table" in back && back.table).toEqual(TRAIN);

    // Labels and numbers as people type them, with a title row and blanks.
    const typed: unknown[][] = [
      ["BIR withholding tax table (TRAIN)", "", "", ""],
      ["Frequency", "From", "Fixed tax", "Rate"],
      ...birTableToRows(TRAIN)
        .slice(1)
        .map(([f, from, fixed, r], i) => [
          i % 3 === 0 ? String(f).toUpperCase().replace("-", "_") : i % 3 === 1 ? String(f).replace("-", " ") : f,
          `₱${Number(from).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
          Number(fixed).toLocaleString("en-PH", { minimumFractionDigits: 2 }),
          `${r}%`,
        ]),
      ["", "", "", ""],
    ];
    const parsed = birTableFromRows(typed);
    expect("table" in parsed && parsed.table).toEqual(TRAIN);

    // The engine gives the same tax on the read-back table.
    const payload = birTablePayload((parsed as { table: BirTableInput }).table);
    for (const pay of [0n, 1041699n, 1041700n, 2000000n, 3333299n, 50000000n]) {
      expect(lookupBIR(payload, "SEMI_MONTHLY", pay).tax).toBe(lookupBIR(TRAIN, "SEMI_MONTHLY", pay).tax);
    }
    expect(lookupBIR(payload, "SEMI_MONTHLY", 2000000n).tax).toBe(160410n); // 937.50 + 20% of 3,333.00

    expect(birTableFromRows([["Frequency", "From", "Fixed tax", "Rate"], ["", "", "", ""]])).toEqual({
      error: "No bracket rows found. Use the columns Frequency, From (₱), Fixed tax (₱), Rate (%), one row per bracket.",
    });
  });

  it("B3 in effect follows the payroll: upcoming and ended versions are not in effect", () => {
    const v = (id: string, from: string, to: string | null = null) => ({
      id,
      effectiveFrom: `${from}T00:00:00.000Z`,
      effectiveTo: to ? `${to}T00:00:00.000Z` : null,
    });
    const now = new Date("2026-11-17T02:00:00.000Z");
    const rows = [v("2027", "2027-01-01"), v("2023", "2023-01-01"), v("2018", "2018-01-01", "2023-01-01")];
    expect(versionInEffect(rows, now)?.id).toBe("2023");
    expect(versionInEffect(rows, new Date("2027-01-01T00:00:00.000Z"))?.id).toBe("2027");
    expect(versionInEffect(rows, new Date("2020-06-01T00:00:00.000Z"))?.id).toBe("2018");
    expect(versionInEffect(rows, new Date("2017-06-01T00:00:00.000Z"))).toBeUndefined();
    // A tie on the start date keeps the given order (PAY-163).
    expect(versionInEffect([v("a", "2026-01-01"), v("b", "2026-01-01")], now)?.id).toBe("a");
    expect(versionInEffect([v("b", "2026-01-01"), v("a", "2026-01-01")], now)?.id).toBe("b");
  });

  it("B4 the Compliance page has a BIR card; the API runs the same check", () => {
    const dir = "src/app/centralportal/(protected)/compliance";
    const page = readFileSync(`${dir}/page.tsx`, "utf8");
    const client = readFileSync(`${dir}/ComplianceClient.tsx`, "utf8");
    expect(page).toMatch(/const CATEGORIES = \[[^\]]*"BIR_WITHHOLDING_TABLE"[^\]]*\] as const;/);
    expect(client).toMatch(/<Card title="BIR withholding tax">/);
    expect(client).toMatch(/publish\("\/api\/admin\/statutory\/bir", m, birTablePayload\(input\)/);
    expect(client).toMatch(/const problems = birTableProblems\(input\);/);
    expect(client).toMatch(/disabled=\{saving \|\| problems\.length > 0\}/);
    expect(client).toMatch(/const currentOf = \(cat: string\) => versionInEffect\(historyOf\(cat\), now\);/);
    for (const f of [page, client]) expect(f).not.toMatch(/—/);

    const api = readFileSync("src/app/api/admin/statutory/_shared.ts", "utf8");
    expect(api).toMatch(
      /if \(category === "BIR_WITHHOLDING_TABLE"\) \{\s+const problems = birTableProblems\(parsed\.data\.payload as BirTableInput\);/,
    );
  });
});
