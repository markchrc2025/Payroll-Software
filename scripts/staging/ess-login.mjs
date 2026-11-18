// STAGING ONLY (PAY-180, Mark's ruling of 19 Nov 2026: "Yes, staging-only
// tool"). Lets a QA session act as a seeded employee in ESS without any
// credential passing through chat.
//
//   createEssLogin  gives an employee a working ESS login through the app's
//                   own activation route. The one step done in the database
//                   is the one HR normally does by email: grant access
//                   (INVITED) and issue the one-time link. The link is then
//                   claimed through POST /api/ess/activate, so the PIN is
//                   checked and hashed by the app exactly as for a real
//                   employee.
//   essRequest      signs in through POST /api/ess/auth and calls /api/ess/*
//                   with the session, exactly as the ESS app does.
//
// The PIN is derived from QA_MCP_SECRET and the employee number, so it is
// never stored, never returned and never needed by the caller. Session tokens
// stay inside this process. The database writes run as the RLS-limited
// runtime role with the tenant set, and only after assertStagingOnly passed.
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { QA_COMPANY } from "./qa-company.mjs";

const BASE = () => `http://127.0.0.1:${process.env.PORT || 10000}`;
const INVITE_TTL_MS = 60 * 60 * 1000;

// Same refusals as src/lib/ess-pin-policy.ts (pinProblem); the test checks
// every derived PIN against the real function.
const COMMON = new Set([
  "123123", "112233", "121212", "123321", "159753", "147258", "258369",
  "696969", "000001", "100000", "102030", "520520", "131313", "142536",
]);
const pad2 = (n) => String(n).padStart(2, "0");
function birthDateForms(d) {
  const yy = pad2(d.getUTCFullYear() % 100);
  const mm = pad2(d.getUTCMonth() + 1);
  const dd = pad2(d.getUTCDate());
  return [`${mm}${dd}${yy}`, `${dd}${mm}${yy}`, `${yy}${mm}${dd}`, `${d.getUTCFullYear()}${mm}`];
}
function refused(pin, employeeNumber, birthDate) {
  if (/^(\d)\1+$/.test(pin)) return true;
  if ("01234567890".includes(pin) || "09876543210".includes(pin)) return true;
  if (/^(\d\d)\1\1$/.test(pin) || /^(\d{3})\1$/.test(pin)) return true;
  if (COMMON.has(pin)) return true;
  if (birthDate && birthDateForms(birthDate).includes(pin)) return true;
  const digits = String(employeeNumber ?? "").replace(/\D/g, "");
  if (digits.length >= 4 && (pin.includes(digits) || digits.includes(pin))) return true;
  return false;
}

/**
 * The QA PIN for one employee: 6 digits from HMAC(secret, employee number),
 * stepping a counter past any PIN the app would refuse. Deterministic, so
 * sign-in later derives the same PIN without storing it.
 *
 * @param {string} secret
 * @param {string} employeeNumber
 * @param {Date | null} [birthDate]
 */
export function deriveQaPin(secret, employeeNumber, birthDate = null) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("QA_MCP_SECRET is unset or too short");
  for (let i = 0; i < 1000; i++) {
    const n = createHmac("sha256", secret).update(`ess-pin:${employeeNumber}:${i}`).digest().readUInt32BE(0);
    const pin = String(n % 1_000_000).padStart(6, "0");
    if (!refused(pin, employeeNumber, birthDate)) return pin;
  }
  throw new Error("could not derive a PIN");
}

