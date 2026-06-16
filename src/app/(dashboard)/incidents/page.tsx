"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Incident = {
  id: string;
  employeeId: string;
  type: string;
  subject: string;
  description: string;
  incidentDate: string;
  responseDeadline: string | null;
  status: string;
  employeeResponse: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  employee: { id: string; employeeNumber: string; firstName: string; lastName: string };
};

type Employee = { id: string; employeeNumber: string; firstName: string; lastName: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INCIDENT_TYPES = [
  { value: "INCIDENT_REPORT", label: "Incident Report" },
  { value: "NOTICE_TO_EXPLAIN", label: "Notice to Explain" },
  { value: "NOTICE_OF_DECISION", label: "Notice of Decision" },
  { value: "DISCIPLINARY_ACTION", label: "Disciplinary Action" },
  { value: "COMMENDATION", label: "Commendation" },
  { value: "MEMO", label: "Memo" },
  { value: "OTHER", label: "Other" },
];

const INCIDENT_STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "UNDER_REVIEW", label: "Under Review" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
  { value: "ESCALATED", label: "Escalated" },
];

function typeBadgeVariant(t: string): "default" | "secondary" | "outline" | "destructive" {
  if (t === "NOTICE_TO_EXPLAIN") return "secondary";
  if (t === "NOTICE_OF_DECISION") return "default";
  if (t === "DISCIPLINARY_ACTION") return "destructive";
  if (t === "COMMENDATION") return "outline";
  return "secondary";
}

function statusBadgeVariant(s: string): "default" | "secondary" | "outline" | "destructive" {
  if (s === "OPEN") return "default";
  if (s === "RESOLVED") return "outline";
  if (s === "ESCALATED") return "destructive";
  return "secondary";
}

function typeLabel(t: string) {
  return INCIDENT_TYPES.find((x) => x.value === t)?.label ?? t;
}

