"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { EmployeeTable } from "@/components/employees/EmployeeTable";
import { BulkImportDialog } from "@/components/employees/BulkImportDialog";
import type { EmployeeRow } from "@/components/employees/columns";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { ChevronDown, Download, Plus, Search, Upload } from "lucide-react";

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
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[32px] font-semibold tracking-[-0.6px] text-[#0E1B2E] leading-none">
            Employees
          </h1>
          <p className="text-[14px] text-[#4A586B] mt-2">
            {isLoading
              ? "Loading…"
              : `${listData?.total ?? 0} active employees across ${departments.length} departments and ${branches.length} branches.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportOpen(true)}
            className="h-10 px-4 rounded-[10px] border border-[#E8EBF1] bg-white text-[#4A586B] text-[13px] font-semibold flex items-center gap-2 hover:bg-[#F8F9FC] transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />Import CSV
          </button>
          <Link
            href="/employees/new"
            className="h-10 px-[17px] rounded-[10px] border-none text-white text-[13.5px] font-semibold flex items-center gap-2 shadow-[0_6px_16px_-5px_rgba(232,105,58,.6)] transition-all hover:-translate-y-px"
            style={{ background: "linear-gradient(145deg,#f08460,#E8693A)" }}
          >
            <Plus className="h-4 w-4" />Add Employee
          </Link>
        </div>
      </div>

      {/* ── Filters toolbar ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8E9AAC]" />
          <input
            className="w-full h-[38px] border border-[#E8EBF1] rounded-[9px] bg-white pl-9 pr-3 text-[13px] text-[#0E1B2E] placeholder:text-[#8E9AAC] outline-none focus:border-[#E8693A] focus:shadow-[0_0_0_3px_#fdeee6] transition"
            placeholder="Search by name or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Department filter */}
        <div className="relative">
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="h-[38px] pl-3 pr-9 border border-[#E8EBF1] rounded-[9px] bg-white text-[13px] font-medium text-[#4A586B] appearance-none outline-none focus:border-[#E8693A] cursor-pointer hover:bg-[#F8F9FC] transition"
          >
            <option value="all">Department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8E9AAC] pointer-events-none" />
        </div>

        {/* Branch filter */}
        <div className="relative">
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="h-[38px] pl-3 pr-9 border border-[#E8EBF1] rounded-[9px] bg-white text-[13px] font-medium text-[#4A586B] appearance-none outline-none focus:border-[#E8693A] cursor-pointer hover:bg-[#F8F9FC] transition"
          >
            <option value="all">Branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8E9AAC] pointer-events-none" />
        </div>

        {/* Status filter */}
        <div className="relative">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-[38px] pl-3 pr-9 border border-[#E8EBF1] rounded-[9px] bg-white text-[13px] font-medium text-[#4A586B] appearance-none outline-none focus:border-[#E8693A] cursor-pointer hover:bg-[#F8F9FC] transition"
          >
            <option value="all">Status</option>
            {EMPLOYMENT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8E9AAC] pointer-events-none" />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Export button */}
        <button
          disabled={isExporting}
          onClick={handleExport}
          className="h-[38px] px-4 rounded-[9px] border border-[#E8EBF1] bg-white text-[#4A586B] text-[13px] font-semibold flex items-center gap-2 hover:bg-[#F8F9FC] disabled:opacity-50 transition"
        >
          <Download className="h-3.5 w-3.5" />
          {isExporting ? "Exporting…" : "Export"}
        </button>
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
