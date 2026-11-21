/**
 * Wave A (Soon plan, approved by Mark 21 Nov 2026): the lists each company
 * keeps. One registry: each list's label, its extra fields and the items a
 * company starts with (editable; items marked system cannot be deleted).
 *
 * Decisions applied: 4 (the bank list includes e-wallets as their own kind);
 * 5 (ethnicity and religion are optional, behind consent and a sensitive-data
 * permission, never used in pay; the lists start empty because each company
 * decides whether and how to record them).
 */
import { z } from "zod";

export type FieldKind = "text" | "number" | "money" | "boolean" | "select";
export interface AttributeField { key: string; label: string; kind: FieldKind; options?: string[]; help?: string }
export interface ListDefinition {
  key: string;
  label: string;
  /** What one item is called, for buttons ("Add bank"). */
  noun: string;
  description: string;
  fields: AttributeField[];
  defaults: { code: string; name: string; attributes?: Record<string, unknown>; isSystem?: boolean }[];
  /** Sensitive personal information (Data Privacy Act): read only with EMPLOYEES_SENSITIVE. */
  sensitive?: boolean;
}

const BANKS = [
  ["BDO", "BDO Unibank"], ["BPI", "Bank of the Philippine Islands"], ["MBTC", "Metrobank"], ["LBP", "Land Bank of the Philippines"],
  ["PNB", "Philippine National Bank"], ["SECB", "Security Bank"], ["UBP", "UnionBank of the Philippines"], ["RCBC", "RCBC"],
  ["CHIB", "China Banking Corporation"], ["EWB", "EastWest Bank"], ["DBP", "Development Bank of the Philippines"], ["PSB", "PSBank"],
] as const;

