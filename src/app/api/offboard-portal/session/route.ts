/**
 * PAY-197 part 2: POST /api/offboard-portal/session { token } trades the
 * single-use link for a portal session cookie; DELETE signs out.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { err } from "@/lib/api-response";
import { endPortalSession, PORTAL_COOKIE, startPortalSession } from "@/lib/offboarding/portal";

export async function POST(req: NextRequest) {
  const parsed = z.object({ token: z.string().min(20).max(200) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("This link is not valid. Ask HR for a new one.", 401);
  const r = await startPortalSession(parsed.data.token);
  if ("refused" in r) return err(r.refused, 401);
  const res = NextResponse.json({ data: { expiresAt: r.expiresAt } });
  res.cookies.set(PORTAL_COOKIE, r.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", expires: r.expiresAt });
  return res;
}

export async function DELETE(req: NextRequest) {
  await endPortalSession(req.cookies.get(PORTAL_COOKIE)?.value);
  const res = NextResponse.json({ data: null });
  res.cookies.delete(PORTAL_COOKIE);
  return res;
}
