/**
 * Wave A3 (PAY-210) against real Postgres: incidents take their category,
 * type and decision from the company's lists.
 *
 *   D1  an incident filed with a built-in type (by item or by enum) links the
 *       item and keeps the enum stage; a type the company added is stored as
 *       OTHER with its item; a category links its item (fails on main: no
 *       typeId column).
 *   D2  an item from outside the company's list is refused.
 *   D3  resolving with a decision copies its suspension days and dismissal
 *       flag; editing the list item afterwards does not change the incident.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `wa3t${sfx}`;
const T2 = `wa3o${sfx}`;
const U = `wa3u${sfx}`;
const EMP = `wa3e${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));

import { POST as create } from "@/app/api/incidents/route";
import { POST as resolve } from "@/app/api/incidents/[id]/resolve/route";

const post = (body: Record<string, unknown>) =>
  create(new NextRequest("http://localhost/api/incidents", { method: "POST", body: JSON.stringify({ employeeId: EMP, subject: "Late", description: "Late three times", incidentDate: "2026-11-10", ...body }) }));

describeDb("Wave A3 incident lists (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const ids: Record<string, string> = {};
  const item = async (tenant: string, list: string, code: string, name: string, attributes: Record<string, unknown> = {}) => {
    const id = `wa3i${randomBytes(4).toString("hex")}`;
    await q(`INSERT INTO "LookupItem" (id, "tenantId", list, code, name, attributes, "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, now())`, [id, tenant, list, code, name, JSON.stringify(attributes)]);
    return id;
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    auth.userId = U;
    for (const [id, c] of [[T, "A"], [T2, "B"]]) await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala', $2, now())`, [id, `WA3${c}${sfx}`.toUpperCase()]);
    await q(`INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'H', 'R', now())`, [U, T, `hr${sfx}@t.test`]);
    await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt") VALUES ($1, $2, 'E-1', 'Ana', 'Cruz', '2025-01-06', now())`, [EMP, T]);
    ids.nte = await item(T, "INCIDENT_TYPE", "NOTICE_TO_EXPLAIN", "Notice to explain");
    ids.coaching = await item(T, "INCIDENT_TYPE", "COACHING", "Coaching session");
    ids.attendance = await item(T, "INCIDENT_CATEGORY", "ATTENDANCE", "Attendance and punctuality", { severity: "LIGHT" });
    ids.suspension = await item(T, "INCIDENT_DECISION", "SUSPENSION", "Suspension", { suspensionDays: 3 });
    ids.dismissal = await item(T, "INCIDENT_DECISION", "DISMISSAL", "Dismissal", { isDismissal: true });
    ids.foreign = await item(T2, "INCIDENT_CATEGORY", "X", "Theirs");
  });

  afterAll(async () => {
    if (!admin) return;
    // The resolve route writes its audit row without waiting; let it land first.
    await new Promise((r) => setTimeout(r, 500));
    await q(`DELETE FROM "DTRRecord" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "OffboardingCase" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "IncidentReport" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, [T]).catch(() => undefined);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "User" WHERE id = $1`, [U]);
    await q(`DELETE FROM "LookupItem" WHERE "tenantId" = ANY($1)`, [[T, T2]]);
    await q(`DELETE FROM "Tenant" WHERE id = ANY($1)`, [[T, T2]]);
    await admin.end();
  });

  it("D1 type and category from the lists", async () => {
    const byItem = await post({ typeId: ids.nte, categoryId: ids.attendance });
    expect(byItem.status).toBe(201);
    expect((await byItem.json()).data).toMatchObject({ type: "NOTICE_TO_EXPLAIN", typeId: ids.nte, categoryId: ids.attendance });
    const byEnum = await post({ type: "NOTICE_TO_EXPLAIN" });
    expect((await byEnum.json()).data).toMatchObject({ type: "NOTICE_TO_EXPLAIN", typeId: ids.nte, categoryId: null });
    const custom = await post({ typeId: ids.coaching });
    expect((await custom.json()).data).toMatchObject({ type: "OTHER", typeId: ids.coaching });
  });

  it("D2 outside the list is refused", async () => {
    const res = await post({ typeId: ids.nte, categoryId: ids.foreign });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("Incident Categories");
  });

  it("D3 the decision's outcome is copied at resolution", async () => {
    const inc = (await (await post({ typeId: ids.nte })).json()).data;
    const res = await resolve(new NextRequest(`http://localhost/x/${inc.id}/resolve`, { method: "POST", body: JSON.stringify({ resolution: "Three days", decisionId: ids.suspension, suspensionStartDate: "2026-11-23" }) }), { params: Promise.resolve({ id: inc.id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ decisionId: ids.suspension, decisionSuspensionDays: 3, decisionIsDismissal: false, status: "RESOLVED" });
    await q(`UPDATE "LookupItem" SET attributes = '{"suspensionDays": 10}' WHERE id = $1`, [ids.suspension]);
    expect((await q(`SELECT "decisionSuspensionDays" d FROM "IncidentReport" WHERE id = $1`, [inc.id])).rows[0].d).toBe(3);

    const inc2 = (await (await post({ typeId: ids.nte })).json()).data;
    const res2 = await resolve(new NextRequest(`http://localhost/x/${inc2.id}/resolve`, { method: "POST", body: JSON.stringify({ resolution: "Dismissed", decisionId: ids.dismissal, lastWorkingDay: "2026-11-30" }) }), { params: Promise.resolve({ id: inc2.id }) });
    expect((await res2.json()).data).toMatchObject({ decisionSuspensionDays: null, decisionIsDismissal: true });
  });
});
