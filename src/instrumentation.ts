/**
 * Next.js Instrumentation Hook
 *
 * Runs once when the Node.js server starts.  Bootstraps the pg-boss job queue
 * and registers all background workers.
 *
 * Only runs in the Node.js runtime — not in Edge or during build.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Skip during next build / static generation
  if (process.env.NODE_ENV === "test") return;

  try {
    const { registerWorkers } = await import("./lib/jobs/workers");
    await registerWorkers();
  } catch (err) {
    // Non-fatal: if the DB is unreachable at startup (e.g. cold dev start),
    // jobs won't be processed.  Routes that enqueue jobs will start pg-boss
    // on-demand when the first job is sent.
    console.error("[instrumentation] Failed to register job workers:", err);
  }
}
