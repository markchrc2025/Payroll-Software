"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Eye, EyeOff, Pencil, Trash2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Announcement = {
  id: string;
  title: string;
  body: string;
  category: string | null;
  isPublished: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { value: "GENERAL", label: "General" },
  { value: "HR", label: "HR" },
  { value: "PAYROLL", label: "Payroll" },
  { value: "POLICY", label: "Policy" },
  { value: "EVENTS", label: "Events" },
  { value: "EMERGENCY", label: "Emergency" },
];

function categoryLabel(c: string | null) {
  if (!c) return null;
  return CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Blank form
// ---------------------------------------------------------------------------

const BLANK = {
  title: "",
  body: "",
  category: "",
  isPublished: true,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  // Filters
  const [filterPublished, setFilterPublished] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Sheets
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Announcement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);

  // Preview
  const [previewTarget, setPreviewTarget] = useState<Announcement | null>(null);

  // Forms
  const [form, setForm] = useState(BLANK);
  const [editForm, setEditForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------------------------------
  // Debounced search
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(filterSearch);
      setPage(1);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filterSearch]);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filterPublished !== "all") params.set("published", filterPublished);
    if (debouncedSearch) params.set("search", debouncedSearch);
    const res = await fetch(`/api/announcements?${params}`);
    const json = await res.json();
    setItems(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, filterPublished, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleCreate() {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!form.body.trim()) { toast.error("Body is required"); return; }
    setSaving(true);
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        body: form.body.trim(),
        category: form.category || null,
        isPublished: form.isPublished,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to create announcement"); return; }
    toast.success("Announcement created");
    setCreateOpen(false);
    setForm(BLANK);
    load();
  }

  async function handleEdit() {
    if (!editTarget) return;
    if (!editForm.title.trim()) { toast.error("Title is required"); return; }
    if (!editForm.body.trim()) { toast.error("Body is required"); return; }
    setSaving(true);
    const res = await fetch(`/api/announcements/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editForm.title.trim(),
        body: editForm.body.trim(),
        category: editForm.category || null,
        isPublished: editForm.isPublished,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to update announcement"); return; }
    toast.success("Announcement updated");
    setEditTarget(null);
    load();
  }

  async function handleTogglePublish(item: Announcement) {
    const res = await fetch(`/api/announcements/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !item.isPublished }),
    });
    if (!res.ok) { toast.error("Failed to update"); return; }
    toast.success(item.isPublished ? "Announcement unpublished" : "Announcement published");
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/announcements/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to delete"); return; }
    toast.success("Announcement deleted");
    setDeleteTarget(null);
    load();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Announcements</h1>
        <p className="text-sm text-muted-foreground">
          Publish company-wide messages that appear in the employee ESS app.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={filterPublished}
          onValueChange={(v) => { setFilterPublished(v ?? "all"); setPage(1); }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="true">Published</SelectItem>
            <SelectItem value="false">Draft</SelectItem>
          </SelectContent>
        </Select>

        <Input
          className="w-56"
          placeholder="Search title or body…"
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
        />

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            onClick={() => { setForm(BLANK); setCreateOpen(true); }}
          >
            <Plus className="h-4 w-4 mr-1.5" /> New Announcement
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Published</TableHead>
              <TableHead className="w-[140px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Megaphone className="h-8 w-8 opacity-30" />
                    <span>No announcements yet. Create one to get started.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium max-w-[280px]">
                    <button
                      className="truncate text-left hover:underline"
                      title={item.title}
                      onClick={() => setPreviewTarget(item)}
                    >
                      {item.title}
                    </button>
                  </TableCell>
                  <TableCell>
                    {item.category ? (
                      <Badge variant="outline" className="text-xs">
                        {categoryLabel(item.category)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {item.isPublished ? (
                      <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                        Published
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Draft</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(item.publishedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        title={item.isPublished ? "Unpublish" : "Publish"}
                        onClick={() => handleTogglePublish(item)}
                      >
                        {item.isPublished
                          ? <EyeOff className="h-3.5 w-3.5" />
                          : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        title="Edit"
                        onClick={() => {
                          setEditTarget(item);
                          setEditForm({
                            title: item.title,
                            body: item.body,
                            category: item.category ?? "",
                            isPublished: item.isPublished,
                          });
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        title="Delete"
                        onClick={() => setDeleteTarget(item)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} of {totalPages} · {total} total</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Create Sheet                                                         */}
      {/* ------------------------------------------------------------------- */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>New Announcement</SheetTitle>
          </SheetHeader>
          <AnnouncementForm
            form={form}
            onChange={setForm}
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
            saving={saving}
            submitLabel="Publish"
          />
        </SheetContent>
      </Sheet>

      {/* ------------------------------------------------------------------- */}
      {/* Edit Sheet                                                           */}
      {/* ------------------------------------------------------------------- */}
      <Sheet open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit Announcement</SheetTitle>
          </SheetHeader>
          <AnnouncementForm
            form={editForm}
            onChange={setEditForm}
            onSubmit={handleEdit}
            onCancel={() => setEditTarget(null)}
            saving={saving}
            submitLabel="Save Changes"
          />
        </SheetContent>
      </Sheet>

      {/* ------------------------------------------------------------------- */}
      {/* Preview Sheet                                                        */}
      {/* ------------------------------------------------------------------- */}
      <Sheet open={!!previewTarget} onOpenChange={(o) => !o && setPreviewTarget(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-base">Preview</SheetTitle>
          </SheetHeader>
          {previewTarget && (
            <div className="mt-6 space-y-4">
              {previewTarget.category && (
                <Badge variant="outline" className="text-xs">
                  {categoryLabel(previewTarget.category)}
                </Badge>
              )}
              <h2 className="text-lg font-semibold leading-snug">{previewTarget.title}</h2>
              <p className="text-xs text-muted-foreground">{fmtDate(previewTarget.publishedAt)}</p>
              <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90 border-t pt-4">
                {previewTarget.body}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ------------------------------------------------------------------- */}
      {/* Delete Dialog                                                        */}
      {/* ------------------------------------------------------------------- */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.title}&rdquo; will be removed from the ESS feed immediately.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared form component used by both Create and Edit sheets
// ---------------------------------------------------------------------------

type FormState = {
  title: string;
  body: string;
  category: string;
  isPublished: boolean;
};

function AnnouncementForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  saving,
  submitLabel,
}: {
  form: FormState;
  onChange: (f: FormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  return (
    <div className="mt-6 space-y-5">
      <div className="space-y-1.5">
        <Label>Title <span className="text-destructive">*</span></Label>
        <Input
          value={form.title}
          onChange={(e) => onChange({ ...form, title: e.target.value })}
          placeholder="e.g. Office closure on June 12"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Category</Label>
        <Select
          value={form.category || "none"}
          onValueChange={(v) => onChange({ ...form, category: v === "none" ? "" : (v ?? "") })}
        >
          <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Body <span className="text-destructive">*</span></Label>
        <Textarea
          rows={8}
          value={form.body}
          onChange={(e) => onChange({ ...form, body: e.target.value })}
          placeholder="Write the announcement content here…"
          className="resize-y"
        />
        <p className="text-xs text-muted-foreground">Plain text. Line breaks are preserved in the ESS app.</p>
      </div>

      <div className="flex items-center gap-3 rounded-md border p-3">
        <input
          id="isPublished"
          type="checkbox"
          className="h-4 w-4 rounded border-border accent-primary"
          checked={form.isPublished}
          onChange={(e) => onChange({ ...form, isPublished: e.target.checked })}
        />
        <div>
          <label htmlFor="isPublished" className="text-sm font-medium cursor-pointer">
            Publish immediately
          </label>
          <p className="text-xs text-muted-foreground">
            Uncheck to save as draft — employees won&rsquo;t see it yet.
          </p>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button className="flex-1" onClick={onSubmit} disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </Button>
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
