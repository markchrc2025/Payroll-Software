/**
 * Wave G3 (PAY-217) against real Postgres: incident decision outcomes.
 * Ana works Monday to Friday (no shift: the default week).
 *
 *   D1  a 3-day suspension from Friday 27 Nov 2026 writes Fri 27, Mon 30 and
 *       Tue 1 Dec as approved unpaid DTR days tagged with the incident, and
 *       payroll's DTR roll-up for 27 to 30 Nov reads 2 unpaid days; resolving again (closing)
 *       does not write them twice (fails on main: no suspension dates).
 *   D2  no first day of the suspension is refused; a day already in a
 *       finalized run (locked) is refused.
 *   D3  a dismissal opens an offboarding case, JUST_CAUSE, with the last
 *       working day entered.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `wg3t${sfx}`;
const U = `wg3u${sfx}`;
const ANA = `wg3a${sfx}`;
const BEN = `wg3b${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));

import { POST as resolve } from "@/app/api/incidents/[id]/resolve/route";
import { aggregateApprovedDtr } from "@/lib/payroll/dtr-aggregate";
import { withTenant } from "@/lib/with-tenant";

describeDb("Wave G3 incident outcomes (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const ids: Record<string, string> = {};
  const item = async (code: string, attributes: Record<string, unknown>) => {
    const id = `wg3i${randomBytes(4).toString("hex")}`;
    await q(`INSERT INTO "LookupItem" (id, "tenantId", list, code, name, attributes, "updatedAt") VALUES ($1, $2, 'INCIDENT_DECISION', $3, $3, $4, now())`, [id, T, code, JSON.stringify(attributes)]);
    return id;
  };
  const incident = async (emp: string) => {
    const id = `wg3n${randomBytes(4).toString("hex")}`;
    await q(`INSERT INTO "IncidentReport" (id, "tenantId", "employeeId", type, subject, description, "incidentDate", "updatedAt") VALUES ($1, $2, $3, 'NOTICE_TO_EXPLAIN', 'Absent without leave', 'AWOL two days', '2026-11-10', now())`, [id, T, emp]);
    return id;
  };
  const call = (id: string, body: Record<string, unknown>) =>
    resolve(new NextRequest(`http://localhost/x/${id}/resolve`, { method: "POST", body: JSON.stringify({ resolution: "Decided", ...body }) }), { params: Promise.resolve({ id }) });

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T; auth.userId = U;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala', $2, now())`, [T, `WG3${sfx}`.toUpperCase()]);
    await q(`INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'H', 'R', now())`, [U, T, `hr${sfx}@t.test`]);
    for (const [e, n] of [[ANA, "A-1"], [BEN, "B-1"]]) await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt") VALUES ($1, $2, $3, 'X', 'Y', '2025-01-06', now())`, [e, T, n]);
    ids.susp = await item("SUSPENSION_3", { suspensionDays: 3 });
    ids.dism = await item("DISMISSAL", { isDismissal: true });
  });

  afterAll(async () => {
    if (!admin) return;
    await new Promise((r) => setTimeout(r, 500));
    for (const t of ["DTRRecord", "ClearanceItem", "OffboardingCase", "IncidentReport", "AuditLog", "LookupItem", "Employee", "User"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]).catch(() => undefined);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 a suspension becomes unpaid days, once", async () => {
    const id = await incident(ANA);
    const res = await call(id, { decisionId: ids.susp, suspensionStartDate: "2026-11-27" });
    expect(res.status).toBe(200);
    expect((await res.json()).data.suspensionDates).toEqual(["2026-11-27", "2026-11-30", "2026-12-01"]);
    const rows = (await q(`SELECT date::date::text AS d, "dayStatus", "approvalStatus", "incidentReportId" FROM "DTRRecord" WHERE "employeeId" = $1 ORDER BY date`, [ANA])).rows;
    expect(rows).toEqual(["2026-11-27", "2026-11-30", "2026-12-01"].map((d) => ({ d, dayStatus: "UNPAID_LEAVE", approvalStatus: "APPROVED", incidentReportId: id })));
    const agg = await withTenant(T, (tx) => aggregateApprovedDtr(tx, { tenantId: T, employeeId: ANA, periodStartDate: new Date("2026-11-27T00:00:00Z"), periodEndDate: new Date("2026-11-30T23:59:59.999Z") }));
    expect(agg.status === "OK" && Number(agg.data.unpaidLeaveDays)).toBe(2);
    const again = await call(id, { status: "CLOSED", decisionId: ids.susp, suspensionStartDate: "2026-12-07" });
    expect(again.status).toBe(200);
    expect(Number((await q(`SELECT count(*) c FROM "DTRRecord" WHERE "employeeId" = $1`, [ANA])).rows[0].c)).toBe(3);
  });

  it("D2 no first day, or a day already paid, is refused", async () => {
    const id = await incident(BEN);
    expect((await call(id, { decisionId: ids.susp })).status).toBe(422);
    await q(`INSERT INTO "DTRRecord" (id, "tenantId", "employeeId", date, "dayStatus", "isLocked", "approvalStatus", "updatedAt") VALUES ($1, $2, $3, '2026-11-24', 'PRESENT', true, 'APPROVED', now())`, [`wg3d${sfx}`, T, BEN]);
    const res = await call(id, { decisionId: ids.susp, suspensionStartDate: "2026-11-23" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("2026-11-24");
    expect((await q(`SELECT status, "decisionId" FROM "IncidentReport" WHERE id = $1`, [id])).rows[0]).toEqual({ status: "OPEN", decisionId: null });
  });

  it("D3 a dismissal opens offboarding", async () => {
    const id = await incident(BEN);
    expect((await call(id, { decisionId: ids.dism })).status).toBe(422);
    const res = await call(id, { decisionId: ids.dism, lastWorkingDay: "2026-11-30" });
    expect(res.status).toBe(200);
    const caseId = (await res.json()).data.offboardingCaseId;
    const c = (await q(`SELECT "employeeId", "separationReason", "lastWorkingDay"::date::text AS lwd FROM "OffboardingCase" WHERE id = $1`, [caseId])).rows[0];
    expect(c).toEqual({ employeeId: BEN, separationReason: "JUST_CAUSE", lwd: "2026-11-30" });
  });
});
