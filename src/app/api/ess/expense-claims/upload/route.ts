/**
 * POST /api/ess/expense-claims/upload (PAY-190)
 *
 * The employee uploads a receipt (JPEG, PNG, WebP, HEIC or PDF, at most
 * 10 MB, multipart field "file") before filing the claim; the answer's
 * storageKey goes into the claim as receiptKey.
 */
import type { NextRequest } from "next/server";
import { getEssContext } from "@/lib/ess-auth";
import { ok, unauthorized } from "@/lib/api-response";
import { storeReceipt } from "@/lib/expense-receipts";

export async function POST(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const stored = await storeReceipt(req, ctx.tenantId);
  if ("error" in stored) return stored.error;
  return ok({ storageKey: stored.key }, "Receipt uploaded");
}
