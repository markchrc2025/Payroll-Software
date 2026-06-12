/**
 * GET    /api/announcements/[id] — Single announcement.
 * PATCH  /api/announcements/[id] — Update title / body / category / publish state.
 * DELETE /api/announcements/[id] — Soft-delete.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, err, unauthorized, notFound, serverError } from "@/lib/api-response";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).optional(),
  category: z.string().max(80).nullable().optional(),
  isPublished: z.boolean().optional(),
  publishedAt: z.string().datetime().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: "Nothing to update" });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  try {
    const item = await withTenant(auth.tenantId, (tx) =>
      tx.announcement.findFirst({
        where: { id, tenantId: auth.tenantId, deletedAt: null },
      }),
    );
    if (!item) return notFound("Announcement");
    return ok(item);
  } catch (e) {
    console.error("[api/announcements/:id GET]", e);
    return serverError(e);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err("Invalid input", 422, parsed.error.flatten());

  const { publishedAt, ...rest } = parsed.data;

  try {
    const existing = await withTenant(auth.tenantId, (tx) =>
      tx.announcement.findFirst({
        where: { id, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      }),
    );
    if (!existing) return notFound("Announcement");

    const updated = await withTenant(auth.tenantId, (tx) =>
      tx.announcement.update({
        where: { id },
        data: {
          ...rest,
          ...(publishedAt ? { publishedAt: new Date(publishedAt) } : {}),
          updatedAt: new Date(),
        },
        select: {
          id: true,
          title: true,
          body: true,
          category: true,
          isPublished: true,
          publishedAt: true,
          updatedAt: true,
        },
      }),
    );
    return ok(updated, "Announcement updated");
  } catch (e) {
    console.error("[api/announcements/:id PATCH]", e);
    return serverError(e);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  try {
    const existing = await withTenant(auth.tenantId, (tx) =>
      tx.announcement.findFirst({
        where: { id, tenantId: auth.tenantId, deletedAt: null },
        select: { id: true },
      }),
    );
    if (!existing) return notFound("Announcement");

    await withTenant(auth.tenantId, (tx) =>
      tx.announcement.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    );
    return ok({ id }, "Announcement deleted");
  } catch (e) {
    console.error("[api/announcements/:id DELETE]", e);
    return serverError(e);
  }
}