export const LISTS: Record<string, ListDefinition> = {
  BANK: {
    key: "BANK", label: "Banks", noun: "bank",
    description: "Banks and e-wallets for employees' payout accounts, and later the bank payroll files.",
    fields: [
      { key: "kind", label: "Kind", kind: "select", options: ["BANK", "EWALLET"] },
      { key: "shortName", label: "Short name", kind: "text" },
      { key: "swiftCode", label: "SWIFT/BIC", kind: "text" },
    ],
    defaults: [
      ...BANKS.map(([code, name]) => ({ code, name, attributes: { kind: "BANK", shortName: code } })),
      { code: "GCASH", name: "GCash", attributes: { kind: "EWALLET", shortName: "GCash" } },
      { code: "MAYA", name: "Maya", attributes: { kind: "EWALLET", shortName: "Maya" } },
    ],
  },
  COURSE: {
    key: "COURSE", label: "Courses", noun: "course",
    description: "Training courses the company runs or sends employees to. A training record picked from a course takes its hours and validity.",
    fields: [
      { key: "provider", label: "Provider", kind: "text" },
      { key: "defaultHours", label: "Hours", kind: "number" },
      { key: "certificateValidityMonths", label: "Certificate valid for (months)", kind: "number", help: "Blank: does not expire" },
    ],
    defaults: [],
  },
  TRAINER: {
    key: "TRAINER", label: "Trainers", noun: "trainer",
    description: "People who run trainings: employees of the company or outside trainers.",
    fields: [
      { key: "kind", label: "Kind", kind: "select", options: ["INTERNAL", "EXTERNAL"] },
      { key: "organization", label: "Company or school", kind: "text" },
      { key: "email", label: "Email", kind: "text" },
    ],
    defaults: [],
  },
  DOCUMENT_CATEGORY: {
    key: "DOCUMENT_CATEGORY", label: "Document Categories", noun: "category",
    description: "Categories of employee documents. Confidential ones are seen only by roles allowed confidential files.",
    fields: [
      { key: "isConfidentialByDefault", label: "Confidential by default", kind: "boolean" },
      { key: "requiresExpiry", label: "Has an expiry date", kind: "boolean" },
      { key: "requiredForNewHires", label: "Required from every new hire", kind: "boolean" },
    ],
    defaults: [
      ["CONTRACT", "Employment contract", true], ["VALID_ID", "Valid ID", false], ["GOVERNMENT_FORM", "Government form", false],
      ["MEDICAL", "Medical", true], ["RESUME", "Resume", false], ["EDUCATION", "Education", false], ["TRAINING_CERT", "Training certificate", false],
      ["PERFORMANCE", "Performance", true], ["CLEARANCE", "Clearance", false], ["TAX", "Tax", true], ["OTHER", "Other", false],
    ].map(([code, name, conf]) => ({ code: code as string, name: name as string, isSystem: true, attributes: { isConfidentialByDefault: conf, requiresExpiry: false, requiredForNewHires: false } })),
  },
  EXPENSE_CATEGORY: {
    key: "EXPENSE_CATEGORY", label: "Expense Categories", noun: "category",
    description: "What the money was for. A claim over a limit is flagged for the approver, not blocked (decision 6).",
    fields: [
      { key: "receiptRequired", label: "Receipt required", kind: "boolean" },
      { key: "limitPerClaimCents", label: "Limit per claim", kind: "money" },
      { key: "limitPerMonthCents", label: "Limit per month", kind: "money" },
      { key: "glAccountCode", label: "GL account", kind: "text", help: "For the accounting export" },
    ],
    defaults: [
      ["TRANSPORT", "Transportation"], ["MEALS", "Meals"], ["COMMUNICATION", "Communication"], ["SUPPLIES", "Office supplies"],
      ["LODGING", "Lodging"], ["REPRESENTATION", "Representation"], ["OTHER", "Other"],
    ].map(([code, name]) => ({ code: code!, name: name!, attributes: { receiptRequired: true } })),
  },
  EXPENSE_TYPE: {
    key: "EXPENSE_TYPE", label: "Expense Types", noun: "type",
    description: "How a claim is paid and taxed. The approver may change a claim's tax treatment, with a reason.",
    fields: [
      { key: "taxTreatment", label: "Tax treatment", kind: "select", options: ["NONTAXABLE_REIMBURSEMENT", "DE_MINIMIS", "TAXABLE"] },
      { key: "deMinimisCode", label: "De minimis item", kind: "text", help: "For DE_MINIMIS, e.g. RICE_SUBSIDY" },
    ],
    defaults: [
      { code: "REIMBURSEMENT", name: "Reimbursement", isSystem: true, attributes: { taxTreatment: "NONTAXABLE_REIMBURSEMENT" } },
      { code: "TAXABLE_ALLOWANCE", name: "Taxable allowance", isSystem: true, attributes: { taxTreatment: "TAXABLE" } },
      { code: "DE_MINIMIS", name: "De minimis benefit", isSystem: true, attributes: { taxTreatment: "DE_MINIMIS" } },
      { code: "CASH_ADVANCE", name: "Cash advance liquidation", isSystem: true, attributes: { taxTreatment: "NONTAXABLE_REIMBURSEMENT" } },
    ],
  },
  INCIDENT_CATEGORY: {
    key: "INCIDENT_CATEGORY", label: "Incident Categories", noun: "category",
    description: "Offense groups from the company's Code of Conduct.",
    fields: [{ key: "severity", label: "Severity", kind: "select", options: ["LIGHT", "LESS_GRAVE", "GRAVE"] }],
    defaults: [
      ["ATTENDANCE", "Attendance and punctuality", "LIGHT"], ["CONDUCT", "Conduct and behavior", "LESS_GRAVE"], ["SAFETY", "Safety and security", "GRAVE"],
      ["DISHONESTY", "Dishonesty and fraud", "GRAVE"], ["PERFORMANCE", "Work performance", "LIGHT"],
    ].map(([code, name, severity]) => ({ code: code!, name: name!, attributes: { severity } })),
  },
  INCIDENT_TYPE: {
    key: "INCIDENT_TYPE", label: "Incident Types", noun: "type",
    description: "The document stage of an incident. The built-in stages cannot be deleted.",
    fields: [],
    defaults: [
      ["INCIDENT_REPORT", "Incident report"], ["NOTICE_TO_EXPLAIN", "Notice to explain"], ["NOTICE_OF_DECISION", "Notice of decision"],
      ["DISCIPLINARY_ACTION", "Disciplinary action"], ["COMMENDATION", "Commendation"], ["MEMO", "Memo"], ["OTHER", "Other"],
    ].map(([code, name]) => ({ code: code!, name: name!, isSystem: true })),
  },
  INCIDENT_DECISION: {
    key: "INCIDENT_DECISION", label: "Incident Decisions", noun: "decision",
    description: "The sanctions a decision can impose. A suspension's days become unpaid days in payroll (Wave G).",
    fields: [
      { key: "suspensionDays", label: "Suspension days", kind: "number" },
      { key: "isDismissal", label: "Dismissal", kind: "boolean", help: "Starts offboarding" },
    ],
    defaults: [
      { code: "CLEARED", name: "Cleared, no sanction", attributes: {} },
      { code: "VERBAL_WARNING", name: "Verbal warning", attributes: {} },
      { code: "WRITTEN_WARNING", name: "Written warning", attributes: {} },
      { code: "SUSPENSION", name: "Suspension", attributes: { suspensionDays: 3 } },
      { code: "DISMISSAL", name: "Dismissal", attributes: { isDismissal: true } },
    ],
  },
  ETHNICITY: {
    key: "ETHNICITY", label: "Ethnicity", noun: "ethnicity", sensitive: true,
    description: "Sensitive personal information (Data Privacy Act): recorded only with the employee's consent, seen only with the sensitive-data permission, never used in pay.",
    fields: [], defaults: [],
  },
  RELIGION: {
    key: "RELIGION", label: "Religion", noun: "religion", sensitive: true,
    description: "Sensitive personal information (Data Privacy Act): recorded only with the employee's consent, seen only with the sensitive-data permission, never used in pay.",
    fields: [], defaults: [],
  },
};

export const LIST_KEYS = Object.keys(LISTS);
export const isListKey = (k: string): k is keyof typeof LISTS => Object.prototype.hasOwnProperty.call(LISTS, k);

/** The attributes of one item, checked against its list's fields; unknown keys are dropped. */
export function attributesSchema(def: ListDefinition) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of def.fields) {
    shape[f.key] = f.kind === "boolean" ? z.boolean().optional()
      : f.kind === "number" ? z.number().int().min(0).max(100000).nullish()
      : f.kind === "money" ? z.string().regex(/^\d{1,13}$/, `${f.label}: whole centavos`).nullish()
      : f.kind === "select" ? z.enum(f.options as [string, ...string[]]).nullish()
      : z.string().trim().max(200).nullish();
  }
  return z.object(shape).strip();
}

export const itemSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,40}$/, "Code: letters, digits, - and _ only"),
  name: z.string().trim().min(1).max(120),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
  attributes: z.record(z.string(), z.unknown()).default({}),
});
