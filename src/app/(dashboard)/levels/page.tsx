"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type WorkflowSummary = { id: string; code: string; description: string | null };

type JobLevel = {
  id: string;
  name: string;
  rank: number;
  description: string | null;
  defaultWorkflowId: string | null;
  defaultWorkflow: WorkflowSummary | null;
  _count: { employees: number };
};

const NONE = "__none__";
const EMPTY_FORM = { name: "", rank: "0", description: "", defaultWorkflowId: NONE };

export default function LevelsPage() {
  const [levels, setLevels] = useState<JobLevel[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<JobLevel | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  async function load() {
    setIsLoading(true);
    const res = await fetch("/api/job-levels");
    const json = await res.json();
    setLevels(json.data ?? []);
    setIsLoading(false);
  }

  async function loadWorkflows() {
    const res = await fetch("/api/approval-workflows?limit=100");
    const json = await res.json();
    setWorkflows(json.data ?? []);
  }

  useEffect(() => { load(); loadWorkflows(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  function openEdit(level: JobLevel) {
    setEditing(level);
    setForm({
      name: level.name,
      rank: String(level.rank),
      description: level.description ?? "",
      defaultWorkflowId: level.defaultWorkflowId ?? NONE,
    });
    setSheetOpen(true);
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const url = editing ? `/api/job-levels/${editing.id}` : "/api/job-levels";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          rank: Number(form.rank) || 0,
          description: form.description.trim() || null,
          defaultWorkflowId:
            form.defaultWorkflowId === NONE ? null : form.defaultWorkflowId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to save level");
        return;
      }
      toast.success(editing ? "Level updated" : "Level created");
      setSheetOpen(false);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(level: JobLevel) {
    if (level._count.employees > 0) {
      toast.error(`Cannot delete — ${level._count.employees} employee(s) assigned`);
      return;
    }
    const res = await fetch(`/api/job-levels/${level.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Level deleted");
      load();
    } else {
      const json = await res.json().catch(() => null);
      toast.error(json?.error ?? "Failed to delete level");
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Level</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${levels.length} job level${levels.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Level
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20 text-center">Rank</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Default Workflow</TableHead>
              <TableHead className="text-center">Employees</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell className="text-center"><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell className="text-center"><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                  <TableCell />
                </TableRow>
              ))
            ) : levels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  <Layers className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  No levels yet. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              levels.map((level) => (
                <TableRow key={level.id}>
                  <TableCell className="text-center text-muted-foreground">{level.rank}</TableCell>
                  <TableCell className="font-medium">{level.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {level.description ?? <span className="italic opacity-40">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {level.defaultWorkflow ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        {level.defaultWorkflow.code}
                      </Badge>
                    ) : (
                      <span className="italic opacity-40">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{level._count.employees}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openEdit(level)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(level)}
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

      {/* Add / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Level" : "Add Level"}</SheetTitle>
            <SheetDescription>
              {editing
                ? "Update the name, rank, or description for this job level."
                : "Define a new job level. Use Rank to control the sort order (lower = more junior)."}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="level-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="level-name"
                ref={nameRef}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Senior"
                required
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="level-rank">Rank</Label>
              <Input
                id="level-rank"
                type="number"
                min={0}
                value={form.rank}
                onChange={(e) => setForm((f) => ({ ...f, rank: e.target.value }))}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Lower numbers appear first. Leave at 0 for automatic ordering.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="level-desc">Description</Label>
              <Textarea
                id="level-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description…"
                rows={3}
                maxLength={500}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="level-workflow">Default Leave Workflow</Label>
              <Select
                value={form.defaultWorkflowId}
                onValueChange={(v) => setForm((f) => ({ ...f, defaultWorkflowId: v ?? NONE }))}
              >
                <SelectTrigger id="level-workflow">
                  <SelectValue placeholder="Inherit from tenant default…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>
                    <span className="italic text-muted-foreground">— Use tenant default —</span>
                  </SelectItem>
                  {workflows.map((wf) => (
                    <SelectItem key={wf.id} value={wf.id}>
                      <span className="font-mono">{wf.code}</span>
                      {wf.description && (
                        <span className="ml-2 text-muted-foreground text-xs">{wf.description}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Employees at this level use this workflow when no EmploymentTerm override is set.
              </p>
            </div>

            <SheetFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheetOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : editing ? "Save Changes" : "Create Level"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
