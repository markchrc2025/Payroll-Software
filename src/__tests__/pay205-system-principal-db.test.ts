/**
 * PAY-205 against real Postgres: a job's write is recorded as the SYSTEM
 * principal in the company it wrote to.
 *
 *   D1  a job queued by a user records that user and the job's name
 *       (fails on main: no system principal).
 *   D2  a scheduled sweep records no user, only the job's name.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { recordJobWrite, systemPrincipal } from "@/lib/jobs/principal";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p205t${sfx}`;
const U = `p205u${sfx}`;

describeDb("PAY-205 system principal (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Jobs Co', $2, now())`, [T, `P205${sfx}`.toUpperCase()]);
    await q(`INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'Hana', 'HR', now())`, [U, T, `hr${sfx}@t.test`]);
  });
  afterAll(async () => {
    if (!admin) return;
    await q(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "User" WHERE id = $1`, [U]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 a queued job records who queued it", async () => {
    await recordJobWrite(systemPrincipal("payroll.run", U), { tenantId: T, entity: "PayrollBook", entityId: "b1", summary: { computed: true } });
    const row = (await q(`SELECT "actorUserId", entity, "entityId", "userAgent", changes FROM "AuditLog" WHERE "tenantId" = $1 AND "entityId" = 'b1'`, [T])).rows[0];
    expect(row).toMatchObject({ actorUserId: U, entity: "PayrollBook", userAgent: "pg-boss:payroll.run" });
    expect(row.changes).toEqual({ principal: { kind: "SYSTEM", job: "payroll.run", enqueuedByUserId: U }, computed: true });
  });

  it("D2 a sweep records the job only", async () => {
    await recordJobWrite(systemPrincipal("leave.accrual"), { tenantId: T, entity: "LeaveTransaction", action: "CREATE", summary: { accrualsGranted: 3 } });
    const row = (await q(`SELECT "actorUserId", action, changes FROM "AuditLog" WHERE "tenantId" = $1 AND entity = 'LeaveTransaction'`, [T])).rows[0];
    expect(row).toMatchObject({ actorUserId: null, action: "CREATE" });
    expect(row.changes.principal).toEqual({ kind: "SYSTEM", job: "leave.accrual", enqueuedByUserId: null });
  });
});