async function postJson(path, body, headers = {}) {
  const res = await fetch(`${BASE()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 500) }; }
  return { status: res.status, ok: res.ok, body: json };
}

/** Signs in to ESS; returns the bearer token (kept in this process only) or throws. */
async function essSignIn(employeeNumber, pin, companyCode = QA_COMPANY.companyCode) {
  const r = await postJson("/api/ess/auth", { companyCode, employeeNumber, pin });
  if (!r.ok || !r.body?.data?.token) {
    throw new Error(`ESS sign-in for ${employeeNumber} failed (${r.status}): ${r.body?.error ?? r.body?.message ?? "no token"}`);
  }
  return r.body.data.token;
}

/**
 * Runs `fn(client)` in one transaction as the runtime role with the QA
 * tenant set, the way the app's withTenant does.
 */
async function withQaTenant(env, fn, companyCode = QA_COMPANY.companyCode) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    const t = await client.query(`SELECT id FROM "Tenant" WHERE "companyCode" = $1 AND "deletedAt" IS NULL`, [companyCode]);
    if (t.rowCount !== 1) throw new Error(`QA company ${companyCode} not found`);
    const tenantId = t.rows[0].id;
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
    const out = await fn(client, tenantId);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

/**
 * Gives one QA employee a working ESS login. Already active with the QA PIN:
 * nothing to do. Active with some other PIN: refused unless `reset` is true,
 * which re-invites and sets the QA PIN. Returns no secret.
 */
export async function createEssLogin({ employeeNumber, reset = false }, env = process.env, deps = {}) {
  const tenantTx = deps.withQaTenant ?? withQaTenant;
  const signIn = deps.essSignIn ?? essSignIn;
  const post = deps.postJson ?? postJson;
  const code = deps.companyCode ?? QA_COMPANY.companyCode;
  if (!employeeNumber) throw new Error("employeeNumber is required");

  const emp = await tenantTx(env, async (db) => {
    const r = await db.query(
      `SELECT id, "employeeNumber", "birthDate", "essAccessStatus", "employmentStatus" FROM "Employee"
       WHERE "employeeNumber" = $1 AND "deletedAt" IS NULL`,
      [employeeNumber],
    );
    if (r.rowCount !== 1) throw new Error(`no employee ${employeeNumber} in the QA company`);
    return r.rows[0];
  }, code);
  const pin = deriveQaPin(env.QA_MCP_SECRET, emp.employeeNumber, emp.birthDate ? new Date(emp.birthDate) : null);

  if (emp.essAccessStatus === "ACTIVE" && !reset) {
    try {
      await signIn(emp.employeeNumber, pin, code);
      return { employeeNumber: emp.employeeNumber, status: "ACTIVE", created: false, message: "Already has a QA ESS login; use ess_request." };
    } catch {
      throw new Error(`${emp.employeeNumber} already has ESS access with a PIN this tool did not set. Call again with reset: true to re-invite and set the QA PIN.`);
    }
  }

  const rawToken = randomBytes(32).toString("base64url");
  await tenantTx(env, async (db, tenantId) => {
    const now = new Date();
    await db.query(`UPDATE "EssInvite" SET "expiresAt" = $2 WHERE "employeeId" = $1 AND "usedAt" IS NULL AND "expiresAt" > $2`, [emp.id, now]);
    await db.query(
      `INSERT INTO "EssInvite" (id, "tenantId", "employeeId", "tokenHash", "expiresAt", "createdAt") VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), tenantId, emp.id, createHash("sha256").update(rawToken).digest("hex"), new Date(now.getTime() + INVITE_TTL_MS), now],
    );
    await db.query(`UPDATE "Employee" SET "essAccessStatus" = 'INVITED', "essInvitedAt" = $2 WHERE id = $1`, [emp.id, now]);
  }, code);

  const act = await post("/api/ess/activate", { token: rawToken, pin });
  if (!act.ok) throw new Error(`activation refused by the app (${act.status}): ${act.body?.error ?? act.body?.message ?? ""}`);
  await signIn(emp.employeeNumber, pin, code);
  return { employeeNumber: emp.employeeNumber, status: "ACTIVE", created: true, message: "ESS login created through /api/ess/activate and checked by signing in. Use ess_request to act as this employee." };
}

/** Allowed ESS paths: everything under /api/ess/ except sign-in, activation and credential routes. */
export function essPathAllowed(path) {
  if (typeof path !== "string" || !path.startsWith("/api/ess/")) return false;
  if (path.includes("..")) return false;
  return !/^\/api\/ess\/(auth|activate|forgot-password|reset-password|password|pin|kiosk-pin|webauthn)(\/|\?|$)/.test(path);
}

/** Strips session tokens from an ESS answer before it reaches the caller. */
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, /^(token|rawToken|accessToken|refreshToken|sessionToken|pin|essPin|pinHash|password|passwordHash|secret)$/i.test(k) ? "[hidden]" : redact(v)]));
  }
  return value;
}

/** Makes ESS calls as QA employees, keeping one session per employee in memory. */
export function createEssClient(env = process.env, deps = {}) {
  const signIn = deps.essSignIn ?? essSignIn;
  const doFetch = deps.fetch ?? fetch;
  const code = deps.companyCode ?? QA_COMPANY.companyCode;
  const sessions = new Map();

  const tokenFor = async (employeeNumber, fresh = false) => {
    if (!fresh && sessions.has(employeeNumber)) return sessions.get(employeeNumber);
    const birthDate = await lookupBirthDate(env, employeeNumber, deps.withQaTenant ?? withQaTenant, code);
    const token = await signIn(employeeNumber, deriveQaPin(env.QA_MCP_SECRET, employeeNumber, birthDate), code);
    sessions.set(employeeNumber, token);
    return token;
  };

  /** @param {{ employeeNumber: string, method: string, path: string, body?: unknown }} args */
  return async function essRequest({ employeeNumber, method, path, body }) {
    if (!essPathAllowed(path)) throw new Error(`path must be under /api/ess/ and not sign-in, activation or PIN routes: ${path}`);
    const send = async (token) => doFetch(`${BASE()}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let res = await send(await tokenFor(employeeNumber));
    if (res.status === 401) res = await send(await tokenFor(employeeNumber, true));
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 2000) }; }
    return { status: res.status, ok: res.ok, body: redact(json) };
  };
}

async function lookupBirthDate(env, employeeNumber, tenantTx, companyCode) {
  const row = await tenantTx(env, async (db) => {
    const r = await db.query(`SELECT "birthDate" FROM "Employee" WHERE "employeeNumber" = $1 AND "deletedAt" IS NULL`, [employeeNumber]);
    return r.rows[0];
  }, companyCode);
  if (!row) throw new Error(`no employee ${employeeNumber} in the QA company`);
  return row.birthDate ? new Date(row.birthDate) : null;
}
