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

export function GET() {
  const problems = checkCriticalEnv();
  const warnings = checkEnvWarnings();
  return NextResponse.json({
    status: problems.length === 0 ? "ok" : "degraded",
    ...(problems.length ? { problems } : {}),
    ...(warnings.length ? { warnings } : {}),
  });
}
