/**
 * POST /api/attendance-logs/import  (PAY-170)
 *
 * Import punches from a biometric device export. Body, either:
 *   { "csv": "<text with a header line>" }   or
 *   { "rows": [{ "employeeNumber", "punchedAt", "punchType" }] }
 *
 * All or nothing: 422 with every problem (row numbers) and nothing written,
 * or 200 with the counts. Each affected day's DTR is recomputed the same way
 * as a live punch. See src/lib/attendance/import.ts for the rules.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/require-permission";
import { err, ok, serverError } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit";
import { importPunches, parsePunchCsv, MAX_IMPORT_ROWS, type PunchImportRow } from "@/lib/attendance/import";

const bodySchema = z.union([
  z.object({ csv: z.string().min(1).max(2_000_000) }),
  z.object({
    rows: z
      .array(z.object({ employeeNumber: z.string(), punchedAt: z.string(), punchType: z.string() }))
      .min(1)
      .max(MAX_IMPORT_ROWS),
  }),
]);

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "TIMESHEETS", "UPDATE");
  if (guard instanceof Response) return guard;
  const { ctx: auth } = guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err("Send either csv text or rows of punches", 422, parsed.error.flatten());

  try {
    let rows: PunchImportRow[];
    if ("csv" in parsed.data) {
      const csv = parsePunchCsv(parsed.data.csv);
      if (csv.problems.length > 0) return err("The file could not be read", 422, { problems: csv.problems });
      rows = csv.rows;
    } else {
      rows = parsed.data.rows;
    }

    const result = await importPunches(auth.tenantId, rows);
    if (!result.ok) return err("Nothing was imported. Fix these rows and import again.", 422, { problems: result.problems });

    await writeAuditLog({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: "CREATE",
      entity: "AttendanceLogImport",
      changes: { imported: result.imported, duplicates: result.duplicates, daysRecomputed: result.daysRecomputed },
    });
    return ok(result);
  } catch (e) {
    return serverError(e);
  }
}
