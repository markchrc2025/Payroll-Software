/**
 * Unit 0.6 — minimal observability.
 *
 * Today a payroll.run failure produces a console.error in the Sliplane runtime
 * log and a `failed` row in pg-boss's job table, and nothing else. Nobody tails
 * that log at 00:05, so the first notice of a failed payroll run is the customer.
 *
 * These tests hold two properties:
 *   1. money-critical job failures produce an explicit ALERT, not just a log;
 *   2. capture is best-effort — it can never break the business action.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("@/lib/emails/client", () => ({ dispatch: vi.fn(async () => {}) }));

import {
  captureError,
  withJobErrorCapture,
  alertsConfigured,
  __resetAlertThrottle,
  ALERT_THROTTLE_MS,
  type AlertSink,
} from "@/lib/observability";

/**
 * The captured arguments are recorded into a closure rather than read back off
 * `vi.fn().mock.calls`, so the declared parameters are genuinely used and the
 * spies stay typed.
 */
function makeSink() {
  const logged: string[] = [];
  const alerts: Array<{ subject: string; body: string }> = [];
  return {
    logged,
    alerts,
    log: vi.fn((line: string) => {
      logged.push(line);
    }),
    sendAlert: vi.fn(async (subject: string, body: string) => {
      alerts.push({ subject, body });
    }),
  };
}

beforeEach(() => {
  __resetAlertThrottle();
  vi.clearAllMocks();
});

describe("unit 0.6 — money-critical job failures raise an alert (T1)", () => {
  it("T1: a failing payroll.run sends an explicit alert", async () => {
    const sink = makeSink();
    const boom = new Error("gross-to-net blew up");
    const wrapped = withJobErrorCapture(
      "payroll.run",
      async () => {
        throw boom;
      },
      { critical: true },
      sink as unknown as AlertSink,
    );

    await expect(wrapped()).rejects.toThrow("gross-to-net blew up");

    expect(sink.sendAlert).toHaveBeenCalledTimes(1);
    expect(sink.alerts[0].subject).toContain("payroll.run");
    expect(sink.alerts[0].body).toContain("gross-to-net blew up");
  });

  it("T1b: a failing payslip.publish sends an explicit alert", async () => {
    const sink = makeSink();
    const wrapped = withJobErrorCapture(
      "payslip.publish",
      async () => {
        throw new Error("pdf render failed");
      },
      { critical: true },
      sink as unknown as AlertSink,
    );

    await expect(wrapped()).rejects.toThrow("pdf render failed");
    expect(sink.sendAlert).toHaveBeenCalledTimes(1);
    expect(sink.alerts[0].subject).toContain("payslip.publish");
  });

  it("T1c: the error is still rethrown so pg-boss retries", async () => {
    const sink = makeSink();
    const wrapped = withJobErrorCapture(
      "payroll.run",
      async () => {
        throw new Error("transient");
      },
      { critical: true },
      sink as unknown as AlertSink,
    );
    await expect(wrapped()).rejects.toThrow("transient");
  });

  it("a non-critical job failure is logged but does NOT alert", async () => {
    const sink = makeSink();
    const wrapped = withJobErrorCapture(
      "dtr.submitted",
      async () => {
        throw new Error("nope");
      },
      { critical: false },
      sink as unknown as AlertSink,
    );

    await expect(wrapped()).rejects.toThrow("nope");
    expect(sink.log).toHaveBeenCalled();
    expect(sink.sendAlert).not.toHaveBeenCalled();
  });

  it("a successful job neither logs nor alerts", async () => {
    const sink = makeSink();
    const wrapped = withJobErrorCapture("payroll.run", async () => {}, { critical: true }, sink as unknown as AlertSink);
    await wrapped();
    expect(sink.log).not.toHaveBeenCalled();
    expect(sink.sendAlert).not.toHaveBeenCalled();
  });

  it("throttles repeat alerts for the same scope so a storm cannot flood the inbox", async () => {
    const sink = makeSink();
    const wrapped = withJobErrorCapture(
      "payroll.run",
      async () => {
        throw new Error("again");
      },
      { critical: true },
      sink as unknown as AlertSink,
    );

    await expect(wrapped()).rejects.toThrow();
    await expect(wrapped()).rejects.toThrow();
    await expect(wrapped()).rejects.toThrow();

    expect(sink.sendAlert).toHaveBeenCalledTimes(1);
    expect(sink.log).toHaveBeenCalledTimes(3); // every failure is still logged
    expect(ALERT_THROTTLE_MS).toBeGreaterThan(0);
  });
});

describe("unit 0.6 — capture is best-effort (T2)", () => {
  it("T2: the business action still completes when the alert transport throws", async () => {
    const sink: AlertSink = {
      log: vi.fn(),
      sendAlert: vi.fn(async () => {
        throw new Error("resend is down");
      }),
    };

    let ran = false;
    const wrapped = withJobErrorCapture(
      "payroll.run",
      async () => {
        ran = true;
        throw new Error("original failure");
      },
      { critical: true },
      sink,
    );

    // The ORIGINAL error must surface — not "resend is down".
    await expect(wrapped()).rejects.toThrow("original failure");
    expect(ran).toBe(true);
  });

  it("T2b: captureError never rejects, even when the logger itself throws", async () => {
    const sink: AlertSink = {
      log: () => {
        throw new Error("logger exploded");
      },
      sendAlert: async () => {
        throw new Error("transport exploded");
      },
    };
    await expect(
      captureError(new Error("x"), { scope: "job:payroll.run", critical: true }, sink),
    ).resolves.toBeUndefined();
  });

  it("T2c: a succeeding action is untouched when capture would fail", async () => {
    const sink: AlertSink = {
      log: () => {
        throw new Error("logger exploded");
      },
      sendAlert: async () => {
        throw new Error("transport exploded");
      },
    };
    const wrapped = withJobErrorCapture("payroll.run", async () => {}, { critical: true }, sink);
    await expect(wrapped()).resolves.toBeUndefined();
  });
});

describe("unit 0.6 — alert configuration", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env = { ...saved };
  });

  it("reports alerts as unconfigured when ALERT_EMAIL_TO is missing", () => {
    delete process.env.ALERT_EMAIL_TO;
    process.env.RESEND_API_KEY = "re_test";
    expect(alertsConfigured()).toBe(false);
  });

  it("reports alerts as unconfigured when RESEND_API_KEY is missing", () => {
    process.env.ALERT_EMAIL_TO = "ops@example.test";
    delete process.env.RESEND_API_KEY;
    expect(alertsConfigured()).toBe(false);
  });

  it("reports alerts as configured when both are present", () => {
    process.env.ALERT_EMAIL_TO = "ops@example.test";
    process.env.RESEND_API_KEY = "re_test";
    expect(alertsConfigured()).toBe(true);
  });
});
