/**
 * POST /api/ess/auth
 *
 * Employee Self-Service login.  Authenticates an employee using:
 *   • employeeNumber + birthDate  (primary — no PIN required)
 *   • employeeNumber + pin        (if the employee has set an ESS PIN)
 *
 * On success: creates an EssSession and returns the raw token.
 * The client must include `Authorization: Bearer <token>` on subsequent ESS
 * requests.
 *
 * Body: { employeeNumber: string, tenantId: string, birthDate?: string (YYYY-MM-DD), pin?: string }
 *
 * Note: `tenantId` is required because ESS is multi-tenant — the login page
 * must know which company the employee belongs to (e.g. from subdomain).
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { err, ok, serverError } from "@/lib/api-response";
import { createEssSession, verifyEssPin } from "@/lib/ess-auth";
import prismaAdmin from "@/lib/prisma-admin";

const LoginSchema = z
  .object({
    tenantId: z.string().min(1),
    employeeNumber: z.string().min(1),
    birthDate: z.string().optional(), // "YYYY-MM-DD"
    pin: z.string().min(4).max(8).optional(),
  })
  .refine((d) => d.birthDate !== undefined || d.pin !== undefined, {
    message: "Provide either birthDate or pin",
  });

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return err("Validation failed", 400, parsed.error.flatten());
  }

  const { tenantId, employeeNumber, birthDate, pin } = parsed.data;

  try {
    // Lookup employee using the admin client (BYPASSRLS) — we scope by tenantId
    // explicitly in the WHERE clause, so tenant isolation is preserved.
    const employee = await prismaAdmin.$queryRaw<
      Array<{
        id: string;
        birthDate: Date | null;
        essPin: string | null;
        deletedAt: Date | null;
        employmentStatus: string;
      }>
    >`
      SELECT id, "birthDate", "essPin", "deletedAt", "employmentStatus"
      FROM "Employee"
      WHERE "tenantId" = ${tenantId}
        AND "employeeNumber" = ${employeeNumber}
      LIMIT 1
    `;

    if (employee.length === 0) {
      return err("Invalid credentials", 401);
    }

    const emp = employee[0]!;

    // Block terminated / deleted employees
    if (emp.deletedAt !== null) {
      return err("Invalid credentials", 401);
    }
    if (["RESIGNED", "TERMINATED", "RETIRED"].includes(emp.employmentStatus)) {
      return err("Access denied — inactive employee", 403);
    }

    let authenticated = false;

    if (pin !== undefined) {
      // PIN-based auth
      if (!emp.essPin) {
        return err("No ESS PIN set — use birthdate login", 400);
      }
      authenticated = await verifyEssPin(pin, emp.essPin);
    } else if (birthDate !== undefined) {
      // Birthdate-based auth — compare UTC midnight
      if (!emp.birthDate) {
        return err("Birthdate not on record — contact HR", 400);
      }
      const storedDate = emp.birthDate.toISOString().split("T")[0]; // "YYYY-MM-DD"
      authenticated = storedDate === birthDate;
    }

    if (!authenticated) {
      return err("Invalid credentials", 401);
    }

    const rawToken = await createEssSession(tenantId, emp.id);
    return ok({ token: rawToken, employeeId: emp.id }, "Login successful");
  } catch (e) {
    console.error("[ess/auth]", e);
    return serverError(e);
  }
}
