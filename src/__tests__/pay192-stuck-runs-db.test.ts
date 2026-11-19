/**
 * PAY-192 (found 19 Nov 2026 on staging): a payroll run whose job never
 * reached the queue, or was lost, stayed PROCESSING forever and locked its
 * cutoff.
 *
 *   S1  (T1) the sweep requeues a run PROCESSING for over 10 minutes with no
 *       live job; it leaves a younger run and a run whose job is still live.
 *   S2  Retry (route): computes a stuck run again; refused while its job is
 *       live and for a run that is not PROCESSING.
 *   S3  Discard (route): deletes a stuck run, after which the same cutoff can
 *       be queued again; refused for a draft and while the job is live.
 *   S4  the worker runs the sweep at start and every 10 minutes; the run page
 *       shows Retry and Discard for a run stuck in processing.
 *   S5  a live job is one waiting, retrying or running.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p192t${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: null as string | null }));
const jobs = vi.hoisted(() => ({ live: new Set<string>(), sent: [] as { tenantId: string; bookId: string }[] }));
vi.mock("@/lib/require-permission", () => ({ requirePermission: vi.fn(async () => ({ ctx: auth })) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}) }));
vi.mock("@/lib/jobs/workers", () => ({
  hasLivePayrollJob: vi.fn(async (id: string) => jobs.live.has(id)),
  enqueuePayrollRun: vi.fn(async (d: { tenantId: string; bookId: string }) => { jobs.sent.push(d); }),
}));

import prismaAdmin from "@/lib/prisma-admin";
import { queueRun } from "@/lib/payroll/persist";
import { isLiveState, requeueStuckRuns } from "@/lib/jobs/stuck-runs";
import { POST as retryRoute } from "@/app/api/payroll/runs/[id]/retry/route";
import { POST as discardRoute } from "@/app/api/payroll/runs/[id]/discard/route";

const call = async (route: typeof retryRoute, id: string) => {
  const res = await route(new NextRequest(`http://test.local/api/payroll/runs/${id}/x`, { method: "POST" }), { params: Promise.resolve({ id }) });
  return { status: res.status, body: await res.json() };
};

describeDb("PAY-192 stuck payroll runs (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  const ids: Record<string, string> = {};
  const queue = async (key: string, start: string, end: string, minutesAgo: number) => {
    const book = await queueRun({ tenantId: T, periodStart: new Date(`${start}T00:00:00Z`), periodEnd: new Date(`${end}T00:00:00Z`), cycle: "SEMI_MONTHLY" });
    ids[key] = book.id;
    await q(`UPDATE "PayrollBook" SET "updatedAt" = (now() AT TIME ZONE 'UTC') - make_interval(mins => $2) WHERE id = $1`, [book.id, minutesAgo]);
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T;
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", timezone, "updatedAt") VALUES ($1, $1, $2, 'Asia/Manila', now())`, [T, `P192${sfx}`.toUpperCase()]);
    await queue("stuck", "2026-09-01", "2026-09-15", 30);
    await queue("young", "2026-09-16", "2026-09-30", 2);
    await queue("live", "2026-10-01", "2026-10-15", 30);
    await queue("draft", "2026-10-16", "2026-10-31", 30);
    await q(`UPDATE "PayrollBook" SET status = 'DRAFT' WHERE id = $1`, [ids.draft]);
    jobs.live.add(ids.live);
  });

  beforeEach(() => { jobs.sent = []; });

  afterAll(async () => {
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("S1 (T1) the sweep requeues only a run stuck over 10 minutes with no live job", async () => {
    const { requeued } = await requeueStuckRuns(prismaAdmin, {
      hasLiveJob: async (id) => jobs.live.has(id),
      enqueue: async (d) => { jobs.sent.push(d); },
    });
    const mine = requeued.filter((id) => Object.values(ids).includes(id));
    expect(mine).toEqual([ids.stuck]);
    expect(jobs.sent.filter((d) => d.tenantId === T)).toEqual([{ tenantId: T, bookId: ids.stuck }]);
  });

  it("S2 Retry computes a stuck run again and refuses otherwise", async () => {
    expect((await call(retryRoute, ids.stuck)).status).toBe(200);
    expect(jobs.sent).toEqual([{ tenantId: T, bookId: ids.stuck }]);
    const live = await call(retryRoute, ids.live);
    expect(live.status).toBe(409);
    expect(live.body.error).toMatch(/still being computed/);
    const draft = await call(retryRoute, ids.draft);
    expect(draft.status).toBe(409);
    expect(draft.body.error).toMatch(/draft/);
    expect((await call(retryRoute, "nope")).status).toBe(404);
    expect(jobs.sent.length).toBe(1);
  });

  it("S3 Discard deletes a stuck run so the cutoff can be run again", async () => {
    expect((await call(discardRoute, ids.draft)).status).toBe(409);
    expect((await call(discardRoute, ids.live)).status).toBe(409);
    expect((await call(discardRoute, ids.stuck)).status).toBe(200);
    expect((await q(`SELECT count(*)::int n FROM "PayrollBook" WHERE id = $1`, [ids.stuck])).rows[0].n).toBe(0);
    await expect(queueRun({ tenantId: T, periodStart: new Date("2026-09-01T00:00:00Z"), periodEnd: new Date("2026-09-15T00:00:00Z"), cycle: "SEMI_MONTHLY" })).resolves.toMatchObject({ status: "PROCESSING" });
    expect((await q(`SELECT count(*)::int n FROM "PayrollBook" WHERE id IN ($1, $2)`, [ids.draft, ids.live])).rows[0].n).toBe(2);
  });

  it("S4 the worker sweeps at start and every 10 minutes; the run page offers Retry and Discard", () => {
    const workers = readFileSync("src/lib/jobs/workers.ts", "utf8");
    expect(workers).toMatch(/schedule\(JOB_NAMES\.PAYROLL_STUCK_SWEEP, "\*\/10 \* \* \* \*"/);
    expect(workers).toMatch(/void sweepStuckRuns\(\)/);
    const page = readFileSync("src/app/(dashboard)/payroll/[id]/page.tsx", "utf8");
    expect(page).toMatch(/run\.status === "PROCESSING"[\s\S]*ProcessingRunPanel/);
    const panel = readFileSync("src/components/payroll/ProcessingRunPanel.tsx", "utf8");
    expect(panel).toMatch(/\/retry|\$\{action\}/);
    expect(panel).toMatch(/Yes, discard this run/);
  });

  it("S5 live means waiting, retrying or running", () => {
    expect(["created", "retry", "active"].every(isLiveState)).toBe(true);
    expect(["completed", "failed", "cancelled"].some(isLiveState)).toBe(false);
  });
});
