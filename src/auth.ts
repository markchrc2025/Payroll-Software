/**
 * NextAuth v5 configuration — Sentire Payroll
 * --------------------------------------------
 * Strategy: JWT (httpOnly cookie) + Credentials provider (email + password via bcrypt).
 * The JWT carries: userId, tenantId, systemRole, roleId so server routes can authorize
 * without an extra DB lookup on every request.
 *
 * Sentire Payroll owns its own users and credentials — sign-in is email/password
 * only. (Google/Microsoft appear on the login screen as placeholders for now.)
 *
 * Used by:
 *  - src/app/api/auth/[...nextauth]/route.ts  → exposes handlers
 *  - src/proxy.ts                              → route protection
 *  - src/lib/auth.ts                           → getAuthContext()
 */

import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prismaAdmin from "@/lib/prisma-admin";
import type { SystemRole } from "@prisma/client";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // Tenant workspace scoping; the company code disambiguates an email that
  // exists in more than one tenant.
  companyCode: z.string().optional(),
  // Which login screen the request came from: "admin" (Central Portal) is
  // restricted to SUPER_ADMIN accounts; "tenant" (or unset) resolves the
  // account by email (optionally scoped by company code).
  scope: z.enum(["tenant", "admin"]).optional(),
});

const USER_SELECT = {
  id: true,
  email: true,
  passwordHash: true,
  firstName: true,
  lastName: true,
  tenantId: true,
  systemRole: true,
  roleId: true,
} as const;

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenantId: string | null;
      systemRole: SystemRole;
      roleId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    userId: string;
    tenantId: string | null;
    systemRole: SystemRole;
    roleId: string | null;
  }
}

/**
 * Credentials `authorize` — exported so the sign-in path can be exercised
 * directly by tests without standing up the whole NextAuth request pipeline.
 *
 * Returns the user object on success, or null for any credential failure.
 * THROWING from here is not a "wrong password" — @auth/core wraps any throw in
 * a CallbackRouteError, which is not client-safe and so surfaces as
 * `?error=Configuration` on the error page. Everything non-essential in here
 * must therefore be fail-soft.
 */
export const authorizeCredentials = async (raw: unknown) => {
  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) return null;

  const { email, password, companyCode, scope } = parsed.data;
  const emailLc = email.toLowerCase();

  // Build the set of accounts this sign-in is allowed to match against.
  // The actual account is then chosen by which one's password verifies —
  // this disambiguates an email that exists in more than one tenant.
  let candidates: Array<{
    id: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    tenantId: string | null;
    systemRole: SystemRole;
    roleId: string | null;
  }> = [];

  if (scope === "admin") {
    // Central Portal: SUPER_ADMIN accounts only.
    candidates = await prismaAdmin.user.findMany({
      where: {
        email: emailLc,
        systemRole: "SUPER_ADMIN",
        tenantId: null,
        isActive: true,
        deletedAt: null,
      },
      select: USER_SELECT,
    });
  } else if (companyCode && companyCode.trim()) {
    // Tenant login scoped to the workspace named by the company code.
    const tenant = await prismaAdmin.tenant.findFirst({
      where: { companyCode: companyCode.trim().toUpperCase(), deletedAt: null },
      select: { id: true },
    });
    if (tenant) {
      candidates = await prismaAdmin.user.findMany({
        where: { email: emailLc, tenantId: tenant.id, isActive: true, deletedAt: null },
        select: USER_SELECT,
      });
    }
  } else {
    // Tenant workspace login by email alone. An email may belong to more
    // than one account (multiple tenants, or a super admin); the password
    // check below selects the right one.
    candidates = await prismaAdmin.user.findMany({
      where: { email: emailLc, isActive: true, deletedAt: null },
      select: USER_SELECT,
    });
  }

  let user: (typeof candidates)[number] | null = null;
  for (const c of candidates) {
    if (await bcrypt.compare(password, c.passwordHash)) {
      user = c;
      break;
    }
  }
  if (!user) return null;

  // lastLoginAt is BOOKKEEPING, not authorization: it records when someone last
  // signed in and says nothing about whether they may. A failure here must never
  // turn a valid credential into a failed sign-in — @auth/core wraps any throw
  // from authorize() in a CallbackRouteError, which is not in its client-safe
  // set, so the user would be bounced to `?error=Configuration` by a transient
  // DB blip. Best-effort, same as our email sends: fail soft, but log loudly —
  // swallowing this would trade a visible failure for an invisible one.
  try {
    await prismaAdmin.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
  } catch (e) {
    console.error("[auth] failed to record lastLoginAt for user", user.id, e);
  }

  return {
    id: user.id,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`.trim(),
    tenantId: user.tenantId,
    systemRole: user.systemRole,
    roleId: user.roleId,
  };
};

/**
 * Custom pages (unit 0.4). `error` MUST be set — without it @auth/core falls
 * back to `${basePath}/error`, its own unbranded page, which is where a failed
 * sign-in currently lands. Both keys point at /login: @auth/core routes by the
 * error's `kind` ("signIn" -> pages.signIn, "error" -> pages.error), and sending
 * both to the login screen means every failure arrives somewhere the user can
 * immediately retry, with one banner handling both sets of codes.
 *
 * /login is already public in src/proxy.ts, which also avoids the ErrorPageLoop
 * @auth/core raises when the configured error page itself requires auth.
 */
export const AUTH_PAGES = {
  signIn: "/login",
  error: "/login",
} as const;

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 /* 8h */ },
  pages: AUTH_PAGES,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        companyCode: { label: "Company Code", type: "text" },
      },
      authorize: authorizeCredentials,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // user is the object returned from authorize() — only on initial sign-in
        token.userId = user.id as string;
        token.tenantId = (user as { tenantId: string | null }).tenantId;
        token.systemRole = (user as { systemRole: SystemRole }).systemRole;
        token.roleId = (user as { roleId: string | null }).roleId;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId;
      session.user.tenantId = token.tenantId;
      session.user.systemRole = token.systemRole;
      session.user.roleId = token.roleId;
      return session;
    },
    authorized({ auth: a, request }) {
      const { pathname } = request.nextUrl;
      const PUBLIC_CENTRAL_PATHS = [
        "/centralportal/accept-invite",
        "/centralportal/reset-password",
      ];
      if (PUBLIC_CENTRAL_PATHS.some((p) => pathname.startsWith(p))) return true;
      // Used by the middleware/proxy below to gate access
      return !!a?.user;
    },
  },
});
