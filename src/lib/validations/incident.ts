/**
 * Zod validation schemas for IncidentReport management (Phase X).
 */
import { z } from "zod";
import { IncidentType, IncidentStatus } from "@prisma/client";

const cuid = z.string().min(1);

export const createIncidentSchema = z.object({
  employeeId: cuid,
  type: z.nativeEnum(IncidentType),
  subject: z.string().min(1).max(300),
  description: z.string().min(1),
  incidentDate: z.coerce.date(),
  responseDeadline: z.coerce.date().optional().nullable(),
  attachmentUrls: z.array(z.string().url()).optional(),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const updateIncidentSchema = z.object({
  type: z.nativeEnum(IncidentType).optional(),
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
  status: z.enum(["RESOLVED", "CLOSED"]).default("RESOLVED"),
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
