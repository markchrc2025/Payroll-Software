/**
 * Field-level encryption — Sentire Payroll
 * -----------------------------------------
 * AES-256-GCM with a per-process key sourced from ENCRYPTION_KEY (base64,
 * 32 bytes). Used for sensitive PII: TIN, SSS, PhilHealth, Pag-IBIG, GSIS,
 * bank account numbers, and tenant statutory numbers.
 *
 * Ciphertext layout (base64): "v1:" + base64(iv(12) || ciphertext || authTag(16))
 *
 * KMS hand-off: rotate by adding "v2:" prefix logic later; the version byte
 * lets us decrypt legacy values during rotation.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const VERSION = "v1";

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY env var is required (32-byte base64). " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}`);
  }
  cachedKey = key;
  return key;
}

/** Encrypt a UTF-8 string; returns versioned base64. Empty/null inputs pass through. */
export function encrypt(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return plain ?? null;
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, ct, tag]).toString("base64")}`;
}

/** Decrypt a versioned base64 blob produced by `encrypt`. Pass-through on null/empty. */
export function decrypt(blob: string | null | undefined): string | null {
  if (blob == null || blob === "") return blob ?? null;
  // Backwards-compat: if value doesn't carry our version prefix, return as-is
  // (covers seed data or legacy plaintext during a rotation window).
  if (!blob.startsWith(`${VERSION}:`)) return blob;
  const buf = Buffer.from(blob.slice(VERSION.length + 1), "base64");
  if (buf.length < IV_LEN + TAG_LEN) throw new Error("Encrypted blob too short");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ct = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * Map of model → field names that should be transparently encrypted/decrypted
 * by the Prisma client extension. Keep this in sync with @sensitive markers
 * in prisma/schema.prisma comments.
 */
export const ENCRYPTED_FIELDS: Record<string, readonly string[]> = {
  Tenant: ["tinNumber", "sssNumber", "philhealthNumber", "pagibigNumber"],
  StatutoryId: ["number"],
  Employee: ["bankAccountNumber"],
};

/**
 * HMAC companion fields — when a field in ENCRYPTED_FIELDS is written,
 * the companion HMAC field is automatically populated for searchable lookups.
 * Key: `"Model.fieldName"` → companion field name.
 */
export const HMAC_COMPANIONS: Record<string, string> = {
  "StatutoryId.number": "numberHmac",
};

let cachedHmacKey: Buffer | null = null;
function getHmacKey(): Buffer {
  if (cachedHmacKey) return cachedHmacKey;
  const raw = process.env.HMAC_KEY;
  if (!raw) {
    // Fall back to ENCRYPTION_KEY with a domain separator so the keys are
    // cryptographically independent even if the same env value is reused.
    const enc = process.env.ENCRYPTION_KEY;
    if (!enc) throw new Error("HMAC_KEY (or ENCRYPTION_KEY) env var is required");
    cachedHmacKey = Buffer.from(
      createHmac("sha256", Buffer.from(enc, "base64")).update("hmac-domain").digest(),
    );
    return cachedHmacKey;
  }
  cachedHmacKey = Buffer.from(raw, "base64");
  return cachedHmacKey;
}

/**
 * Compute HMAC-SHA256 of a plaintext value. Returns a fixed-length hex string
 * suitable for database equality lookups.
 * Returns null for null/empty input (mirrors encrypt() behaviour).
 */
export function hmac(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  return createHmac("sha256", getHmacKey()).update(plain, "utf8").digest("hex");
}
