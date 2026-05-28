/**
 * POST /api/ess/auth/logout
 *
 * Revoke the current ESS session.  The raw token is extracted from the
 * Authorization header, hashed, and its `revokedAt` is set to now.
 *
 * After logout the token is immediately invalid.
 */
import type { NextRequest } from "next/server";
import { getEssContext, hashEssToken, revokeEssSession } from "@/lib/ess-auth";
import { ok, serverError, unauthorized } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();

  const authHeader = req.headers.get("authorization") ?? "";
  const rawToken = authHeader.slice(7).trim();
  const tokenHash = hashEssToken(rawToken);

  try {
    await revokeEssSession(ctx.tenantId, tokenHash);
    return ok({ revoked: true }, "Logged out");
  } catch (e) {
    console.error("[ess/auth/logout]", e);
    return serverError(e);
  }
}
