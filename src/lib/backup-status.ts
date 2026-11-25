/**
 * "Are the database backups working?" for /api/health and the daily backup
 * watch job.
 *
 * PAY-73 (Mark, 25 Nov 2026: backups stay on RustFS on the mail server): the
 * Backup Check service (ops/backup-check) restores the newest Dokploy backup
 * into a throwaway database every day, copies the uploaded files to the app
 * server and writes a report, latest.json, into its own bucket. The app reads
 * only that report, with a read-only key to that bucket
 * (BACKUP_REPORT_S3_*); it holds no key to the backups themselves.
 *
 * Without that key the old signal stays: the newest successful BackupRun row
 * (written by the retired GitHub backup workflow).
 *
 * HARD RULE: this must never be able to break /api/health liveness. Every read
 * is cached for 60s, bounded by a timeout, and any failure resolves to status
 * "unknown" instead of throwing.
 */

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import prismaAdmin from "@/lib/prisma-admin";

export type BackupStatus = "ok" | "stale" | "failed" | "never" | "unknown";

/** The Backup Check report (ops/backup-check/check.sh, version 1). */
export interface BackupCheckReport {
  version: number;
  checkedAt: string;
  ok: boolean;
  seconds?: number;
  backup: { key: string; sizeBytes: number; at: string | null; copies: number; oldestAt: string | null; totalBytes: number };
  restore: {
    ok: boolean;
    tables: number;
    forcedRowSecurityTables: number;
    migrations: number;
    lastMigration: string;
    rows: Record<string, number>;
  };
  files: { ok: boolean; objects: number; bytes: number; persistent: boolean };
  errors: string[];
  warnings: string[];
}

export interface BackupFreshness {
  /** ok = fresh and restore-tested; stale = too old (or the check stopped running); failed = the last check failed; never = nothing recorded yet; unknown = couldn't check. */
  status: BackupStatus;
  lastBackupAt: string | null;
  ageHours: number | null;
  maxAgeHours: number;
  ok: boolean | null;
  /** Where the answer came from. */
  source?: "check" | "heartbeat";
  /** One line for a person: what is wrong, or what was proven. */
  detail?: string;
  check?: {
    checkedAt: string;
    checkAgeHours: number;
    copies: number;
    oldestAt: string | null;
    restore: BackupCheckReport["restore"];
    files: BackupCheckReport["files"];
    errors: string[];
    warnings: string[];
  };
}

