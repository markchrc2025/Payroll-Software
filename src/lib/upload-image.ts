/**
 * Browser-side image upload to Cloudflare R2 via a presigned PUT URL.
 *
 * Asks the given presign endpoint for a short-lived upload URL, PUTs the file
 * straight to R2, and returns the stable storage key to persist on the record.
 * Used by the company-logo and employee-photo upload controls.
 */

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ACCEPT_ATTR = ACCEPTED_IMAGE_TYPES.join(",");
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Throws a user-facing Error if the file is the wrong type or too large. */
export function validateImage(file: File): void {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Please choose a JPG, PNG, or WebP image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 5 MB or smaller.");
  }
}

/** Uploads `file` through `presignUrl` and resolves to its R2 storage key. */
export async function uploadImage(file: File, presignUrl: string): Promise<string> {
  validateImage(file);

  const presignRes = await fetch(presignUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
    }),
  });
  const presignJson = await presignRes.json().catch(() => null);
  if (!presignRes.ok) {
    throw new Error(presignJson?.error ?? "Could not start the upload.");
  }

  const { uploadUrl, storageKey } = presignJson.data as {
    uploadUrl: string;
    storageKey: string;
  };

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error("Upload to storage failed. Please try again.");
  }

  return storageKey;
}
