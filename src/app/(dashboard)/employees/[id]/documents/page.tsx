/**
 * /employees/[id]/documents
 *
 * 201-file document management for a single employee. Will be folded into
 * the tabbed employee detail page in Phase C5.
 */

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { isR2Configured } from "@/lib/r2";
import { employeeRefWhere } from "@/lib/employee-ref";
import { DocumentManager } from "@/components/employees/DocumentManager";

export const dynamic = "force-dynamic";

export default async function EmployeeDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const { id } = await params; // Employee ID (employeeNumber) or legacy CUID

  const employee = await prisma.employee.findFirst({
    where: employeeRefWhere(session.user.tenantId, id),
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeNumber: true,
    },
  });
  if (!employee) notFound();

  const documents = await prisma.employeeDocument.findMany({
    where: {
      employeeId: employee.id,
      tenantId: session.user.tenantId,
      deletedAt: null,
    },
    orderBy: [{ category: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      category: true,
      title: true,
      description: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      isConfidential: true,
      createdAt: true,
    },
  });

  const fullName = `${employee.firstName} ${employee.lastName}`;
  const storageReady = isR2Configured();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/employees"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">201 File: {fullName}</h1>
          <p className="text-sm text-muted-foreground">
            Employee #{employee.employeeNumber}
          </p>
        </div>
      </div>

      {!storageReady && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>File storage is not configured.</strong> Set{" "}
          <code>R2_ACCOUNT_ID</code>, <code>R2_ACCESS_KEY_ID</code>,{" "}
          <code>R2_SECRET_ACCESS_KEY</code>, and <code>R2_BUCKET</code> in{" "}
          <code>.env.local</code> to enable uploads.
        </div>
      )}

      <DocumentManager employeeId={employee.id} documents={documents} />
    </div>
  );
}
