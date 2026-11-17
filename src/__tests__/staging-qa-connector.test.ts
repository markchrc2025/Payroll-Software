/**
 * Staging environment and its QA connector (docs/STAGING.md).
 *
 * The connector lets a Claude session drive the STAGING Payroll app as the QA
 * company's admin. These tests pin the parts that keep it away from production
 * and keep it safe to expose on a public URL:
 *
 *   Q1  the capability key: under 32 characters never matches; a wrong key
 *       never matches; only the exact key does.
 *   Q2  the connector refuses to start unless STAGING_EMBEDDED_DB=1, the
 *       database is the embedded one on 127.0.0.1 and the key is long enough.
 *   Q3  HTTP gate: any path but /mcp/<key> is a 404 (no hint the server
 *       exists); GET on the right path is a 405; /healthz answers.
 *   Q4  JSON-RPC: initialize echoes a supported protocol version and falls
 *       back to the newest for an unknown one; notifications get 202 and no
 *       body; unknown methods are -32601; a batch answers each request.
 *   Q5  tools: the list is fixed; a tool error comes back as isError content,
 *       not a crash; each call writes one audit line.
 *   Q6  the API client refuses paths outside /api/ and anything under
 *       /api/auth/ (the connector cannot sign in as someone else).
 *   Q7  rate limit: past the per-minute budget the answer is 429.
 *   Q8  start.sh: every staging step is inside a STAGING_EMBEDDED_DB=1 guard,
 *       and the production order (preflight, ensure-roles, migrate, runtime
 *       role check, next start) is unchanged.
 */
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { keyMatches, assertStagingOnly, createServer, TOOLS } from "../../scripts/staging/qa-mcp.mjs";
import { StagingApi } from "../../scripts/staging/api-client.mjs";

const KEY = "k".repeat(40);

type Audit = Record<string, unknown>;
type FakeApi = { request: (m: string, p: string, b?: unknown) => Promise<unknown>; must: () => Promise<unknown> };

let servers: { close: () => void }[] = [];
afterEach(() => {
  for (const s of servers) s.close();
  servers = [];
});

