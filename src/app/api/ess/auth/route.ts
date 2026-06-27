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
 * Body: { companyCode: string, employeeNumber: string, birthDate?: string (YYYY-MM-DD), pin?: string }
 *
 * Note: `companyCode` is required — employees use their company's short code
 * (e.g. "DEMOCORP") to identify their tenant. Resolved to the internal tenantId.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { err, ok, serverError } from "@/lib/api-response";
import { createEssSession, verifyEssPin, verifyEssPassword } from "@/lib/ess-auth";
import prismaAdmin from "@/lib/prisma-admin";

const LoginSchema = z
  .object({
    companyCode: z.string().min(1),
    employeeNumber: z.string().min(1),
    birthDate: z.string().optional(), // "YYYY-MM-DD"
    pin: z.string().min(4).max(8).optional(),
    password: z.string().min(1).optional(),
  })
  .refine((d) => d.birthDate !== undefined || d.pin !== undefined || d.password !== undefined, {
    message: "Provide a birthDate, pin or password",
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

  const { companyCode, employeeNumber, birthDate, pin, password } = parsed.data;

  try {
    // Resolve companyCode → tenantId
    const tenant = await prismaAdmin.tenant.findFirst({
      where: { companyCode: companyCode.trim().toUpperCase(), deletedAt: null },
      select: { id: true },
    });
    if (!tenant) {
      return err("Invalid credentials", 401);
    }
    const tenantId = tenant.id;

    // Lookup employee using the admin client (BYPASSRLS) — scoped by tenantId
    const employee = await prismaAdmin.$queryRaw<
      Array<{
        id: string;
        birthDate: Date | null;
        essPin: string | null;
        deletedAt: Date | null;
        employmentStatus: string;
        essAccessStatus: string;
        essDeactivateAt: Date | null;
      }>
    >`
      SELECT id, "birthDate", "essPin", "deletedAt", "employmentStatus",
             "essAccessStatus", "essDeactivateAt"
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

    // ESS access gate — employees do NOT have access by default; HR must grant
    // it. NOT_INVITED / DISABLED cannot sign in.
    if (emp.essAccessStatus === "NOT_INVITED" || emp.essAccessStatus === "DISABLED") {
      return err("Employee Self-Service access isn't enabled for your account — please contact HR.", 403);
    }
    // Scheduled deactivation is authoritative even if the hourly sweep hasn't
    // run yet: once the time passes, access is denied.
    if (emp.essDeactivateAt && emp.essDeactivateAt.getTime() <= Date.now()) {
      return err("Your Employee Self-Service access has ended — please contact HR.", 403);
    }

    let authenticated = false;

    if (password !== undefined) {
      // Password-based auth. essPasswordHash may not exist yet (column added by
      // the ESS password migration) — query it defensively so PIN/DOB login keep
      // working before the migration is applied.
      let hash: string | null = null;
      try {
        const rows = await prismaAdmin.$queryRaw<Array<{ essPasswordHash: string | null }>>`
          SELECT "essPasswordHash" FROM "Employee" WHERE id = ${emp.id} LIMIT 1
        `;
        hash = rows[0]?.essPasswordHash ?? null;
      } catch {
        return err("Password sign-in isn't available yet — use your PIN or date of birth.", 400);
      }
      if (!hash) {
        return err("No ESS password set — sign in with your PIN or date of birth, then set one in Settings.", 400);
      }
      authenticated = await verifyEssPassword(password, hash);
    } else if (pin !== undefined) {
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

    // First successful login flips INVITED → ACTIVE; always record last login.
    await prismaAdmin.employee.update({
      where: { id: emp.id },
      data: {
        essLastLoginAt: new Date(),
        ...(emp.essAccessStatus === "INVITED"
          ? { essAccessStatus: "ACTIVE", essActivatedAt: new Date() }
          : {}),
      },
    });

    const rawToken = await createEssSession(tenantId, emp.id);
    return ok({ token: rawToken, employeeId: emp.id }, "Login successful");
  } catch (e) {
    console.error("[ess/auth]", e);
    return serverError(e);
  }
}
