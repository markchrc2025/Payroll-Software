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

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const problems = checkCriticalEnv();
  const warnings = checkEnvWarnings();
  // TEMP DIAGNOSTIC: log every hit so we can confirm in the platform logs
  // whether the deploy healthcheck probe actually reaches this route (and with
  // what Host/User-Agent). Remove once the Sliplane deploy is healthy.
  console.log(
    `[health] GET /api/health reached — host="${request.headers.get("host") ?? ""}" ` +
      `ua="${request.headers.get("user-agent") ?? ""}" ok=${problems.length === 0}`,
  );
  return NextResponse.json({
    status: problems.length === 0 ? "ok" : "degraded",
    ...(problems.length ? { problems } : {}),
    ...(warnings.length ? { warnings } : {}),
  });
}
