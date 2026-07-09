/**
 * Browser-side image upload helper.
 *
 * Posts the file to one of our own server-side upload endpoints (same-origin,
 * so no object-storage CORS is required); the server stores it and returns the
 * stable storage key to persist on the record. Used by the company-logo and
 * employee-photo upload controls.
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

/** Uploads `file` to the given server upload endpoint; resolves to its storage key. */
export async function uploadImage(file: File, uploadUrl: string): Promise<string> {
  validateImage(file);

  const form = new FormData();
  form.append("file", file);

  const res = await fetch(uploadUrl, { method: "POST", body: form });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error ?? "Upload failed. Please try again.");
  }

  return (json.data as { storageKey: string }).storageKey;
}
