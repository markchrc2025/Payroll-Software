/**
 * PAY-73: the daily backup watch. At 06:00 Manila, after the 02:30 backup and
 * the 04:30 restore check, read the Backup Check report and email
 * ALERT_EMAIL_TO when the backups are not proven good (failed, stale or never
 * checked). A log line is not a notification: nobody reads the runtime log.
 */
import { captureError, defaultSink, type AlertSink } from "@/lib/observability";
import { readBackupFreshness, reportConfigured, type BackupFreshness } from "@/lib/backup-status";

export function backupAlertBody(f: BackupFreshness): string {
  const c = f.check;
  return [
    `status:        ${f.status}`,
    `what:          ${f.detail ?? ""}`,
    `newest backup: ${f.lastBackupAt ?? "none"}${f.ageHours != null ? ` (${f.ageHours}h old)` : ""}`,
    ...(c
      ? [
          `last check:    ${c.checkedAt} (${c.checkAgeHours}h ago)`,
          `copies kept:   ${c.copies}, oldest ${c.oldestAt ?? "none"}`,
          `restore:       ${c.restore.ok ? "ok" : "FAILED"}, ${c.restore.tables} tables, ${c.restore.migrations} migrations, rows ${JSON.stringify(c.restore.rows)}`,
          `files copy:    ${c.files.ok ? "ok" : "FAILED"}, ${c.files.objects} files${c.files.persistent ? "" : ", NOT on a volume"}`,
          ...c.errors.map((e) => `error:         ${e}`),
          ...c.warnings.map((w) => `warning:       ${w}`),
        ]
      : []),
  ].join("\n");
}

export async function handleBackupWatch(sink: AlertSink = defaultSink): Promise<BackupFreshness | null> {
  if (!reportConfigured()) {
    console.warn("[jobs/backup.watch] no BACKUP_REPORT_S3_* key, so the backups are not being watched");
    return null;
  }
  let f: BackupFreshness;
  try {
    f = await readBackupFreshness();
  } catch (e) {
    await captureError(e, { scope: "backup.watch", critical: true, detail: "could not read the backup check report" }, sink);
    return null;
  }
  if (f.status === "ok") {
    console.log(`[jobs/backup.watch] ok: ${f.detail}`);
    return f;
  }
  try {
    await sink.sendAlert(`[Sentire] Payroll backups need attention (${f.status})`, backupAlertBody(f));
  } catch (e) {
    console.error("[jobs/backup.watch] the alert email failed:", e);
  }
  console.error(`[jobs/backup.watch] ${f.status}: ${f.detail}`);
  return f;
}
