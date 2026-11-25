/**
 * PAY-73 (Mark, 25 Nov 2026: backups stay on RustFS on the mail server): the
 * daily Backup Check report drives /api/health and an alert email.
 *
 *   T1  the report decides the status: ok, failed, stale backup, stale check,
 *       never (fails on main: no freshnessFromReport).
 *   T2  the watch job emails the details when the backups are not good, and
 *       stays quiet when they are.
 *   T3  the public health body carries the status and ages only, never the
 *       check's row counts or errors.
 *   T4  the watch job is scheduled at 06:00 Manila; the check service restores
 *       with --exit-on-error into a throwaway PostgreSQL 18 and never deletes
 *       from the files copy.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { freshnessFromReport, type BackupCheckReport, type BackupFreshness } from "@/lib/backup-status";

const NOW = Date.parse("2026-11-25T22:00:00Z");
const report = (over: Partial<BackupCheckReport> = {}): BackupCheckReport => ({
  version: 1,
  checkedAt: "2026-11-25T20:30:10Z",
  ok: true,
  backup: { key: "postgres/sentire_payroll/x.sql.gz", sizeBytes: 98000, at: "2026-11-25T18:30:00Z", copies: 14, oldestAt: "2026-11-12T18:30:00Z", totalBytes: 1_300_000 },
  restore: { ok: true, tables: 103, forcedRowSecurityTables: 93, migrations: 137, lastMigration: "20261121002800_bir2316_signatory", rows: { tenants: 3, employees: 40 } },
  files: { ok: true, objects: 12, bytes: 4096, persistent: true },
  errors: [],
  warnings: [],
  ...over,
});

describe("PAY-73 backup check", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/backup-status");
  });

  it("T1 the report decides the status", () => {
    const ok = freshnessFromReport(report(), NOW);
    expect(ok).toMatchObject({ status: "ok", source: "check", ageHours: 3.5, ok: true });
    expect(ok.detail).toContain("103 tables, 137 migrations; 14 copies kept");

    const failed = freshnessFromReport(report({ ok: false, errors: ["pg_restore failed: end of file"] }), NOW);
    expect(failed.status).toBe("failed");
    expect(failed.detail).toContain("pg_restore failed");

    const old = freshnessFromReport(report({ backup: { ...report().backup, at: "2026-11-24T18:00:00Z" } }), NOW);
    expect(old).toMatchObject({ status: "stale", ageHours: 28 });

    const stopped = freshnessFromReport(report({ checkedAt: "2026-11-23T19:00:00Z" }), NOW);
    expect(stopped.status).toBe("stale");
    expect(stopped.detail).toContain("should run daily");

    expect(freshnessFromReport(null, NOW).status).toBe("never");
  });

  it("T2 the watch job emails the details only when the backups are not good", async () => {
    const reads: BackupFreshness[] = [
      freshnessFromReport(report({ ok: false, restore: { ...report().restore, ok: false }, errors: ["pg_restore failed: end of file"], files: { ...report().files, persistent: false } }), NOW),
      freshnessFromReport(report(), NOW),
    ];
    vi.doMock("@/lib/backup-status", async (orig) => ({
      ...(await orig<typeof import("@/lib/backup-status")>()),
      reportConfigured: () => true,
      readBackupFreshness: vi.fn(async () => reads.shift()!),
    }));
    const { handleBackupWatch } = await import("@/lib/jobs/handlers/backup-watch");
    const sent: { subject: string; body: string }[] = [];
    const sink = { log: () => {}, sendAlert: async (subject: string, body: string) => { sent.push({ subject, body }); } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    await handleBackupWatch(sink);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("[Sentire] Payroll backups need attention (failed)");
    expect(sent[0].body).toContain("error:         pg_restore failed: end of file");
    expect(sent[0].body).toContain("restore:       FAILED");
    expect(sent[0].body).toContain("NOT on a volume");

    await handleBackupWatch(sink);
    expect(sent).toHaveLength(1);
  });

  it("T3 the public health body has the status and ages only", async () => {
    const f = freshnessFromReport(report({ ok: false, errors: ["secret detail"] }), NOW);
    vi.doMock("@/lib/backup-status", () => ({ getBackupFreshness: vi.fn(async () => f) }));
    const { GET } = await import("@/app/api/health/route");
    const body = await (await GET()).json();
    expect(body.backup).toEqual({ status: "failed", lastBackupAt: f.lastBackupAt, ageHours: f.ageHours, maxAgeHours: f.maxAgeHours, ok: false });
    const text = JSON.stringify(body);
    expect(text).not.toContain("secret detail");
    expect(text).not.toContain("employees");
    expect(body.warnings.find((w: { name: string }) => w.name === "DATABASE_BACKUP").detail).toBe("The last backup restore check failed.");
  });

  it("T4 the schedule and the check service", () => {
    const workers = readFileSync("src/lib/jobs/workers.ts", "utf8");
    expect(workers).toContain('BACKUP_WATCH: "backup.watch"');
    expect(workers).toContain('boss.schedule(JOB_NAMES.BACKUP_WATCH, "0 22 * * *"');
    const docker = readFileSync("ops/backup-check/Dockerfile", "utf8");
    expect(docker).toMatch(/^FROM postgres:18-/m);
    const check = readFileSync("ops/backup-check/check.sh", "utf8");
    expect(check).toContain("pg_restore --exit-on-error -d restored");
    expect(check).toContain('s3 sync "s3://${FILES_S3_BUCKET}" "$dir"');
    expect(check).not.toMatch(/sync[^\n]*--delete/);
    expect(check).not.toMatch(/\baws\b[^\n]*\brm\b/);
    expect(readFileSync("ops/backup-check/run.sh", "utf8")).toContain('CHECK_AT_UTC:-20:30');
  });
});
