/**
 * PAY-135: a payroll run created for chosen employees computed everyone.
 *
 * Found on staging (15 Nov 2026) with the QA connector: an OFF_CYCLE run and a
 * FINAL_PAY run created with employeeIds = [one employee] both came back with
 * every active employee. POST /api/payroll/runs passed employeeIds to
 * queueRun, but the book never stored them and the payroll.run job only gets
 * {tenantId, bookId}, so processRun (and recomputeRun, for every run type)
 * loaded everyone. A final pay for one leaver became a final pay for all.
 *
 *   S1  selectRunEmployees: an empty subset keeps everyone; a subset keeps
 *       exactly those people; unknown ids select nobody extra.
 *   S2  validation: a FINAL_PAY run must name the employee(s) and the
 *       separation reason; OFF_CYCLE and REGULAR may still cover everyone.
 *   S3  (static) the three places that pick a run's employees (createDraftRun,
 *       processRun, recomputeRun) all go through selectRunEmployees, and both
 *       ways of creating a book store the subset.
 *   S4  (real Postgres) queueRun stores the subset on the book, de-duplicated,
 *       and an unrestricted run stores none.
 *   S5  (static) the New Run dialog no longer offers Final Pay for everyone.
 *
 * End to end on staging after deploy: the same OFF_CYCLE and FINAL_PAY calls
 * return only the chosen employee (recorded on PAY-135).
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { selectRunEmployees, queueRun } from "@/lib/payroll/persist";
import { createPayrollRunSchema } from "@/lib/validations/payroll-run";

const people = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("PAY-135 targeted payroll runs", () => {
  it("S1 an empty subset keeps everyone; a subset keeps exactly those", () => {
    expect(selectRunEmployees(people, []).map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(selectRunEmployees(people, null).map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(selectRunEmployees(people, ["b"]).map((e) => e.id)).toEqual(["b"]);
    expect(selectRunEmployees(people, ["c", "a", "a"]).map((e) => e.id)).toEqual(["a", "c"]);
    expect(selectRunEmployees(people, ["zz"])).toEqual([]);
  });

  it("S2 a final pay must name the leaver(s) and the reason", () => {
    const base = { periodStart: "2026-11-01", periodEnd: "2026-11-15", cycle: "SEMI_MONTHLY" };
    const finalPay = createPayrollRunSchema.safeParse({ ...base, runType: "FINAL_PAY" });
    expect(finalPay.success).toBe(false);
    const issues = finalPay.error!.flatten().fieldErrors;
    expect(issues.employeeIds?.[0]).toMatch(/must name the separated employee/);
    expect(issues.separationReason?.[0]).toMatch(/reason for separation/);

    expect(createPayrollRunSchema.safeParse({ ...base, runType: "FINAL_PAY", employeeIds: ["a"], separationReason: "RESIGNATION" }).success).toBe(true);
    expect(createPayrollRunSchema.safeParse({ ...base, runType: "OFF_CYCLE" }).success).toBe(true);
    expect(createPayrollRunSchema.safeParse({ ...base, runType: "OFF_CYCLE", employeeIds: ["a"] }).success).toBe(true);
    expect(createPayrollRunSchema.safeParse({ ...base }).success).toBe(true);
  });

  it("S3 every employee selection honours the stored subset", () => {
    const src = readFileSync("src/lib/payroll/persist.ts", "utf8");
    const body = (fn: string) => {
      const start = src.indexOf(`export async function ${fn}(`);
      expect(start).toBeGreaterThan(-1);
      const next = src.indexOf("\nexport ", start + 10);
      return src.slice(start, next === -1 ? undefined : next);
    };
    expect(body("createDraftRun")).toMatch(/selectRunEmployees\(allEmployees, targetIdsFor\(input\)\)/);
    expect(body("createDraftRun")).toMatch(/targetEmployeeIds: targetIdsFor\(input\)/);
    expect(body("queueRun")).toMatch(/targetEmployeeIds: targetIdsFor\(input\)/);
    expect(body("recomputeRun")).toMatch(/selectRunEmployees\([\s\S]*?book\.targetEmployeeIds/);
    expect(body("processRun")).toMatch(/selectRunEmployees\(allEmployees, book\.targetEmployeeIds\)/);
    // nothing else loads employees for a run without going through the helper
    for (const fn of ["createDraftRun", "recomputeRun", "processRun"]) {
      expect(body(fn).match(/loadActiveEmployees\(/g)?.length).toBe(1);
    }
  });

  it("S5 the New Run dialog sends final pay to Offboard instead of offering it for everyone", () => {
    const page = readFileSync("src/app/(dashboard)/payroll/page.tsx", "utf8");
    const dialog = page.slice(page.indexOf("<Label>Run Type</Label>"), page.indexOf('htmlFor="pr-notes"'));
    expect(dialog).not.toMatch(/value="FINAL_PAY"/);
    expect(dialog).toMatch(/Final pay: use Offboard/);
  });
});

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p135t${sfx}`;

describeDb("PAY-135 S4: queueRun stores the subset (real Postgres)", () => {
  let admin: pg.Client;
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await admin.query(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, $1, $2, now())`, [T, `P135${sfx}`.toUpperCase()]);
  });
  afterAll(async () => {
    await admin.query(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    await admin.query(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("S4 the book keeps the chosen employees, de-duplicated; no choice keeps none", async () => {
    const targeted = await queueRun({
      tenantId: T,
      periodStart: new Date("2026-11-01"),
      periodEnd: new Date("2026-11-15"),
      cycle: "SEMI_MONTHLY",
      runType: "OFF_CYCLE",
      employeeIds: ["emp-b", "emp-a", "emp-b"],
    });
    const everyone = await queueRun({
      tenantId: T,
      periodStart: new Date("2026-11-01"),
      periodEnd: new Date("2026-11-15"),
      cycle: "SEMI_MONTHLY",
      runType: "REGULAR",
    });
    const rows = await admin.query(`SELECT id, "targetEmployeeIds" FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r.targetEmployeeIds as string[]]));
    expect(byId[targeted.id]).toEqual(["emp-b", "emp-a"]);
    expect(byId[everyone.id]).toEqual([]);
  });
});
