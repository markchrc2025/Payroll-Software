/**
 * GET /api/health — liveness probe.
 *
 * ALWAYS returns HTTP 200 when the server can respond, so a platform deploy
 * healthcheck reflects "is the server up and serving?" — not "is every env var
 * perfect?". Critical-env problems (e.g. an invalid ENCRYPTION_KEY) are still
 * reported in the JSON body (`status: "degraded"`, `problems`) and logged at
 * boot via logEnvCheck(), but they must NOT fail a deploy or roll back a running
 * server — a bad ENCRYPTION_KEY only breaks encrypted-field writes, which the
 * relevant routes surface on their own. Use a separate endpoint if a strict
 * readiness gate (503 on config problems) is ever needed.
 */
import { NextResponse } from "next/server";
import { checkCriticalEnv, checkEnvWarnings } from "@/lib/env-check";
import { getBackupFreshness, type BackupFreshness } from "@/lib/backup-status";
import { alertsConfigured } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET() {
  const problems = checkCriticalEnv();
  const warnings = checkEnvWarnings();

  // Best-effort off-platform-backup freshness. MUST NOT affect liveness:
  // getBackupFreshness() is cached, timeout-bounded and swallows every error
  // (returns "unknown"), so a DB blip or a not-yet-applied migration can never
  // flip this endpoint off HTTP 200. A stale/absent backup is surfaced only as
  // a warning + the `backup` body field, never as a hard failure.
  // getBackupFreshness() is itself total today (it try/catches its own DB call),
  // but this endpoint must not DEPEND on that discipline holding: the comment
  // above is a promise about THIS route, so the guarantee belongs here. If the
  // helper ever gains a throwing path, a deploy healthcheck must not be what
  // discovers it.
  let backup: BackupFreshness;
  try {
    backup = await getBackupFreshness();
  } catch {
    backup = {
      status: "unknown",
      lastBackupAt: null,
      ageHours: null,
      maxAgeHours: 0,
      ok: null,
    };
  }

  if (backup.status === "stale" || backup.status === "never") {
    warnings.push({
      name: "DATABASE_BACKUP",
      detail:
        backup.status === "never"
          ? "No successful off-platform database backup has been recorded yet."
          : `Latest off-platform backup is ${backup.ageHours}h old (threshold ${backup.maxAgeHours}h).`,
    });
  }

  // Whether money-critical job failures can actually reach a human (unit 0.6).
  // Pure env inspection — no I/O, no DB — and try/catch'd anyway, so it can
  // never flip this endpoint off HTTP 200.
  let alerts = false;
  try {
    alerts = alertsConfigured();
  } catch {
    alerts = false;
  }

  return NextResponse.json({
    status: problems.length === 0 ? "ok" : "degraded",
    ...(problems.length ? { problems } : {}),
    ...(warnings.length ? { warnings } : {}),
    backup,
    alerts,
  });
}
