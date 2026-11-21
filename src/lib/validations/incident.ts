/**
 * Zod validation schemas for IncidentReport management (Phase X).
 */
import { z } from "zod";
import { IncidentType, IncidentStatus } from "@prisma/client";

const cuid = z.string().min(1);

// Wave A3 (PAY-210): typeId and categoryId are the company's list items
// (src/lib/incidents/lists.ts); `type` alone still works for the built-in stages.
const listPicks = {
  typeId: cuid.optional(),
  categoryId: cuid.nullable().optional(),
};

export const createIncidentSchema = z.object({
  employeeId: cuid,
  type: z.nativeEnum(IncidentType).optional(),
  ...listPicks,
  subject: z.string().min(1).max(300),
  description: z.string().min(1),
  incidentDate: z.coerce.date(),
  responseDeadline: z.coerce.date().optional().nullable(),
  attachmentUrls: z.array(z.string().url()).optional(),
}).refine((v) => v.type || v.typeId, { message: "Choose the incident type", path: ["typeId"] });

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const updateIncidentSchema = z.object({
  type: z.nativeEnum(IncidentType).optional(),
  ...listPicks,
  subject: z.string().min(1).max(300).optional(),
  description: z.string().min(1).optional(),
  incidentDate: z.coerce.date().optional(),
  responseDeadline: z.coerce.date().optional().nullable(),
  status: z.nativeEnum(IncidentStatus).optional(),
  attachmentUrls: z.array(z.string().url()).optional(),
  resolution: z.string().max(2000).optional().nullable(),
});

export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;

export const resolveIncidentSchema = z.object({
  resolution: z.string().min(1).max(2000),
  /** Wave A3: the Incident Decisions item; its outcome is copied onto the incident. */
  decisionId: cuid.nullable().optional(),
  status: z.enum(["RESOLVED", "CLOSED"]).default("RESOLVED"),
  /** Wave G3: a suspension's first day; a dismissal's last working day (YYYY-MM-DD). */
  suspensionStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lastWorkingDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type ResolveIncidentInput = z.infer<typeof resolveIncidentSchema>;

export const respondIncidentSchema = z.object({
  employeeResponse: z.string().min(1),
});

export type RespondIncidentInput = z.infer<typeof respondIncidentSchema>;

export const listIncidentsSchema = z.object({
  type: z.nativeEnum(IncidentType).optional(),
  status: z.nativeEnum(IncidentStatus).optional(),
  employeeId: cuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
