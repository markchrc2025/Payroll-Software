"use client";

/**
 * /employees — Employee List Page
 *
 * Features:
 *  • Paginated table with search, department, branch, status filters
 *  • "Add Employee" → /employees/new
 *  • Bulk CSV import dialog
 *  • CSV export (downloads directly)
 *  • Inline soft-delete with toast feedback
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmployeeTable } from "@/components/employees/EmployeeTable";
import { BulkImportDialog } from "@/components/employees/BulkImportDialog";
import type { EmployeeRow } from "@/components/employees/columns";
import {
  Download,
  Plus,
  Upload,
  RefreshCw,
  Search,
} from "lucide-react";
import { useDebounce } from "@/lib/hooks/useDebounce";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Department = { id: string; name: string };
type Branch = { id: string; name: string };

type EmployeeListResponse = {
  data: EmployeeRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const EMPLOYMENT_STATUSES = [
  { value: "REGULAR", label: "Regular" },
  { value: "PROBATIONARY", label: "Probationary" },
  { value: "CONTRACTUAL", label: "Contractual" },
  { value: "PROJECT_BASED", label: "Project-Based" },
  { value: "RESIGNED", label: "Resigned" },
  { value: "TERMINATED", label: "Terminated" },
  { value: "RETIRED", label: "Retired" },
];

const LIMITS = [25, 50, 100];

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function EmployeesPage() {
  // --- Filter state ---
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [branchId, setBranchId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  // --- Data state ---
  const [listData, setListData] = useState<EmployeeListResponse | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- UI state ---
  const [importOpen, setImportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // --- Fetch departments & branches once ---
  useEffect(() => {
    Promise.all([
      fetch("/api/departments").then((r) => r.json()),
      fetch("/api/branches").then((r) => r.json()),
    ]).then(([d, b]) => {
      setDepartments(d.data ?? []);
      setBranches(b.data ?? []);
    });
  }, []);

  // --- Fetch employees ---
  const fetchEmployees = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(debouncedSearch && { search: debouncedSearch }),
      ...(departmentId !== "all" && { departmentId }),
      ...(branchId !== "all" && { branchId }),
      ...(status !== "all" && { status }),
    });

    const res = await fetch(`/api/employees?${params}`);
    const json = await res.json();
    setListData(json);
    setIsLoading(false);
  }, [page, limit, debouncedSearch, departmentId, branchId, status]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, departmentId, branchId, status, limit]);

  // --- Actions ---
  async function handleDelete(id: string) {
    const res = await fetch(`/api/employees/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Employee deleted");
      fetchEmployees();
    } else {
      const json = await res.json().catch(() => null);
      toast.error(json?.error ?? "Failed to delete employee");
    }
  }

  async function handleExport() {
    setIsExporting(true);
    const params = new URLSearchParams({
      ...(departmentId !== "all" && { departmentId }),
      ...(branchId !== "all" && { branchId }),
      ...(status !== "all" && { status }),
    });
    const res = await fetch(`/api/employees/export?${params}`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `employees_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      toast.error("Export failed");
    }
    setIsExporting(false);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Employees</h1>
          <p className="text-sm text-muted-foreground">
            {listData ? `${listData.total} total` : "Loading…"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isExporting}
            onClick={handleExport}
          >
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Exporting…" : "Export CSV"}
          </Button>
          <Button size="sm" render={<Link href="/employees/new" />}>
              <Plus className="mr-2 h-4 w-4" />
              Add Employee
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-9"
            placeholder="Search by name, number, email…"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          />
        </div>

        <Select value={departmentId} onValueChange={(v: string | null) => setDepartmentId(v ?? "all")}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={branchId} onValueChange={(v: string | null) => setBranchId(v ?? "all")}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="All Branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v: string | null) => setStatus(v ?? "all")}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {EMPLOYMENT_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(limit)}
          onValueChange={(v: string | null) => setLimit(Number(v ?? 25))}
        >
          <SelectTrigger className="w-24 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LIMITS.map((l) => (
              <SelectItem key={l} value={String(l)}>
                {l} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={fetchEmployees}
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Table */}
      <EmployeeTable
        data={listData?.data ?? []}
        total={listData?.total ?? 0}
        page={page}
        limit={limit}
        totalPages={listData?.totalPages ?? 1}
        isLoading={isLoading}
        onPageChange={setPage}
        onDelete={handleDelete}
      />

      {/* Bulk Import Dialog */}
      <BulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={fetchEmployees}
      />
    </div>
  );
}
