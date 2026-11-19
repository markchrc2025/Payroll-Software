/**
 * POST /api/expense-claims/upload
 *
 * Uploads a receipt (image or PDF) to object storage server-side (multipart
 * "file" field) and returns the storage key, which the caller saves as
 * `receiptKey` when POSTing the claim to /api/expense-claims.
 *
 * Allowed types: image/jpeg, image/png, image/webp, image/heic, application/pdf
 * Max size: 10 MB. Server-side upload — no bucket CORS needed.
 */

import type { NextRequest } from "next/server";

import { getAuthContext } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";
import { storeReceipt } from "@/lib/expense-receipts";
import { withTenant } from "@/lib/with-tenant";
import { callerEmployeeId } from "@/lib/approvals/second-party";
import { forbidUnless } from "@/lib/authz/route-permission";

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  // Unit 0.25: a receipt is uploaded by the employee filing their own claim, or
  // by payroll staff. Anyone else signed in may not write files into storage.
  const ownClaimant = await withTenant(auth.tenantId, (tx) => callerEmployeeId(tx, auth));
  if (!ownClaimant) {
    const denied = await forbidUnless(auth, ["PAYROLL", "UPDATE"]);
    if (denied) return denied;
  }

  const stored = await storeReceipt(req, auth.tenantId);
  if ("error" in stored) return stored.error;
  const storageKey = stored.key;

  return ok({ storageKey });
}
