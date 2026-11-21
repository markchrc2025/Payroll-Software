/**
 * Wave B (PAY-212, decision 7): ESS self-entry of education, experience and
 * training goes through Profile Requests (src/lib/background/entry-view.ts).
 * The request is checked when filed and again when approved; approval
 * creates the record as if HR had entered it.
 */
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { educationSchema, trainingSchema, workExperienceSchema } from "@/lib/validations/employee-background";
import { applyCourse } from "@/lib/lookups/record-picks";
import type { BackgroundField } from "./entry-view";

type Tx = Prisma.TransactionClient;

export class BackgroundEntryRefusal extends Error {}

// ESS does not attach certificate files to a request (HR can add one later).
const CERT = ["certificateKey", "certificateFileName", "certificateMimeType", "certificateFileSize"] as const;

const SCHEMA: Record<BackgroundField, z.ZodTypeAny> = {
  "background.education": educationSchema,
  "background.experience": workExperienceSchema,
  "background.training": trainingSchema,
};

export function parseBackground(field: BackgroundField, input: unknown) {
  const body = { ...(input && typeof input === "object" ? input as Record<string, unknown> : {}) };
  if (field === "background.training") for (const k of CERT) delete body[k];
  const r = SCHEMA[field].safeParse(body);
  if (!r.success) throw new BackgroundEntryRefusal(r.error.issues[0]?.message ?? "Check the entry");
  return { stored: JSON.stringify(body), data: r.data as Record<string, unknown> };
}

/** Creates the record an approved request asks for; returns its id. */
export async function applyBackground(tx: Tx, p: { tenantId: string; employeeId: string; field: BackgroundField; newValue: string; approverUserId: string | null }): Promise<string> {
  let raw: unknown;
  try { raw = JSON.parse(p.newValue); } catch { throw new BackgroundEntryRefusal("This request cannot be read; reject it and ask the employee to file it again."); }
  const { data } = parseBackground(p.field, raw);
  const base = { tenantId: p.tenantId, employeeId: p.employeeId, createdByUserId: p.approverUserId };
  if (p.field === "background.education") {
    return (await tx.employeeEducation.create({ data: { ...base, ...(data as z.infer<typeof educationSchema>) }, select: { id: true } })).id;
  }
  if (p.field === "background.experience") {
    return (await tx.employeeWorkExperience.create({ data: { ...base, ...(data as z.infer<typeof workExperienceSchema>) }, select: { id: true } })).id;
  }
  const t = await applyCourse(tx, p.tenantId, data as z.infer<typeof trainingSchema>);
  return (await tx.employeeTraining.create({ data: { ...base, ...t }, select: { id: true } })).id;
}
