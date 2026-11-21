/**
 * Wave C3 (PAY-213): Document Workflow. HR keeps letter templates (a
 * Certificate of Employment, a COE with compensation, clearance forms); an
 * employee requests one in ESS; it is approved like any request; approval
 * fixes the letter's text, and the employee downloads it as a PDF.
 *
 * A template's body is plain text with merge fields in double braces, such as
 * {{employee.fullName}}. Unknown fields are refused when the template is
 * saved. A template that uses a salary field can only be approved by a role
 * that may see pay (PAYROLL:READ).
 *
 * The text is filled from the employee's record at approval and kept on the
 * request (renderedTitle, renderedBody), so a later change to the template or
 * the record does not change a letter already issued; the PDF is drawn from
 * that text on download.
 */
import type { Prisma } from "@prisma/client";
import { z } from "zod";

type Tx = Prisma.TransactionClient;

export const MERGE_FIELDS: Record<string, string> = {
  "employee.fullName": "Full name",
  "employee.firstName": "First name",
  "employee.lastName": "Last name",
  "employee.number": "Employee number",
  "employee.position": "Position",
  "employee.department": "Department",
  "employee.hireDate": "Hire date",
  "employee.employmentStatus": "Employment status",
  "employee.basicSalary": "Basic salary (with its basis, e.g. a month)",
  "employee.annualBasicSalary": "Basic salary for a year",
  "company.name": "Company name",
  "company.address": "Company address",
  "request.purpose": "Purpose the employee gave",
  "today": "Date of issue",
  "signatory.name": "Signatory's name",
  "signatory.title": "Signatory's position",
};
export const SALARY_FIELDS = new Set(["employee.basicSalary", "employee.annualBasicSalary"]);

const FIELD_RE = /\{\{\s*([a-zA-Z.]+)\s*\}\}/g;

export function fieldsIn(text: string): string[] {
  return [...new Set([...text.matchAll(FIELD_RE)].map((m) => m[1]!))];
}

/** The unknown fields in a template, and whether it shows pay. */
export function checkTemplate(title: string, body: string): { unknown: string[]; showsSalary: boolean } {
  const used = [...fieldsIn(title), ...fieldsIn(body)];
  return { unknown: used.filter((f) => !(f in MERGE_FIELDS)), showsSalary: used.some((f) => SALARY_FIELDS.has(f)) };
}

