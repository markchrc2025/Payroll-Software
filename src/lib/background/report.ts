/**
 * Wave B (PAY-212): the company-wide Education, Experience, Training and
 * Legal Documents pages. Each answers one table (columns and rows) so the
 * page and its CSV are the same; rows cover the company's current employees.
 *
 * Training and documents carry a status against the as-of date:
 *   Expired   expiry before the as-of date
 *   Expiring  expiry within the next `withinDays` days (default 60)
 *   Valid     a later expiry
 *   No expiry none recorded
 * Legal Documents also lists, for every current employee, each category the
 * company marked "Required from every new hire" that has no document on file
 * (status Missing).
 */
import type { Prisma } from "@prisma/client";
import { CURRENTLY_EMPLOYED_STATUSES } from "@/lib/validations/employee";
import { listItems } from "@/lib/lookups/store";

type Tx = Prisma.TransactionClient;

import { type BackgroundKind, type BackgroundTable, type Column, type Row } from "./report-view";
export { BACKGROUND_KINDS, isBackgroundKind, type BackgroundKind, type BackgroundTable } from "./report-view";

const EMP_COLS: Column[] = [
  { key: "employeeNumber", label: "Employee #" },
  { key: "employeeName", label: "Employee" },
  { key: "department", label: "Department" },
];

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const DAY = 86_400_000;

export function expiryStatus(expiresAt: Date | null, asOf: Date, withinDays: number): "Expired" | "Expiring" | "Valid" | "No expiry" {
  if (!expiresAt) return "No expiry";
  const t = Date.UTC(expiresAt.getUTCFullYear(), expiresAt.getUTCMonth(), expiresAt.getUTCDate());
  const a = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  if (t < a) return "Expired";
  if (t <= a + withinDays * DAY) return "Expiring";
  return "Valid";
}

type Emp = { id: string; employeeNumber: string; firstName: string; lastName: string; department: { name: string } | null };
const empCols = (e: Emp): Row => ({ employeeId: e.id, employeeNumber: e.employeeNumber, employeeName: `${e.lastName}, ${e.firstName}`, department: e.department?.name ?? null });

const TITLES: Record<BackgroundKind, string> = {
  education: "Education", experience: "Experience", training: "Training", "legal-documents": "Legal Documents",
};

