/**
 * Wave C3 (PAY-213): the employee's own document requests.
 *   GET   their requests
 *   POST  { templateId, purpose? } request a document; it goes through the
 *         company's DOCUMENT approval chain
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getEssContext } from "@/lib/ess-auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { DocumentRequestRefusal, fileDocumentRequest } from "@/lib/documents/requests";

const schema = z.object({ templateId: z.string().min(1), purpose: z.string().trim().max(300).nullable().optional() });

export async function GET(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const rows = await withTenant(ctx.tenantId, (tx) => tx.documentRequest.findMany({
    where: { tenantId: ctx.tenantId, employeeId: ctx.employeeId },
    select: { id: true, purpose: true, status: true, rejectionReason: true, createdAt: true, decidedAt: true, template: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  }));
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Choose the document", 422);
  try {
    const r = await withTenant(ctx.tenantId, (tx) => fileDocumentRequest(tx, { tenantId: ctx.tenantId, employeeId: ctx.employeeId, templateId: parsed.data.templateId, purpose: parsed.data.purpose ?? null }));
    return ok({ id: r.id, status: r.status }, "Requested. You can download it here once it is approved.", 201);
  } catch (e) {
    if (e instanceof DocumentRequestRefusal) return err(e.message, e.status);
    throw e;
  }
}
