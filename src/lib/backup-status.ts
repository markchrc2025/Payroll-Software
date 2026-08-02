/**
 * Best-effort "when did the last off-platform DB backup succeed?" signal for
 * /api/health.
 *
 * The GitHub Actions backup runner (.github/workflows/db-backup.yml) writes a
 * `BackupRun` row after each attempt; this reads the most recent SUCCESSFUL one
 * and reports how old it is. The app holds no backup credentials and never
 * touches object storage — freshness comes purely from this database row.
 *
 * HARD RULE: this must never be able to break /api/health liveness. Every read
 * is (a) cached for 60s, (b) bounded by a short timeout, and (c) wrapped so ANY
 * failure — the `BackupRun` table not existing yet (migration pending), the DB
 * being briefly unreachable — resolves to status "unknown" instead of throwing.
 * /api/health therefore always returns HTTP 200 regardless of this call.
 */

import prismaAdmin from "@/lib/prisma-admin";

export type BackupStatus = "ok" | "stale" | "never" | "unknown";

export interface BackupFreshness {
  /** ok = fresh; stale = older than the threshold; never = no backup row yet; unknown = couldn't check. */
  status: BackupStatus;
  lastBackupAt: string | null;
  ageHours: number | null;
  maxAgeHours: number;
  ok: boolean | null;
}

function maxAgeHours(): number {
  const n = Number(process.env.BACKUP_MAX_AGE_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 26;
}

const CACHE_TTL_MS = 60_000;
const READ_TIMEOUT_MS = 800;

let cache: { at: number; value: BackupFreshness } | null = null;

async function readLatest(): Promise<BackupFreshness> {
  const threshold = maxAgeHours();
  const last = await prismaAdmin.backupRun.findFirst({
    where: { ok: true, finishedAt: { not: null } },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true, ok: true },
  });

  if (!last?.finishedAt) {
    return { status: "never", lastBackupAt: null, ageHours: null, maxAgeHours: threshold, ok: null };
  }

  const ageHours = (Date.now() - last.finishedAt.getTime()) / 3_600_000;
  return {
    status: ageHours <= threshold ? "ok" : "stale",
    lastBackupAt: last.finishedAt.toISOString(),
    ageHours: Math.round(ageHours * 10) / 10,
    maxAgeHours: threshold,
    ok: last.ok,
  };
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
      readLatest(),
      new Promise<BackupFreshness>((resolve) =>
        setTimeout(() => resolve(unknown), READ_TIMEOUT_MS),
      ),
    ]);
  } catch {
    value = unknown;
  }

  cache = { at: now, value };
  return value;
}