function maxAgeHours(): number {
  const n = Number(process.env.BACKUP_MAX_AGE_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 26;
}
/** The check runs daily; older than this means it has stopped. */
export const MAX_CHECK_AGE_HOURS = 50;

const CACHE_TTL_MS = 60_000;
const READ_TIMEOUT_MS = 800;
const REPORT_TIMEOUT_MS = 2_500;

let cache: { at: number; value: BackupFreshness } | null = null;
export function __resetBackupCache(): void {
  cache = null;
}

const hours = (fromIso: string, now: number) => Math.round(((now - new Date(fromIso).getTime()) / 3_600_000) * 10) / 10;

export function reportConfigured(): boolean {
  const e = process.env;
  return Boolean(e.BACKUP_REPORT_S3_ENDPOINT && e.BACKUP_REPORT_S3_BUCKET && e.BACKUP_REPORT_S3_ACCESS_KEY_ID && e.BACKUP_REPORT_S3_SECRET_ACCESS_KEY);
}

let reportClient: S3Client | null = null;
async function fetchReport(): Promise<BackupCheckReport | null> {
  const e = process.env;
  reportClient ??= new S3Client({
    region: e.BACKUP_REPORT_S3_REGION ?? "us-east-1",
    endpoint: e.BACKUP_REPORT_S3_ENDPOINT,
    forcePathStyle: (e.BACKUP_REPORT_S3_FORCE_PATH_STYLE ?? "true") === "true",
    credentials: { accessKeyId: e.BACKUP_REPORT_S3_ACCESS_KEY_ID!, secretAccessKey: e.BACKUP_REPORT_S3_SECRET_ACCESS_KEY! },
  });
  try {
    const res = await reportClient.send(new GetObjectCommand({ Bucket: e.BACKUP_REPORT_S3_BUCKET, Key: "latest.json" }));
    const text = await res.Body?.transformToString();
    return text ? (JSON.parse(text) as BackupCheckReport) : null;
  } catch (err) {
    const name = (err as { name?: string; Code?: string })?.name ?? (err as { Code?: string })?.Code;
    if (name === "NoSuchKey" || name === "NotFound") return null;
    throw err;
  }
}

/** Pure: turn a report into a status. Exported for tests. */
export function freshnessFromReport(r: BackupCheckReport | null, now = Date.now()): BackupFreshness {
  const threshold = maxAgeHours();
  if (!r) {
    return { status: "never", source: "check", lastBackupAt: null, ageHours: null, maxAgeHours: threshold, ok: null, detail: "The backup check has not reported yet." };
  }
  const ageHours = r.backup?.at ? hours(r.backup.at, now) : null;
  const checkAgeHours = hours(r.checkedAt, now);
  const check = {
    checkedAt: r.checkedAt, checkAgeHours, copies: r.backup?.copies ?? 0, oldestAt: r.backup?.oldestAt ?? null,
    restore: r.restore, files: r.files, errors: r.errors ?? [], warnings: r.warnings ?? [],
  };
  const base = { source: "check" as const, lastBackupAt: r.backup?.at ?? null, ageHours, maxAgeHours: threshold, ok: r.ok, check };
  if (!r.ok) {
    return { ...base, status: "failed", detail: `The last backup check failed: ${(r.errors ?? []).join("; ") || "no reason given"}.` };
  }
  if (checkAgeHours > MAX_CHECK_AGE_HOURS) {
    return { ...base, status: "stale", detail: `The backup check last ran ${checkAgeHours}h ago; it should run daily.` };
  }
  if (ageHours === null || ageHours > threshold) {
    return { ...base, status: "stale", detail: `The newest backup is ${ageHours ?? "?"}h old (threshold ${threshold}h).` };
  }
  return {
    ...base,
    status: "ok",
    detail: `Backup from ${ageHours}h ago restored: ${r.restore.tables} tables, ${r.restore.migrations} migrations; ${check.copies} copies kept.`,
  };
}

async function readHeartbeat(): Promise<BackupFreshness> {
  const threshold = maxAgeHours();
  const last = await prismaAdmin.backupRun.findFirst({
    where: { ok: true, finishedAt: { not: null } },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true, ok: true },
  });

  if (!last?.finishedAt) {
    return { status: "never", source: "heartbeat", lastBackupAt: null, ageHours: null, maxAgeHours: threshold, ok: null };
  }

  const ageHours = (Date.now() - last.finishedAt.getTime()) / 3_600_000;
  return {
    status: ageHours <= threshold ? "ok" : "stale",
    source: "heartbeat",
    lastBackupAt: last.finishedAt.toISOString(),
    ageHours: Math.round(ageHours * 10) / 10,
    maxAgeHours: threshold,
    ok: last.ok,
  };
}

/** Uncached read, for the watch job. Throws on a read error. */
export async function readBackupFreshness(): Promise<BackupFreshness> {
  return reportConfigured() ? freshnessFromReport(await fetchReport()) : readHeartbeat();
}

/**
 * Cached, timeout-bounded, never-throwing backup freshness for /api/health.
 * Returns status "unknown" on any error or slow read.
 */
export async function getBackupFreshness(): Promise<BackupFreshness> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value;

  const unknown: BackupFreshness = {
    status: "unknown",
    lastBackupAt: null,
    ageHours: null,
    maxAgeHours: maxAgeHours(),
    ok: null,
  };

  let value: BackupFreshness;
  try {
    value = await Promise.race([
      readBackupFreshness(),
      new Promise<BackupFreshness>((resolve) =>
        setTimeout(() => resolve(unknown), reportConfigured() ? REPORT_TIMEOUT_MS : READ_TIMEOUT_MS),
      ),
    ]);
  } catch {
    value = unknown;
  }

  cache = { at: now, value };
  return value;
}