export async function loadBackground(
  tx: Tx, tenantId: string, kind: BackgroundKind,
  opts: { asOf?: Date; withinDays?: number } = {},
): Promise<BackgroundTable> {
  // Today in Manila, as a UTC-midnight date like the stored dates.
  const asOf = opts.asOf ?? new Date(`${new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)}T00:00:00.000Z`);
  const withinDays = opts.withinDays ?? 60;
  const employees: Emp[] = await tx.employee.findMany({
    where: { tenantId, deletedAt: null, employmentStatus: { in: [...CURRENTLY_EMPLOYED_STATUSES] } },
    select: { id: true, employeeNumber: true, firstName: true, lastName: true, department: { select: { name: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const byId = new Map(employees.map((e) => [e.id, e]));
  const ids = employees.map((e) => e.id);
  const order = (r: Row) => `${r.employeeName ?? ""}\u0000`;
  const counts: Record<string, number> = {};
  const count = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
  let columns: Column[];
  let rows: Row[];

  if (kind === "education") {
    const recs = await tx.employeeEducation.findMany({ where: { tenantId, deletedAt: null, employeeId: { in: ids } }, orderBy: [{ endYear: "desc" }] });
    columns = [...EMP_COLS, { key: "level", label: "Level" }, { key: "school", label: "School" }, { key: "degree", label: "Degree" }, { key: "fieldOfStudy", label: "Field" }, { key: "years", label: "Years" }, { key: "honors", label: "Honors" }];
    rows = recs.map((r) => ({
      ...empCols(byId.get(r.employeeId)!), id: r.id, level: r.level, school: r.school, degree: r.degree, fieldOfStudy: r.fieldOfStudy,
      years: r.startYear || r.endYear ? `${r.startYear ?? "?"} to ${r.endYear ?? "present"}` : null, honors: r.honors,
    }));
    for (const r of rows) count(r.level ?? "Unspecified");
  } else if (kind === "experience") {
    const recs = await tx.employeeWorkExperience.findMany({ where: { tenantId, deletedAt: null, employeeId: { in: ids } }, orderBy: [{ startDate: "desc" }] });
    columns = [...EMP_COLS, { key: "companyName", label: "Company" }, { key: "position", label: "Position" }, { key: "startDate", label: "From" }, { key: "endDate", label: "To" }, { key: "location", label: "Location" }, { key: "reasonForLeaving", label: "Reason for leaving" }];
    rows = recs.map((r) => ({
      ...empCols(byId.get(r.employeeId)!), id: r.id, companyName: r.companyName, position: r.position,
      startDate: ymd(r.startDate), endDate: ymd(r.endDate) ?? "present", location: r.location, reasonForLeaving: r.reasonForLeaving,
    }));
    counts.records = rows.length;
  } else if (kind === "training") {
    const recs = await tx.employeeTraining.findMany({ where: { tenantId, deletedAt: null, employeeId: { in: ids } }, orderBy: [{ expiresAt: "asc" }, { trainingDate: "desc" }] });
    columns = [...EMP_COLS, { key: "title", label: "Training" }, { key: "provider", label: "Provider" }, { key: "trainingDate", label: "Date" }, { key: "hours", label: "Hours" }, { key: "expiresAt", label: "Expires" }, { key: "status", label: "Status" }];
    rows = recs.map((r) => {
      const status = expiryStatus(r.expiresAt, asOf, withinDays);
      count(status);
      return {
        ...empCols(byId.get(r.employeeId)!), id: r.id, title: r.title, provider: r.provider, trainingDate: ymd(r.trainingDate),
        hours: r.hours == null ? null : String(r.hours), expiresAt: ymd(r.expiresAt), status,
      };
    });
  } else {
    const [docs, categories] = await Promise.all([
      tx.employeeDocument.findMany({ where: { tenantId, deletedAt: null, employeeId: { in: ids } }, orderBy: [{ createdAt: "desc" }] }),
      listItems(tx, tenantId, "DOCUMENT_CATEGORY", true),
    ]);
    const catName = new Map(categories.map((c) => [c.id, c.name]));
    const catByCode = new Map(categories.map((c) => [c.code, c]));
    const label = (d: { categoryId: string | null; category: string }) => (d.categoryId && catName.get(d.categoryId)) || catByCode.get(d.category)?.name || d.category;
    columns = [...EMP_COLS, { key: "category", label: "Category" }, { key: "title", label: "Document" }, { key: "uploadedAt", label: "Uploaded" }, { key: "expiresAt", label: "Expires" }, { key: "status", label: "Status" }];
    rows = docs.map((d) => {
      const status = d.expiresAt ? expiryStatus(d.expiresAt, asOf, withinDays) : "On file";
      count(status);
      return {
        ...empCols(byId.get(d.employeeId)!), id: d.id, category: label(d), title: d.isConfidential ? "Confidential" : d.title,
        uploadedAt: ymd(d.createdAt), expiresAt: ymd(d.expiresAt), status,
      };
    });
    const required = categories.filter((c) => c.isActive && c.deletedAt === null && (c.attributes as Record<string, unknown>)?.requiredForNewHires === true);
    const held = new Set(docs.map((d) => `${d.employeeId}\u0000${d.categoryId ?? catByCode.get(d.category)?.id ?? d.category}`));
    for (const e of employees) {
      for (const c of required) {
        if (held.has(`${e.id}\u0000${c.id}`)) continue;
        count("Missing");
        rows.push({ ...empCols(e), id: `missing:${e.id}:${c.id}`, category: c.name, title: null, uploadedAt: null, expiresAt: null, status: "Missing" });
      }
    }
  }
  rows.sort((a, b) => order(a).localeCompare(order(b)));
  return { kind, title: TITLES[kind], asOf: ymd(asOf)!, withinDays, columns, rows, counts };
}

