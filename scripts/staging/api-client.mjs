// STAGING ONLY: a minimal client for the app's own HTTP API, used by the seed
// and the QA connector. It signs in exactly as the browser does (Auth.js
// credentials: CSRF token, then POST /api/auth/callback/credentials) and keeps
// the session cookie, so every call goes through the same permission checks,
// validation and tenant scoping as a real HR admin's.
import { QA_COMPANY } from "./qa-company.mjs";

const BASE = `http://127.0.0.1:${process.env.PORT || 10000}`;

export class StagingApi {
  #cookies = new Map();
  #signedInAt = 0;

  #absorb(res) {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === "" || /max-age=0/i.test(line)) this.#cookies.delete(name);
      else this.#cookies.set(name, value);
    }
  }

  #cookieHeader() {
    return [...this.#cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async waitUntilUp(timeoutMs = 300_000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      try {
        const r = await fetch(`${BASE}/api/health`);
        if (r.ok) return;
      } catch { /* not listening yet */ }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("staging app did not answer /api/health in time");
  }

  async signIn() {
    const password = process.env.STAGING_ADMIN_PASSWORD;
    if (!password) throw new Error("STAGING_ADMIN_PASSWORD is not set");
    this.#cookies.clear();
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    this.#absorb(csrfRes);
    const { csrfToken } = await csrfRes.json();
    const body = new URLSearchParams({
      csrfToken,
      email: QA_COMPANY.adminEmail,
      password,
      companyCode: QA_COMPANY.companyCode,
      callbackUrl: `${BASE}/dashboard`,
    });
    const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: this.#cookieHeader() },
      body,
    });
    this.#absorb(res);
    const hasSession = [...this.#cookies.keys()].some((k) => k.endsWith("authjs.session-token"));
    if (!hasSession) throw new Error(`sign-in as ${QA_COMPANY.adminEmail} failed (status ${res.status}, ${res.headers.get("location") ?? "no redirect"})`);
    this.#signedInAt = Date.now();
  }

  /** JSON request against /api/*. Re-signs in once on 401 and when the session is over 6 hours old. */
  async request(method, path, body) {
    if (!path.startsWith("/api/") || path.startsWith("/api/auth/")) throw new Error(`path must be under /api/ and not /api/auth/: ${path}`);
    if (!this.#signedInAt || Date.now() - this.#signedInAt > 6 * 3600_000) await this.signIn();
    const send = () =>
      fetch(`${BASE}${path}`, {
        method,
        headers: { cookie: this.#cookieHeader(), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    let res = await send();
    if (res.status === 401) {
      await this.signIn();
      res = await send();
    }
    this.#absorb(res);
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 2000) }; }
    return { status: res.status, ok: res.ok, body: json };
  }

  /** Like request() but throws on a non-2xx answer and returns body.data. */
  async must(method, path, body) {
    const r = await this.request(method, path, body);
    if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${JSON.stringify(r.body?.error ?? r.body).slice(0, 500)} ${r.body?.details ? JSON.stringify(r.body.details).slice(0, 800) : ""}`);
    return r.body?.data ?? r.body;
  }
}
