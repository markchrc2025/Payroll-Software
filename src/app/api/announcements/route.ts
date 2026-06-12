/**
 * GET  /api/announcements — Paginated list of announcements for the tenant.
 * POST /api/announcements — Create a new announcement.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { ok, paginated, err, unauthorized, serverError } from "@/lib/api-response";
import { randomBytes } from "crypto";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  published: z.enum(["true", "false", "all"]).default("all"),
});

const createSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  category: z.string().max(80).optional().nullable(),
  isPublished: z.boolean().default(true),
  publishedAt: z.string().datetime().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listSchema.safeParse(qp);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { page, limit, search, published } = parsed.data;

  const where = {
    tenantId: auth.tenantId,
    deletedAt: null,
    ...(published === "true" ? { isPublished: true } : {}),
    ...(published === "false" ? { isPublished: false } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { body: { contains: search, mode: "insensitive" as const } },
            { category: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  try {
    const [rows, total] = await withTenant(auth.tenantId, (tx) =>
      Promise.all([
        tx.announcement.findMany({
          where,
          orderBy: { publishedAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            title: true,
            body: true,
            category: true,
            isPublished: true,
            publishedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        tx.announcement.count({ where }),
      ]),
    );
    return paginated(rows, total, page, limit);
  } catch (e) {
    console.error("[api/announcements GET]", e);
    return serverError(e);
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err("Invalid input", 422, parsed.error.flatten());
  const { title, body: text, category, isPublished, publishedAt } = parsed.data;

  try {
    const announcement = await withTenant(auth.tenantId, (tx) =>
      tx.announcement.create({
        data: {
          id: randomBytes(12).toString("hex"),
          tenantId: auth.tenantId,
          title,
          body: text,
          category: category ?? null,
          isPublished,
          publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
          createdByUserId: auth.userId,
        },
        select: {
          id: true,
          title: true,
          body: true,
          category: true,
          isPublished: true,
          publishedAt: true,
          createdAt: true,
        },
      }),
    );
    return ok(announcement, "Announcement created", 201);
  } catch (e) {
    console.error("[api/announcements POST]", e);
    return serverError(e);
  }
}
