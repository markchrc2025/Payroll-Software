/**
 * Worker-registration retry (unit 0.5).
 *
 * src/instrumentation.ts fires worker registration into the background rather
 * than awaiting it — deliberately, and correctly: during a zero-downtime
 * redeploy the OLD container still holds DB connections, so the new container's
 * `boss.start()` can hit "timeout exceeded when trying to connect". Awaiting it
 * would stall `register()`, the healthcheck would never pass, and the deploy
 * would roll back.
 *
 * The gap this closes is that the background call ran exactly ONCE. On failure it
 * logged and gave up, leaving the container with no workers for its entire life —
 * and the recovery the old comment promised does not exist: the enqueue helpers
 * call startJobQueue(), which starts pg-boss but never re-runs registerWorkers(),
 * so no boss.work() handler is ever attached. Jobs would be accepted into the
 * queue and never consumed, which is silent and worse than a crash.
 *
 * Backoff is increasing, not fixed: the failure this recovers from is contention
 * with a container that is on its way out, so retrying harder makes it worse.
 */

/** Delays between attempts. Total patience ≈ 1m51s over 6 attempts. */
export const REGISTRATION_RETRY_DELAYS_MS = [1_000, 5_000, 15_000, 30_000, 60_000];

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface RetryOptions {
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string, err?: unknown) => void;
}

/**
 * Run `register` until it succeeds or the backoff schedule is exhausted.
 *
 * Never throws — boot must not break because the queue is unavailable. Returns
 * true if registration succeeded, false if it was given up on.
 */
export async function registerWorkersWithRetry(
  register: () => Promise<void>,
  opts: RetryOptions = {},
): Promise<boolean> {
  const sleep = opts.sleep ?? defaultSleep;
  const log =
    opts.log ??
    ((message: string, err?: unknown) => {
      if (err === undefined) console.log(message);
      else console.error(message, err);
    });

  const attempts = REGISTRATION_RETRY_DELAYS_MS.length + 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await register();
      if (attempt > 1) {
        log(`[pg-boss] Workers registered on attempt ${attempt}/${attempts}.`);
      }
      return true;
    } catch (err) {
      const delay = REGISTRATION_RETRY_DELAYS_MS[attempt - 1];
      if (delay === undefined) {
        log(
          `[pg-boss] Worker registration FAILED after ${attempts} attempts — ` +
            "this container will not process background jobs (payroll, payslips, " +
            "crons). Redeploy once the database is reachable.",
          err,
        );
        return false;
      }
      log(
        `[pg-boss] Worker registration attempt ${attempt}/${attempts} failed; ` +
          `retrying in ${delay}ms.`,
        err,
      );
      try {
        await sleep(delay);
      } catch {
        // A failing sleep must not abort the retry loop.
      }
    }
  }

  return false;
}
