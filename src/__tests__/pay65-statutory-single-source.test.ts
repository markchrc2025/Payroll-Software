/**
 * PAY-65 (plan 1.10, R69, 12 Aug 2026): "Statutory payload single source of
 * truth (three hand-transcribed SSS tables, seed script not importable)."
 *
 *   T1  the baseline is importable without a database and every payload is a
 *       valid statutory payload (fails on main: no such module).
 *   T2  the SSS table says what the circular says, checked by hand on four
 *       rows: MSC 5,000.00, 15,000.00, 20,000.00 and 35,000.00.
 *   T3  the loader writes the baseline: it imports every payload from the
 *       module and defines none itself.
 *   T4  no other file builds its own SSS table. One copy is left, in
 *       engine.test.ts, which is protected and needs Mark's OK to change; it
 *       is checked here to be equal to the baseline, row for row.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DE_MINIMIS_2025, MIN_WAGE_2025, PAGIBIG_2024, PHIC_2025, SSS_2026, TRAIN_2023, buildSSS2026,
} from "@/lib/statutory/baseline-2026";
import { parseStatutoryPayload } from "@/lib/statutory/types";
import { SSS as FIXTURE_SSS } from "./fixtures/statutory-test-rules";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" || name === "generated" ? [] : files(p);
    return /\.(ts|tsx|mjs)$/.test(name) ? [p] : [];
  });

describe("PAY-65 one place for the statutory payloads", () => {
  it("T1 the baseline imports without a database and every payload is valid", () => {
    expect(() => parseStatutoryPayload("SSS_SCHEDULE", SSS_2026)).not.toThrow();
    expect(() => parseStatutoryPayload("PHILHEALTH_SCHEDULE", PHIC_2025)).not.toThrow();
    expect(() => parseStatutoryPayload("PAGIBIG_SCHEDULE", PAGIBIG_2024)).not.toThrow();
    expect(() => parseStatutoryPayload("BIR_WITHHOLDING_TABLE", TRAIN_2023)).not.toThrow();
    expect(() => parseStatutoryPayload("MINIMUM_WAGE_RATE", MIN_WAGE_2025)).not.toThrow();
    expect(() => parseStatutoryPayload("DE_MINIMIS_CEILING", DE_MINIMIS_2025)).not.toThrow();
    const source = readFileSync("src/lib/statutory/baseline-2026.ts", "utf8");
    expect(source).not.toMatch(/PrismaClient|from "pg"|process\.env/);
  });

  it("T2 the SSS table, four rows by hand", () => {
    expect(SSS_2026.rows).toHaveLength(61); // 5,000.00 to 35,000.00 in steps of 500.00
    const row = (msc: number) => SSS_2026.rows.find((r) => r.msc === msc)!;
    // MSC 5,000.00: employee 5% = 250.00; employer 10% = 500.00 + EC 10.00.
    expect(row(500_000)).toMatchObject({ compensationFrom: 0, compensationTo: 524_999, regularSSEmployee: 25_000, regularSSEmployer: 50_000, ecEmployer: 1_000, mpfEmployee: 0, totalEmployee: 25_000, totalEmployer: 51_000, totalTotal: 76_000 });
    // MSC 15,000.00: employee 750.00; employer 1,500.00 + EC 30.00 (MSC above 14,750.00).
    expect(row(1_500_000)).toMatchObject({ compensationFrom: 1_475_000, compensationTo: 1_524_999, regularSSEmployee: 75_000, regularSSEmployer: 150_000, ecEmployer: 3_000, totalEmployee: 75_000, totalEmployer: 153_000 });
    // MSC 20,000.00: the last row with no MPF. Employee 1,000.00; employer 2,000.00 + 30.00.
    expect(row(2_000_000)).toMatchObject({ regularSSEmployee: 100_000, regularSSEmployer: 200_000, mpfEmployee: 0, mpfEmployer: 0, totalEmployee: 100_000, totalEmployer: 203_000 });
    // MSC 35,000.00: regular on 20,000.00 (1,000.00 and 2,000.00), MPF on 15,000.00 (750.00 and 1,500.00).
    expect(row(3_500_000)).toMatchObject({ compensationFrom: 3_475_000, compensationTo: 99_999_999, regularSSEmployee: 100_000, mpfEmployee: 75_000, mpfEmployer: 150_000, totalEmployee: 175_000, totalEmployer: 353_000, totalTotal: 528_000 });
    // The test fixture is this same table, not a copy.
    expect(FIXTURE_SSS).toEqual(SSS_2026);
  });

  it("T3 the loader writes the baseline and defines no payload itself", () => {
    const loader = readFileSync("scripts/load-statutory-2026.ts", "utf8");
    expect(loader).toContain('from "../src/lib/statutory/baseline-2026"');
    for (const name of ["SSS_2026", "PHIC_2025", "PAGIBIG_2024", "TRAIN_2023", "DE_MINIMIS_2025", "MIN_WAGE_2025"]) {
      expect(loader, name).toMatch(new RegExp(`payload: ${name}\\b`));
      expect(loader, name).not.toMatch(new RegExp(`const ${name}\\b`));
    }
    expect(loader).not.toContain("function buildSSS2026");
  });

  it("T4 no other file builds its own SSS table", () => {
    // The mark of a hand-built SSS table: a loop over the salary credits.
    const loop = new RegExp(["for \\(let msc", " = "].join(""));
    const builders = [...files("src"), ...files("scripts")].filter((p) => loop.test(readFileSync(p, "utf8")));
    expect(builders.sort()).toEqual(["src/lib/payroll/__tests__/engine.test.ts", "src/lib/statutory/baseline-2026.ts"]);
    // The protected copy is run as written and compared with the baseline.
    const engineTest = readFileSync("src/lib/payroll/__tests__/engine.test.ts", "utf8");
    const start = engineTest.indexOf("function buildSSSTable(): SssSchedulePayload {");
    const end = engineTest.indexOf("\n}\n", start) + 2;
    const body = engineTest.slice(start, end).replace("function buildSSSTable(): SssSchedulePayload {", "function buildSSSTable() {").replace(/: SssSchedulePayload\["rows"\]/g, "");
    const copy = new Function(`${body}; return buildSSSTable();`)() as { rows: unknown[] };
    expect(copy).toEqual(buildSSS2026());
  });
});
