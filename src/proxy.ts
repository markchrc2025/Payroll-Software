/**
 * Sentire Payroll — Edge Proxy (formerly middleware.ts in Next ≤15)
 * Protects all app routes except: /login, /api/auth/*, and static assets.
 * On unauthenticated access to API → 401 JSON; to a page → redirect to /login.
 */
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth?.user;
  const path = nextUrl.pathname;

  const isPublic =
    path === "/login" ||
    path === "/centralportal" ||
    path === "/centralportal/login" ||
    path === "/centralportal/accept-invite" ||
    path === "/centralportal/reset-password" ||
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/kiosk/") ||
    path.startsWith("/api/ess/") ||
    path.startsWith("/ess") ||
    path.startsWith("/remotekiosk") ||
    path.startsWith("/_next/") ||
    path === "/favicon.ico";

  if (isPublic) return NextResponse.next();

  if (!isLoggedIn) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  // Skip Next internals and static files; cover everything else
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
