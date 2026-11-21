/**
 * Wave A2 (PAY-209, decision 6) against real Postgres: expense claims take
 * their category and type from the company's lists.
 *
 *   D1  a claim filed with a category (by id, or by code or name) and no type
 *       links both items, the type defaulting to Reimbursement; `category`
 *       keeps the code; a category outside the list is refused (fails on
 *       main: no categoryId column).
 *   D2  a category that needs a receipt refuses submission without one.
 *   D3  limits per claim and per month are flagged at submission, counting
 *       the employee's other live claims in the month; the claim still goes
 *       through (flagged, not blocked).
 *   D4  approval takes the type's tax treatment; another treatment needs a
 *       reason, which is kept.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `wa2t${sfx}`;
const FILER = `wa2f${sfx}`;
const OWNER = `wa2o${sfx}`;
const EMP = `wa2e${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "TENANT_USER", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));

import { POST as create } from "@/app/api/expense-claims/route";
import { POST as submit } from "@/app/api/expense-claims/[id]/submit/route";
import { POST as approve } from "@/app/api/expense-claims/[id]/approve/route";

const json = (url: string, body: unknown) => new NextRequest(url, { method: "POST", body: JSON.stringify(body) });
const file = async (body: Record<string, unknown>) => {
  auth.userId = FILER;
  return create(json("http://localhost/api/expense-claims", { employeeId: EMP, description: "Taxi", amount: "500.00", claimDate: "2026-11-10", ...body }));
};
const doSubmit = (id: string) => { auth.userId = FILER; return submit(new NextRequest(`http://localhost/x/${id}/submit`, { method: "POST" }), { params: Promise.resolve({ id }) }); };
const doApprove = (id: string, body: unknown) => { auth.userId = OWNER; return approve(json(`http://localhost/x/${id}/approve`, body), { params: Promise.resolve({ id }) }); };

describeDb("Wave A2 expense claim lists (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const ids: Record<string, string> = {};
  const item = async (list: string, code: string, name: string, attributes: Record<string, unknown>) => {
    const id = `wa2i${randomBytes(4).toString("hex")}`;
    await q(`INSERT INTO "LookupItem" (id, "tenantId", list, code, name, attributes, "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, now())`, [id, T, list, code, name, JSON.stringify(attributes)]);
    return id;
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala', $2, now())`, [T, `WA2${sfx}`.toUpperCase()]);
    for (const [id, e] of [[FILER, "f"], [OWNER, "o"]]) {
      await q(`INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'A', 'B', now())`, [id, T, `${e}${sfx}@t.test`]);
    }
    await q(`UPDATE "Tenant" SET "ownerUserId" = $2 WHERE id = $1`, [T, OWNER]);
    await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "userId", "updatedAt") VALUES ($1, $2, 'E-1', 'Ana', 'Cruz', '2025-01-06', $3, now())`, [EMP, T, FILER]);
    // The lists, as a company would set them (defaults are not added once a list has items).
    ids.transport = await item("EXPENSE_CATEGORY", "TRANSPORT", "Transportation", { receiptRequired: false, limitPerClaimCents: "100000", limitPerMonthCents: "150000" });
    ids.meals = await item("EXPENSE_CATEGORY", "MEALS", "Meals", { receiptRequired: true });
    ids.reimb = await item("EXPENSE_TYPE", "REIMBURSEMENT", "Reimbursement", { taxTreatment: "NONTAXABLE_REIMBURSEMENT" });
    ids.taxable = await item("EXPENSE_TYPE", "TAXABLE_ALLOWANCE", "Taxable allowance", { taxTreatment: "TAXABLE" });
  });

  afterAll(async () => {
    if (!admin) return;
    await q(`DELETE FROM "ExpenseClaim" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`UPDATE "Tenant" SET "ownerUserId" = NULL WHERE id = $1`, [T]);
    await q(`DELETE FROM "User" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "LookupItem" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 category and type from the lists", async () => {
    const byId = await file({ categoryId: ids.transport });
    expect(byId.status).toBe(201);
    expect((await byId.json()).data).toMatchObject({ categoryId: ids.transport, category: "TRANSPORT", typeId: ids.reimb });
    const byName = await file({ category: "meals", typeId: ids.taxable });
    expect((await byName.json()).data).toMatchObject({ categoryId: ids.meals, category: "MEALS", typeId: ids.taxable });
    const outside = await file({ category: "ENTERTAINMENT" });
    expect(outside.status).toBe(422);
    expect((await outside.json()).error).toContain("Expense Categories");
  });

  it("D2 a receipt where the category needs one", async () => {
    const c = (await (await file({ categoryId: ids.meals })).json()).data;
    const res = await doSubmit(c.id);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain("Meals claims need a receipt");
    expect((await q(`SELECT status FROM "ExpenseClaim" WHERE id = $1`, [c.id])).rows[0].status).toBe("DRAFT");
  });

  it("D3 limits flagged, not blocked", async () => {
    await q(`DELETE FROM "ExpenseClaim" WHERE "tenantId" = $1`, [T]);
    const first = (await (await file({ categoryId: ids.transport, amount: "900.00" })).json()).data;
    const r1 = await doSubmit(first.id);
    expect(r1.status).toBe(200);
    expect((await r1.json()).data.limitFlags).toEqual([]);
    const second = (await (await file({ categoryId: ids.transport, amount: "1200.00", claimDate: "2026-11-25" })).json()).data;
    const r2 = await doSubmit(second.id);
    expect(r2.status).toBe(200);
    const d2 = (await r2.json()).data;
    expect(d2.status).toBe("SUBMITTED");
    expect(d2.limitFlags).toEqual([
      { kind: "PER_CLAIM", limitCents: "100000", amountCents: "120000" },
      { kind: "PER_MONTH", limitCents: "150000", monthTotalCents: "210000", month: "2026-11" },
    ]);
    // Another month does not count.
    const dec = (await (await file({ categoryId: ids.transport, amount: "800.00", claimDate: "2026-12-01" })).json()).data;
    expect((await (await doSubmit(dec.id)).json()).data.limitFlags).toEqual([]);
    // Still approvable.
    const ap = await doApprove(second.id, {});
    expect(ap.status).toBe(200);
    expect((await ap.json()).data.limitFlags).toHaveLength(2);
  });

  it("D4 the type's tax treatment; another needs a reason", async () => {
    const c = (await (await file({ categoryId: ids.transport, amount: "100.00" })).json()).data;
    await doSubmit(c.id);
    const noReason = await doApprove(c.id, { taxTreatment: "TAXABLE" });
    expect(noReason.status).toBe(422);
    expect((await noReason.json()).error).toContain("Give a reason");
    const withReason = await doApprove(c.id, { taxTreatment: "TAXABLE", reason: "Personal trip, not business" });
    expect(withReason.status).toBe(200);
    expect((await withReason.json()).data).toMatchObject({ taxTreatment: "TAXABLE", taxTreatmentReason: "Personal trip, not business" });

    const d = (await (await file({ categoryId: ids.transport, amount: "100.00", typeId: ids.taxable })).json()).data;
    await doSubmit(d.id);
    const plain = await doApprove(d.id, {});
    expect((await plain.json()).data).toMatchObject({ taxTreatment: "TAXABLE", taxTreatmentReason: null });
  });
});
