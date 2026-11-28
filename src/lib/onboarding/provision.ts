/**
 * PAY-74: creating a company. One path for both doors: Central's "create
 * tenant" and the public self-serve sign-up.
 *
 *   createCompanyWithOwner  the company, an Administrator role holding every
 *                           permission, and the owner admin user.
 *   seedTenantDefaults      the rows a company needs before its first payroll
 *                           run (src/lib/onboarding/defaults.ts). Idempotent:
 *                           an existing row (same name, code or date and
 *                           name) is left alone, so it is safe to run again.
 *
 * Both take a transaction on the owner client (prismaAdmin), whose
 * admin_bypass policy lets it write a new tenant's rows.
 */
import { randomInt } from "node:crypto";
import type { PayFrequency, Prisma } from "@prisma/client";
import { countryToTimezone } from "@/lib/time/country-timezone";
import { DEFAULT_LEAVE_TYPES, DEFAULT_SHIFTS, HEAD_OFFICE, NATIONAL_HOLIDAYS } from "./defaults";

type Tx = Prisma.TransactionClient;

/** A company code from the name (letters of the first words) plus three digits, unique. */
export async function makeCompanyCode(tx: Tx, name: string): Promise<string> {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const skip = new Set(["INC", "CORP", "CORPORATION", "CO", "COMPANY", "OPC", "LTD", "THE", "AND", "OF"]);
  const kept = words.filter((w) => !skip.has(w));
  const base = (kept.length >= 2 ? kept.map((w) => w[0]).join("") : (kept[0] ?? words[0] ?? "CO")).slice(0, 6) || "CO";
  for (let i = 0; i < 20; i++) {
    const code = `${base}${randomInt(100, 1000)}`;
    if (!(await tx.tenant.findUnique({ where: { companyCode: code }, select: { id: true } }))) return code;
  }
  throw new Error("could not find a free company code");
}

export type NewCompany = {
  name: string;
  payrollCycle?: PayFrequency;
  contactEmail?: string | null;
  contactPhone?: string | null;
  owner: { firstName: string; lastName: string; email: string; passwordHash: string; phone?: string | null };
};

export async function createCompanyWithOwner(tx: Tx, c: NewCompany) {
  const tenant = await tx.tenant.create({
    data: {
      name: c.name,
      companyCode: await makeCompanyCode(tx, c.name),
      country: "Philippines",
      timezone: countryToTimezone("Philippines"),
      subscriptionTier: "STARTER",
      subscriptionStatus: "TRIALING",
      contactEmail: c.contactEmail ?? c.owner.email,
      contactPhone: c.contactPhone ?? c.owner.phone ?? null,
      ...(c.payrollCycle ? { payrollCycle: c.payrollCycle } : {}),
    },
    select: { id: true, name: true, companyCode: true },
  });
  const permissions = await tx.permission.findMany({ select: { id: true } });
  const role = await tx.role.create({
    data: {
      tenantId: tenant.id,
      name: "Administrator",
      description: "Full access to all modules",
      isSystem: true,
      permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
    },
    select: { id: true },
  });
  const owner = await tx.user.create({
    data: {
      tenantId: tenant.id,
      email: c.owner.email.toLowerCase(),
      passwordHash: c.owner.passwordHash,
      firstName: c.owner.firstName,
      lastName: c.owner.lastName,
      systemRole: "TENANT_USER",
      isActive: true,
      roleId: role.id,
    },
    select: { id: true, email: true },
  });
  await tx.tenant.update({ where: { id: tenant.id }, data: { ownerUserId: owner.id } });
  return { tenant, owner, roleId: role.id };
}

export type SeedResult = { branches: number; shifts: number; leaveTypes: number; holidays: number };

export async function seedTenantDefaults(tx: Tx, tenantId: string, createdByUserId?: string | null): Promise<SeedResult> {
  const out: SeedResult = { branches: 0, shifts: 0, leaveTypes: 0, holidays: 0 };

  if (!(await tx.branch.findFirst({ where: { tenantId, deletedAt: null }, select: { id: true } }))) {
    await tx.branch.create({ data: { tenantId, ...HEAD_OFFICE } });
    out.branches = 1;
  }

  const shiftNames = new Set((await tx.shiftSchedule.findMany({ where: { tenantId }, select: { name: true } })).map((s) => s.name));
  for (const s of DEFAULT_SHIFTS) {
    if (shiftNames.has(s.name)) continue;
    await tx.shiftSchedule.create({ data: { tenantId, ...s, workDays: s.workDays } });
    out.shifts++;
  }

  const leaveCodes = new Set((await tx.leaveType.findMany({ where: { tenantId }, select: { code: true } })).map((l) => l.code));
  for (const l of DEFAULT_LEAVE_TYPES) {
    if (leaveCodes.has(l.code)) continue;
    await tx.leaveType.create({ data: { tenantId, ...l } });
    out.leaveTypes++;
  }

  const onFile = new Set(
    (await tx.holiday.findMany({ where: { tenantId, deletedAt: null }, select: { date: true, name: true } })).map(
      (h) => `${h.date.toISOString().slice(0, 10)}|${h.name.toLowerCase()}`,
    ),
  );
  const missing = Object.values(NATIONAL_HOLIDAYS)
    .flat()
    .filter((h) => !onFile.has(`${h.date}|${h.name.toLowerCase()}`));
  if (missing.length) {
    await tx.holiday.createMany({
      data: missing.map((h) => ({
        tenantId,
        name: h.name,
        category: h.category,
        date: new Date(`${h.date}T00:00:00.000Z`),
        proclamationReference: h.proclamationReference,
        createdByUserId: createdByUserId ?? null,
      })),
    });
    out.holidays = missing.length;
  }
  return out;
}
