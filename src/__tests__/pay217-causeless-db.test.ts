/**
 * PAY-217 Causeless (Mark, 21 Nov 2026 22:25: a note and an attachment)
 * against real Postgres.
 *   D1  a note with a file is saved, listed and its file downloads as sent;
 *       a note without a file is saved too (fails on main: no route).
 *   D2  no note text is refused; an employee of another company is refused;
 *       a removed note leaves the list.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `pcl${sfx}`;
const T2 = `pco${sfx}`;
const EMP = `pce${sfx}`;
const FOREIGN = `pcf${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: null as string | null, systemRole: "SUPER_ADMIN", roleId: null as string | null }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));

import { GET as list, POST as add } from "@/app/api/incidents/causeless/route";
import { DELETE as remove } from "@/app/api/incidents/causeless/[id]/route";
import { GET as file } from "@/app/api/incidents/causeless/[id]/file/route";

const post = (fields: Record<string, string>, f?: File) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  if (f) fd.set("file", f);
  return add(new NextRequest("http://x/api/incidents/causeless", { method: "POST", body: fd }));
};
const p = (id: string) => ({ params: Promise.resolve({ id }) });

describeDb("PAY-217 Causeless (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    for (const [id, c] of [[T, "A"], [T2, "B"]]) await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala', $2, now())`, [id, `PCL${c}${sfx}`.toUpperCase()]);
    await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt") VALUES ($1, $2, 'E-1', 'Ana', 'Cruz', '2025-01-06', now())`, [EMP, T]);
    await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt") VALUES ($1, $2, 'E-1', 'Ben', 'Sy', '2025-01-06', now())`, [FOREIGN, T2]);
  });

  afterAll(async () => {
    if (!admin) return;
    await new Promise((r) => setTimeout(r, 500));
    for (const t of ["CauselessNote", "AuditLog", "Employee"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1)`, [[T, T2]]).catch(() => undefined);
    await q(`DELETE FROM "Tenant" WHERE id = ANY($1)`, [[T, T2]]);
    await admin.end();
  });

  it("D1 a note with and without a file", async () => {
    const res = await post({ employeeId: EMP, noteDate: "2026-11-20", note: "Came in without ID; reminded." }, new File([new Uint8Array([1, 2, 3])], "memo.pdf", { type: "application/pdf" }));
    expect(res.status).toBe(201);
    const id = (await res.json()).data.id;
    expect((await post({ employeeId: EMP, noteDate: "2026-11-21", note: "Thanked for covering a shift." })).status).toBe(201);
    const rows = (await (await list(new NextRequest(`http://x/api/incidents/causeless?employeeId=${EMP}`))).json()).data;
    expect(rows.map((r: { noteDate: string; fileName: string | null }) => [r.noteDate, r.fileName])).toEqual([["2026-11-21", null], ["2026-11-20", "memo.pdf"]]);
    const f = await file(new NextRequest(`http://x/f`), p(id));
    expect(f.headers.get("content-type")).toBe("application/pdf");
    expect([...new Uint8Array(await f.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it("D2 refusals and removal", async () => {
    expect((await post({ employeeId: EMP, noteDate: "2026-11-20", note: " " })).status).toBe(422);
    expect((await post({ employeeId: FOREIGN, noteDate: "2026-11-20", note: "Not ours" })).status).toBe(404);
    const id = (await (await post({ employeeId: EMP, noteDate: "2026-11-19", note: "Wrong employee" })).json()).data.id;
    expect((await remove(new NextRequest("http://x", { method: "DELETE" }), p(id))).status).toBe(200);
    const rows = (await (await list(new NextRequest(`http://x/api/incidents/causeless`))).json()).data;
    expect(rows.some((r: { id: string }) => r.id === id)).toBe(false);
  });
});
