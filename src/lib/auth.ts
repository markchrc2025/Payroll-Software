/**
 * Auth Context
 * -----------
 * Phase 2 placeholder — reads DEV_COMPANY_ID / DEV_USER_ID from .env.local.
 * TODO: Replace with real NextAuth session in the Auth phase.
 *
 * Every API route calls getAuthContext() first. If it returns null, respond 401.
 * The returned companyId MUST scope every Prisma query (multi-tenancy guarantee).
 */

import type { NextRequest } from "next/server";
import { SystemRole } from "@prisma/client";

export type AuthContext = {
  companyId: string;
  userId: string;
  systemRole: SystemRole;
};

export async function getAuthContext(
  _req: NextRequest
): Promise<AuthContext | null> {
  // TODO: Replace with real session/JWT validation
  const companyId = process.env.DEV_COMPANY_ID;
  const userId = process.env.DEV_USER_ID;

  if (process.env.NODE_ENV === "development" && companyId && userId) {
    return { companyId, userId, systemRole: SystemRole.COMPANY_USER };
  }

  return null;
}
