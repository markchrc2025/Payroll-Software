/**
 * PAY-192 (found 19 Nov 2026 on staging): a payroll run is created in
 * PROCESSING and computed only by its `payroll.run` job. When that job never
 * reaches the queue (the enqueue is fire-and-forget and fails if pg-boss is
 * not up yet, as right after a deploy) or is lost, the run stayed PROCESSING
 * forever: recompute refuses it, nothing could cancel it, and the period's
 * unique key kept HR from creating another run for that cutoff.
 *
 *   requeueStuckRuns   on worker start and every 10 minutes, every run that
 *                      has been PROCESSING for 10 minutes with no live job
 *                      gets a new job. A job that is still waiting, retrying
 *                      or running is left alone, so a slow compute is never
 *                      doubled.
 *   retryStuckRun      HR's "Retry": the same, for one run, at once.
 *   discardStuckRun    HR's "Discard": deletes a PROCESSING run that has no
 *                      live job, so the cutoff can be run again. A PROCESSING
 *                      run has no sheets (the compute is one transaction).
 */
import type { PrismaClient } from "@prisma/client";

export const STUCK_AFTER_MS = 10 * 60 * 1000;

export type LiveJobCheck = (bookId: string) => Promise<boolean>;
export type Enqueue = (data: { tenantId: string; bookId: string }) => Promise<unknown>;

type BookDb = Pick<PrismaClient, "payrollBook">;

/** Live = waiting, retrying or running. */
export function isLiveState(state: string): boolean {
  return state === "created" || state === "retry" || state === "active";
}

export async function requeueStuckRuns(
  db: BookDb,
  deps: { hasLiveJob: LiveJobCheck; enqueue: Enqueue; now?: Date },
): Promise<{ requeued: string[] }> {
  const now = deps.now ?? new Date();
  const books = await db.payrollBook.findMany({
    where: { status: "PROCESSING", updatedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
    select: { id: true, tenantId: true },
  });
  const requeued: string[] = [];
  for (const b of books) {
    if (await deps.hasLiveJob(b.id)) continue;
    await deps.enqueue({ tenantId: b.tenantId, bookId: b.id });
    requeued.push(b.id);
  }
  return { requeued };
}

export type StuckRunResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_processing" | "still_running"; status?: string };

async function processingWithoutJob(
  db: BookDb,
  tenantId: string,
  bookId: string,
  hasLiveJob: LiveJobCheck,
): Promise<StuckRunResult> {
  const book = await db.payrollBook.findFirst({ where: { id: bookId, tenantId }, select: { status: true } });
  if (!book) return { ok: false, reason: "not_found" };
  if (book.status !== "PROCESSING") return { ok: false, reason: "not_processing", status: book.status };
  if (await hasLiveJob(bookId)) return { ok: false, reason: "still_running" };
  return { ok: true };
}

export async function retryStuckRun(
  db: BookDb,
  tenantId: string,
  bookId: string,
  deps: { hasLiveJob: LiveJobCheck; enqueue: Enqueue },
): Promise<StuckRunResult> {
  const check = await processingWithoutJob(db, tenantId, bookId, deps.hasLiveJob);
  if (!check.ok) return check;
  await deps.enqueue({ tenantId, bookId });
  return { ok: true };
}

export async function discardStuckRun(
  db: BookDb,
  tenantId: string,
  bookId: string,
  deps: { hasLiveJob: LiveJobCheck },
): Promise<StuckRunResult> {
  const check = await processingWithoutJob(db, tenantId, bookId, deps.hasLiveJob);
  if (!check.ok) return check;
  // Re-check the status in the delete itself, so a compute that finished in
  // between is never thrown away.
  const gone = await db.payrollBook.deleteMany({ where: { id: bookId, tenantId, status: "PROCESSING" } });
  if (gone.count !== 1) return { ok: false, reason: "not_processing" };
  return { ok: true };
}

/** User-facing words for a refused retry or discard. */
export function stuckRunMessage(r: Exclude<StuckRunResult, { ok: true }>): { status: number; message: string } {
  if (r.reason === "not_found") return { status: 404, message: "Payroll run not found" };
  if (r.reason === "still_running") {
    return { status: 409, message: "This run is still being computed. Wait for it to finish, then refresh." };
  }
  return { status: 409, message: `This run is ${(r.status ?? "no longer processing").toLowerCase()}, not stuck in processing.` };
}
