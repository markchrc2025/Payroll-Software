/**
 * PAY-197 (Mark, 20 Nov 2026 12:15: a submenu per part; 24 Nov: "Where's the
 * other features I told you about?") against real Postgres.
 *   D1  Exit Questionnaires: the answers and a summary (fails on main: no route).
 *   D2  Personal Information Forms: the bank account as its last four digits;
 *       the encrypted number never reaches HR, here or in the case list.
 *   D3  Final Pay & Documents: clearance, the finalized final pay with its
 *       net, the quitclaim ready.
 *   D4  the portal gives the separated employee their BIR 2316 once final pay
 *       is finalized.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";
import { TRAIN_2023 } from "@/lib/statutory/baseline-2026";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p97d${sfx}`;
const id = (k: string) => `p97d${k}${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
const portal = vi.hoisted(() => ({ ctx: null as null | { tenantId: string; employeeId: string; caseId: string } }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/offboarding/portal", async (orig) => ({ ...(await orig<typeof import("@/lib/offboarding/portal")>()), getPortalSession: vi.fn(async () => portal.ctx) }));

import { GET as forms } from "@/app/api/offboarding/forms/[kind]/route";
import { GET as cases } from "@/app/api/offboarding/cases/route";
import { GET as bir2316 } from "@/app/api/offboard-portal/bir-2316/route";

describeDb("PAY-197 Offboarding submenus (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const get = async (kind: string) => (await (await forms(new NextRequest(`http://x/api/offboarding/forms/${kind}`), { params: Promise.resolve({ kind }) })).json()).data;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    portal.ctx = { tenantId: T, employeeId: id("ana"), caseId: id("case") };
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala', $2, now())`, [T, `P97D${sfx}`.toUpperCase()]);
    await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt") VALUES ($1, $2, 'A-1', 'Ana', 'Cruz', '2024-01-08', now())`, [id("ana"), T]);
    await q(`INSERT INTO "StatutoryRule" (id, "tenantId", category, "effectiveFrom", "legalBasis", version, payload, "updatedAt") VALUES ($1, $2, 'BIR_WITHHOLDING_TABLE', '2023-01-01', 'test', 'p97d', $3::jsonb, now())`, [id("bir"), T, JSON.stringify(TRAIN_2023)]);
    await q(`INSERT INTO "OffboardingCase" (id, "tenantId", "employeeId", "separationReason", "lastWorkingDay", status, "exitQuestionnaire", "exitQuestionnaireAt", "personalInfo", "personalInfoAt", "updatedAt")
             VALUES ($1, $2, $3, 'RESIGNATION', '2026-11-15', 'CLEARED', $4, '2026-11-16', $5, '2026-11-16', now())`,
      [id("case"), T, id("ana"), JSON.stringify({ reasonForLeaving: "Moving to Cebu", wouldRecommend: "YES", wouldReturn: "MAYBE", likedMost: "The team" }),
        JSON.stringify({ forwardingAddress: "12 Osmena Blvd, Cebu City", personalEmail: "ana@example.com", mobileNumber: "09171234567", bankName: "BPI", bankAccountName: "Ana Cruz", bankAccountNumberEnc: "ENCRYPTED-SECRET", bankAccountLast4: "4321" })]);
    await q(`INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "finalizedAt", "updatedAt") VALUES ($1, $2, '2026-11-01', '2026-11-15', 'SEMI_MONTHLY', 'FINAL_PAY', 'FINALIZED', '2026-11-20', now())`, [id("b"), T]);
    await q(`INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
         "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
         "basePayCents", "grossCompensationCents", "nontaxableCompensationCents", "grossTaxableIncomeCents", "withholdingTaxCents",
         "sssEeCents", "philhealthEeCents", "pagibigEeCents", "netPayCents", "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "updatedAt")
       VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', 3000000, 261, false, 1500000, 1500000, 0, 1500000, 0, 0, 0, 0, 3456789, '[]', '[]', '{}', '{}', now())`,
      [id("s"), T, id("b"), id("ana")]);
  });

  afterAll(async () => {
    if (!admin) return;
    await q(`ALTER TABLE "PayrollSheet" DISABLE TRIGGER USER`);
    await q(`ALTER TABLE "PayrollBook" DISABLE TRIGGER USER`);
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    await q(`ALTER TABLE "PayrollSheet" ENABLE TRIGGER USER`);
    await q(`ALTER TABLE "PayrollBook" ENABLE TRIGGER USER`);
    for (const t of ["OffboardingCase", "StatutoryRule", "Employee"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 exit questionnaires", async () => {
    const d = await get("questionnaires");
    expect(d.summary).toEqual({ responses: 1, wouldRecommend: { YES: 1, MAYBE: 0, NO: 0 }, wouldReturn: { YES: 0, MAYBE: 1, NO: 0 } });
    expect(d.rows[0]).toMatchObject({ name: "Cruz, Ana", reasonForLeaving: "Moving to Cebu", likedMost: "The team", submittedAt: "2026-11-16" });
  });

  it("D2 personal information, the bank account masked everywhere", async () => {
    const d = await get("personal-info");
    expect(d.rows[0]).toMatchObject({ forwardingAddress: "12 Osmena Blvd, Cebu City", bankName: "BPI", bankAccount: "ending 4321" });
    expect(JSON.stringify(d)).not.toContain("ENCRYPTED-SECRET");
    const list = await (await cases(new NextRequest("http://x/api/offboarding/cases"))).text();
    expect(list).toContain("ending 4321");
    expect(list).not.toContain("ENCRYPTED-SECRET");
  });

  it("D3 final pay and documents", async () => {
    const d = await get("final-pay");
    expect(d.rows[0]).toMatchObject({ clearance: { pending: 0, total: 0 }, finalPayRun: { bookId: id("b"), status: "FINALIZED", netPayCents: "3456789" }, dueInDays: null, quitclaimReady: true });
    expect((await forms(new NextRequest("http://x"), { params: Promise.resolve({ kind: "nope" }) })).status).toBe(404);
  });

  it("D4 the portal's BIR 2316", async () => {
    const res = await bir2316(new NextRequest("http://x/api/offboard-portal/bir-2316"));
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
  });
});