async function start(api: FakeApi, audit: (e: Audit) => void = () => {}, perMinute = 120) {
  const server = createServer({ secret: KEY, api, audit, perMinute });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const rpc = (base: string, body: unknown, path = `/mcp/${KEY}`) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const fakeApi: FakeApi = {
  request: async (m, p) => ({ status: 200, ok: true, body: { data: { echoed: `${m} ${p}` } } }),
  must: async () => [],
};

describe("staging QA connector", () => {
  it("Q1 the key must be the exact secret, and the secret at least 32 characters", () => {
    expect(keyMatches(KEY, KEY)).toBe(true);
    expect(keyMatches(KEY + "x", KEY)).toBe(false);
    expect(keyMatches("", KEY)).toBe(false);
    expect(keyMatches("short", "short")).toBe(false);
    expect(keyMatches("s".repeat(31), "s".repeat(31))).toBe(false);
  });

  it("Q2 refuses to start outside the embedded staging database", () => {
    const env = (e: Record<string, string | undefined>) => e as unknown as NodeJS.ProcessEnv;
    const good = { STAGING_EMBEDDED_DB: "1", DATABASE_URL: "postgresql://payroll_app:x@127.0.0.1:5432/payroll_staging", QA_MCP_SECRET: KEY };
    expect(assertStagingOnly(env(good))).toBeNull();
    expect(assertStagingOnly(env({ ...good, STAGING_EMBEDDED_DB: undefined }))).toMatch(/STAGING_EMBEDDED_DB/);
    expect(assertStagingOnly(env({ ...good, DATABASE_URL: "postgresql://payroll_app:x@shared-postgres-dwdmih:5432/payroll" }))).toMatch(/127\.0\.0\.1/);
    expect(assertStagingOnly(env({ ...good, QA_MCP_SECRET: "too-short" }))).toMatch(/QA_MCP_SECRET/);
  });

  it("Q3 wrong path or key is a 404, GET is a 405, /healthz answers", async () => {
    const base = await start(fakeApi);
    expect((await rpc(base, { jsonrpc: "2.0", id: 1, method: "ping" }, `/mcp/${"x".repeat(40)}`)).status).toBe(404);
    expect((await rpc(base, { jsonrpc: "2.0", id: 1, method: "ping" }, "/mcp")).status).toBe(404);
    expect((await rpc(base, { jsonrpc: "2.0", id: 1, method: "ping" }, "/")).status).toBe(404);
    expect((await fetch(`${base}/mcp/${KEY}`)).status).toBe(405);
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect((await rpc(base, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);
  });

  it("Q4 JSON-RPC: initialize, notifications, unknown methods, batches", async () => {
    const base = await start(fakeApi);
    const init = await (await rpc(base, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })).json();
    expect(init.result.protocolVersion).toBe("2025-03-26");
    expect(init.result.capabilities.tools).toBeDefined();
    expect(init.result.serverInfo.name).toBe("sentire-payroll-qa");
    expect(init.result.instructions).toMatch(/STAGING/);
    const unknown = await (await rpc(base, { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } })).json();
    expect(unknown.result.protocolVersion).toBe("2025-06-18");

    const note = await rpc(base, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(note.status).toBe(202);
    expect(await note.text()).toBe("");

    const missing = await (await rpc(base, { jsonrpc: "2.0", id: 3, method: "resources/list" })).json();
    expect(missing.error.code).toBe(-32601);

    const batch = await (await rpc(base, [
      { jsonrpc: "2.0", id: 4, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 5, method: "tools/list" },
    ])).json();
    expect(batch.map((r: { id: number }) => r.id)).toEqual([4, 5]);

    const bad = await (await rpc(base, { id: 6, method: "ping" })).json();
    expect(bad.error.code).toBe(-32600);
  });

  it("Q5 tools: fixed list, errors come back as content, one audit line per call", async () => {
    const lines: Audit[] = [];
    const failing: FakeApi = { request: async () => { throw new Error("boom"); }, must: async () => [] };
    const base = await start(failing, (e) => lines.push(e));

    const list = await (await rpc(base, { jsonrpc: "2.0", id: 1, method: "tools/list" })).json();
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual([
      "staging_status", "list_employees", "set_attendance", "import_punches", "create_payroll_run",
      "recompute_payroll_run", "get_payroll_run", "seed_scenario", "reset_staging", "api_request",
    ]);
    expect(list.result.tools.every((t: { inputSchema: { type: string } }) => t.inputSchema.type === "object")).toBe(true);
    expect(TOOLS.length).toBe(10); // PAY-140 added reset_staging; PAY-170 added import_punches

    const call = await (await rpc(base, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "api_request", arguments: { method: "GET", path: "/api/employees" } } })).json();
    expect(call.result.isError).toBe(true);
    expect(call.result.content[0].text).toMatch(/boom/);
    expect(lines).toEqual([expect.objectContaining({ tool: "api_request", ok: false, path: "/api/employees", error: "boom" })]);

    const nope = await (await rpc(base, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "drop_database", arguments: {} } })).json();
    expect(nope.error.code).toBe(-32602);
  });

  it("Q5b a successful call returns the API answer as text", async () => {
    const lines: Audit[] = [];
    const base = await start(fakeApi, (e) => lines.push(e));
    const call = await (await rpc(base, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "api_request", arguments: { method: "GET", path: "/api/branches" } } })).json();
    expect(JSON.parse(call.result.content[0].text).body.data.echoed).toBe("GET /api/branches");
    expect(lines[0]).toMatchObject({ tool: "api_request", ok: true, path: "/api/branches" });
  });

  it("Q6 the API client refuses /api/auth/ and anything outside /api/", async () => {
    const api = new StagingApi();
    await expect(api.request("POST", "/api/auth/callback/credentials", {})).rejects.toThrow(/not \/api\/auth/);
    await expect(api.request("GET", "/dashboard")).rejects.toThrow(/under \/api\//);
  });

  it("Q7 past the per-minute budget the answer is 429", async () => {
    const base = await start(fakeApi, () => {}, 2);
    expect((await rpc(base, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);
    expect((await rpc(base, { jsonrpc: "2.0", id: 2, method: "ping" })).status).toBe(200);
    expect((await rpc(base, { jsonrpc: "2.0", id: 3, method: "ping" })).status).toBe(429);
  });

  it("Q8 start.sh: staging steps are guarded, production order unchanged", () => {
    const sh = readFileSync("scripts/start.sh", "utf8");
    const guard = 'if [ "${STAGING_EMBEDDED_DB:-}" = "1" ]; then';
    const blocks = sh.split(guard).slice(1).map((b) => b.slice(0, b.indexOf("\nfi\n")));
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatch(/staging_embedded_db/);
    expect(blocks[1]).toMatch(/load-statutory-2026/);
    expect(blocks[1]).toMatch(/bootstrap-company/);
    expect(blocks[1]).toMatch(/qa-mcp\.mjs &/);

    const outside = sh.split(guard).map((b, i) => (i === 0 ? b : b.slice(b.indexOf("\nfi\n")))).join("");
    expect(outside).not.toMatch(/scripts\/staging\/|qa-mcp|bootstrap-company/);

    const at = (s: string) => sh.indexOf(s);
    const order = [
      "staging_embedded_db\n",
      'if [ -z "${DIRECT_DATABASE_URL:-}" ]',
      'if [ -z "${DATABASE_URL:-}" ]',
      "node scripts/db/ensure-roles.mjs",
      '"$BIN/prisma" migrate deploy',
      "node scripts/db/assert-runtime-role.mjs",
      "scripts/staging/bootstrap-company.mjs",
      'exec "$BIN/next" start',
    ].map(at);
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
