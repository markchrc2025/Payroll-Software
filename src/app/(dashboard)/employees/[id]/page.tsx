/**
 * /employees/[id] — Employee 201 Profile Page
 *
 * Server component that loads the employee, then passes data to a
 * client sub-component for tab interactivity.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { ChevronRight } from "lucide-react";
import { EmployeeProfileClient } from "./ProfileClient";

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

/** Forward the browser's session cookie so the API can authenticate. */
async function authHeaders(): Promise<HeadersInit> {
  const store = await cookies();
  const cookieHeader = store.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
  return { Cookie: cookieHeader };
}

async function getEmployee(id: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/employees/${id}`, {
    cache: "no-store",
    headers: await authHeaders(),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

async function getLeaveBalances(id: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(
    `${base}/api/employees/${id}/leave-balances?year=${new Date().getFullYear()}`,
    { cache: "no-store", headers: await authHeaders() }
  );
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params; // Employee ID (employeeNumber) or legacy CUID

  // Resolve the employee first (GET accepts Employee ID or CUID), then load
  // leave balances by the resolved internal id.
  const employee = await getEmployee(id);
  if (!employee) notFound();

  const leaveBalances = await getLeaveBalances(employee.id);

  const fullName = `${employee.firstName} ${employee.lastName}`;
  const empRef = encodeURIComponent(employee.employeeNumber);
  const subtitle = [
    employee.employeeNumber,
    employee.position?.title ?? employee.jobTitle,
    employee.branch?.name ? `${employee.branch.name} Branch` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[13px] text-[#8E9AAC]">
        <Link href="/employees" className="text-[#E8693A] font-semibold hover:underline">
          Employees
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span>{fullName}</span>
      </nav>

      {/* Page head */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-semibold tracking-[-0.6px] text-[#0E1B2E] leading-none">
            {fullName}
          </h1>
          {subtitle && (
            <p className="text-[14px] text-[#4A586B] mt-2">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/employees/${empRef}/edit`}
            className="h-10 px-4 rounded-[10px] border border-[#E8EBF1] bg-white text-[#4A586B] text-[13px] font-semibold flex items-center gap-2 hover:bg-[#F8F9FC] transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit Profile
          </Link>
          <button className="h-10 px-4 rounded-[10px] border border-[#E8EBF1] bg-white text-[#4A586B] text-[13px] font-semibold flex items-center gap-2 hover:bg-[#F8F9FC] transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="4" width="14" height="17" rx="2"/>
              <path d="M9 4a1 1 0 011-1h4a1 1 0 011 1v1H9V4z" strokeLinejoin="round"/>
            </svg>
            File Leave
          </button>
          <Link
            href={`/employees/${empRef}/offboard`}
            className="h-10 px-4 rounded-[9px] border border-[#FACECA] bg-[#FEF3F2] text-[#E0463B] text-[13px] font-semibold flex items-center gap-2 hover:bg-[#FCE9E7] transition-colors"
          >
            Initiate Offboarding
          </Link>
        </div>
      </div>

      {/* Profile body */}
      <EmployeeProfileClient employee={employee} leaveBalances={leaveBalances} />
    </div>
  );
}
