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

import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prismaAdmin from "@/lib/prisma-admin";
import type { SystemRole } from "@prisma/client";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // Legacy/explicit tenant scoping; the redesigned tenant login omits it.
  companyCode: z.string().optional(),
  // Which login screen the request came from: "admin" (Central Portal) is
  // restricted to SUPER_ADMIN accounts; "tenant" (or unset) resolves the
  // account by email across tenants.
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

/**
 * Resolve a Central Portal administrator (SUPER_ADMIN, no tenant) by email.
 * Used by both the password flow and OAuth SSO. SSO never creates accounts —
 * a person must already be provisioned as a Central admin to sign in, which is
 * also what keeps a Sentire admin account distinct from any tenant-employee
 * account that happens to share the same email.
 */
async function findCentralAdminByEmail(email: string) {
  return prismaAdmin.user.findFirst({
    where: {
      email: email.toLowerCase(),
      systemRole: "SUPER_ADMIN",
      tenantId: null,
      isActive: true,
      deletedAt: null,
    },
    select: USER_SELECT,
  });
}

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
 * Central Portal SSO providers. Each is added only when its credentials are
 * present in the environment, so nothing changes in production until the OAuth
 * app is registered and the env vars are set. These back the "Continue with
 * company SSO" button on /centralportal/login (admin scope only for now).
 */
const oauthProviders: NonNullable<NextAuthConfig["providers"]> = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  oauthProviders.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          prompt: "select_account",
          // Restrict the Google account chooser to the company's Workspace
          // domain when CENTRAL_SSO_ALLOWED_DOMAIN is set (e.g. sentire.solutions).
          ...(process.env.CENTRAL_SSO_ALLOWED_DOMAIN
            ? { hd: process.env.CENTRAL_SSO_ALLOWED_DOMAIN }
            : {}),
        },
      },
    }),
  );
}

if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET) {
  oauthProviders.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      // Single-tenant issuer, e.g. https://login.microsoftonline.com/<tenant-id>/v2.0
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
  );
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
          // Legacy/explicit tenant login — verify company code, scope the lookup.
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
    ...oauthProviders,
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Password sign-ins are already verified in authorize().
      if (!account || account.provider === "credentials") return true;

      // OAuth = Central Portal staff SSO (verify-then-match). The IdP proves the
      // person owns the email; we then require that it belongs to an existing
      // Central admin. We never auto-provision accounts.
      const email = (profile?.email ?? user?.email ?? "").toLowerCase();
      if (!email) return false;

      // Only trust an email the IdP marks verified (Google sets this; Entra work
      // accounts are org-managed and treated as verified).
      if (
        account.provider === "google" &&
        (profile as { email_verified?: boolean })?.email_verified !== true
      ) {
        return false;
      }

      // Optionally fence SSO to the company domain.
      const domain = process.env.CENTRAL_SSO_ALLOWED_DOMAIN?.toLowerCase();
      if (domain && !email.endsWith(`@${domain}`)) return false;

      const admin = await findCentralAdminByEmail(email);
      return !!admin;
    },
    async jwt({ token, user, account }) {
      if (user && (!account || account.provider === "credentials")) {
        // user is the object returned from authorize() — only on initial sign-in
        token.userId = user.id as string;
        token.tenantId = (user as { tenantId: string | null }).tenantId;
        token.systemRole = (user as { systemRole: SystemRole }).systemRole;
        token.roleId = (user as { roleId: string | null }).roleId;
      } else if (account && account.provider !== "credentials") {
        // OAuth sign-in: load the Central admin we validated in signIn() and
        // hydrate the token with the same claims the credentials flow sets.
        const email = (token.email ?? user?.email ?? "").toLowerCase();
        const admin = email ? await findCentralAdminByEmail(email) : null;
        if (admin) {
          token.userId = admin.id;
          token.tenantId = admin.tenantId;
          token.systemRole = admin.systemRole;
          token.roleId = admin.roleId;
          await prismaAdmin.user.update({
            where: { id: admin.id },
            data: { lastLoginAt: new Date() },
          });
        }
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
