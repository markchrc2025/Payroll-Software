"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileText, LogOut, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Shape of a row as returned by GET /api/employees
// ---------------------------------------------------------------------------

export type EmployeeRow = {
  id: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  workEmail: string | null;
  mobileNumber: string | null;
  jobTitle: string | null;
  employmentStatus: string;
  employmentType: string;
  payFrequency: string;
  salaryType: string;
  hireDate: string;
  department: { id: string; name: string } | null;
  branch: { id: string; name: string } | null;
  position: { id: string; title: string; level: string | null } | null;
  salaryHistory: { basicSalaryCents: string | null; effectiveDate: string }[];
};

// ---------------------------------------------------------------------------
// Avatar color palette — deterministic from name
// ---------------------------------------------------------------------------

const AVATAR_COLORS = [
  { bg: "#fdeee6", color: "#E8693A" },
  { bg: "#F8F0DC", color: "#A87A1E" },
  { bg: "#E5F6EE", color: "#0FA36B" },
  { bg: "#FBF0DD", color: "#DB8A28" },
  { bg: "#EFEFEF", color: "#525252" },
  { bg: "#F0EDFC", color: "#6D28D9" },
];

export function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getInitials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  REGULAR:      { bg: "#E5F6EE", color: "#0FA36B", label: "Regular" },
  PROBATIONARY: { bg: "#FBF0DD", color: "#DB8A28", label: "Probationary" },
  CONTRACTUAL:  { bg: "#fdeee6", color: "#E8693A", label: "Contractual" },
  PROJECT_BASED:{ bg: "#F0EDFC", color: "#6D28D9", label: "Project-Based" },
  RESIGNED:     { bg: "#EFEFEF", color: "#8F8F8F", label: "Resigned" },
  TERMINATED:   { bg: "#FCE9E7", color: "#E0463B", label: "Terminated" },
  RETIRED:      { bg: "#EFEFEF", color: "#8F8F8F", label: "Retired" },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: "#EFEFEF", color: "#8F8F8F", label: status.replace(/_/g, " ") };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Salary formatting
// ---------------------------------------------------------------------------

function formatRate(cents: string | null | undefined, salaryType: string): string {
  if (!cents) return "—";
  const n = Number(cents) / 100;
  if (isNaN(n)) return "—";
  const fmt = `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return salaryType === "DAILY" ? `${fmt}/day` : fmt;
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

export function buildColumns(
  onDelete: (id: string, name: string) => void
): ColumnDef<EmployeeRow>[] {
  return [
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => {
        const { firstName, lastName, employeeNumber } = row.original;
        const { bg, color } = getAvatarColor(`${firstName}${lastName}`);
        const initials = getInitials(firstName, lastName);
        return (
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-none"
              style={{ background: bg, color }}
            >
              {initials}
            </div>
            <div>
              <div className="font-semibold text-[13.5px] leading-tight text-[#171717]">
                {firstName} {lastName}
              </div>
              <div className="text-[11.5px] text-[#8F8F8F]">{employeeNumber}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: "department",
      header: "Department",
      cell: ({ row }) => (
        <span className="text-[13.5px] text-[#171717]">
          {row.original.department?.name ?? <span className="text-[#8F8F8F]">—</span>}
        </span>
      ),
    },
    {
      id: "position",
      header: "Position",
      cell: ({ row }) => {
        const title = row.original.position?.title ?? row.original.jobTitle;
        return (
          <span className="text-[13.5px] text-[#171717]">
            {title ?? <span className="text-[#8F8F8F]">—</span>}
          </span>
        );
      },
    },
    {
      id: "branch",
      header: "Branch",
      cell: ({ row }) => (
        <span className="text-[13.5px] text-[#171717]">
          {row.original.branch?.name ?? <span className="text-[#8F8F8F]">—</span>}
        </span>
      ),
    },
    {
      id: "salaryType",
      header: "Salary type",
      cell: ({ row }) => {
        const map: Record<string, string> = { MONTHLY: "Monthly", WEEKLY: "Weekly", DAILY: "Daily" };
        return (
          <span className="text-[13.5px] text-[#171717]">
            {map[row.original.salaryType] ?? row.original.salaryType}
          </span>
        );
      },
    },
    {
      id: "monthlyRate",
      header: () => <span className="block text-right">Monthly rate</span>,
      cell: ({ row }) => (
        <span className="text-[13.5px] text-[#171717] tabular-nums block text-right">
          {formatRate(row.original.salaryHistory?.[0]?.basicSalaryCents, row.original.salaryType)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusPill status={row.original.employmentStatus} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const emp = row.original;
        const name = `${emp.firstName} ${emp.lastName}`;
        const ref = encodeURIComponent(emp.employeeNumber);
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-[#8F8F8F] hover:text-[#171717] hover:bg-[#EFEFEF]"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                />
              }
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem render={<Link href={`/employees/${ref}/edit`} />}>
                <Pencil className="mr-2 h-4 w-4" />Edit
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href={`/employees/${ref}/documents`} />}>
                <FileText className="mr-2 h-4 w-4" />201 File
              </DropdownMenuItem>
              {!["RESIGNED", "TERMINATED", "RETIRED"].includes(emp.employmentStatus) && (
                <DropdownMenuItem render={<Link href={`/employees/${ref}/offboard`} />}>
                  <LogOut className="mr-2 h-4 w-4" />Offboard
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(emp.id, name)}
              >
                <Trash2 className="mr-2 h-4 w-4" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      size: 50,
    },
  ];
}
