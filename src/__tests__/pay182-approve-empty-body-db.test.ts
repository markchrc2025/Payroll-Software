/**
 * PAY-182 (found 18 Nov 2026 with PAY-181): the Leave, OT and Undertime
 * Approve buttons post with no body. The routes parsed that as null against a
 * schema that only accepts undefined, so they threw (500) before looking at
 * the request.
 *
 *   B1  (T1) each approve route accepts an empty body: it goes on to look up
 *       the request (404 for an id that does not exist) instead of throwing.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const T = `p182t${randomBytes(4).toString("hex")}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "p182-hr", systemRole: "TENANT_USER", roleId: "r" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/require-permission", () => ({
  requirePermission: vi.fn(async () => ({ ctx: auth })),
  checkPermission: vi.fn(async () => true),
}));
vi.mock("@/lib/approvals/second-party", async (orig) => ({
  ...(await orig<typeof import("@/lib/approvals/second-party")>()),
  requireApprover: vi.fn(async () => ({ ctx: auth })),
}));

import { POST as leave } from "@/app/api/leave-transactions/[id]/approve/route";
import { POST as ot } from "@/app/api/ot-applications/[id]/approve/route";
import { POST as ut } from "@/app/api/undertime-requests/[id]/approve/route";

describeDb("PAY-182 approve routes accept the empty body the buttons send", () => {
  auth.tenantId = T;
  const cases = [
    ["leave-transactions", leave],
    ["ot-applications", ot],
    ["undertime-requests", ut],
  ] as const;
  for (const [name, route] of cases) {
    it(`B1 (T1) ${name}: an empty body is read as no note`, async () => {
      const res = await route(new NextRequest(`http://test.local/api/${name}/nope/approve`, { method: "POST" }), {
        params: Promise.resolve({ id: "nope" }),
      });
      expect(res.status).toBe(404);
    });
  }
});
