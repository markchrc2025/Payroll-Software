/**
 * PAY-190 (found 18 Nov 2026 in the ESS sandbox test): the ESS expense claim
 * form told the employee to attach official receipts but had no way to.
 *
 *   R1  (T1) an employee uploads a receipt in ESS; it is stored under their
 *       company's receipts folder and the key comes back.
 *   R2  a claim may only carry a receipt key of the employee's own company:
 *       another company's key or a path trick is refused (422).
 *   R3  the employee opens the receipt of their own claim, never another's.
 *   R4  HR: a PAYROLL reader opens any claim's receipt; anyone else only
 *       their own.
 *   R5  a wrong file type is refused; no storage configured answers 503.
 *   R6  the ESS form sends the file and the receipt key; ESS and HR lists show
 *       a link to the receipt.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p190t${sfx}`;
const A = `p190a${sfx}`;
const B = `p190b${sfx}`;

const ess = vi.hoisted(() => ({ tenantId: "", employeeId: "", userId: null as string | null }));
const hr = vi.hoisted(() => ({ auth: { tenantId: "", userId: "u" } as Record<string, unknown>, seeAll: true, me: null as string | null }));
const store = vi.hoisted(() => ({ configured: true, puts: [] as { key: string; type: string }[] }));
vi.mock("@/lib/ess-auth", () => ({ getEssContext: vi.fn(async () => ess) }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => hr.auth) }));
vi.mock("@/lib/approvals/second-party", () => ({
  maySeeAllRecords: vi.fn(async () => hr.seeAll),
  callerEmployeeId: vi.fn(async () => hr.me),
  FILE_IN_ESS: "File it in ESS",
}));
vi.mock("@/lib/r2", () => ({
  isR2Configured: () => store.configured,
  putObject: vi.fn(async (key: string, _b: Buffer, type: string) => { store.puts.push({ key, type }); }),
  r2: () => ({}),
  R2_BUCKET: "bucket",
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async (_c: unknown, cmd: { input: { Key: string } }) => `https://storage.test/${cmd.input.Key}?sig=1`),
}));

import { POST as essUpload } from "@/app/api/ess/expense-claims/upload/route";
import { POST as essCreate } from "@/app/api/ess/expense-claims/route";
import { GET as essReceipt } from "@/app/api/ess/expense-claims/[id]/receipt/route";
import { GET as hrReceipt } from "@/app/api/expense-claims/[id]/receipt/route";
import { isTenantReceiptKey } from "@/lib/expense-receipts";

const upload = (type: string, name = "or.jpg") => {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array([1, 2, 3])], name, { type }));
  return essUpload(new NextRequest("http://test.local/api/ess/expense-claims/upload", { method: "POST", body: fd }));
};
const create = (receiptKey?: string) =>
  essCreate(new NextRequest("http://test.local/api/ess/expense-claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ category: "TRANSPORTATION", description: "Grab", amountCents: 35000, claimDate: "2026-11-18", ...(receiptKey ? { receiptKey } : {}) }),
  }));
const view = (route: typeof essReceipt, id: string) =>
  route(new NextRequest(`http://test.local/x/${id}/receipt`), { params: Promise.resolve({ id }) });

describeDb("PAY-190 receipts on expense claims (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  let keyA = "";
  let claimA = "";

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    ess.tenantId = T;
    hr.auth = { tenantId: T, userId: "u" };
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", timezone, "updatedAt") VALUES ($1, $1, $2, 'Asia/Manila', now())`, [T, `P190${sfx}`.toUpperCase()]);
    for (const [id, n] of [[A, "1"], [B, "2"]])
      await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt") VALUES ($1, $2, $3, 'R', 'Test', '2025-01-06', now())`, [id, T, `P190-${sfx}-${n}`]);
  });

  beforeEach(() => {
    store.configured = true;
    store.puts = [];
    ess.employeeId = A;
    hr.seeAll = true;
    hr.me = null;
  });

  afterAll(async () => {
    await q(`DELETE FROM "ExpenseClaim" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Employee" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("R1 (T1) uploads a receipt in ESS under the company's receipts folder", async () => {
    const res = await upload("image/jpeg");
    expect(res.status).toBe(200);
    keyA = (await res.json()).data.storageKey;
    expect(keyA).toMatch(new RegExp(`^tenants/${T}/receipts/[0-9a-f-]+\\.jpg$`));
    expect(store.puts).toEqual([{ key: keyA, type: "image/jpeg" }]);
  });

  it("R2 a claim carries only a receipt of its own company", async () => {
    for (const bad of [`tenants/other/receipts/${"a".repeat(8)}.jpg`, `tenants/${T}/receipts/../selfies/x.jpg`, `tenants/${T}/selfies/x.jpg`]) {
      const r = await create(bad);
      expect(r.status, bad).toBe(422);
    }
    const ok = await create(keyA);
    expect(ok.status).toBe(201);
    claimA = (await ok.json()).data.id;
    expect((await q(`SELECT "receiptKey" FROM "ExpenseClaim" WHERE id = $1`, [claimA])).rows[0].receiptKey).toBe(keyA);
    expect(isTenantReceiptKey(T, keyA)).toBe(true);
  });

  it("R3 the employee opens their own receipt, never another's", async () => {
    const own = await view(essReceipt, claimA);
    expect(own.status).toBe(200);
    expect((await own.json()).data.url).toContain(keyA);
    ess.employeeId = B;
    expect((await view(essReceipt, claimA)).status).toBe(404);
  });

  it("R4 HR: a payroll reader opens any receipt; anyone else only their own", async () => {
    expect((await view(hrReceipt, claimA)).status).toBe(200);
    hr.seeAll = false;
    hr.me = B;
    expect((await view(hrReceipt, claimA)).status).toBe(404);
    hr.me = A;
    expect((await view(hrReceipt, claimA)).status).toBe(200);
  });

  it("R5 a wrong file type is refused; no storage answers 503", async () => {
    expect((await upload("text/html", "x.html")).status).toBe(400);
    store.configured = false;
    expect((await upload("image/png", "or.png")).status).toBe(503);
    expect(store.puts).toEqual([]);
  });

  it("R6 the ESS form sends the receipt; ESS and HR lists link to it", () => {
    const essPage = readFileSync("src/app/(ess)/ess/expense-claims/page.tsx", "utf8");
    expect(essPage).toMatch(/type="file"/);
    expect(essPage).toMatch(/\/api\/ess\/expense-claims\/upload/);
    expect(essPage).toMatch(/receiptKey \? \{ receiptKey \}/);
    expect(essPage).toMatch(/\/api\/ess\/expense-claims\/\$\{id\}\/receipt/);
    const hrPage = readFileSync("src/app/(dashboard)/expense-claims/page.tsx", "utf8");
    expect(hrPage).toMatch(/\/api\/expense-claims\/\$\{id\}\/receipt/);
  });
});
