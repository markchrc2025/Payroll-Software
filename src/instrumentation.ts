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

  // Preflight: surface missing/invalid critical env vars (e.g. ENCRYPTION_KEY)
  // at boot in the logs, instead of as a mystery 500 on first use.
  try {
    const { logEnvCheck } = await import("./lib/env-check");
    logEnvCheck();
  } catch {
    // never block startup on the check itself
  }

  // IMPORTANT: do NOT `await` worker registration here.
  //
  // Next's `register()` "must complete before the server is ready to handle
  // requests" (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
  // registerWorkers() calls pg-boss `boss.start()`, which opens a DB
  // connection. During a zero-downtime redeploy the OLD container is still
  // running and holding DB connections, so the NEW container's pg-boss can
  // block/timeout trying to connect ("timeout exceeded when trying to
  // connect"). If we awaited that here, `register()` would stall and the new
  // container would never become ready to serve requests — so the platform
  // healthcheck on /api/health never passes and the deploy is rolled back.
  //
  // Firing registration off in the background lets the HTTP server (and the
  // healthcheck) come up immediately, and it is RETRIED with backoff (unit 0.5)
  // so a connection that is merely slow — rather than broken — still ends with
  // workers attached.
  //
  // Retrying matters because there is no other recovery. An earlier version of
  // this comment claimed "any jobs enqueued in the meantime start pg-boss
  // on-demand via the enqueue helpers", which is only half true: the enqueue
  // helpers call startJobQueue(), which starts pg-boss but never re-runs
  // registerWorkers(). No boss.work() handler would be attached, so jobs would
  // be accepted into the queue and silently never consumed.
  void registerWorkersInBackground();
}

async function registerWorkersInBackground(): Promise<void> {
  try {
    const { registerWorkers } = await import("./lib/jobs/workers");
    const { registerWorkersWithRetry } = await import("./lib/jobs/retry");
    await registerWorkersWithRetry(() => registerWorkers());
  } catch (err) {
    // Backstop only — registerWorkersWithRetry already swallows registration
    // failures. This catches a failure to even load the modules.
    console.error("[instrumentation] Failed to register job workers:", err);
  }
}
