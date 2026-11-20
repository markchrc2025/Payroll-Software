/**
 * PAY-194 (Mark, 20 Nov 2026, ruling A): a salary held under the strict DTR
 * policy is released in the next regular run, once the held cutoff's DTR is
 * approved.
 *
 * Company: strict DTR policy, contributions on the first cutoff. Ella and
 * Finn: monthly 25,000.00, semi-monthly, Mon-Fri, time clock needed.
 * 1-15 Nov: one of each one's days is still pending, so both are held out of
 * that run, which is finalized. Ella's day is approved afterwards; Finn's
 * stays pending.
 *
 * Hand figures for Ella (centavos):
 *   held 1-15 Nov (first cutoff): gross 1,250,000; SSS 125,000; PhilHealth
 *     62,500; Pag-IBIG 20,000; taxable 1,042,500, tax (1,042,500 - 1,041,700)
 *     x 15% = 120; net 1,042,380
 *   own 16-30 Nov (second cutoff): gross 1,250,000; no contributions; tax
 *     (1,250,000 - 1,041,700) x 15% = 31,245; net 1,218,755
 *   16-30 Nov sheet: gross 2,500,000; SSS 125,000; tax 31,365; net 2,261,135
 *
 *   H1  (T1) the next regular run releases Ella's held cutoff: its figures are
 *       added and recorded on her sheet (computed as it would have been).
 *   H2  Finn's held cutoff is not released while its DTR is still pending; it
 *       is released by a later run once approved.
 *   H3  the payslip shows this period's basic pay and the held salary as its
 *       own line; the earnings add up to gross pay.
 *   H4  a held cutoff is released once: when two drafts release it, the second
 *       is refused at finalize, and after a recompute it no longer releases it.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { BIR, DE_MINIMIS, MIN_WAGE, PAGIBIG, PHIC, SSS } from "./fixtures/statutory-test-rules";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p194t${sfx}`;
const id = (s: string) => `p194${s}${sfx}`;
const ELLA = id("ella");
const FINN = id("finn");
const SHIFT = id("shift");

import prismaAdmin from "@/lib/prisma-admin";
import { withTenant } from "@/lib/with-tenant";
import { createDraftRun, finalizeRun, recomputeRun } from "@/lib/payroll/persist";
import { loadPayslipPdfData } from "@/lib/payslip/pdf-data";

const weekdays = (from: string, to: string) => {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
};
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describeDb("PAY-194 held salary released in the next regular run (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const dtr = (emp: string, day: string, status: string) =>
    q(
      `INSERT INTO "DTRRecord" (id, "tenantId", "employeeId", date, "dayStatus", "workedMinutes", "approvalStatus", "updatedAt")
       VALUES ($1, $2, $3, $4, 'PRESENT', 480, $5, now())`,
      [`${emp}-${day}`, T, emp, `${day}T00:00:00.000Z`, status],
    );
  const sheet = async (book: string, emp: string) =>
    (await q(
      `SELECT "grossCompensationCents"::text gross, "sssEeCents"::text sss, "withholdingTaxCents"::text tax,
              "netPayCents"::text net, "basePayCents"::text base, "heldRelease" hr
         FROM "PayrollSheet" WHERE "payrollBookId" = $1 AND "employeeId" = $2`,
      [book, emp],
    )).rows[0] as { gross: string; sss: string; tax: string; net: string; base: string; hr: { releases: { fromBookId: string; periodStart: string; periodEnd: string; amounts: Record<string, string> }[] } | null } | undefined;
  const run = (start: string, end: string) =>
    createDraftRun({ tenantId: T, periodStart: d(start), periodEnd: d(end), cycle: "SEMI_MONTHLY", runType: "REGULAR" });

  let A = "";
  let B = "";

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T02:00:00.000Z"));
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "strictDtrPolicy", "updatedAt") VALUES ($1, $1, $2, true, now())`, [T, `P194${sfx}`.toUpperCase()]);
    for (const [cat, payload] of [
      ["SSS_SCHEDULE", SSS], ["PHILHEALTH_SCHEDULE", PHIC], ["PAGIBIG_SCHEDULE", PAGIBIG], ["BIR_WITHHOLDING_TABLE", BIR],
      ["MINIMUM_WAGE_RATE", MIN_WAGE],
      ["DE_MINIMIS_CEILING", { ...DE_MINIMIS, items: [{ code: "RICE", label: "Rice subsidy", monthlyCeiling: 200_000, basis: "test" }] }],
    ] as [string, unknown][]) {
      await q(
        `INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt")
         VALUES ($1, $2, $3::"StatutoryCategory", '2026-01-01', 'test', $4, $5::jsonb, now())`,
        [id(cat), T, cat, `p194-${cat}`, JSON.stringify(payload)],
      );
    }
    await q(
      `INSERT INTO "ShiftSchedule" (id, "tenantId", name, type, "timeIn", "timeOut", "workDays", "updatedAt")
       VALUES ($1, $2, 'Day', 'FIXED', '08:00', '17:00', '["MON","TUE","WED","THU","FRI"]'::jsonb, now())`,
      [SHIFT, T],
    );
    for (const [e, name] of [[ELLA, "Ella"], [FINN, "Finn"]]) {
      await q(
        `INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "shiftScheduleId", "updatedAt")
         VALUES ($1, $2, $1, $3, 'Held', '2025-01-06', $4, now())`,
        [e, T, name, SHIFT],
      );
      await q(
        `INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt")
         VALUES ($1, $2, $3, '2025-01-06', 2500000, 'MONTHLY', now())`,
        [`${e}-t`, T, e],
      );
      for (const day of weekdays("2026-11-02", "2026-11-13")) await dtr(e, day, day === "2026-11-05" ? "PENDING" : "APPROVED");
    }

    const a = await run("2026-11-01", "2026-11-15");
    A = a.id;
    expect(a.sheets).toHaveLength(0); // both held
    await finalizeRun(T, A, null);

    // Ella's pending day is approved after the run; Finn's is not.
    await q(`UPDATE "DTRRecord" SET "approvalStatus" = 'APPROVED' WHERE "employeeId" = $1 AND date = '2026-11-05'`, [ELLA]);
    vi.setSystemTime(new Date("2026-12-01T02:00:00.000Z"));
    for (const e of [ELLA, FINN]) for (const day of weekdays("2026-11-16", "2026-11-30")) await dtr(e, day, "APPROVED");
    B = (await run("2026-11-16", "2026-11-30")).id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    for (const t of ["DTRRecord", "AuditLog", "EmploymentTerm", "Employee", "ShiftSchedule", "StatutoryRule"]) {
      await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    }
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("H1 (T1) the next regular run releases the held cutoff, computed as it would have been", async () => {
    const s = (await sheet(B, ELLA))!;
    expect(s.hr?.releases).toHaveLength(1);
    const r = s.hr!.releases[0];
    expect(r).toMatchObject({ fromBookId: A, periodStart: "2026-11-01", periodEnd: "2026-11-15" });
    expect(r.amounts).toMatchObject({
      grossCompensationCents: "1250000", sssEeCents: "125000", philhealthEeCents: "62500", pagibigEeCents: "20000",
      grossTaxableIncomeCents: "1042500", withholdingTaxCents: "120", netPayCents: "1042380",
    });
    expect({ gross: s.gross, sss: s.sss, tax: s.tax, net: s.net, base: s.base }).toEqual({
      gross: "2500000", sss: "125000", tax: "31365", net: "2261135", base: "2500000",
    });
  });

  it("H2 a held cutoff whose DTR is still pending is not released; a later run releases it once approved", async () => {
    const f = (await sheet(B, FINN))!;
    expect(f.hr).toBeNull();
    expect(f.net).toBe("1218755");
    await q(`UPDATE "DTRRecord" SET "approvalStatus" = 'APPROVED' WHERE "employeeId" = $1 AND date = '2026-11-05'`, [FINN]);
    await recomputeRun(T, B);
    expect((await sheet(B, FINN))!.hr?.releases.map((x) => x.fromBookId)).toEqual([A]);
    expect((await sheet(B, FINN))!.net).toBe("2261135");
  });

  it("H3 the payslip shows this period's basic pay and the held salary on its own line", async () => {
    // A second draft that would also release A's held cutoffs (for H4).
    vi.setSystemTime(new Date("2026-12-16T02:00:00.000Z"));
    for (const e of [ELLA, FINN]) for (const day of weekdays("2026-12-01", "2026-12-15")) await dtr(e, day, "APPROVED");
    const D = (await run("2026-12-01", "2026-12-15")).id;
    expect((await sheet(D, ELLA))!.hr?.releases.map((x) => x.fromBookId)).toEqual([A]);

    await finalizeRun(T, B, null);
    const p = await withTenant(T, (tx) => loadPayslipPdfData(tx, { tenantId: T, bookId: B, employeeId: ELLA }));
    const lines = p.earnings.map((l) => [l.label, l.amount]);
    expect(lines).toEqual([
      ["Basic pay", 1_250_000n],
      ["Held salary released (1 to 15 Nov 2026)", 1_250_000n],
    ]);
    expect(p.earnings.reduce((t, l) => t + l.amount, 0n)).toBe(2_500_000n);

    // H4: D also released A's cutoffs; B was finalized first, so D is refused.
    await expect(finalizeRun(T, D, null)).rejects.toThrow(/already released by another finalized run.*Recompute the run, then finalize/);
    await recomputeRun(T, D);
    expect((await sheet(D, ELLA))!.hr).toBeNull();
    expect((await sheet(D, ELLA))!.gross).toBe("1250000");
    await finalizeRun(T, D, null);
    void prismaAdmin;
  });
});
