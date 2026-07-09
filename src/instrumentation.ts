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
  // healthcheck) come up immediately. pg-boss connects on its own once the old
  // container tears down and frees connections; any jobs enqueued in the
  // meantime start pg-boss on-demand via the enqueue helpers.
  void registerWorkersInBackground();
}

async function registerWorkersInBackground(): Promise<void> {
  try {
    const { registerWorkers } = await import("./lib/jobs/workers");
    await registerWorkers();
  } catch (err) {
    // Non-fatal: if the DB is unreachable at startup (e.g. cold dev start or a
    // redeploy overlap), jobs won't be processed yet.  Routes that enqueue jobs
    // will start pg-boss on-demand when the first job is sent.
    console.error("[instrumentation] Failed to register job workers:", err);
  }
}