function statusLabel(s: string) {
  return INCIDENT_STATUSES.find((x) => x.value === s)?.label ?? s;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filters
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Sheets
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Incident | null>(null);
  const [resolveTarget, setResolveTarget] = useState<Incident | null>(null);

  // Forms
  const [form, setForm] = useState({
    employeeId: "",
    type: "INCIDENT_REPORT",
    subject: "",
    description: "",
    incidentDate: "",
    responseDeadline: "",
  });
  const [editForm, setEditForm] = useState({
    subject: "",
    description: "",
    status: "OPEN",
    responseDeadline: "",
    employeeResponse: "",
  });
  const [resolution, setResolution] = useState("");
  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------------------------------
  // Debounced search
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(filterSearch), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filterSearch]);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadEmployees = useCallback(async () => {
    const res = await fetch("/api/employees?limit=500&status=ACTIVE");
    const json = await res.json();
    setEmployees(json.data ?? []);
  }, []);

  const loadIncidents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (filterType) params.set("type", filterType);
    if (filterStatus) params.set("status", filterStatus);
    if (debouncedSearch) params.set("search", debouncedSearch);
    const res = await fetch(`/api/incidents?${params}`);
    const json = await res.json();
    setIncidents(json.data ?? []);
    setTotal(json.meta?.total ?? 0);
    setLoading(false);
  }, [filterType, filterStatus, debouncedSearch]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);
  useEffect(() => { loadIncidents(); }, [loadIncidents]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleCreate() {
    if (!form.employeeId) { toast.error("Select an employee"); return; }
    if (!form.subject.trim()) { toast.error("Subject is required"); return; }
    if (!form.incidentDate) { toast.error("Incident date is required"); return; }

    setSaving(true);
    const body: Record<string, unknown> = {
      employeeId: form.employeeId,
      type: form.type,
      subject: form.subject.trim(),
      description: form.description.trim(),
      incidentDate: form.incidentDate,
    };
    if (form.responseDeadline) body.responseDeadline = form.responseDeadline;

    const res = await fetch("/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to create incident"); return; }
    toast.success("Incident created");
    setCreateOpen(false);
    loadIncidents();
  }

  async function handleEdit() {
    if (!editTarget) return;
    setSaving(true);
    const body: Record<string, unknown> = {
      subject: editForm.subject || undefined,
      description: editForm.description || undefined,
      status: editForm.status,
      responseDeadline: editForm.responseDeadline || null,
      employeeResponse: editForm.employeeResponse || null,
    };
    const res = await fetch(`/api/incidents/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to update incident"); return; }
    toast.success("Incident updated");
    setEditTarget(null);
    loadIncidents();
  }

  async function handleResolve() {
    if (!resolveTarget) return;
    if (!resolution.trim()) { toast.error("Resolution text is required"); return; }
    setSaving(true);
    const res = await fetch(`/api/incidents/${resolveTarget.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolution: resolution.trim() }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to resolve incident"); return; }
    toast.success("Incident resolved");
    setResolveTarget(null);
    setResolution("");
    loadIncidents();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Incidents</h1>
        <p className="text-sm text-muted-foreground">NTEs, incident reports, notices, and disciplinary records</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterType || "all"} onValueChange={(v) => { const val = v ?? "all"; setFilterType(val === "all" ? "" : val); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {INCIDENT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus || "all"} onValueChange={(v) => { const val = v ?? "all"; setFilterStatus(val === "all" ? "" : val); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {INCIDENT_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          className="w-52"
          placeholder="Search employee…"
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
        />

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={loadIncidents} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => { setForm({ employeeId: "", type: "INCIDENT_REPORT", subject: "", description: "", incidentDate: "", responseDeadline: "" }); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> New Incident
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : incidents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  No incidents found.
                </TableCell>
              </TableRow>
            ) : (
              incidents.map((inc) => (
                <TableRow key={inc.id}>
                  <TableCell className="text-sm font-medium">
                    {inc.employee.lastName}, {inc.employee.firstName}
                    <span className="block text-xs text-muted-foreground">{inc.employee.employeeNumber}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={typeBadgeVariant(inc.type)} className="text-xs">
                      {typeLabel(inc.type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate" title={inc.subject}>
                    {inc.subject}
                  </TableCell>
                  <TableCell className="text-sm">{inc.incidentDate.slice(0, 10)}</TableCell>
                  <TableCell className="text-sm">
                    {inc.responseDeadline ? inc.responseDeadline.slice(0, 10) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(inc.status)}>
                      {statusLabel(inc.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setEditTarget(inc);
                          setEditForm({
                            subject: inc.subject,
                            description: inc.description,
                            status: inc.status,
                            responseDeadline: inc.responseDeadline?.slice(0, 10) ?? "",
                            employeeResponse: inc.employeeResponse ?? "",
                          });
                        }}
                      >
                        Edit
                      </Button>
                      {(inc.status === "OPEN" || inc.status === "UNDER_REVIEW") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-green-600 hover:text-green-700"
                          onClick={() => { setResolveTarget(inc); setResolution(""); }}
                        >
                          Resolve
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {total > 50 && (
        <p className="text-xs text-muted-foreground text-right">Showing 50 of {total} incidents.</p>
      )}

      {/* Create Sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New Incident</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="space-y-1.5">
              <Label>Employee <span className="text-destructive">*</span></Label>
              <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v ?? "" })}>
                <SelectTrigger><SelectValue placeholder="Select employee…" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.lastName}, {e.firstName} ({e.employeeNumber})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v ?? form.type })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INCIDENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Subject <span className="text-destructive">*</span></Label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Incident Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.incidentDate} onChange={(e) => setForm({ ...form, incidentDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Response Deadline</Label>
                <Input type="date" value={form.responseDeadline} onChange={(e) => setForm({ ...form, responseDeadline: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleCreate} disabled={saving}>
                {saving ? "Creating…" : "Create Incident"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Sheet */}
      <Sheet open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Edit Incident</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {editTarget && (
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="font-medium">{editTarget.employee.lastName}, {editTarget.employee.firstName}</p>
                <p className="text-muted-foreground">{typeLabel(editTarget.type)} · {editTarget.incidentDate.slice(0, 10)}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input value={editForm.subject} onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={4} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v ?? editForm.status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INCIDENT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Response Deadline</Label>
              <Input type="date" value={editForm.responseDeadline} onChange={(e) => setEditForm({ ...editForm, responseDeadline: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Employee Response</Label>
              <Textarea rows={4} placeholder="Employee's written reply…" value={editForm.employeeResponse} onChange={(e) => setEditForm({ ...editForm, employeeResponse: e.target.value })} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleEdit} disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setEditTarget(null)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Resolve Sheet */}
      <Sheet open={!!resolveTarget} onOpenChange={(o) => !o && setResolveTarget(null)}>
        <SheetContent className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Resolve Incident</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {resolveTarget && (
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="font-medium">{resolveTarget.subject}</p>
                <p className="text-muted-foreground">{resolveTarget.employee.lastName}, {resolveTarget.employee.firstName}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Resolution <span className="text-destructive">*</span></Label>
              <Textarea rows={5} placeholder="Describe the resolution…" value={resolution} onChange={(e) => setResolution(e.target.value)} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button className="flex-1" onClick={handleResolve} disabled={saving}>
                {saving ? "Resolving…" : "Mark Resolved"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setResolveTarget(null)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
