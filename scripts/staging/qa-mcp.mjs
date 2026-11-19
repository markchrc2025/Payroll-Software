// STAGING ONLY: the Sentire Payroll QA connector, an MCP server that lets a
// Claude session drive the staging app as its QA admin.
//
// Same security pattern as the Sentire Dokploy connector:
//   - capability URL: POST /mcp/<QA_MCP_SECRET>; any other path or a wrong key
//     is a 404, and with QA_MCP_SECRET unset or under 32 characters the server
//     does not start;
//   - refuses to start unless STAGING_EMBEDDED_DB=1 and the database is the
//     embedded one on 127.0.0.1, so it can never point at production data;
//   - every tool goes through the app's HTTP API as the QA admin (permissions,
//     validation and tenant scoping all apply), never straight to the database;
//   - one JSON audit line per call on stdout (Dokploy logs), 120 calls a minute.
//
// Transport: MCP Streamable HTTP, stateless, JSON responses (no SSE, no
// session id), which the protocol allows for a server that only answers.
import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { StagingApi } from "./api-client.mjs";
import { QA_COMPANY } from "./qa-company.mjs";
import { seedScenario, waitForRun } from "./seed-data.mjs";
import { createEssClient, createEssLogin } from "./ess-login.mjs";

export const SERVER_INFO = { name: "sentire-payroll-qa", version: "1.0.0" };
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const MIN_SECRET = 32;
const MAX_BODY = 1_000_000;

export const INSTRUCTIONS = [
  "Sentire Payroll QA connector: drives the STAGING Payroll app (payroll-staging.apps.sentire.solutions) as the admin of the seeded test company \"Sentire QA Co.\" (company code SENTIREQA). Never production.",
  "Staging data is disposable. If the app keeps its database (STAGING_PG_DATA_DIR on a volume), data survives restarts and deploys; to wipe it, call reset_staging, then restart the staging app (Sentire Dokploy connector, restart_app on \"Payroll Staging\"). Without a kept database, every restart or deploy recreates the database and re-seeds it.",
  "Everything goes through the app's real API, so a 4xx answer is the app's own validation or permission check: report it, do not work around it.",
  "Money in the API is in centavos as strings (\"3000000\" = ₱30,000.00). Dates are YYYY-MM-DD.",
].join(" ");

