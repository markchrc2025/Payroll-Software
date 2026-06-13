import { z } from "zod";

/** Allowed MIME types for logo / profile-photo image uploads. */
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** 5 MB max per image. */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/** Request body for an image-upload presign (logo or employee photo). */
export const imagePresignSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES, { error: "Unsupported image type" }),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(MAX_IMAGE_SIZE, `Image must be ≤ ${MAX_IMAGE_SIZE / 1024 / 1024} MB`),
});

export type ImagePresignInput = z.infer<typeof imagePresignSchema>;
