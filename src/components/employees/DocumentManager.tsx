"use client";

/**
 * DocumentManager — renders the upload form + the document list for one
 * employee's 201 file. Used by /employees/[id]/documents (and later by the
 * employee detail page's Documents tab in Phase C5).
 *
 * Upload flow:
 *   1. POST /api/employees/[id]/documents/presign → { uploadUrl, storageKey }
 *   2. PUT the file directly to uploadUrl (Cloudflare R2)
 *   3. POST /api/employees/[id]/documents → records the row
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Download,
  Trash2,
  Upload,
  FileText,
  File as FileIcon,
  Image as ImageIcon,
  Lock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  DOCUMENT_CATEGORIES,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from "@/lib/validations/document";

const CATEGORY_LABELS: Record<(typeof DOCUMENT_CATEGORIES)[number], string> = {
  CONTRACT: "Contract",
  VALID_ID: "Valid ID",
  GOVERNMENT_FORM: "Government Form",
  MEDICAL: "Medical",
  RESUME: "Resume / CV",
  EDUCATION: "Education",
  TRAINING_CERT: "Training Certificate",
  PERFORMANCE: "Performance Review",
  CLEARANCE: "Clearance",
  TAX: "Tax",
  OTHER: "Other",
};

const ACCEPT_ATTR = ALLOWED_MIME_TYPES.join(",");

type EmployeeDocument = {
  id: string;
  category: keyof typeof CATEGORY_LABELS;
  title: string;
  description: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  isConfidential: boolean;
  createdAt: string | Date;
};

type Props = {
  employeeId: string;
  documents: EmployeeDocument[];
};

export function DocumentManager({ employeeId, documents }: Props) {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);

  // Form state
  const [category, setCategory] =
    useState<(typeof DOCUMENT_CATEGORIES)[number]>("CONTRACT");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isConfidential, setIsConfidential] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  function resetForm() {
    setTitle("");
    setDescription("");
    setIsConfidential(false);
    setFile(null);
    setCategory("CONTRACT");
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error("Please choose a file to upload");
      return;
    }
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File must be ≤ ${MAX_FILE_SIZE / 1024 / 1024} MB`);
      return;
    }

    setIsUploading(true);
    try {
      // Step 1 — ask the server for a presigned PUT URL
      const presignRes = await fetch(
        `/api/employees/${employeeId}/documents/presign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category,
            title: title.trim(),
            description: description.trim() || null,
            isConfidential,
            fileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
          }),
        }
      );
      const presignJson = await presignRes.json();
      if (!presignRes.ok) {
        throw new Error(presignJson?.error ?? "Failed to get upload URL");
      }
      const { uploadUrl, storageKey } = presignJson.data as {
        uploadUrl: string;
        storageKey: string;
      };

      // Step 2 — PUT the file directly to Cloudflare R2
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`R2 upload failed (HTTP ${putRes.status})`);
      }

      // Step 3 — record the document in the DB
      const finalizeRes = await fetch(
        `/api/employees/${employeeId}/documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category,
            title: title.trim(),
            description: description.trim() || null,
            isConfidential,
            fileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
            storageKey,
          }),
        }
      );
      const finalizeJson = await finalizeRes.json();
      if (!finalizeRes.ok) {
        throw new Error(finalizeJson?.error ?? "Failed to record document");
      }

      toast.success("Document uploaded");
      resetForm();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDownload(docId: string) {
    try {
      const res = await fetch(
        `/api/employees/${employeeId}/documents/${docId}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Download failed");
      window.open(json.data.downloadUrl, "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    }
  }

  async function handleDelete(docId: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(
        `/api/employees/${employeeId}/documents/${docId}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Delete failed");
      toast.success("Document deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Upload form ─────────────────────────────────────────────────── */}
      <form
        onSubmit={handleUpload}
        className="space-y-4 rounded-lg border bg-card p-6"
      >
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">Upload new document</h2>
        </div>
        <Separator />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Category *</Label>
            <Select
              value={category}
              onValueChange={(v: string | null) =>
                v && setCategory(v as (typeof DOCUMENT_CATEGORIES)[number])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-title">Title *</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Employment Contract 2025"
              maxLength={200}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="doc-description">Description (optional)</Label>
          <Textarea
            id="doc-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notes about this document…"
            maxLength={1000}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="doc-file">File *</Label>
          <Input
            id="doc-file"
            type="file"
            accept={ACCEPT_ATTR}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">
            PDF, images (JPG, PNG, WebP, HEIC), Word, Excel. Max{" "}
            {MAX_FILE_SIZE / 1024 / 1024} MB.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-md border p-3">
          <Checkbox
            id="doc-confidential"
            checked={isConfidential}
            onCheckedChange={(c: boolean) => setIsConfidential(c)}
          />
          <div className="space-y-1 leading-none">
            <Label htmlFor="doc-confidential" className="cursor-pointer">
              Mark as confidential (HR-only)
            </Label>
            <p className="text-xs text-muted-foreground">
              Confidential documents are visible only to HR roles and the
              employee themselves.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={isUploading}>
            {isUploading ? "Uploading…" : "Upload Document"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={resetForm}
            disabled={isUploading}
          >
            Clear
          </Button>
        </div>
      </form>

      {/* ── Document list ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">
          Documents ({documents.length})
        </h2>
        {documents.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No documents uploaded yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-start gap-4 rounded-lg border bg-card p-4"
              >
                <div className="mt-0.5 text-muted-foreground">
                  <DocIcon mimeType={doc.mimeType} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium truncate">{doc.title}</span>
                    <Badge variant="secondary">
                      {CATEGORY_LABELS[doc.category]}
                    </Badge>
                    {doc.isConfidential && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/50 text-amber-700 dark:text-amber-400"
                      >
                        <Lock className="mr-1 h-3 w-3" />
                        Confidential
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground truncate">
                    {doc.fileName} · {formatBytes(doc.fileSize)} ·{" "}
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </div>
                  {doc.description && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {doc.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDownload(doc.id)}
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(doc.id, doc.title)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function DocIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <ImageIcon className="h-6 w-6" />;
  if (mimeType === "application/pdf") return <FileText className="h-6 w-6" />;
  return <FileIcon className="h-6 w-6" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
