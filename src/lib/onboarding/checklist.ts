/**
 * PAY-74: the setup checklist on the dashboard, from sign-up to the first
 * published payslip. Every step is read from the company's own data, so it
 * ticks itself off; the card disappears once all steps are done.
 */
import prismaAdmin from "@/lib/prisma-admin";

export type ChecklistStep = { key: string; title: string; detail: string; href: string; done: boolean };

export async function getSetupChecklist(tenantId: string): Promise<ChecklistStep[]> {
  const [tenant, employees, withoutSchedule, runs, published] = await Promise.all([
    prismaAdmin.tenant.findUnique({
      where: { id: tenantId },
      select: { tinNumber: true, rdoCode: true, address: true, sssNumber: true, philhealthNumber: true, pagibigNumber: true },
    }),
    prismaAdmin.employee.count({ where: { tenantId, deletedAt: null } }),
    prismaAdmin.employee.count({ where: { tenantId, deletedAt: null, shiftScheduleId: null } }),
    prismaAdmin.payrollBook.count({ where: { tenantId, status: { not: "CANCELLED" } } }),
    prismaAdmin.payrollSheet.count({ where: { tenantId, payslipKey: { not: null } } }),
  ]);
  const missing = [
    !tenant?.tinNumber && "TIN",
    !tenant?.rdoCode && "RDO code",
    !tenant?.address && "registered address",
    !tenant?.sssNumber && "SSS employer number",
    !tenant?.philhealthNumber && "PhilHealth employer number",
    !tenant?.pagibigNumber && "Pag-IBIG employer number",
  ].filter(Boolean) as string[];
  return [
    {
      key: "company",
      title: "Complete your company profile",
      detail: missing.length ? `Still needed: ${missing.join(", ")}. They print on payslips, BIR forms and remittance reports.` : "TIN, RDO, address and employer numbers are in.",
      href: "/settings",
      done: missing.length === 0,
    },
    {
      key: "employees",
      title: "Add your employees",
      detail: employees ? `${employees} employee${employees === 1 ? "" : "s"} added.` : "Their pay, statutory numbers and hire date.",
      href: "/employees",
      done: employees > 0,
    },
    {
      key: "schedules",
      title: "Give everyone a work schedule",
      detail: employees === 0 ? "Standard 5-day and 6-day shifts are ready to assign." : withoutSchedule ? `${withoutSchedule} employee${withoutSchedule === 1 ? " has" : "s have"} no work schedule yet.` : "Everyone has a work schedule.",
      href: "/shift-schedules",
      done: employees > 0 && withoutSchedule === 0,
    },
    {
      key: "run",
      title: "Run your first payroll",
      detail: runs ? "Your first payroll run is in." : "Pick the cutoff and let Sentire compute pay, contributions and tax.",
      href: "/payroll",
      done: runs > 0,
    },
    {
      key: "publish",
      title: "Publish the payslips",
      detail: published ? "Payslips are out in Self-Service." : "Finalize the run, then publish the payslips to your employees.",
      href: "/payroll",
      done: published > 0,
    },
  ];
}
