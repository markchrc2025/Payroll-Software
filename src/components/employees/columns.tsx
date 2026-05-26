"use client";

/**
 * Column definitions for the Employee data table.
 * Optimized for the paginated list view — shows essential info at a glance.
 */

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
  hireDate: string;
  department: { id: string; name: string } | null;
  branch: { id: string; name: string } | null;
  salaryHistory: { basicSalary: string; effectiveDate: string }[];
};

// ---------------------------------------------------------------------------
// Status badge colours
// ---------------------------------------------------------------------------

const statusColour: Record<string, string> = {
  REGULAR: "bg-green-100 text-green-800 border-green-200",
  PROBATIONARY: "bg-yellow-100 text-yellow-800 border-yellow-200",
  CONTRACTUAL: "bg-blue-100 text-blue-800 border-blue-200",
  PROJECT_BASED: "bg-purple-100 text-purple-800 border-purple-200",
  RESIGNED: "bg-gray-100 text-gray-600 border-gray-200",
  TERMINATED: "bg-red-100 text-red-800 border-red-200",
  SEPARATED: "bg-red-50 text-red-700 border-red-200",
};

function StatusBadge({ status }: { status: string }) {
  const cls = statusColour[status] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function formatPeso(value: string | undefined): string {
  if (!value) return "—";
  const n = parseFloat(value);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

export function buildColumns(
  onDelete: (id: string, name: string) => void
): ColumnDef<EmployeeRow>[] {
  return [
    {
      accessorKey: "employeeNumber",
      header: "Emp #",
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.employeeNumber}</span>
      ),
      size: 90,
    },
    {
      id: "fullName",
      header: "Name",
      cell: ({ row }) => {
        const { firstName, middleName, lastName, suffix } = row.original;
        const full = [firstName, middleName, lastName, suffix]
          .filter(Boolean)
          .join(" ");
        return (
          <div>
            <p className="font-medium leading-none">{full}</p>
            {row.original.jobTitle && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {row.original.jobTitle}
              </p>
            )}
          </div>
        );
      },
    },
    {
      id: "department",
      header: "Department",
      cell: ({ row }) => row.original.department?.name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: "branch",
      header: "Branch",
      cell: ({ row }) => row.original.branch?.name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: "employmentStatus",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.employmentStatus} />,
    },
    {
      accessorKey: "hireDate",
      header: "Hire Date",
      cell: ({ row }) =>
        new Date(row.original.hireDate).toLocaleDateString("en-PH", {
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
    },
    {
      id: "basicSalary",
      header: "Basic Salary",
      cell: ({ row }) =>
        formatPeso(row.original.salaryHistory?.[0]?.basicSalary),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const emp = row.original;
        const name = `${emp.firstName} ${emp.lastName}`;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/employees/${emp.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(emp.id, name)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      size: 50,
    },
  ];
}
