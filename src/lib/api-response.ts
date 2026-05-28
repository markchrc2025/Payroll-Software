/**
 * Typed API response helpers.
 * All route handlers return consistent JSON envelopes.
 */

export type ApiSuccess<T> = {
  data: T;
  message?: string;
};

export type ApiError = {
  error: string;
  details?: unknown;
};

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export function ok<T>(data: T, message?: string, status = 200): Response {
  return Response.json({ data, message } satisfies ApiSuccess<T>, { status });
}

export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): Response {
  return Response.json({
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  } satisfies PaginatedResponse<T>);
}

export function err(message: string, status = 400, details?: unknown): Response {
  return Response.json({ error: message, details } satisfies ApiError, {
    status,
  });
}

export function unauthorized(): Response {
  return err("Unauthorized", 401);
}

export function forbidden(message = "Forbidden"): Response {
  return err(message, 403);
}

export function notFound(resource = "Resource"): Response {
  return err(`${resource} not found`, 404);
}

export function serverError(e: unknown): Response {
  console.error(e);
  return err("Internal server error", 500);
}
