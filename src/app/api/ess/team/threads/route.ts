/**
 * Wave F2 (PAY-216): Team Discussion in ESS.
 *   GET   the threads the employee is in the audience of
 *   POST  a thread; an employee posts to their own department at most
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { createThread, DiscussionRefusal, listThreads } from "@/lib/team/discussion";

export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  return ok(await withTenant(ctx.tenantId, (tx) => listThreads(tx, ctx.tenantId, { kind: "EMPLOYEE", employeeId: ctx.employeeId })));
}

export async function POST(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const body = await req.json().catch(() => null);
  try {
    return ok(await withTenant(ctx.tenantId, (tx) => createThread(tx, ctx.tenantId, { kind: "EMPLOYEE", employeeId: ctx.employeeId }, body)), "Posted", 201);
  } catch (e) {
    if (e instanceof DiscussionRefusal) return err(e.message, e.status);
    throw e;
  }
}
