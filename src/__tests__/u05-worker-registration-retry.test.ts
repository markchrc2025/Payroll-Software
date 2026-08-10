/**
 * Unit 0.5 — worker registration must survive a slow database at boot.
 *
 * src/instrumentation.ts deliberately does NOT await worker registration: during
 * a zero-downtime redeploy the OLD container still holds DB connections, so the
 * new container's pg-boss can hit "timeout exceeded when trying to connect". If
 * that were awaited, the new container would never become ready and the deploy
 * would roll back. Firing it into the background is correct.
 *
 * What is NOT correct is that the background call runs ONCE. On failure it logs
 * and gives up, so workers are absent for the whole life of that container.
 *
 * The recovery the code comment claims — "any jobs enqueued in the meantime
 * start pg-boss on-demand via the enqueue helpers" — starts pg-boss but never
 * calls registerWorkers(), so boss.work() handlers are still not attached: jobs
 * are accepted into the queue and never consumed.
 *
 * These tests drive the real exported retry wrapper.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

import { registerWorkersWithRetry, REGISTRATION_RETRY_DELAYS_MS } from "@/lib/jobs/retry";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("unit 0.5 — registration retries a slow database (T4)", () => {
  it("T4: registers on a later attempt when the first connection fails", async () => {
    let attempts = 0;
    const register = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("timeout exceeded when trying to connect");
    });

    const ok = await registerWorkersWithRetry(register, { sleep: async () => {} });

    expect(ok).toBe(true);
    expect(attempts).toBe(3);
  });

  it("T4b: succeeds first time without sleeping when the DB is available", async () => {
    const register = vi.fn(async () => {});
    const sleep = vi.fn(async () => {});

    const ok = await registerWorkersWithRetry(register, { sleep });

    expect(ok).toBe(true);
    expect(register).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("T4c: backs off between attempts rather than hammering the database", async () => {
    const waits: number[] = [];
    const register = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    await registerWorkersWithRetry(register, {
      sleep: async (ms) => {
        waits.push(ms);
      },
    });

    expect(waits.length).toBeGreaterThan(0);
    // Strictly increasing — a fixed-interval retry would just hammer a DB that
    // is busy precisely because the old container has not released connections.
    for (let i = 1; i < waits.length; i += 1) {
      expect(waits[i]).toBeGreaterThan(waits[i - 1]);
    }
    expect(waits).toEqual(REGISTRATION_RETRY_DELAYS_MS.slice(0, waits.length));
  });

  it("T4d: gives up after the configured attempts and reports failure, never throws", async () => {
    const register = vi.fn(async () => {
      throw new Error("still down");
    });

    const ok = await registerWorkersWithRetry(register, { sleep: async () => {} });

    expect(ok).toBe(false);
    expect(register).toHaveBeenCalledTimes(REGISTRATION_RETRY_DELAYS_MS.length + 1);
  });

  it("T4e: a registration failure never escapes to the caller (boot must not break)", async () => {
    const register = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(
      registerWorkersWithRetry(register, { sleep: async () => {} }),
    ).resolves.toBe(false);
  });

  it("T4f: stops retrying as soon as one attempt succeeds", async () => {
    let attempts = 0;
    const register = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("first fails");
    });

    await registerWorkersWithRetry(register, { sleep: async () => {} });

    expect(register).toHaveBeenCalledTimes(2);
  });
});
