"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildColumns, type EmployeeRow } from "./columns";
import { ChevronLeft, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  data: EmployeeRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  isLoading?: boolean;
  onPageChange: (page: number) => void;
  onDelete: (id: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Pagination helper — shows up to 7 page buttons with ellipsis
// ---------------------------------------------------------------------------

function buildPageList(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  if (current > 3) pages.push("…");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmployeeTable({
  data,
  total,
  page,
  limit,
  totalPages,
  isLoading,
  onPageChange,
  onDelete,
}: Props) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const columns = buildColumns((id, name) => setDeleteTarget({ id, name }));

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    rowCount: total,
  });

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    await onDelete(deleteTarget.id);
    setIsDeleting(false);
    setDeleteTarget(null);
  };

  const pageList = buildPageList(page, totalPages);

  return (
    <>
      {/* Table card */}
      <div className="bg-white rounded-[14px] border border-[#E8EBF1] shadow-[0_1px_2px_rgba(16,30,54,.06),0_1px_3px_rgba(16,30,54,.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      className="text-left px-4 py-3 text-[10.5px] uppercase tracking-[0.7px] text-[#8E9AAC] font-bold bg-[#FBFCFE] border-b border-[#E8EBF1] whitespace-nowrap"
                      style={{ width: h.column.columnDef.size }}
                    >
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-[#E8EBF1]">
                    {columns.map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-16 text-center text-[#8E9AAC] text-[13.5px]"
                  >
                    No employees found.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#E8EBF1] cursor-pointer transition-colors hover:bg-[#F8F9FC] last:border-b-0"
                    onClick={() => router.push(`/employees/${encodeURIComponent(row.original.employeeNumber)}`)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination row */}
        {!isLoading && (
          <div className="flex items-center justify-between px-4 py-3.5 border-t border-[#E8EBF1]">
            <span className="text-[12.5px] text-[#8E9AAC]">
              Showing {total === 0 ? 0 : (page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="w-[30px] h-[30px] rounded-[8px] border border-[#E8EBF1] bg-white flex items-center justify-center text-[#4A586B] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F4F6F9] transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {pageList.map((p, i) =>
                  p === "…" ? (
                    <span key={`e${i}`} className="w-[30px] h-[30px] flex items-center justify-center text-[12.5px] text-[#8E9AAC]">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => onPageChange(p)}
                      className={`w-[30px] h-[30px] rounded-[8px] border text-[12.5px] font-semibold transition-colors ${
                        p === page
                          ? "bg-[#E8693A] border-[#E8693A] text-white"
                          : "bg-white border-[#E8EBF1] text-[#4A586B] hover:bg-[#F4F6F9]"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="w-[30px] h-[30px] rounded-[8px] border border-[#E8EBF1] bg-white flex items-center justify-center text-[#4A586B] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F4F6F9] transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Employee</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <strong>{deleteTarget?.name}</strong>? This action cannot be
              undone from the UI (soft delete).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
