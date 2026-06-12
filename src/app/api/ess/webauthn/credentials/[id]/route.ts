/**
 * PATCH  /api/ess/webauthn/credentials/[id] — rename a credential
 * DELETE /api/ess/webauthn/credentials/[id] — remove a credential
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getEssContext } from "@/lib/ess-auth";
import { ok, err, unauthorized, notFound, serverError } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";

const patchSchema = z.object({
  label: z.string().max(80),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Invalid input", 422, parsed.error.flatten());

  try {
    const cred = await prismaAdmin.essWebAuthnCredential.findFirst({
      where: { id, employeeId: ctx.employeeId, tenantId: ctx.tenantId },
    });
    if (!cred) return notFound("Credential");

    const updated = await prismaAdmin.essWebAuthnCredential.update({
      where: { id },
      data: { label: parsed.data.label },
      select: { id: true, label: true },
    });
    return ok(updated);
  } catch (e) {
    console.error("[ess/webauthn/credentials/:id PATCH]", e);
    return serverError(e);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getEssContext(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  try {
    const cred = await prismaAdmin.essWebAuthnCredential.findFirst({
      where: { id, employeeId: ctx.employeeId, tenantId: ctx.tenantId },
    });
    if (!cred) return notFound("Credential");

    await prismaAdmin.essWebAuthnCredential.delete({ where: { id } });
    return ok({ id }, "Credential removed");
  } catch (e) {
    console.error("[ess/webauthn/credentials/:id DELETE]", e);
    return serverError(e);
  }
}
