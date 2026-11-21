/**
 * Wave C3 and C4 (PAY-213) against real Postgres: Document Workflow.
 *
 *   D1  a template with an unknown merge field is refused; one with a salary
 *       field is marked as showing pay (fails on main: no route).
 *   D2  an employee requests a document in ESS; a second pending request for
 *       the same document, and a template not offered in ESS, are refused.
 *   D3  approval fills the letter from the employee's record and keeps it: a
 *       later change to the record does not change it; the PDF downloads; a
 *       rejected request issues nothing; nobody decides their own request.
 *   D4  a letter that shows pay: a role with DOCUMENTS:APPROVE but not
 *       PAYROLL:READ cannot approve it, and its inbox shows no preview.
 *   D5  with an approval chain the assigned approver approves their step;
 *       the letter is issued at the last step.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `wdt${sfx}`;
const OWNER = `wdo${sfx}`;
const CLERK = `wdk${sfx}`;
const SUP = `wds${sfx}`;
const ROLE = `wdr${sfx}`;
const ADMIN = `wdadm${sfx}`;
const E = { owner: `wdeo${sfx}`, ana: `wdea${sfx}`, sup: `wdes${sfx}`, clerk: `wdek${sfx}` };

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "TENANT_USER", roleId: null as string | null }));
const ess = vi.hoisted(() => ({ tenantId: "", employeeId: "" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/ess-auth", () => ({ getEssContext: vi.fn(async () => ess) }));

import { POST as createTemplate } from "@/app/api/document-templates/route";
import { POST as essRequest } from "@/app/api/ess/document-requests/route";
import { GET as essPdf } from "@/app/api/ess/document-requests/[id]/pdf/route";
import { POST as approve } from "@/app/api/document-requests/[id]/approve/route";
import { POST as reject } from "@/app/api/document-requests/[id]/reject/route";
import { GET as inbox } from "@/app/api/approvals/inbox/route";

const jreq = (url: string, body: unknown) => new NextRequest(url, { method: "POST", body: JSON.stringify(body) });
const as = (user: string, role: string | null) => { auth.userId = user; auth.roleId = role; };
const file = async (templateId: string, purpose = "bank loan") => {
  ess.employeeId = E.ana;
  return essRequest(jreq("http://localhost/api/ess/document-requests", { templateId, purpose }));
};
const decide = (kind: "approve" | "reject", id: string, body: unknown = {}) =>
  (kind === "approve" ? approve : reject)(jreq(`http://localhost/x/${id}/${kind}`, body), { params: Promise.resolve({ id }) });

describeDb("Wave C3 document workflow (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T; ess.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", address, city, "updatedAt") VALUES ($1, 'Tala Foods Inc.', $2, '12 Shoe Ave', 'Marikina', now())`, [T, `WD${sfx}`.toUpperCase()]);
    for (const [id, e] of [[OWNER, "o"], [CLERK, "k"], [SUP, "s"]]) await q(`INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'A', 'B', now())`, [id, T, `${e}${sfx}@t.test`]);
    await q(`UPDATE "Tenant" SET "ownerUserId" = $2 WHERE id = $1`, [T, OWNER]);
    await q(`INSERT INTO "Role" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, 'Documents clerk', now())`, [ROLE, T]);
    await q(`INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT $1, id FROM "Permission" WHERE module = 'DOCUMENTS' AND action IN ('APPROVE', 'READ')`, [ROLE]);
    // The owner's Administrator role holds every permission (as at sign-up).
    await q(`INSERT INTO "Role" (id, "tenantId", name, "isSystem", "updatedAt") VALUES ($1, $2, 'Administrator', true, now())`, [ADMIN, T]);
    await q(`INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT $1, id FROM "Permission"`, [ADMIN]);
    for (const [id, num, first, last, user] of [[E.owner, "O-1", "Olga", "Ocampo", OWNER], [E.ana, "A-1", "Ana", "Cruz", null], [E.sup, "S-1", "Sam", "Santos", SUP], [E.clerk, "K-1", "Kai", "Reyes", CLERK]] as const) {
      await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "employmentStatus", "jobTitle", "userId", "updatedAt") VALUES ($1, $2, $3, $4, $5, '2023-03-06', 'REGULAR', 'Accounting Staff', $6, now())`, [id, T, num, first, last, user]);
    }
    await q(`INSERT INTO "EmploymentTerm" (id, "tenantId", "employeeId", "effectiveDate", "basicSalaryCents", "salaryType", "updatedAt") VALUES ($1, $2, $3, '2023-03-06', 2500000, 'MONTHLY', now())`, [`wdet${sfx}`, T, E.ana]);
  });

  afterAll(async () => {
    if (!admin) return;
    await new Promise((r) => setTimeout(r, 400));
    await q(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, [T]).catch(() => undefined);
    await q(`DELETE FROM "ApprovalStep" WHERE "tenantId" = $1`, [T]);
    await q(`ALTER TABLE "DocumentRequest" DISABLE TRIGGER pay213_document_request_issued`);
    await q(`DELETE FROM "DocumentRequest" WHERE "tenantId" = $1`, [T]);
    await q(`ALTER TABLE "DocumentRequest" ENABLE TRIGGER pay213_document_request_issued`);
    await q(`DELETE FROM "DocumentTemplate" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "EmploymentTerm" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "RolePermission" WHERE "roleId" = ANY($1)`, [[ROLE, ADMIN]]);
    await q(`DELETE FROM "Role" WHERE "tenantId" = $1`, [T]);
    await q(`UPDATE "Tenant" SET "ownerUserId" = NULL WHERE id = $1`, [T]);
    await q(`DELETE FROM "User" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 templates", async () => {
    as(OWNER, ADMIN);
    const bad = await createTemplate(jreq("http://localhost/api/document-templates", { name: "X", title: "X", body: "Dear {{employee.nickname}}" }));
    expect(bad.status).toBe(422);
    expect((await bad.json()).error).toContain("{{employee.nickname}}");
    const coe = await createTemplate(jreq("http://localhost/api/document-templates", {
      name: "Certificate of Employment", title: "Certificate of Employment",
      body: "This is to certify that {{employee.fullName}} has been employed by {{company.name}} as {{employee.position}} since {{employee.hireDate}}.\n\nIssued for {{request.purpose}}.",
      signatoryName: "Olga Ocampo", signatoryTitle: "HR Manager",
    }));
    expect(coe.status).toBe(201);
    const c = (await coe.json()).data;
    expect(c.showsSalary).toBe(false);
    ids.coe = c.id;
    const pay = await createTemplate(jreq("http://localhost/api/document-templates", { name: "COE with compensation", title: "Certificate of Employment and Compensation", body: "{{employee.fullName}} earns {{employee.basicSalary}} ({{employee.annualBasicSalary}} a year)." }));
    const p = (await pay.json()).data;
    expect(p.showsSalary).toBe(true);
    ids.pay = p.id;
    const hidden = await createTemplate(jreq("http://localhost/api/document-templates", { name: "Internal memo", title: "Memo", body: "x", availableInEss: false }));
    ids.hidden = (await hidden.json()).data.id;
  });

  it("D2 requesting in ESS", async () => {
    const res = await file(ids.coe!);
    expect(res.status).toBe(201);
    ids.r1 = (await res.json()).data.id;
    expect((await file(ids.coe!)).status).toBe(409);
    expect((await file(ids.hidden!)).status).toBe(404);
  });

  it("D3 approval issues the letter; rejection issues nothing", async () => {
    as(OWNER, ADMIN);
    const ok = await decide("approve", ids.r1!);
    expect(ok.status).toBe(200);
    const row = (await q(`SELECT status, "renderedTitle", "renderedBody" FROM "DocumentRequest" WHERE id = $1`, [ids.r1])).rows[0];
    expect(row.status).toBe("APPROVED");
    expect(row.renderedTitle).toBe("Certificate of Employment");
    expect(row.renderedBody).toBe("This is to certify that Ana Cruz has been employed by Tala Foods Inc. as Accounting Staff since March 6, 2023.\n\nIssued for bank loan.");
    await q(`UPDATE "Employee" SET "lastName" = 'Cruz-Santos' WHERE id = $1`, [E.ana]);
    expect((await q(`SELECT "renderedBody" FROM "DocumentRequest" WHERE id = $1`, [ids.r1])).rows[0].renderedBody).toContain("Ana Cruz has");
    await expect(q(`UPDATE "DocumentRequest" SET "renderedBody" = 'x' WHERE id = $1`, [ids.r1])).rejects.toThrow(/cannot be changed/);
    ess.employeeId = E.ana;
    const pdf = await essPdf(new NextRequest(`http://localhost/x/${ids.r1}/pdf`), { params: Promise.resolve({ id: ids.r1! }) });
    expect(pdf.status).toBe(200);
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");

    // A second request, rejected: nothing issued.
    const again = (await (await file(ids.coe!, "visa")).json()).data;
    expect((await decide("reject", again.id, {})).status).toBe(422);
    expect((await decide("reject", again.id, { reason: "Ask HR in person" })).status).toBe(200);
    expect((await q(`SELECT status, "renderedBody" FROM "DocumentRequest" WHERE id = $1`, [again.id])).rows[0]).toEqual({ status: "REJECTED", renderedBody: null });
    const none = await essPdf(new NextRequest(`http://localhost/x/${again.id}/pdf`), { params: Promise.resolve({ id: again.id }) });
    expect(none.status).toBe(409);

    // Nobody decides their own.
    ess.employeeId = E.clerk;
    const own = (await (await essRequest(jreq("http://localhost/api/ess/document-requests", { templateId: ids.coe }))).json()).data;
    as(CLERK, ROLE);
    expect((await decide("approve", own.id)).status).toBe(403);
  });

  it("D4 a letter that shows pay needs pay access", async () => {
    const r = (await (await file(ids.pay!)).json()).data;
    as(CLERK, ROLE);
    const items = (await (await inbox(new NextRequest("http://localhost/api/approvals/inbox?module=DOCUMENT"))).json()).data as { id: string; exceptions: string[]; details: { preview: unknown } }[];
    const it = items.find((i) => i.id === r.id)!;
    expect(it.details.preview).toBeNull();
    expect(it.exceptions).toEqual(["Shows pay: only a role that may see pay can approve it"]);
    const res = await decide("approve", r.id);
    expect(res.status).toBe(403);
    as(OWNER, ADMIN);
    expect((await decide("approve", r.id)).status).toBe(200);
    expect((await q(`SELECT "renderedBody" FROM "DocumentRequest" WHERE id = $1`, [r.id])).rows[0].renderedBody).toBe("Ana Cruz-Santos earns ₱25,000.00 a month (₱300,000.00 a year).");
  });

  it("D5 the approval chain", async () => {
    await q(`DELETE FROM "DocumentRequest" WHERE "employeeId" = $1 AND status = 'PENDING'`, [E.ana]);
    const r = (await (await file(ids.coe!, "embassy")).json()).data;
    await q(`INSERT INTO "ApprovalStep" (id, "tenantId", module, "entityId", "stepIndex", "roleKey", "approverEmployeeId", "updatedAt") VALUES ($1, $2, 'DOCUMENT', $3, 0, 'supervisor', $4, now()), ($5, $2, 'DOCUMENT', $3, 1, 'hr_manager', $6, now())`,
      [`wdst0${sfx}`, T, r.id, E.sup, `wdst1${sfx}`, E.owner]);
    as(SUP, null);
    const first = await decide("approve", r.id);
    expect(first.status).toBe(200);
    expect((await first.json()).data.status).toBe("PENDING");
    expect((await q(`SELECT "renderedBody" FROM "DocumentRequest" WHERE id = $1`, [r.id])).rows[0].renderedBody).toBeNull();
    expect((await decide("approve", r.id)).status).toBe(403); // the next step is not his
    as(OWNER, ADMIN);
    const last = await decide("approve", r.id);
    expect((await last.json()).data.status).toBe("APPROVED");
  });
});
