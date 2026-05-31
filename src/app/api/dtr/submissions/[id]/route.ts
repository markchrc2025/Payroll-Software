/**
 * /api/dtr/submissions/[id]
 *   GET — return submission with daily DTR breakdown + audit log
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { notFound, ok, unauthorized } from "@/lib/api-response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const { id } = await params;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const submission = await tx.dTRSubmission.findFirst({
      where: { id, tenantId: auth.tenantId },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeNumber: true,
            department: { select: { name: true } },
            branch: { select: { name: true } },
            immediateSupervisor: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        supervisor: {
          select: { id: true, firstName: true, lastName: true },
        },
        manager: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
    if (!submission) return null;

    // Fetch DTR records for this employee for the cutoff period
    const dtrRecords = await tx.dTRRecord.findMany({
      where: {
        tenantId: auth.tenantId,
        employeeId: submission.employeeId,
        date: {
          gte: submission.periodStart,
          lte: new Date(
            new Date(submission.periodEnd).setUTCHours(23, 59, 59, 999),
          ),
        },
      },
      orderBy: { date: "asc" },
    });

    // Fetch audit log entries for all these DTR records
    const dtrRecordIds = dtrRecords.map((r) => r.id);
    const auditLogs =
      dtrRecordIds.length > 0
        ? await tx.dTRAuditLog.findMany({
            where: { dtrRecordId: { in: dtrRecordIds } },
            orderBy: { createdAt: "asc" },
          })
        : [];

    return { ...submission, dtrRecords, auditLogs };
  });

  if (!result) return notFound();
  return ok(result);
}
