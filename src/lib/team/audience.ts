/**
 * Wave F2 and F3 (PAY-216): who a discussion thread or a shared document is
 * for: departments and branches, an empty list meaning everyone. An employee
 * is in the audience when every non-empty list includes theirs.
 */
import type { Prisma } from "@prisma/client";
import { z } from "zod";

type Tx = Prisma.TransactionClient;

export const audienceSchema = z.object({
  departmentIds: z.array(z.string()).default([]),
  branchIds: z.array(z.string()).default([]),
}).default({ departmentIds: [], branchIds: [] });
export type Audience = z.infer<typeof audienceSchema>;

export const asAudience = (j: Prisma.JsonValue): Audience => {
  const a = (j && typeof j === "object" && !Array.isArray(j) ? j : {}) as Partial<Audience>;
  return { departmentIds: Array.isArray(a.departmentIds) ? a.departmentIds : [], branchIds: Array.isArray(a.branchIds) ? a.branchIds : [] };
};

export function inAudience(a: Audience, e: { departmentId: string | null; branchId: string | null }): boolean {
  if (a.departmentIds.length && (!e.departmentId || !a.departmentIds.includes(e.departmentId))) return false;
  if (a.branchIds.length && (!e.branchId || !a.branchIds.includes(e.branchId))) return false;
  return true;
}

/** The current employees an audience covers. */
export async function audienceEmployees(tx: Tx, tenantId: string, a: Audience) {
  return tx.employee.findMany({
    where: {
      tenantId, deletedAt: null, employmentStatus: { notIn: ["RESIGNED", "TERMINATED"] },
      ...(a.departmentIds.length ? { departmentId: { in: a.departmentIds } } : {}),
      ...(a.branchIds.length ? { branchId: { in: a.branchIds } } : {}),
    },
    select: { id: true, firstName: true, lastName: true, employeeNumber: true, departmentId: true, branchId: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

/** Employees named as @First Last (or @employee-number) in a text, among those given. */
export function mentionsIn(text: string, people: { id: string; firstName: string; lastName: string; employeeNumber: string }[]): string[] {
  const t = text.toLowerCase();
  return people.filter((p) => t.includes(`@${p.firstName} ${p.lastName}`.toLowerCase()) || t.includes(`@${p.employeeNumber}`.toLowerCase())).map((p) => p.id);
}
