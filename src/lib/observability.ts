/**
 * Minimal error capture (unit 0.6).
 *
 * Today a payroll.run failure produces a console.error line in the Sliplane
 * runtime log and a `failed` row in pg-boss's job table — and nothing else. No
 * email, no alert, no dashboard. You would learn a payroll run had failed from
 * the customer.
 *
 * This module is the single place errors are reported from, so the transport can
 * change later (Sentry, a webhook) without touching 94 route files and 7 job
 * handlers.
 *
 * NON-NEGOTIABLE: capture is best-effort. Observability must never break a
 * business action, so every path here is wrapped and nothing escapes. A payroll
 * run must not fail because an alert email bounced.
 */

import { dispatch } from "@/lib/emails/client";

export interface CaptureContext {
  /** Where it happened: "job:payroll.run", "route", … */
  scope: string;
  /** Money-critical — warrants an explicit alert, not just a log line. */
  critical?: boolean;
  [key: string]: unknown;
}

export interface AlertSink {
  log(line: string): void;
  sendAlert(subject: string, body: string): Promise<void>;
}

/** Minimum gap between alerts for the same scope, so a storm cannot flood an inbox. */
export const ALERT_THROTTLE_MS = 15 * 60 * 1000;
const lastAlertAt = new Map<string, number>();

/** Exposed for tests — the throttle is process-local state. */
export function __resetAlertThrottle(): void {
  lastAlertAt.clear();
}

export function alertsConfigured(): boolean {
  return Boolean(process.env.ALERT_EMAIL_TO && process.env.RESEND_API_KEY);
}

function errorSummary(err: unknown): { message: string; stack: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack ?? "(no stack)" };
  }
  return { message: String(err), stack: "(not an Error)" };
}

export const defaultSink: AlertSink = {
  log(line) {
    console.error(line);
  },
  async sendAlert(subject, body) {
    const to = process.env.ALERT_EMAIL_TO;
    if (!to) return;
    await dispatch({
      to,
      subject,
      html: `<pre style="font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap">${body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</pre>`,
    });
  },
};

/**
 * Report an error. Never throws, never rejects — callers may ignore the promise.
 */
export async function captureError(
  err: unknown,
  ctx: CaptureContext,
  sink: AlertSink = defaultSink,
): Promise<void> {
  try {
    const { message, stack } = errorSummary(err);
    const { scope, critical, ...rest } = ctx;

    try {
      sink.log(
        JSON.stringify({
          level: critical ? "critical" : "error",
          scope,
          message,
          ...rest,
        }),
      );
    } catch {
      // A failing logger must not stop the alert below.
    }

    // Money-critical failures get an explicit alert. A log line is not a
    // notification: nobody is tailing the runtime log at 00:05, which is exactly
    // when the payroll and payslip jobs run.
    if (!critical) return;

    const now = Date.now();
    const last = lastAlertAt.get(scope) ?? 0;
    if (now - last < ALERT_THROTTLE_MS) return; // storm guard; the log above still records every failure
    lastAlertAt.set(scope, now);

    try {
      await sink.sendAlert(
        `[Sentire] ${scope} failed`,
        [
          `scope:   ${scope}`,
          `message: ${message}`,
          ...Object.entries(rest).map(([k, v]) => `${k}: ${String(v)}`),
          "",
          stack,
        ].join("\n"),
      );
    } catch {
      // The alert transport is allowed to fail. The business action must not.
    }
  } catch {
    // Absolute backstop: capture itself is never allowed to throw.
  }
}

/**
 * Wrap a job handler so failures are reported, then rethrown so pg-boss still
 * retries. Swallowing here would trade a loud failure for a silent one.
 */
export function withJobErrorCapture<A extends unknown[]>(
  name: string,
  fn: (...args: A) => Promise<void>,
  opts: { critical?: boolean } = {},
  sink: AlertSink = defaultSink,
): (...args: A) => Promise<void> {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (err) {
      await captureError(err, { scope: `job:${name}`, critical: opts.critical }, sink);
      throw err;
    }
  };
}
