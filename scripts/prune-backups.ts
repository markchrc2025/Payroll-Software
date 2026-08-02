/**
 * prune-backups.ts — Grandfather-Father-Son (GFS) retention for the off-platform
 * backup bucket, LOCK-AWARE. Run by .github/workflows/db-backup.yml after each
 * successful upload.
 *
 * Keep policy (all tunable via env):
 *   - every dump from the last BACKUP_KEEP_INTRADAY_HOURS  (default 48h)
 *   - the newest dump per day for BACKUP_RETENTION_DAILY   days   (default 14)
 *   - the newest dump per ISO-week for BACKUP_RETENTION_WEEKLY weeks (default 8)
 * Everything else is deleted (dump + its companion manifest).
 *
 * If Cloudflare R2 Object Lock is enabled, objects still within their retention
 * window CANNOT be deleted: DeleteObject is refused for them. This script treats
 * that as "locked → keep, skip" (never an error), so the prune is correct
 * whether Object Lock is on or off. Object Lock therefore enforces a hard
 * minimum retention floor regardless of this GFS policy (see docs/BACKUPS.md).
 *
 * Uses the BACKUP_S3_* WRITE credentials — CI only; never on the app.
 */

import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const PREFIX = "db/";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return v;
}
function num(name: string, dflt: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

const BUCKET = required("BACKUP_S3_BUCKET");
const ENDPOINT = required("BACKUP_S3_ENDPOINT");
const REGION = process.env.BACKUP_S3_REGION || "auto";
const KEEP_INTRADAY_HOURS = num("BACKUP_KEEP_INTRADAY_HOURS", 48);
const KEEP_DAILY = num("BACKUP_RETENTION_DAILY", 14);
const KEEP_WEEKLY = num("BACKUP_RETENTION_WEEKLY", 8);

const s3 = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: required("BACKUP_S3_ACCESS_KEY_ID"),
    secretAccessKey: required("BACKUP_S3_SECRET_ACCESS_KEY"),
  },
  // R2 rejects the SDK's default CRC32 trailer — same fix we use in the app.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

interface Dump {
  key: string;
  manifestKey: string;
  when: Date;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** ISO-week bucket key (the Monday of that week, UTC). */
function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const mondayOffset = (t.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  t.setUTCDate(t.getUTCDate() - mondayOffset);
  return t.toISOString().slice(0, 10);
}

async function listDumps(): Promise<Dump[]> {
  const dumps: Dump[] = [];
  let token: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX, ContinuationToken: token }),
    );
    for (const o of res.Contents ?? []) {
      if (o.Key?.endsWith(".dump.gpg") && o.LastModified) {
        dumps.push({
          key: o.Key,
          manifestKey: o.Key.replace(/\.gpg$/, ".manifest.json"),
          when: o.LastModified,
        });
      }
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  // newest first
  return dumps.sort((a, b) => b.when.getTime() - a.when.getTime());
}

/** Newest-first `dumps` → the set of keys to KEEP. */
function computeKeep(dumps: Dump[]): Set<string> {
  const keep = new Set<string>();
  const now = Date.now();

  for (const d of dumps) {
    if ((now - d.when.getTime()) / 3_600_000 <= KEEP_INTRADAY_HOURS) keep.add(d.key);
  }

  const newestPer = (bucketOf: (d: Date) => string, limit: number) => {
    const seen = new Map<string, Dump>();
    for (const d of dumps) {
      const b = bucketOf(d.when);
      if (!seen.has(b)) seen.set(b, d); // dumps are newest-first → first per bucket is newest
    }
    [...seen.values()]
      .sort((a, b) => b.when.getTime() - a.when.getTime())
      .slice(0, limit)
      .forEach((d) => keep.add(d.key));
  };

  newestPer(dayKey, KEEP_DAILY);
  newestPer(weekKey, KEEP_WEEKLY);
  return keep;
}

type DeleteResult = "deleted" | "locked" | "error";

async function tryDelete(key: string): Promise<DeleteResult> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    return "deleted";
  } catch (e) {
    const msg =
      e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    // Object-Lock retention / legal hold → keep, skip (not a failure).
    if (/AccessDenied|Retention|WORM|ObjectLock|Forbidden|\b403\b/i.test(msg)) {
      return "locked";
    }
    console.error(`  ! delete ${key} failed: ${msg}`);
    return "error";
  }
}

async function main() {
  const dumps = await listDumps();
  if (dumps.length === 0) {
    console.log("No dumps found under prefix; nothing to prune.");
    return;
  }
  const keep = computeKeep(dumps);
  console.log(
    `${dumps.length} dumps found; keeping ${keep.size} ` +
      `(intraday ≤ ${KEEP_INTRADAY_HOURS}h, ${KEEP_DAILY} daily, ${KEEP_WEEKLY} weekly).`,
  );

  let deleted = 0;
  let locked = 0;
  let errors = 0;

  for (const d of dumps) {
    if (keep.has(d.key)) continue;
    const r = await tryDelete(d.key);
    await tryDelete(d.manifestKey).catch(() => undefined); // best-effort companion
    if (r === "deleted") {
      deleted++;
      console.log(`  - deleted ${d.key}`);
    } else if (r === "locked") {
      locked++;
      console.log(`  - locked, kept until retention expires: ${d.key}`);
    } else {
      errors++;
    }
  }

  console.log(`Prune complete: ${deleted} deleted, ${locked} locked/kept, ${errors} errors.`);
  // Lock skips are expected and NEVER fail the backup. Only genuine
  // (non-lock) delete errors are surfaced as a warning, still non-fatal.
  if (errors > 0) {
    console.warn("::warning::Some non-lock deletes errored during prune (see log above).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
