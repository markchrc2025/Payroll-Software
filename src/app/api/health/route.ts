/**
 * GET /api/health — lightweight readiness/configuration check.
 *
 * Returns 200 when critical env vars are present and valid, or 503 with the
 * list of configuration problems. Lets a deploy be verified before testing,
 * so a missing ENCRYPTION_KEY is caught here rather than on the first save.
 */
import { NextResponse } from "next/server";
import { checkCriticalEnv, checkEnvWarnings } from "@/lib/env-check";

export const dynamic = "force-dynamic";

export function GET() {
  const problems = checkCriticalEnv();
  const warnings = checkEnvWarnings();
  if (problems.length === 0) {
    return NextResponse.json(
      warnings.length === 0 ? { status: "ok" } : { status: "ok", warnings },
    );
  }
  return NextResponse.json(
    { status: "degraded", problems, ...(warnings.length ? { warnings } : {}) },
    { status: 503 },
  );
}
