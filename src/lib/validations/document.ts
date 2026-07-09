import { z } from "zod";

export const DOCUMENT_CATEGORIES = [
  "CONTRACT",
  "VALID_ID",
  "GOVERNMENT_FORM",
  "MEDICAL",
  "RESUME",
  "EDUCATION",
  "TRAINING_CERT",
  "PERFORMANCE",
  "CLEARANCE",
  "TAX",
  "OTHER",
] as const;

/** Allowed MIME types for 201-file uploads. */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

/** 25 MB max per file. */
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

/** Used after the server-side upload — confirm and persist metadata. */
export const finalizeDocumentSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  isConfidential: z.coerce.boolean().default(false),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE),
  storageKey: z.string().min(1).max(500),
});

export type FinalizeDocumentInput = z.infer<typeof finalizeDocumentSchema>;
