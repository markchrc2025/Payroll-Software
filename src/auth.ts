/**
 * NextAuth v5 configuration — Sentire Payroll
 * --------------------------------------------
 * Strategy: JWT (httpOnly cookie) + Credentials provider (email + password via bcrypt).
 * The JWT carries: userId, tenantId, systemRole, roleId so server routes can authorize
 * without an extra DB lookup on every request.
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
import prisma from "@/lib/prisma";
import type { SystemRole } from "@prisma/client";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.user.findFirst({
          where: {
            email: email.toLowerCase(),
            isActive: true,
            deletedAt: null,
          },
          select: {
            id: true,
            email: true,
            passwordHash: true,
            firstName: true,
            lastName: true,
            tenantId: true,
            systemRole: true,
            roleId: true,
          },
        });

        if (!user) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        // Update lastLoginAt (fire-and-forget acceptable; await for correctness)
        await prisma.user.update({
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
    authorized({ auth: a }) {
      // Used by the middleware/proxy below to gate access
      return !!a?.user;
    },
  },
});
