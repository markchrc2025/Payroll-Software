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

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 /* 8h */ },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        companyCode: { label: "Company Code", type: "text" },
      },
      authorize: async (raw) => {
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

        // Update lastLoginAt (fire-and-forget acceptable; await for correctness)
        await prismaAdmin.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim(),
          tenantId: user.tenantId,
          systemRole: user.systemRole,
          roleId: user.roleId,
        };
      },
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
