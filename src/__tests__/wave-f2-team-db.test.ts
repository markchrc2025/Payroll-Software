/**
 * Wave F2 and F3 (PAY-216) against real Postgres: Team Discussion and
 * Document and Form Sharing.
 *
 *   D1  HR posts for one department; only its employees see it in ESS; an
 *       @mention of someone in the audience is recorded (fails on main: no
 *       route).
 *   D2  an employee's thread is for their own department at most; comments
 *       reach the thread's audience.
 *   D3  HR hides a comment with a reason: employees no longer see it, HR
 *       does, and the hide is audited.
 *   D4  a shared document needing acknowledgement: the tracker shows who has
 *       not; a new version asks everyone again; the file downloads for those
 *       it is shared with only.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `wtt${sfx}`;
const id = (k: string) => `wt${k}${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
const ess = vi.hoisted(() => ({ tenantId: "", employeeId: "" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/ess-auth", () => ({ getEssContext: vi.fn(async () => ess) }));
vi.mock("@/lib/r2", async (orig) => ({ ...(await orig<typeof import("@/lib/r2")>()), isR2Configured: () => false }));

import { GET as hrThreads, POST as hrPost } from "@/app/api/team/threads/route";
import { GET as hrThread } from "@/app/api/team/threads/[id]/route";
import { POST as hide } from "@/app/api/team/hide/route";
import { GET as essThreads, POST as essPost } from "@/app/api/ess/team/threads/route";
import { GET as essThread } from "@/app/api/ess/team/threads/[id]/route";
import { POST as essComment } from "@/app/api/ess/team/threads/[id]/comments/route";
import { POST as share } from "@/app/api/team/documents/route";
import { POST as newVersion } from "@/app/api/team/documents/[id]/versions/route";
import { GET as trackerGet } from "@/app/api/team/documents/[id]/tracker/route";
import { GET as essDocs } from "@/app/api/ess/team/documents/route";
import { POST as ack } from "@/app/api/ess/team/documents/[id]/ack/route";
import { GET as essFile } from "@/app/api/ess/team/documents/[id]/file/route";

const jreq = (body: unknown) => new NextRequest("http://x", { method: "POST", body: JSON.stringify(body) });
const ctx = (v: string) => ({ params: Promise.resolve({ id: v }) });
const as = (e: string) => { ess.employeeId = id(e); };
const data = async (r: Response) => (await r.json()).data;

describeDb("Wave F2 and F3 team (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  let threadId = "", commentId = "", docId = "";

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T; auth.userId = id("u"); ess.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala', $2, now())`, [T, `WT${sfx}`.toUpperCase()]);
    await q(`INSERT INTO "User" (id, "tenantId", email, "passwordHash", "firstName", "lastName", "updatedAt") VALUES ($1, $2, $3, 'x', 'Hana', 'Reyes', now())`, [id("u"), T, `hr${sfx}@t.test`]);
    await q(`INSERT INTO "Department" (id, "tenantId", name, "updatedAt") VALUES ($1, $2, 'Ops', now()), ($3, $2, 'Sales', now())`, [id("ops"), T, id("sales")]);
    for (const [e, num, first, dept] of [["ana", "A-1", "Ana", "ops"], ["ben", "B-1", "Ben", "ops"], ["cara", "C-1", "Cara", "sales"]]) {
      await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "employmentStatus", "departmentId", "updatedAt") VALUES ($1, $2, $3, $4, 'Cruz', '2024-01-08', 'REGULAR', $5, now())`, [id(e), T, num, first, id(dept)]);
    }
  });

  afterAll(async () => {
    if (!admin) return;
    await new Promise((r) => setTimeout(r, 400));
    await q(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, [T]).catch(() => undefined);
    for (const t of ["SharedDocumentAck", "SharedDocumentVersion", "SharedDocument", "DiscussionComment", "DiscussionThread", "Employee", "Department", "User"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 HR posts for a department, with a mention", async () => {
    const r = await hrPost(jreq({ title: "Night shift next week", body: "@Ben Cruz please confirm the roster.", audience: { departmentIds: [id("ops")], branchIds: [] } }));
    expect(r.status).toBe(201);
    threadId = (await data(r)).id;
    as("ben");
    expect((await data(await essThreads(new NextRequest("http://x")))).map((t: { title: string; mentionsMe: boolean }) => [t.title, t.mentionsMe])).toEqual([["Night shift next week", true]]);
    as("cara");
    expect(await data(await essThreads(new NextRequest("http://x")))).toEqual([]);
    expect((await essThread(new NextRequest("http://x"), ctx(threadId))).status).toBe(404);
  });

  it("D2 an employee's thread and comments", async () => {
    as("cara");
    const r = await essPost(jreq({ title: "Sales targets", body: "Thoughts?", audience: { departmentIds: [], branchIds: [] } }));
    const t = await data(r);
    expect(t.audience).toEqual({ departmentIds: [id("sales")], branchIds: [] });
    as("ana");
    const c = await essComment(jreq({ body: "Confirmed for Tuesday." }), ctx(threadId));
    expect(c.status).toBe(201);
    commentId = (await data(c)).id;
    expect((await essComment(jreq({ body: "Hi" }), ctx(t.id))).status).toBe(404);
  });

  it("D3 HR hides a comment", async () => {
    const res = await hide(jreq({ kind: "COMMENT", id: commentId, reason: "Shares a colleague's phone number" }));
    expect(res.status).toBe(200);
    as("ben");
    expect((await data(await essThread(new NextRequest("http://x"), ctx(threadId)))).comments).toEqual([]);
    const hr = await data(await hrThread(new NextRequest("http://x"), ctx(threadId)));
    expect(hr.comments).toEqual([expect.objectContaining({ hidden: true, hiddenReason: "Shares a colleague's phone number" })]);
    expect((await q(`SELECT count(*)::int n FROM "AuditLog" WHERE "tenantId" = $1 AND "entityId" = $2`, [T, commentId])).rows[0].n).toBe(1);
    expect((await data(await hrThreads(new NextRequest("http://x")))).length).toBe(2);
  });

  it("D4 sharing a document with acknowledgement and versions", async () => {
    const fd = new FormData();
    fd.append("file", new File([new TextEncoder().encode("Handbook v1")], "handbook.pdf", { type: "application/pdf" }));
    fd.append("title", "Employee Handbook"); fd.append("requiresAck", "true"); fd.append("departmentIds", id("ops")); fd.append("branchIds", "");
    const r = await share(new NextRequest("http://x", { method: "POST", body: fd }));
    expect(r.status).toBe(201);
    docId = (await data(r)).id;
    as("ana");
    expect((await data(await essDocs(new NextRequest("http://x"))))[0]).toMatchObject({ title: "Employee Handbook", version: 1, requiresAck: true, acknowledged: false });
    expect((await ack(new NextRequest("http://x", { method: "POST" }), ctx(docId))).status).toBe(200);
    const file = await essFile(new NextRequest("http://x"), ctx(docId));
    expect(await file.text()).toBe("Handbook v1");
    const t1 = await data(await trackerGet(new NextRequest("http://x"), ctx(docId)));
    expect(t1.rows.map((x: { employeeNumber: string; acknowledgedAt: string | null }) => [x.employeeNumber, !!x.acknowledgedAt])).toEqual([["A-1", true], ["B-1", false]]);

    const v2 = new FormData();
    v2.append("file", new File([new TextEncoder().encode("Handbook v2")], "handbook.pdf", { type: "application/pdf" }));
    expect((await newVersion(new NextRequest("http://x", { method: "POST", body: v2 }), ctx(docId))).status).toBe(200);
    expect((await data(await essDocs(new NextRequest("http://x"))))[0]).toMatchObject({ version: 2, acknowledged: false });
    expect(await (await essFile(new NextRequest("http://x"), ctx(docId))).text()).toBe("Handbook v2");
    as("cara");
    expect((await essFile(new NextRequest("http://x"), ctx(docId))).status).toBe(404);
  });
});
