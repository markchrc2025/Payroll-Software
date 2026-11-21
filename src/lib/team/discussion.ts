/**
 * Wave F2 (PAY-216): Team Discussion. Threads for an audience (departments,
 * branches; empty: everyone), with comments and @mentions (@First Last or
 * @employee-number of someone in the audience). Employees see and post in
 * the threads they are in the audience of; HR sees every thread and can hide
 * a thread or a comment with a reason, which is audited and hides it from
 * employees (HR still sees it, marked hidden).
 */
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { asAudience, audienceEmployees, audienceSchema, inAudience, mentionsIn, type Audience } from "./audience";

type Tx = Prisma.TransactionClient;

export class DiscussionRefusal extends Error {
  constructor(message: string, public status: 403 | 404 | 422 = 422) { super(message); }
}

export const threadSchema = z.object({ title: z.string().trim().min(1, "Give the thread a title").max(200), body: z.string().trim().min(1, "Write something").max(10000), audience: audienceSchema });
export const commentSchema = z.object({ body: z.string().trim().min(1, "Write something").max(5000) });

/** Who is posting: an employee in ESS, or HR in the dashboard. */
export type Viewer = { kind: "EMPLOYEE"; employeeId: string } | { kind: "HR"; userId: string; name: string };

async function viewerEmployee(tx: Tx, tenantId: string, v: Viewer) {
  if (v.kind !== "EMPLOYEE") return null;
  const e = await tx.employee.findFirst({ where: { id: v.employeeId, tenantId, deletedAt: null }, select: { id: true, firstName: true, lastName: true, departmentId: true, branchId: true } });
  if (!e) throw new DiscussionRefusal("Employee not found", 404);
  return e;
}

export async function listThreads(tx: Tx, tenantId: string, v: Viewer) {
  const me = await viewerEmployee(tx, tenantId, v);
  const threads = await tx.discussionThread.findMany({
    where: { tenantId, ...(me ? { hiddenAt: null } : {}) },
    include: { _count: { select: { comments: me ? { where: { hiddenAt: null } } : true } } },
    orderBy: { lastActivityAt: "desc" }, take: 200,
  });
  return threads
    .filter((t) => !me || inAudience(asAudience(t.audience), me))
    .map((t) => ({
      id: t.id, title: t.title, authorName: t.authorName, createdAt: t.createdAt, lastActivityAt: t.lastActivityAt, comments: t._count.comments,
      audience: asAudience(t.audience), hidden: !!t.hiddenAt, mentionsMe: !!me && (t.mentions as string[]).includes(me.id),
    }));
}

export async function getThread(tx: Tx, tenantId: string, id: string, v: Viewer) {
  const me = await viewerEmployee(tx, tenantId, v);
  const t = await tx.discussionThread.findFirst({ where: { id, tenantId }, include: { comments: { orderBy: { createdAt: "asc" } } } });
  if (!t || (me && (t.hiddenAt || !inAudience(asAudience(t.audience), me)))) throw new DiscussionRefusal("Thread not found", 404);
  return {
    id: t.id, title: t.title, body: t.body, authorName: t.authorName, createdAt: t.createdAt, audience: asAudience(t.audience),
    hidden: !!t.hiddenAt, hiddenReason: me ? null : t.hiddenReason,
    comments: t.comments.filter((c) => !me || !c.hiddenAt).map((c) => ({ id: c.id, body: c.body, authorName: c.authorName, createdAt: c.createdAt, hidden: !!c.hiddenAt, hiddenReason: me ? null : c.hiddenReason, mentionsMe: !!me && (c.mentions as string[]).includes(me.id) })),
  };
}

async function author(tx: Tx, tenantId: string, v: Viewer) {
  const me = await viewerEmployee(tx, tenantId, v);
  return me
    ? { authorEmployeeId: me.id, authorUserId: null, authorName: `${me.firstName} ${me.lastName}` }
    : { authorEmployeeId: null, authorUserId: (v as { userId: string }).userId, authorName: (v as { name: string }).name };
}

export async function createThread(tx: Tx, tenantId: string, v: Viewer, input: unknown) {
  const r = threadSchema.safeParse(input);
  if (!r.success) throw new DiscussionRefusal(r.error.issues[0]?.message ?? "Check the thread");
  const me = await viewerEmployee(tx, tenantId, v);
  // An employee posts to their own department (everyone when they have none).
  const audience: Audience = me ? { departmentIds: me.departmentId ? [me.departmentId] : [], branchIds: [] } : r.data.audience;
  const people = await audienceEmployees(tx, tenantId, audience);
  return tx.discussionThread.create({ data: { tenantId, title: r.data.title, body: r.data.body, audience, mentions: mentionsIn(r.data.body, people), ...(await author(tx, tenantId, v)) } });
}

export async function addComment(tx: Tx, tenantId: string, threadId: string, v: Viewer, input: unknown) {
  const r = commentSchema.safeParse(input);
  if (!r.success) throw new DiscussionRefusal(r.error.issues[0]?.message ?? "Check the comment");
  await getThread(tx, tenantId, threadId, v); // visibility
  const t = await tx.discussionThread.findUniqueOrThrow({ where: { id: threadId } });
  const people = await audienceEmployees(tx, tenantId, asAudience(t.audience));
  const c = await tx.discussionComment.create({ data: { tenantId, threadId, body: r.data.body, mentions: mentionsIn(r.data.body, people), ...(await author(tx, tenantId, v)) } });
  await tx.discussionThread.update({ where: { id: threadId }, data: { lastActivityAt: c.createdAt } });
  return c;
}

export async function hidePost(tx: Tx, tenantId: string, userId: string, kind: "THREAD" | "COMMENT", id: string, reason: string) {
  if (!reason.trim()) throw new DiscussionRefusal("Give the reason for hiding it");
  const data = { hiddenAt: new Date(), hiddenByUserId: userId, hiddenReason: reason.trim() };
  if (kind === "THREAD") {
    const t = await tx.discussionThread.findFirst({ where: { id, tenantId } });
    if (!t) throw new DiscussionRefusal("Thread not found", 404);
    return tx.discussionThread.update({ where: { id }, data });
  }
  const c = await tx.discussionComment.findFirst({ where: { id, tenantId } });
  if (!c) throw new DiscussionRefusal("Comment not found", 404);
  return tx.discussionComment.update({ where: { id }, data });
}

/** The dashboard user as a discussion viewer, named from their account. */
export async function hrViewer(tx: Tx, userId: string): Promise<Viewer> {
  const u = await tx.user.findFirst({ where: { id: userId }, select: { firstName: true, lastName: true } });
  return { kind: "HR", userId, name: u ? `${u.firstName} ${u.lastName} (HR)` : "HR" };
}
