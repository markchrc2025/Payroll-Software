/**
 * PAY-197 part 2 (Mark, 20 Nov 2026, ruling 4): the offboarding portal,
 * against real Postgres.
 *
 *   D1  HR's link: only its hash is stored; a new link retires the unused
 *       one (fails on main: no portal).
 *   D2  a link starts one session and only once; a retired or expired link
 *       is refused.
 *   D3  the session reaches only the employee's own case: the summary, the
 *       exit questionnaire, the personal information form (the bank account
 *       number encrypted, shown only as its last four digits) and a
 *       certificate of employment request. No session, no access.
 *   D4  the portal closes 90 days after final pay: a link or a session past
 *       then is refused; the final payslip is there before.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

process.env.ENCRYPTION_KEY ??= randomBytes(32).toString("base64");

import { getPortalSession, hashToken, issuePortalLink, startPortalSession, PORTAL_COOKIE } from "@/lib/offboarding/portal";
import { GET as me } from "@/app/api/offboard-portal/me/route";
import { PUT as questionnaire } from "@/app/api/offboard-portal/questionnaire/route";
import { PUT as personalInfo } from "@/app/api/offboard-portal/personal-info/route";
import { POST as coe } from "@/app/api/offboard-portal/coe-request/route";
import { GET as payslip } from "@/app/api/offboard-portal/payslip/route";
import { withTenant } from "@/lib/with-tenant";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p197p${sfx}`;
const id = (s: string) => `p197p${s}${sfx}`;
const req = (path: string, cookie?: string, body?: unknown, method = "GET") =>
  new NextRequest(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie: `${PORTAL_COOKIE}=${cookie}` } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

describeDb("PAY-197 offboarding portal (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  let session = "";

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Portal Co', $2, now())`, [T, T.toUpperCase()]);
    for (const e of ["ana", "ben"]) await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "personalEmail", "updatedAt") VALUES ($1, $2, $3, $4, 'Santos', '2025-01-06', $5, now())`, [id(e), T, `E-${e}`, e, `${e}@personal.test`]);
    for (const e of ["ana", "ben"]) await q(`INSERT INTO "OffboardingCase" (id, "tenantId", "employeeId", "separationReason", "lastWorkingDay", status, "updatedAt") VALUES ($1, $2, $3, 'RESIGNATION', '2026-11-14', 'CLEARED', now())`, [id(`c${e}`), T, id(e)]);
  });

  afterAll(async () => {
    if (!admin) return;
    for (const t of ["OffboardingPortalSession", "OffboardingPortalLink", "OffboardingCase", "PayrollSheet", "PayrollBook", "AuditLog", "Employee"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  let first = "";
  it("D1 only the hash is kept; a new link retires the old", async () => {
    first = await withTenant(T, (tx) => issuePortalLink(tx, T, id("cana"), "ana@personal.test"));
    const rows = (await q(`SELECT "tokenHash", "retiredAt" FROM "OffboardingPortalLink" WHERE "caseId" = $1`, [id("cana")])).rows;
    expect(rows).toEqual([{ tokenHash: hashToken(first), retiredAt: null }]);
    expect(JSON.stringify(rows)).not.toContain(first);
  });

  it("D2 one session per link", async () => {
    const second = await withTenant(T, (tx) => issuePortalLink(tx, T, id("cana"), "ana@personal.test"));
    expect(await startPortalSession(first)).toEqual({ refused: "This link is not valid. Ask HR for a new one." });
    const ok = await startPortalSession(second);
    expect("token" in ok).toBe(true);
    session = (ok as { token: string }).token;
    expect(await startPortalSession(second)).toEqual({ refused: "This link was already used. Ask HR for a new one." });
    const late = await withTenant(T, (tx) => issuePortalLink(tx, T, id("cben"), "ben@personal.test", new Date(Date.now() - 8 * 86_400_000)));
    expect(await startPortalSession(late)).toEqual({ refused: "This link has expired. Ask HR for a new one." });
  });

  it("D3 the employee's own case only", async () => {
    expect((await me(req("/api/offboard-portal/me"))).status).toBe(401);
    expect(await getPortalSession(req("/x", session))).toMatchObject({ tenantId: T, caseId: id("cana"), employeeId: id("ana") });
    const summary = (await (await me(req("/api/offboard-portal/me", session))).json()).data;
    expect(summary).toMatchObject({ company: "Portal Co", employee: { firstName: "ana" }, finalPayslipBookId: null, closesAt: null });
    expect((await questionnaire(req("/q", session, { reasonForLeaving: "Moving abroad", wouldRecommend: "YES", wouldReturn: "MAYBE" }, "PUT"))).status).toBe(200);
    expect((await personalInfo(req("/p", session, { forwardingAddress: "12 Shoe Avenue, Marikina", personalEmail: "ana@new.test", mobileNumber: "09171234567", bankName: "BDO", bankAccountNumber: "0012-3456-7890" }, "PUT"))).status).toBe(200);
    expect((await coe(req("/c", session, undefined, "POST"))).status).toBe(200);
    const row = (await q(`SELECT "exitQuestionnaire" e, "personalInfo" p, "coeRequestedAt" c FROM "OffboardingCase" WHERE id = $1`, [id("cana")])).rows[0];
    expect(row.e).toMatchObject({ reasonForLeaving: "Moving abroad", wouldReturn: "MAYBE" });
    expect(row.p).toMatchObject({ bankName: "BDO", bankAccountLast4: "7890" });
    expect(JSON.stringify(row.p)).not.toContain("001234567890");
    expect(row.c).not.toBeNull();
    const ben = (await q(`SELECT "exitQuestionnaire" e FROM "OffboardingCase" WHERE id = $1`, [id("cben")])).rows[0];
    expect(ben.e).toBeNull();
    const after = (await (await me(req("/api/offboard-portal/me", session))).json()).data;
    expect(after.personalInfo).toMatchObject({ bankAccount: "ending 7890" });
    expect(after.personalInfo.bankAccountNumberEnc).toBeUndefined();
    expect((await payslip(req("/s", session))).status).toBe(404);
  });

  it("D4 closes 90 days after final pay", async () => {
    await q(`INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "finalizedAt", "updatedAt") VALUES ($1, $2, '2026-11-01', '2026-11-14', 'SEMI_MONTHLY', 'FINAL_PAY', 'FINALIZED', now() - interval '91 days', now())`, [id("fp"), T]);
    await q(
      `INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
         "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
         "basePayCents", "grossCompensationCents", "nontaxableCompensationCents", "grossTaxableIncomeCents", "withholdingTaxCents",
         "sssEeCents", "philhealthEeCents", "pagibigEeCents", "netPayCents", "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "updatedAt")
       VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', 6660000, 261, true, 3330000, 3330000, 0, 3330000, 0, 0, 0, 0, 3330000, '[]', '[]', '{}', '{}', now())`,
      [id("fps"), T, id("fp"), id("ben")],
    );
    await expect(withTenant(T, (tx) => issuePortalLink(tx, T, id("cben"), "ben@personal.test"))).rejects.toThrow(/closed 90 days after final pay/);
    await q(`UPDATE "PayrollBook" SET "finalizedAt" = now() - interval '89 days' WHERE id = $1`, [id("fp")]);
    const raw = await withTenant(T, (tx) => issuePortalLink(tx, T, id("cben"), "ben@personal.test"));
    const s = await startPortalSession(raw);
    expect("token" in s && s.expiresAt.getTime() <= Date.now() + 12 * 3_600_000).toBe(true);
    const summary = (await (await me(req("/m", (s as { token: string }).token))).json()).data;
    expect(summary.finalPayslipBookId).toBe(id("fp"));
    expect(new Date(summary.closesAt).getTime()).toBeGreaterThan(Date.now());
  });
});
