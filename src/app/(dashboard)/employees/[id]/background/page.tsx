/**
 * /employees/[id]/background
 *
 * Education, Work Experience, and Training records for a single employee.
 * Each is a repeatable list with add / edit / delete. Training entries can
 * carry a certificate uploaded to R2.
 */

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { isR2Configured, resolveObjectUrl } from "@/lib/r2";
import { employeeRefWhere } from "@/lib/employee-ref";
import { EmployeeBackground } from "@/components/employees/EmployeeBackground";

export const dynamic = "force-dynamic";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export default async function EmployeeBackgroundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");
  const tenantId = session.user.tenantId;

  const { id } = await params; // employeeNumber or legacy CUID

  const employee = await prisma.employee.findFirst({
    where: employeeRefWhere(tenantId, id),
    select: { id: true, firstName: true, lastName: true, employeeNumber: true },
  });
  if (!employee) notFound();

  const [education, workExperience, training] = await Promise.all([
    prisma.employeeEducation.findMany({
      where: { employeeId: employee.id, tenantId, deletedAt: null },
      orderBy: [{ endYear: "desc" }, { startYear: "desc" }, { createdAt: "desc" }],
    }),
    prisma.employeeWorkExperience.findMany({
      where: { employeeId: employee.id, tenantId, deletedAt: null },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.employeeTraining.findMany({
      where: { employeeId: employee.id, tenantId, deletedAt: null },
      orderBy: [{ trainingDate: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const educationRows = education.map((r) => ({
    id: r.id, level: r.level, school: r.school, degree: r.degree,
    fieldOfStudy: r.fieldOfStudy, startYear: r.startYear, endYear: r.endYear,
    honors: r.honors, notes: r.notes,
  }));

  const workExperienceRows = workExperience.map((r) => ({
    id: r.id, companyName: r.companyName, position: r.position,
    startDate: iso(r.startDate), endDate: iso(r.endDate), location: r.location,
    description: r.description, reasonForLeaving: r.reasonForLeaving,
  }));

  const trainingRows = await Promise.all(
    training.map(async (r) => ({
      id: r.id, title: r.title, provider: r.provider, trainingDate: iso(r.trainingDate),
      hours: r.hours, expiresAt: iso(r.expiresAt), notes: r.notes,
      certificateKey: r.certificateKey, certificateFileName: r.certificateFileName,
      certificateMimeType: r.certificateMimeType, certificateFileSize: r.certificateFileSize,
      certificateUrl: r.certificateKey ? await resolveObjectUrl(r.certificateKey, { expiresIn: 600 }) : null,
    })),
  );

  const fullName = `${employee.firstName} ${employee.lastName}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/employees/${encodeURIComponent(employee.employeeNumber)}/edit`} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Background: {fullName}</h1>
          <p className="text-sm text-muted-foreground">Employee #{employee.employeeNumber}</p>
        </div>
      </div>

      {!isR2Configured() && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>File storage is not configured.</strong> Training certificate uploads are disabled until R2 is set up.
        </div>
      )}

      <EmployeeBackground
        employeeId={employee.id}
        initialEducation={educationRows}
        initialWorkExperience={workExperienceRows}
        initialTraining={trainingRows}
        storageReady={isR2Configured()}
      />
    </div>
  );
}
