"use client";

/**
 * BulkImportDialog — CSV drag-and-drop / file picker upload dialog.
 *
 * • Shows a template download link
 * • Displays per-row validation errors returned from the API
 * • Reports success count on completion
 */

import { useState, useRef, type DragEvent, type ChangeEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// CSV template (mirrors required columns for bulk import)
// ---------------------------------------------------------------------------

const CSV_TEMPLATE_HEADERS = [
  "first_name",
  "last_name",
  "middle_name",
  "birth_date",
  "gender",
  "civil_status",
  "mobile_number",
  "work_email",
  "department_name",
  "branch_name",
  "job_title",
  "employment_type",
  "employment_status",
  "hire_date",
  "pay_frequency",
  "salary_type",
  "basic_salary",
  "bank_name",
  "bank_account_number",
  "bank_account_name",
].join(",");

const CSV_TEMPLATE_EXAMPLE =
  "Juan,Dela Cruz,,,MALE,SINGLE,09171234567,juan@example.com,Engineering,Manila HQ,Software Engineer,FULL_TIME,PROBATIONARY,2025-01-15,SEMI_MONTHLY,MONTHLY,35000,BDO,1234567890,Juan Dela Cruz";

const CSV_TEMPLATE_BLOB = new Blob(
  [CSV_TEMPLATE_HEADERS + "\n" + CSV_TEMPLATE_EXAMPLE + "\n"],
  { type: "text/csv" }
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImportError = { row: number; message: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkImportDialog({ open, onOpenChange, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- File handling ---
  function handleFile(f: File) {
    if (!f.name.endsWith(".csv")) {
      toast.error("Please upload a CSV file (.csv)");
      return;
    }
    setFile(f);
    setImportErrors([]);
    setImportedCount(null);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  }

  function handleRemoveFile() {
    setFile(null);
    setImportErrors([]);
    setImportedCount(null);
  }

  // --- Upload ---
  async function handleUpload() {
    if (!file) return;
    setIsUploading(true);
    setImportErrors([]);
    setImportedCount(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/employees/bulk-import", {
      method: "POST",
      body: formData,
    });

    const json = await res.json().catch(() => null);
    setIsUploading(false);

    if (!res.ok) {
      toast.error(json?.error ?? "Upload failed");
      return;
    }

    const { imported, errors } = json.data as {
      imported: number;
      errors: ImportError[];
    };

    setImportedCount(imported);
    setImportErrors(errors ?? []);

    if (imported > 0) {
      toast.success(`${imported} employee${imported !== 1 ? "s" : ""} imported`);
      onSuccess();
    }
    if ((errors ?? []).length > 0) {
      toast.warning(`${errors.length} row(s) had errors — see details below`);
    }
  }

  // --- Download template ---
  function handleDownloadTemplate() {
    const url = URL.createObjectURL(CSV_TEMPLATE_BLOB);
    const a = document.createElement("a");
    a.href = url;
    a.download = "employee_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Reset on close ---
  function handleClose(open: boolean) {
    if (!open) {
      setFile(null);
      setImportErrors([]);
      setImportedCount(null);
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Import Employees</DialogTitle>
          <DialogDescription>
            Upload a CSV file to import multiple employees at once.{" "}
            <button
              className="underline text-primary text-sm"
              onClick={handleDownloadTemplate}
            >
              Download template
            </button>
          </DialogDescription>
        </DialogHeader>

        {/* Drop zone */}
        {!file ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/40"
            }`}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Drag & drop your CSV here, or{" "}
              <span className="text-primary font-medium">click to browse</span>
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleInputChange}
            />
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
            <FileText className="h-5 w-5 text-primary shrink-0" />
            <span className="flex-1 text-sm font-medium truncate">
              {file.name}
            </span>
            <button
              onClick={handleRemoveFile}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Result summary */}
        {importedCount !== null && (
          <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {importedCount} employee{importedCount !== 1 ? "s" : ""} imported
            successfully
          </div>
        )}

        {/* Error list */}
        {importErrors.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertCircle className="h-4 w-4" />
              {importErrors.length} row{importErrors.length !== 1 ? "s" : ""}{" "}
              failed
            </div>
            {importErrors.map((e, i) => (
              <div
                key={i}
                className="flex gap-2 text-xs rounded bg-destructive/5 border border-destructive/20 px-2 py-1"
              >
                <Badge variant="destructive" className="text-xs shrink-0">
                  Row {e.row}
                </Badge>
                <span className="text-muted-foreground">{e.message}</span>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            disabled={!file || isUploading}
            onClick={handleUpload}
          >
            {isUploading ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
