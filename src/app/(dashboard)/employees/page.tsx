"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { EmployeeTable } from "@/components/employees/EmployeeTable";
import { BulkImportDialog } from "@/components/employees/BulkImportDialog";
import type { EmployeeRow } from "@/components/employees/columns";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { ArrowUpDown, ChevronDown, Download, Plus, Search, Upload } from "lucide-react";

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
  const [limit] = useState(25);

  // --- Data state ---
  const [listData, setListData] = useState<EmployeeListResponse | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- UI state ---
  const [importOpen, setImportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [ioMenuOpen, setIoMenuOpen] = useState(false);
  const ioMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ioMenuRef.current && !ioMenuRef.current.contains(e.target as Node)) {
        setIoMenuOpen(false);
      }
    }
    if (ioMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ioMenuOpen]);

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
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-none">
            Employees
          </h1>
          <p className="text-[14px] text-[#525252] mt-2">
            {isLoading
              ? "Loading…"
              : `${listData?.total ?? 0} active employees across ${departments.length} departments and ${branches.length} branches.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Combined Import / Export dropdown */}
          <div className="relative" ref={ioMenuRef}>
            <button
              onClick={() => setIoMenuOpen((v) => !v)}
              className="h-7 px-2.5 rounded-[8px] bg-[var(--fill)] text-[var(--ink)] text-[13.5px] font-medium flex items-center gap-1.5 hover:bg-[var(--fill-2)] transition-colors"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              Import / Export
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${ioMenuOpen ? "rotate-180" : ""}`} />
            </button>
            {ioMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-44 rounded-[10px] border border-[#E8E8E8] bg-white shadow-lg z-20 py-1 overflow-hidden">
                <button
                  onClick={() => { setImportOpen(true); setIoMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#525252] hover:bg-[#F7F7F7] transition-colors"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import CSV
                </button>
                <button
                  disabled={isExporting}
                  onClick={() => { handleExport(); setIoMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#525252] hover:bg-[#F7F7F7] disabled:opacity-50 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  {isExporting ? "Exporting…" : "Export CSV"}
                </button>
              </div>
            )}
          </div>

          <Link
            href="/employees/new"
            className="h-7 px-2.5 rounded-[8px] bg-[var(--acc)] text-[var(--on-acc)] text-[13.5px] font-medium flex items-center gap-1.5 hover:brightness-[1.07] transition-[filter]"
          >
            <Plus className="h-4 w-4" />Add Employee
          </Link>
        </div>
      </div>

      {/* ── Filters toolbar ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8F8F8F]" />
          <input
            className="w-full h-7 border border-transparent rounded-[8px] bg-[var(--fill)] pl-9 pr-3 text-[13.5px] text-[#171717] placeholder:text-[#8F8F8F] outline-none focus:border-[#A3A3A3] focus:shadow-[0_0_0_2px_#E5E5E5] transition focus:bg-white"
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
            className="h-7 pl-3 pr-9 border border-transparent rounded-[8px] bg-[var(--fill)] text-[13.5px] font-medium text-[#525252] appearance-none outline-none focus:border-[#A3A3A3] cursor-pointer hover:bg-[var(--fill-2)] transition focus:bg-white"
          >
            <option value="all">Department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8F8F8F] pointer-events-none" />
        </div>

        {/* Branch filter */}
        <div className="relative">
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="h-7 pl-3 pr-9 border border-transparent rounded-[8px] bg-[var(--fill)] text-[13.5px] font-medium text-[#525252] appearance-none outline-none focus:border-[#A3A3A3] cursor-pointer hover:bg-[var(--fill-2)] transition focus:bg-white"
          >
            <option value="all">Branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8F8F8F] pointer-events-none" />
        </div>

        {/* Status filter */}
        <div className="relative">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-7 pl-3 pr-9 border border-transparent rounded-[8px] bg-[var(--fill)] text-[13.5px] font-medium text-[#525252] appearance-none outline-none focus:border-[#A3A3A3] cursor-pointer hover:bg-[var(--fill-2)] transition focus:bg-white"
          >
            <option value="all">Status</option>
            {EMPLOYMENT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8F8F8F] pointer-events-none" />
        </div>

        {/* Spacer */}
        <div className="flex-1" />
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