const peso = (c) => (c == null ? "" : `₱${(Number(c) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

function sheetTable(run, names) {
  const rows = (run.sheets ?? []).map((s) => ({
    employee: names[s.employeeId] ?? s.employeeId,
    salaryType: s.salaryTypeSnapshot,
    divisor: s.workingDaysDenominatorSnapshot,
    base: peso(s.basePayCents),
    lateUndertime: peso(s.lateUndertimeDeductionCents),
    ot: peso(s.otPayCents),
    gross: peso(s.grossCompensationCents),
    sssEe: peso(s.sssEeCents),
    philhealthEe: peso(s.philhealthEeCents),
    pagibigEe: peso(s.pagibigEeCents),
    wht: peso(s.withholdingTaxCents),
    net: peso(s.netPayCents),
  }));
  return { id: run.id, period: `${run.periodStart?.slice(0, 10)} to ${run.periodEnd?.slice(0, 10)}`, cycle: run.cycle, runType: run.runType, status: run.status, sheets: rows };
}

async function employeeNames(api) {
  const list = await api.must("GET", "/api/employees?limit=500");
  const arr = Array.isArray(list) ? list : list?.items ?? [];
  return Object.fromEntries(arr.map((e) => [e.id, `${e.firstName} ${e.lastName} [${e.employeeNumber ?? e.id}]`]));
}

const str = (description) => ({ type: "string", description });
const date = (description) => ({ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description });

let essClient;
const essRequest = (a) => (essClient ??= createEssClient())(a);

export const TOOLS = [
  {
    name: "staging_status",
    description: "Health of the staging app, the QA company, its employees and payroll runs.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async (api) => {
      const health = await fetch(`http://127.0.0.1:${process.env.PORT || 10000}/api/health`).then((r) => r.json()).catch((e) => ({ error: e.message }));
      const names = await employeeNames(api);
      const runs = await api.must("GET", "/api/payroll/runs?limit=50");
      const list = Array.isArray(runs) ? runs : runs?.items ?? [];
      return {
        health,
        company: { name: QA_COMPANY.name, companyCode: QA_COMPANY.companyCode, admin: QA_COMPANY.adminEmail },
        employees: Object.values(names),
        runs: list.map((r) => ({ id: r.id, period: `${r.periodStart?.slice(0, 10)} to ${r.periodEnd?.slice(0, 10)}`, cycle: r.cycle, runType: r.runType, status: r.status })),
      };
    },
  },
  {
    name: "list_employees",
    description: "Employees of the QA company with their pay setup (salary type, pay cycle, current basic salary). The full record, including the working-days divisor, is GET /api/employees/<id> via api_request.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async (api) => {
      const list = await api.must("GET", "/api/employees?limit=500");
      const arr = Array.isArray(list) ? list : list?.items ?? [];
      return arr.map((e) => ({ id: e.id, employeeNumber: e.employeeNumber, name: `${e.firstName} ${e.lastName}`, salaryType: e.salaryType, payFrequency: e.payFrequency, basicSalary: peso(e.salaryHistory?.[0]?.basicSalaryCents), hireDate: e.hireDate?.slice(0, 10), status: e.employmentStatus }));
    },
  },
  {
    name: "set_attendance",
    description: "Create or replace an employee's attendance totals for a pay period (the payroll engine's input). Numbers as strings, e.g. daysWorked \"10\", unpaidLeaveDays \"1\", regularOtHours \"2.5\".",
    inputSchema: {
      type: "object",
      required: ["employeeId", "periodStart", "periodEnd"],
      properties: {
        employeeId: str("Employee id from list_employees"),
        periodStart: date("First day of the period"),
        periodEnd: date("Last day of the period"),
        daysWorked: str("Days worked"),
        unpaidLeaveDays: str("Unpaid leave days (LWOP)"),
        lateUndertimeMinutes: { type: "integer", minimum: 0 },
        regularOtHours: str("Regular overtime hours"),
        restDayHours: str("Rest-day hours"),
        regularHolidayHours: str("Regular holiday hours"),
        specialHolidayHours: str("Special holiday hours"),
        nightDiffHours: str("Night differential hours"),
        notes: str("Free text"),
      },
      additionalProperties: false,
    },
    run: (api, a) => api.must("POST", "/api/period-inputs", a),
  },
  {
    name: "import_punches",
    description: "Import time-clock punches the way a biometric device export comes in (PAY-170): the app writes an attendance log per punch and works out each day's DTR exactly as for a live punch. Times are company time, \"YYYY-MM-DD HH:mm\". All or nothing: a 422 lists every wrong row and nothing is written. Punches already there are skipped.",
    inputSchema: {
      type: "object",
      required: ["rows"],
      properties: {
        rows: {
          type: "array",
          minItems: 1,
          maxItems: 5000,
          items: {
            type: "object",
            required: ["employeeNumber", "punchedAt", "punchType"],
            properties: {
              employeeNumber: str("Employee number, e.g. EMP-0001"),
              punchedAt: str("Company time, YYYY-MM-DD HH:mm"),
              punchType: { type: "string", enum: ["IN", "OUT"] },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    run: (api, a) => api.must("POST", "/api/attendance-logs/import", { rows: a.rows }),
  },
  {
    name: "create_payroll_run",
    description: "Create a payroll run (draft) and wait until it is computed; returns every sheet: base, OT, gross, contributions, tax, net, divisor used. Nothing is finalised or sent.",
    inputSchema: {
      type: "object",
      required: ["periodStart", "periodEnd", "cycle"],
      properties: {
        periodStart: date("First day"),
        periodEnd: date("Last day"),
        cycle: { type: "string", enum: ["DAILY", "WEEKLY", "BI_WEEKLY", "SEMI_MONTHLY", "MONTHLY"] },
        runType: { type: "string", enum: ["REGULAR", "OFF_CYCLE", "FINAL_PAY", "YEAR_END"], default: "REGULAR" },
        employeeIds: { type: "array", items: { type: "string" }, description: "Optional subset" },
        notes: str("Free text"),
      },
      additionalProperties: false,
    },
    run: async (api, a) => {
      const book = await api.must("POST", "/api/payroll/runs", a);
      return sheetTable(await waitForRun(api, book.id), await employeeNames(api));
    },
  },
  {
    name: "recompute_payroll_run",
    description: "Recompute a draft run from the current employee data and attendance, wait, and return its sheets.",
    inputSchema: { type: "object", required: ["runId"], properties: { runId: str("Run id") }, additionalProperties: false },
    run: async (api, a) => {
      await api.must("POST", `/api/payroll/runs/${encodeURIComponent(a.runId)}/recompute`, {});
      return sheetTable(await waitForRun(api, a.runId), await employeeNames(api));
    },
  },
  {
    name: "get_payroll_run",
    description: "One payroll run with every sheet summarised (pesos).",
    inputSchema: { type: "object", required: ["runId"], properties: { runId: str("Run id") }, additionalProperties: false },
    run: async (api, a) => sheetTable(await api.must("GET", `/api/payroll/runs/${encodeURIComponent(a.runId)}`), await employeeNames(api)),
  },
  {
    name: "seed_scenario",
    description: "Re-run the standard QA scenario (5 employees covering monthly, daily, weekly, a 6-day week, an unpaid day, a mid-cutoff hire; runs for both November cutoffs and a weekly run). Reuses what is already there and restores the standard attendance; existing draft runs are not recomputed (use recompute_payroll_run).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: (api) => seedScenario(api, () => {}),
  },
  {
    name: "reset_staging",
    description: "Ask for a clean staging database at the next start. With a kept database (STAGING_PG_DATA_DIR) this marks it for wiping; then restart the Payroll Staging app (Sentire Dokploy connector, restart_app) and it comes back freshly seeded. Nothing is deleted until that restart.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: () => markStagingReset(process.env),
  },
  {
    name: "create_ess_login",
    description: "STAGING ONLY. Give a QA employee a working ESS (employee self-service) login, so ess_request can act as them. Access is granted and the one-time link is claimed through the app's own /api/ess/activate, so the PIN passes the app's real PIN rules. The PIN is derived inside the connector and never shown. If the employee already has ESS with a PIN this tool did not set, pass reset: true to re-invite them.",
    inputSchema: {
      type: "object",
      required: ["employeeNumber"],
      properties: {
        employeeNumber: str("e.g. QA-001 (see list_employees)"),
        reset: { type: "boolean", description: "Re-invite an employee whose ESS PIN this tool did not set" },
      },
      additionalProperties: false,
    },
    run: (_api, a) => createEssLogin(a),
  },
  {
    name: "ess_request",
    description: "STAGING ONLY. Call the ESS API (/api/ess/...) as a QA employee, after create_ess_login. Signs in through /api/ess/auth inside the connector; the session never leaves it. Sign-in, activation and PIN or password routes are refused. Use for clock-in and out, DTR, leave, OT and undertime filings, expense claims, payslips, profile.",
    inputSchema: {
      type: "object",
      required: ["employeeNumber", "method", "path"],
      properties: {
        employeeNumber: str("e.g. QA-001"),
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
        path: { type: "string", pattern: "^/api/ess/", description: "e.g. /api/ess/dtr?from=2026-11-01&to=2026-11-15" },
        body: { type: "object", description: "JSON body for POST/PUT/PATCH" },
      },
      additionalProperties: false,
    },
    run: (_api, a) => essRequest(a),
  },
  {
    name: "api_request",
    description: "Any call to the staging app's API (/api/... except /api/auth/...) as the QA admin, with the app's own validation and permission checks. Use for anything the other tools do not cover: employees, movements, leave, loans, adjustments, payslips, reports.",
    inputSchema: {
      type: "object",
      required: ["method", "path"],
      properties: {
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
        path: { type: "string", pattern: "^/api/", description: "e.g. /api/employees?limit=50" },
        body: { type: "object", description: "JSON body for POST/PUT/PATCH" },
      },
      additionalProperties: false,
    },
    run: (api, a) => api.request(a.method, a.path, a.body),
  },
];

/** PAY-140: marks the kept staging database for wiping at the next start. */
export function markStagingReset(env = process.env) {
  const dir = env.STAGING_PG_DATA_DIR;
  if (!dir) {
    return { marked: false, message: "This staging app does not keep its database (STAGING_PG_DATA_DIR is not set): every restart already starts fresh. Restart Payroll Staging to reset." };
  }
  if (!existsSync(dir)) throw new Error(`STAGING_PG_DATA_DIR ${dir} does not exist`);
  writeFileSync(join(dir, "RESET"), `requested ${new Date().toISOString()}\n`);
  return { marked: true, message: "Marked. Restart Payroll Staging (Sentire Dokploy connector, restart_app) to wipe the database and re-seed it. Until then nothing changes." };
}

export function keyMatches(provided, expected) {
  if (typeof expected !== "string" || expected.length < MIN_SECRET || !provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Handles one JSON-RPC message; returns the response object, or null for a notification. */
export async function handleRpc(msg, api, audit) {
  const id = msg?.id;
  const isNotification = id === undefined || id === null;
  const reply = (result) => (isNotification ? null : { jsonrpc: "2.0", id, result });
  const fail = (code, message) => (isNotification ? null : { jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(-32600, "Invalid Request");

  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      return reply({
        protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return fail(-32602, `Unknown tool: ${msg.params?.name}`);
      const started = Date.now();
      try {
        const out = await tool.run(api, msg.params?.arguments ?? {});
        audit({ tool: tool.name, ok: true, ms: Date.now() - started, path: msg.params?.arguments?.path });
        return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      } catch (e) {
        audit({ tool: tool.name, ok: false, ms: Date.now() - started, path: msg.params?.arguments?.path, error: String(e.message).slice(0, 300) });
        return reply({ content: [{ type: "text", text: `Error: ${e.message}` }], isError: true });
      }
    }
    default:
      if (msg.method.startsWith("notifications/")) return null;
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

export function createServer({ secret, api, audit = (e) => console.log(JSON.stringify({ at: new Date().toISOString(), qa_mcp: e })), perMinute = 120 }) {
  let tokens = perMinute;
  let last = Date.now();
  const take = () => {
    const now = Date.now();
    tokens = Math.min(perMinute, tokens + ((now - last) / 60_000) * perMinute);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };

  return http.createServer((req, res) => {
    void (async () => {
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      if (path === "/healthz") return send(res, 200, { ok: true });
      const m = path.match(/^\/mcp\/([^/]+)\/?$/);
      if (!m || !keyMatches(decodeURIComponent(m[1]), secret)) return send(res, 404, { error: "Not found" });
      if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" }, { allow: "POST" });
      if (!take()) return send(res, 429, { jsonrpc: "2.0", error: { code: -32000, message: "Rate limit: 120 calls a minute" }, id: null });

      let raw = "";
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) return send(res, 413, { jsonrpc: "2.0", error: { code: -32600, message: "Body too large" }, id: null });
        raw += chunk;
      }
      let parsed;
      try { parsed = JSON.parse(raw); } catch { return send(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }); }

      if (Array.isArray(parsed)) {
        const out = (await Promise.all(parsed.map((p) => handleRpc(p, api, audit)))).filter(Boolean);
        return out.length ? send(res, 200, out) : send(res, 202);
      }
      const out = await handleRpc(parsed, api, audit);
      return out ? send(res, 200, out) : send(res, 202);
    })().catch((e) => {
      console.error("[qa-mcp] request failed:", e.message);
      if (!res.headersSent) send(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    });
  });
}

// ---------------------------------------------------------------------------
// Entry point: `node scripts/staging/qa-mcp.mjs` (started by start.sh, staging
// only). Waits for the app, seeds the QA scenario through the API, then serves
// the connector. A seed failure is logged, not fatal: the connector still
// starts so the failure can be inspected through it.
// ---------------------------------------------------------------------------
export function assertStagingOnly(env = process.env) {
  if (env.STAGING_EMBEDDED_DB !== "1") return "STAGING_EMBEDDED_DB is not 1";
  if (!/@127\.0\.0\.1:/.test(env.DATABASE_URL ?? "")) return "DATABASE_URL is not the embedded staging database on 127.0.0.1";
  if (typeof env.QA_MCP_SECRET !== "string" || env.QA_MCP_SECRET.length < MIN_SECRET) return `QA_MCP_SECRET is unset or under ${MIN_SECRET} characters`;
  return null;
}

async function main() {
  const refusal = assertStagingOnly();
  if (refusal) {
    console.error(`[qa-mcp] not starting: ${refusal}`);
    return;
  }
  const api = new StagingApi();
  await api.waitUntilUp();
  try {
    await api.signIn();
    // PAY-140: on a kept database, add what is missing but leave test edits alone.
    await seedScenario(api, (line) => console.log(`[qa-seed] ${line}`), {
      restoreAttendance: process.env.STAGING_PG_REUSED !== "1",
    });
    console.log("[qa-seed] scenario ready");
  } catch (e) {
    console.error(`[qa-seed] failed: ${e.message}`);
  }
  const port = Number(process.env.QA_MCP_PORT || 10001);
  createServer({ secret: process.env.QA_MCP_SECRET, api }).listen(port, "0.0.0.0", () => {
    console.log(`[qa-mcp] listening on :${port} (path /mcp/<QA_MCP_SECRET>)`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`[qa-mcp] fatal: ${e.message}`);
  });
}
