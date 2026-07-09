/**
 * Shared multipart-upload reader for the server-side upload routes.
 *
 * All direct-to-storage browser uploads were replaced by server-side uploads
 * (browser -> our API -> bucket) because the object-storage provider offers no
 * way to set a bucket CORS policy. Each upload route reads the file with this
 * helper, applies its own auth/context checks, then calls r2.putObject().
 */

import { err } from "@/lib/api-response";

type ReadResult = { file: File; error?: never } | { file?: never; error: Response };

/**
 * Read + validate the "file" field of a multipart request.
 * Returns the File, or an `error` Response ready to be returned to the client.
 */
export async function readUploadedFile(
  req: Request,
  opts: { allowedTypes: readonly string[]; maxBytes: number; label?: string },
): Promise<ReadResult> {
  const label = opts.label ?? "File";
  const form = await req.formData().catch(() => null);
  if (!form) return { error: err("Expected a multipart/form-data request.", 400) };

  const file = form.get("file");
  if (!(file instanceof File)) return { error: err("No file provided.", 400) };

  if (!opts.allowedTypes.includes(file.type)) {
    return { error: err("Unsupported file type.", 400) };
  }
  if (file.size <= 0) return { error: err(`${label} is empty.`, 400) };
  if (file.size > opts.maxBytes) {
    return {
      error: err(`${label} must be ≤ ${Math.round(opts.maxBytes / 1024 / 1024)} MB.`, 400),
    };
  }

  return { file };
}