const LONG = new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const long = (d: Date) => LONG.format(d);
const peso = (c: bigint) => `₱${(Number(c) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PER: Record<string, string> = { MONTHLY: "a month", DAILY: "a day", WEEKLY: "a week" };
const STATUS: Record<string, string> = { PROBATIONARY: "probationary", REGULAR: "regular", CONTRACTUAL: "contractual", PROJECT_BASED: "project-based" };
/** Months or days a year by salary type, for the annual figure (days: the employee's divisor, default 261). */
function annual(cents: bigint, type: string | null, divisor: number | null): bigint | null {
  if (type === "MONTHLY") return cents * 12n;
  if (type === "DAILY") return cents * BigInt(divisor ?? 261);
  if (type === "WEEKLY") return cents * 52n;
  return null;
}

/** The merge values for one employee, as of `asOf` (Manila calendar date). */
export async function mergeValues(
  tx: Tx, tenantId: string, employeeId: string,
  extra: { purpose: string | null; signatoryName: string | null; signatoryTitle: string | null; asOf: Date },
): Promise<Record<string, string>> {
  const e = await tx.employee.findFirstOrThrow({
    where: { id: employeeId, tenantId },
    select: {
      firstName: true, middleName: true, lastName: true, suffix: true, employeeNumber: true, hireDate: true, employmentStatus: true,
      jobTitle: true, workingDaysDenominator: true, position: { select: { title: true } }, department: { select: { name: true } },
    },
  });
  const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, tradeName: true, address: true, city: true, province: true, zipCode: true } });
  const term = await tx.employmentTerm.findFirst({
    where: { tenantId, employeeId, basicSalaryCents: { not: null }, effectiveDate: { lte: extra.asOf } },
    orderBy: { effectiveDate: "desc" },
    select: { basicSalaryCents: true, salaryType: true },
  });
  const mi = e.middleName ? ` ${e.middleName.charAt(0).toUpperCase()}.` : "";
  const yearly = term?.basicSalaryCents != null ? annual(term.basicSalaryCents, term.salaryType, e.workingDaysDenominator) : null;
  return {
    "employee.fullName": `${e.firstName}${mi} ${e.lastName}${e.suffix ? ` ${e.suffix}` : ""}`,
    "employee.firstName": e.firstName,
    "employee.lastName": e.lastName,
    "employee.number": e.employeeNumber,
    "employee.position": e.position?.title ?? e.jobTitle ?? "",
    "employee.department": e.department?.name ?? "",
    "employee.hireDate": long(e.hireDate),
    "employee.employmentStatus": STATUS[e.employmentStatus] ?? e.employmentStatus.toLowerCase().replace(/_/g, " "),
    "employee.basicSalary": term?.basicSalaryCents != null ? `${peso(term.basicSalaryCents)} ${PER[term.salaryType ?? ""] ?? ""}`.trim() : "",
    "employee.annualBasicSalary": yearly != null ? peso(yearly) : "",
    "company.name": t.tradeName?.trim() || t.name,
    "company.address": [t.address, t.city, t.province, t.zipCode].filter(Boolean).join(", "),
    "request.purpose": extra.purpose ?? "",
    "today": long(extra.asOf),
    "signatory.name": extra.signatoryName ?? "",
    "signatory.title": extra.signatoryTitle ?? "",
  };
}

export function fill(text: string, values: Record<string, string>): string {
  return text.replace(FIELD_RE, (_, k: string) => values[k] ?? "");
}

/** Today in Manila as a UTC-midnight date. */
export const manilaToday = (now = new Date()) => new Date(`${new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10)}T00:00:00.000Z`);

/** The filled title and body for a request, from its template and the employee's record. */
export async function renderRequest(tx: Tx, tenantId: string, requestId: string, asOf = manilaToday()) {
  const r = await tx.documentRequest.findFirstOrThrow({ where: { id: requestId, tenantId }, include: { template: true } });
  const values = await mergeValues(tx, tenantId, r.employeeId, { purpose: r.purpose, signatoryName: r.template.signatoryName, signatoryTitle: r.template.signatoryTitle, asOf });
  return { title: fill(r.template.title, values), body: fill(r.template.body, values), showsSalary: r.template.showsSalary };
}


/** A template as saved: fields checked, salary use worked out. */
export const templateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  title: z.string().trim().min(1, "Title is required").max(200),
  body: z.string().trim().min(1, "Body is required").max(20000),
  signatoryName: z.string().trim().max(120).nullable().optional(),
  signatoryTitle: z.string().trim().max(120).nullable().optional(),
  availableInEss: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export class TemplateRefusal extends Error {}

export function shapeTemplate(input: unknown, partial: boolean, current?: { title: string; body: string }) {
  const r = (partial ? templateSchema.partial() : templateSchema).safeParse(input);
  if (!r.success) throw new TemplateRefusal(r.error.issues[0]?.message ?? "Check the template");
  const title = r.data.title ?? current?.title ?? "";
  const body = r.data.body ?? current?.body ?? "";
  const { unknown, showsSalary } = checkTemplate(title, body);
  if (unknown.length) throw new TemplateRefusal(`Unknown merge field${unknown.length > 1 ? "s" : ""}: ${unknown.map((u) => `{{${u}}}`).join(", ")}`);
  return { ...r.data, showsSalary };
}

/** Starting templates offered on an empty Management screen. */
export const STARTER_TEMPLATES = [
  {
    name: "Certificate of Employment", title: "Certificate of Employment",
    body: "This is to certify that {{employee.fullName}} has been employed by {{company.name}} as {{employee.position}} since {{employee.hireDate}}, and is a {{employee.employmentStatus}} employee.\n\nThis certification is issued upon the request of {{employee.firstName}} {{employee.lastName}} for {{request.purpose}}.\n\nIssued on {{today}}.\n\n{{signatory.name}}\n{{signatory.title}}",
  },
  {
    name: "Certificate of Employment with Compensation", title: "Certificate of Employment and Compensation",
    body: "This is to certify that {{employee.fullName}} has been employed by {{company.name}} as {{employee.position}} since {{employee.hireDate}}, with a basic salary of {{employee.basicSalary}} ({{employee.annualBasicSalary}} a year).\n\nThis certification is issued upon the request of {{employee.firstName}} {{employee.lastName}} for {{request.purpose}}.\n\nIssued on {{today}}.\n\n{{signatory.name}}\n{{signatory.title}}",
  },
];
