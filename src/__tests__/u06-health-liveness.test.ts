/**
 * Unit 0.6 — /api/health must remain an always-200, DB-free liveness probe.
 *
 * This property is load-bearing for deploys: unit 0.2's migrate-then-serve start
 * script only keeps the previous container serving because the platform's
 * healthcheck reflects "is the server up?" rather than "is every dependency
 * perfect?". Any new field added to this endpoint has to be cached,
 * try/catch-guarded and incapable of flipping it off 200 — otherwise a DB blip
 * rolls back a healthy deploy.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

// The DB is unreachable: backup freshness rejects outright. The route is
// expected to absorb this and still answer 200.
vi.mock("@/lib/backup-status", () => ({
  getBackupFreshness: vi.fn(async () => {
    throw new Error("ECONNREFUSED: database unreachable");
  }),
}));

vi.mock("@/lib/emails/client", () => ({ dispatch: vi.fn(async () => {}) }));

import { GET } from "@/app/api/health/route";
import { getBackupFreshness } from "@/lib/backup-status";

const saved = { ...process.env };
beforeEach(() => {
  process.env = { ...saved };
  vi.clearAllMocks();
});

describe("unit 0.6 — /api/health liveness (T3)", () => {
  it("T3: returns 200 even when the database is unreachable", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("T3b: still returns 200 when every critical env var is missing", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_DATABASE_URL;
    delete process.env.ENCRYPTION_KEY;
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    // Problems are reported in the body, never as a non-200.
    expect(body.status).toBe("degraded");
    expect(Array.isArray(body.problems)).toBe(true);
  });

  it("T3c: the new alerts field is present and never throws the route", async () => {
    process.env.ALERT_EMAIL_TO = "ops@example.test";
    process.env.RESEND_API_KEY = "re_test";
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alerts).toBe(true);
  });

  it("T3d: alerts reports false when unconfigured, without failing the probe", async () => {
    delete process.env.ALERT_EMAIL_TO;
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alerts).toBe(false);
  });

  it("T3e: a missing ALERT_EMAIL_TO is a WARNING, never a critical problem", async () => {
    delete process.env.ALERT_EMAIL_TO;
    process.env.DATABASE_URL = "postgresql://u:p@h:5432/db";
    process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    const res = await GET();
    const body = await res.json();

    const warnNames = (body.warnings ?? []).map((w: { name: string }) => w.name);
    const problemNames = (body.problems ?? []).map((p: { name: string }) => p.name);
    expect(warnNames).toContain("ALERT_EMAIL_TO");
    expect(problemNames).not.toContain("ALERT_EMAIL_TO");
    expect(body.status).toBe("ok"); // warnings must not degrade status
  });

  it("T3f: backup freshness genuinely threw — the route absorbed it", async () => {
    await GET();
    expect(getBackupFreshness).toHaveBeenCalled();
    await expect(
      (getBackupFreshness as unknown as () => Promise<unknown>)(),
    ).rejects.toThrow("database unreachable");
  });
});
