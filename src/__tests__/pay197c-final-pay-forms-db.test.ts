/**
 * PAY-197 part 3 against real Postgres.
 *
 *   D1  HR downloads the certificate of employment as a PDF; the quitclaim is
 *       refused until the final pay run is finalized, then downloads (fails on
 *       main: no forms).
 *   D2  the portal offers the certificate only after HR issues it.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p197f${sfx}`;
const id = (s: string) => `p197f${s}${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "u", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/authz/route-permission", () => ({ forbidUnless: vi.fn(async () => null) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}), getClientIp: () => null }));

import { GET as doc } from "@/app/api/offboarding/cases/[id]/documents/[kind]/route";
import { POST as issue } from "@/app/api/offboarding/cases/[id]/coe-issue/route";
import { GET as portalCoe } from "@/app/api/offboard-portal/coe/route";
import { issuePortalLink, PORTAL_COOKIE, startPortalSession } from "@/lib/offboarding/portal";
import { withTenant } from "@/lib/with-tenant";

describeDb("PAY-197 final pay forms (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const get = (kind: string) => doc(new NextRequest(`http://localhost/x`), { params: Promise.resolve({ id: id("case"), kind }) });

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Forms Co', $2, now())`, [T, T.toUpperCase()]);
    await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt") VALUES ($1, $2, 'E-ANA', 'Ana', 'Santos', '2023-06-15', now())`, [id("ana"), T]);
    await q(`INSERT INTO "OffboardingCase" (id, "tenantId", "employeeId", "separationReason", "lastWorkingDay", status, "updatedAt") VALUES ($1, $2, $3, 'RESIGNATION', '2026-11-14', 'CLEARED', now())`, [id("case"), T, id("ana")]);
  });
  afterAll(async () => {
    if (!admin) return;
    for (const t of ["OffboardingPortalSession", "OffboardingPortalLink", "OffboardingCase", "PayrollSheet", "PayrollBook", "Employee"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 HR's documents", async () => {
    const coe = await get("coe");
    expect(coe.status).toBe(200);
    expect(coe.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await coe.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    expect((await get("quitclaim")).status).toBe(409);
    await q(`INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "finalizedAt", "updatedAt") VALUES ($1, $2, '2026-11-01', '2026-11-14', 'SEMI_MONTHLY', 'FINAL_PAY', 'FINALIZED', now(), now())`, [id("fp"), T]);
    await q(
      `INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
         "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
         "basePayCents", "grossCompensationCents", "nontaxableCompensationCents", "grossTaxableIncomeCents", "withholdingTaxCents",
         "sssEeCents", "philhealthEeCents", "pagibigEeCents", "netPayCents", "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "updatedAt")
       VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', 6660000, 261, true, 3330000, 3330000, 0, 3330000, 0, 0, 0, 0, 3330000, '[]', '[]', '{}', '{}', now())`,
      [id("fps"), T, id("fp"), id("ana")],
    );
    const qc = await get("quitclaim");
    expect(qc.status).toBe(200);
    expect(qc.headers.get("content-disposition")).toContain("Quitclaim_E-ANA.pdf");
  });

  it("D2 the portal offers the certificate once issued", async () => {
    const raw = await withTenant(T, (tx) => issuePortalLink(tx, T, id("case"), "ana@personal.test"));
    const s = (await startPortalSession(raw)) as { token: string };
    const ask = () => portalCoe(new NextRequest("http://localhost/x", { headers: { cookie: `${PORTAL_COOKIE}=${s.token}` } }));
    expect((await ask()).status).toBe(404);
    expect((await issue(new NextRequest("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: id("case") }) })).status).toBe(200);
    const r = await ask();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
  });
});
