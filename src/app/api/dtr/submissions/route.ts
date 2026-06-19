/**
 * /api/dtr/submissions
 *   GET  — list DTR period-submissions (paginated, filterable)
 *   POST — create a new DTR submission (HR on behalf of employee, or ESS)
 */
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/with-tenant";
import { getAuthContext } from "@/lib/auth";
import { err, ok, paginated, unauthorized } from "@/lib/api-response";
import {
  createDtrSubmissionSchema,
  listDtrSubmissionsSchema,
} from "@/lib/validations/dtr";
import { enqueueDtrSubmitted } from "@/lib/jobs/workers";
import { snapshotApprovalChain } from "@/lib/approvals/snapshot";
import { findSubmissionBlockers, describeBlockers } from "@/lib/dtr/submission-guard";

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const qp = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listDtrSubmissionsSchema.safeParse(qp);
  if (!parsed.success) return err("Invalid query", 422, parsed.error.flatten());
  const { employeeId, status, periodStart, periodEnd, page, limit } = parsed.data;

  const where: Prisma.DTRSubmissionWhereInput = {
    tenantId: auth.tenantId,
    ...(employeeId && { employeeId }),
    ...(status && { status }),
    ...((periodStart || periodEnd) && {
      periodStart: periodStart ? { gte: new Date(periodStart) } : undefined,
      periodEnd: periodEnd ? { lte: new Date(periodEnd + "T23:59:59.999Z") } : undefined,
    }),
  };

  const [rows, total] = await withTenant(auth.tenantId, (tx) =>
    Promise.all([
      tx.dTRSubmission.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeNumber: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ periodEnd: "desc" }, { submittedAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.dTRSubmission.count({ where }),
    ]),
  );

  return paginated(rows, total, page, limit);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = createDtrSubmissionSchema.safeParse(body);
  if (!parsed.success) return err("Invalid body", 422, parsed.error.flatten());
  const d = parsed.data;

  const result = await withTenant(auth.tenantId, async (tx) => {
    // Validate employee belongs to tenant
    const employee = await tx.employee.findFirst({
      where: { id: d.employeeId, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) return "NOT_FOUND_EMP";

    const periodStart = new Date(d.periodStart + "T00:00:00.000Z");
    const periodEnd = new Date(d.periodEnd + "T00:00:00.000Z");

    // Prevent duplicate submission for same employee + period
    const existing = await tx.dTRSubmission.findFirst({
      where: {
        tenantId: auth.tenantId,
        employeeId: d.employeeId,
        periodStart,
        periodEnd,
      },
      select: { id: true },
    });
    if (existing) return "DUPLICATE";

    // Block submission while OT / undertime / leave for this period are pending.
    const blockers = await findSubmissionBlockers(
      tx, auth.tenantId, d.employeeId, periodStart, periodEnd,
    );
    if (blockers.length > 0) {
      return { blocked: true as const, blockers };
    }

    const submission = await tx.dTRSubmission.create({
      data: {
        tenantId: auth.tenantId,
        employeeId: d.employeeId,
        periodStart,
        periodEnd,
        status: "SUBMITTED",
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
        },
      },
    });

    // Snapshot the DTR approval chain. If no approvers resolve, the submission
    // is immediately final-approved (eligible for payroll).
    const snap = await snapshotApprovalChain(tx, {
      module: "DTR",
      entityId: submission.id,
      requesterId: d.employeeId,
      tenantId: auth.tenantId,
    });

    if (snap.activeSteps === 0) {
      await tx.dTRSubmission.update({
        where: { id: submission.id },
        data: { status: "MANAGER_APPROVED" },
      });
    } else if (snap.firstStepIndex !== 0) {
      await tx.dTRSubmission.update({
        where: { id: submission.id },
        data: { currentStepIndex: snap.firstStepIndex },
      });
    }

    return submission;
  });

  if (result === "NOT_FOUND_EMP") return err("Employee not found", 404);
  if (result === "DUPLICATE")
    return err("A submission already exists for this employee and period", 409);
  if (typeof result === "object" && "blocked" in result) {
    return err(
      `Resolve all filings before submitting: ${describeBlockers(result.blockers)}.`,
      409,
      { blockers: result.blockers },
    );
  }

  // Enqueue supervisor notification (best-effort)
  void enqueueDtrSubmitted({
    tenantId: auth.tenantId,
    submissionId: result.id,
  }).catch((e) =>
    console.error("[api/dtr/submissions] Failed to enqueue dtr.submitted:", e),
  );

  return ok(result, "DTR submission created", 201);
}
