"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobPosting {
  id: string;
  title: string;
  code: string | null;
  description: string | null;
  departmentId: string | null;
  branchId: string | null;
  positionId: string | null;
  headcount: number;
  status: "DRAFT" | "OPEN" | "ON_HOLD" | "CLOSED";
  openedAt: string | null;
  closedAt: string | null;
}

interface Applicant {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  stage: "APPLIED" | "SCREENING" | "INTERVIEW" | "OFFER" | "HIRED" | "REJECTED" | "WITHDRAWN";
  source: "REFERRAL" | "ONLINE_POSTING" | "WALK_IN" | "AGENCY" | "OTHER";
  rating: number | null;
  rejectionReason: string | null;
  jobPosting: { id: string; title: string; code: string | null };
}

interface ApplicantNote {
  id: string;
  body: string;
  createdAt: string;
}

interface Department { id: string; name: string; }
interface Branch { id: string; name: string; }
interface Position { id: string; title: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_ORDER = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER"] as const;
const TERMINAL_STAGES = new Set(["HIRED", "REJECTED", "WITHDRAWN"]);

function stageBadge(stage: Applicant["stage"]) {
  const map: Record<string, string> = {
    APPLIED: "secondary",
    SCREENING: "outline",
    INTERVIEW: "outline",
    OFFER: "default",
    HIRED: "default",
    REJECTED: "destructive",
    WITHDRAWN: "secondary",
  };
  return <Badge variant={(map[stage] ?? "secondary") as never}>{stage}</Badge>;
}

function postingStatusBadge(status: JobPosting["status"]) {
  const map: Record<string, string> = {
    DRAFT: "secondary",
    OPEN: "default",
    ON_HOLD: "outline",
    CLOSED: "secondary",
  };
  return <Badge variant={(map[status] ?? "secondary") as never}>{status}</Badge>;
}

function Stars({ rating }: { rating: number | null }) {
  return (
    <span className="text-yellow-400">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n}>{n <= (rating ?? 0) ? "★" : "☆"}</span>
      ))}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RecruitmentPage() {
  const router = useRouter();

  // Reference data
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);

  // Job Postings tab
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [postingsLoading, setPostingsLoading] = useState(true);
  const [postingStatusFilter, setPostingStatusFilter] = useState("");
  const [postingSheet, setPostingSheet] = useState<"create" | "edit" | null>(null);
  const [editingPosting, setEditingPosting] = useState<JobPosting | null>(null);
  const [postingForm, setPostingForm] = useState({
    title: "", code: "", description: "", departmentId: "", branchId: "",
    positionId: "", headcount: "1",
  });
  const [postingSaving, setPostingSaving] = useState(false);
  const [deletePostingId, setDeletePostingId] = useState<string | null>(null);

  // Applicants tab
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [applicantsLoading, setApplicantsLoading] = useState(true);
  const [postingFilter, setPostingFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [applicantSheet, setApplicantSheet] = useState<"create" | null>(null);
  const [applicantForm, setApplicantForm] = useState({
    jobPostingId: "", firstName: "", lastName: "", email: "", phone: "",
    source: "ONLINE_POSTING",
  });
  const [applicantSaving, setApplicantSaving] = useState(false);

  // Reject sheet
  const [rejectTarget, setRejectTarget] = useState<Applicant | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectSaving, setRejectSaving] = useState(false);

  // Notes sheet
  const [notesTarget, setNotesTarget] = useState<Applicant | null>(null);
  const [notes, setNotes] = useState<ApplicantNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  // ── Reference data fetch ──
  useEffect(() => {
    Promise.all([
      fetch("/api/departments?limit=200").then((r) => r.json()),
      fetch("/api/branches?limit=200").then((r) => r.json()),
      fetch("/api/positions?limit=200").then((r) => r.json()),
    ]).then(([d, b, p]) => {
      setDepartments(d?.data ?? []);
      setBranches(b?.data ?? []);
      setPositions(p?.data ?? []);
    });
  }, []);

  // ── Job Postings fetch ──
  const fetchPostings = useCallback(() => {
    setPostingsLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (postingStatusFilter) params.set("status", postingStatusFilter);
    fetch(`/api/job-postings?${params}`)
      .then((r) => r.json())
      .then((d) => setPostings(d?.data ?? []))
      .finally(() => setPostingsLoading(false));
  }, [postingStatusFilter]);

  useEffect(() => { fetchPostings(); }, [fetchPostings]);

  // ── Applicants fetch ──
  const fetchApplicants = useCallback(() => {
    setApplicantsLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (postingFilter) params.set("jobPostingId", postingFilter);
    if (stageFilter) params.set("stage", stageFilter);
    fetch(`/api/applicants?${params}`)
      .then((r) => r.json())
      .then((d) => setApplicants(d?.data ?? []))
      .finally(() => setApplicantsLoading(false));
  }, [postingFilter, stageFilter]);

  useEffect(() => { fetchApplicants(); }, [fetchApplicants]);

  // ── Notes fetch ──
  useEffect(() => {
    if (!notesTarget) { setNotes([]); return; }
    setNotesLoading(true);
    fetch(`/api/applicants/${notesTarget.id}/notes`)
      .then((r) => r.json())
      .then((d) => setNotes(d?.data ?? []))
      .finally(() => setNotesLoading(false));
  }, [notesTarget]);

  // ── Name maps ──
  const deptMap = Object.fromEntries(departments.map((d) => [d.id, d.name]));
  const branchMap = Object.fromEntries(branches.map((b) => [b.id, b.name]));
  const posMap = Object.fromEntries(positions.map((p) => [p.id, p.title]));

  // ──────────────────────────────────────────────────────────────────────────
  // Job Posting handlers
  // ──────────────────────────────────────────────────────────────────────────

  function openCreatePosting() {
    setEditingPosting(null);
    setPostingForm({ title: "", code: "", description: "", departmentId: "", branchId: "", positionId: "", headcount: "1" });
    setPostingSheet("create");
  }

  function openEditPosting(p: JobPosting) {
    setEditingPosting(p);
    setPostingForm({
      title: p.title,
      code: p.code ?? "",
      description: p.description ?? "",
      departmentId: p.departmentId ?? "",
      branchId: p.branchId ?? "",
      positionId: p.positionId ?? "",
      headcount: String(p.headcount),
    });
    setPostingSheet("edit");
  }

  async function savePosting() {
    setPostingSaving(true);
    const body = {
      title: postingForm.title,
      code: postingForm.code || undefined,
      description: postingForm.description || undefined,
      departmentId: postingForm.departmentId || undefined,
      branchId: postingForm.branchId || undefined,
      positionId: postingForm.positionId || undefined,
      headcount: parseInt(postingForm.headcount, 10) || 1,
    };
    const url = postingSheet === "edit" && editingPosting ? `/api/job-postings/${editingPosting.id}` : "/api/job-postings";
    const method = postingSheet === "edit" ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    setPostingSaving(false);
    if (!res.ok) { toast.error(data?.message ?? "Error saving job posting"); return; }
    toast.success(postingSheet === "edit" ? "Job posting updated" : "Job posting created");
    setPostingSheet(null);
    fetchPostings();
  }

  async function changePostingStatus(p: JobPosting, newStatus: string) {
    const body: Record<string, unknown> = { status: newStatus };
    if (newStatus === "OPEN") body.openedAt = new Date().toISOString();
    if (newStatus === "CLOSED") body.closedAt = new Date().toISOString();
    const res = await fetch(`/api/job-postings/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { toast.error("Failed to update status"); return; }
    toast.success(`Posting ${newStatus.toLowerCase()}`);
    fetchPostings();
  }

  async function deletePosting() {
    if (!deletePostingId) return;
    const res = await fetch(`/api/job-postings/${deletePostingId}`, { method: "DELETE" });
    setDeletePostingId(null);
    if (!res.ok) { toast.error("Failed to delete posting"); return; }
    toast.success("Posting deleted");
    fetchPostings();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Applicant handlers
  // ──────────────────────────────────────────────────────────────────────────

  async function createApplicant() {
    setApplicantSaving(true);
    const body = {
      jobPostingId: applicantForm.jobPostingId,
      firstName: applicantForm.firstName,
      lastName: applicantForm.lastName,
      email: applicantForm.email || undefined,
      phone: applicantForm.phone || undefined,
      source: applicantForm.source,
    };
    const res = await fetch("/api/applicants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    setApplicantSaving(false);
    if (!res.ok) { toast.error(data?.message ?? "Error creating applicant"); return; }
    toast.success("Applicant added");
    setApplicantSheet(null);
    fetchApplicants();
  }

  async function advanceStage(applicant: Applicant) {
    const res = await fetch(`/api/applicants/${applicant.id}/advance`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { toast.error(data?.message ?? "Cannot advance stage"); return; }
    toast.success(`Stage advanced to ${data?.data?.stage}`);
    fetchApplicants();
  }

  async function hireApplicant(applicant: Applicant) {
    const res = await fetch(`/api/applicants/${applicant.id}/hire`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { toast.error(data?.message ?? "Failed to hire"); return; }
    toast.success("Applicant hired! Redirecting to employee profile...");
    const employeeId = data?.data?.employeeId;
    if (employeeId) router.push(`/employees/${employeeId}`);
    else fetchApplicants();
  }

  async function submitReject() {
    if (!rejectTarget) return;
    setRejectSaving(true);
    const res = await fetch(`/api/applicants/${rejectTarget.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejectionReason }),
    });
    const data = await res.json();
    setRejectSaving(false);
    if (!res.ok) { toast.error(data?.message ?? "Failed to reject"); return; }
    toast.success("Applicant rejected");
    setRejectTarget(null);
    setRejectionReason("");
    fetchApplicants();
  }

  async function setRating(applicant: Applicant, rating: number) {
    const res = await fetch(`/api/applicants/${applicant.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    });
    if (!res.ok) { toast.error("Failed to update rating"); return; }
    fetchApplicants();
  }

  async function addNote() {
    if (!notesTarget || !noteBody.trim()) return;
    setNoteSaving(true);
    const res = await fetch(`/api/applicants/${notesTarget.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: noteBody.trim() }),
    });
    const data = await res.json();
    setNoteSaving(false);
    if (!res.ok) { toast.error(data?.message ?? "Failed to add note"); return; }
    toast.success("Note added");
    setNoteBody("");
    setNotes((prev) => [data.data, ...prev]);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Recruitment</h1>

      <Tabs defaultValue="postings">
        <TabsList>
          <TabsTrigger value="postings">Job Postings</TabsTrigger>
          <TabsTrigger value="applicants">Applicants</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* JOB POSTINGS TAB                                               */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="postings" className="space-y-4 mt-4">
          <div className="flex gap-2 items-center">
            <Select
              value={postingStatusFilter || "all"}
              onValueChange={(v) => {
                const val = v ?? "all";
                setPostingStatusFilter(val === "all" ? "" : val);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="DRAFT">DRAFT</SelectItem>
                <SelectItem value="OPEN">OPEN</SelectItem>
                <SelectItem value="ON_HOLD">ON HOLD</SelectItem>
                <SelectItem value="CLOSED">CLOSED</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={openCreatePosting}>+ Add Posting</Button>
          </div>

          {postingsLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Headcount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Opened At</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {postings.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No job postings found</TableCell></TableRow>
                )}
                {postings.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.code ?? "—"}</TableCell>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell>{p.departmentId ? deptMap[p.departmentId] ?? p.departmentId : "—"}</TableCell>
                    <TableCell>{p.branchId ? branchMap[p.branchId] ?? p.branchId : "—"}</TableCell>
                    <TableCell>{p.positionId ? posMap[p.positionId] ?? p.positionId : "—"}</TableCell>
                    <TableCell>{p.headcount}</TableCell>
                    <TableCell>{postingStatusBadge(p.status)}</TableCell>
                    <TableCell>{p.openedAt ? new Date(p.openedAt).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {p.status === "DRAFT" && (
                          <Button size="sm" variant="outline" onClick={() => changePostingStatus(p, "OPEN")}>Open</Button>
                        )}
                        {p.status === "OPEN" && (
                          <Button size="sm" variant="outline" onClick={() => changePostingStatus(p, "CLOSED")}>Close</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => openEditPosting(p)}>Edit</Button>
                        {(p.status === "DRAFT" || p.status === "CLOSED") && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeletePostingId(p.id)}>Delete</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* APPLICANTS TAB                                                 */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="applicants" className="space-y-4 mt-4">
          <div className="flex gap-2 items-center flex-wrap">
            <Select
              value={postingFilter || "all"}
              onValueChange={(v) => {
                const val = v ?? "all";
                setPostingFilter(val === "all" ? "" : val);
              }}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder="All Job Postings" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Job Postings</SelectItem>
                {postings.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.title}{p.code ? ` (${p.code})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={stageFilter || "all"}
              onValueChange={(v) => {
                const val = v ?? "all";
                setStageFilter(val === "all" ? "" : val);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED", "WITHDRAWN"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => {
              setApplicantForm({ jobPostingId: postingFilter || "", firstName: "", lastName: "", email: "", phone: "", source: "ONLINE_POSTING" });
              setApplicantSheet("create");
            }}>+ Add Applicant</Button>
          </div>

          {applicantsLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Job Posting</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applicants.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No applicants found</TableCell></TableRow>
                )}
                {applicants.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.firstName} {a.lastName}</TableCell>
                    <TableCell>{a.email ?? "—"}</TableCell>
                    <TableCell>{a.phone ?? "—"}</TableCell>
                    <TableCell>{a.jobPosting?.title ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{a.source.replace("_", " ")}</Badge></TableCell>
                    <TableCell>{stageBadge(a.stage)}</TableCell>
                    <TableCell>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            className={`text-lg ${n <= (a.rating ?? 0) ? "text-yellow-400" : "text-gray-300"} hover:text-yellow-400 transition-colors`}
                            onClick={() => setRating(a, n)}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {!TERMINAL_STAGES.has(a.stage) && STAGE_ORDER.includes(a.stage as typeof STAGE_ORDER[number]) && (
                          <Button size="sm" variant="outline" onClick={() => advanceStage(a)}>Advance</Button>
                        )}
                        {a.stage === "OFFER" && (
                          <Button size="sm" variant="default" onClick={() => hireApplicant(a)}>Hire</Button>
                        )}
                        {!TERMINAL_STAGES.has(a.stage) && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setRejectTarget(a); setRejectionReason(""); }}>Reject</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setNotesTarget(a)}>Notes</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* JOB POSTING SHEET (create / edit)                                  */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Sheet open={postingSheet !== null} onOpenChange={(o) => { if (!o) setPostingSheet(null); }}>
        <SheetContent className="w-[460px]">
          <SheetHeader>
            <SheetTitle>{postingSheet === "edit" ? "Edit Job Posting" : "New Job Posting"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <Label>Title *</Label>
              <Input value={postingForm.title} onChange={(e) => setPostingForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Code</Label>
              <Input placeholder="e.g. DEV-SENIOR-2026" value={postingForm.code} onChange={(e) => setPostingForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
            </div>
            <div className="space-y-1">
              <Label>Department</Label>
              <Select value={postingForm.departmentId || "none"} onValueChange={(v) => { const val = v ?? "none"; setPostingForm((f) => ({ ...f, departmentId: val === "none" ? "" : val })); }}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Branch</Label>
              <Select value={postingForm.branchId || "none"} onValueChange={(v) => { const val = v ?? "none"; setPostingForm((f) => ({ ...f, branchId: val === "none" ? "" : val })); }}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Position</Label>
              <Select value={postingForm.positionId || "none"} onValueChange={(v) => { const val = v ?? "none"; setPostingForm((f) => ({ ...f, positionId: val === "none" ? "" : val })); }}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {positions.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Headcount</Label>
              <Input type="number" min="1" value={postingForm.headcount} onChange={(e) => setPostingForm((f) => ({ ...f, headcount: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={4} value={postingForm.description} onChange={(e) => setPostingForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <SheetFooter>
            <Button onClick={savePosting} disabled={postingSaving || !postingForm.title}>
              {postingSaving ? "Saving…" : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* DELETE POSTING CONFIRM                                             */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={deletePostingId !== null} onOpenChange={(o: boolean) => { if (!o) setDeletePostingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Job Posting?</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePostingId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deletePosting}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ADD APPLICANT SHEET                                                */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Sheet open={applicantSheet !== null} onOpenChange={(o) => { if (!o) setApplicantSheet(null); }}>
        <SheetContent className="w-[420px]">
          <SheetHeader>
            <SheetTitle>Add Applicant</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <Label>Job Posting *</Label>
              <Select value={applicantForm.jobPostingId || "none"} onValueChange={(v) => { const val = v ?? "none"; setApplicantForm((f) => ({ ...f, jobPostingId: val === "none" ? "" : val })); }}>
                <SelectTrigger><SelectValue placeholder="Select posting" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select posting</SelectItem>
                  {postings.filter((p) => p.status === "OPEN").map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.title}{p.code ? ` (${p.code})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>First Name *</Label>
              <Input value={applicantForm.firstName} onChange={(e) => setApplicantForm((f) => ({ ...f, firstName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Last Name *</Label>
              <Input value={applicantForm.lastName} onChange={(e) => setApplicantForm((f) => ({ ...f, lastName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={applicantForm.email} onChange={(e) => setApplicantForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={applicantForm.phone} onChange={(e) => setApplicantForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Source</Label>
              <Select value={applicantForm.source} onValueChange={(v) => { const val = v ?? "ONLINE_POSTING"; setApplicantForm((f) => ({ ...f, source: val })); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["REFERRAL", "ONLINE_POSTING", "WALK_IN", "AGENCY", "OTHER"].map((s) => (
                    <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <SheetFooter>
            <Button onClick={createApplicant} disabled={applicantSaving || !applicantForm.jobPostingId || !applicantForm.firstName || !applicantForm.lastName}>
              {applicantSaving ? "Saving…" : "Add Applicant"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* REJECT SHEET                                                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Sheet open={rejectTarget !== null} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectionReason(""); } }}>
        <SheetContent className="w-[400px]">
          <SheetHeader>
            <SheetTitle>Reject Applicant</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Rejecting <strong>{rejectTarget?.firstName} {rejectTarget?.lastName}</strong>
            </p>
            <div className="space-y-1">
              <Label>Rejection Reason *</Label>
              <Textarea rows={4} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Enter reason for rejection..." />
            </div>
          </div>
          <SheetFooter>
            <Button variant="destructive" onClick={submitReject} disabled={rejectSaving || !rejectionReason.trim()}>
              {rejectSaving ? "Rejecting…" : "Confirm Rejection"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* NOTES SHEET                                                         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Sheet open={notesTarget !== null} onOpenChange={(o) => { if (!o) { setNotesTarget(null); setNoteBody(""); } }}>
        <SheetContent className="w-[460px] flex flex-col">
          <SheetHeader>
            <SheetTitle>Notes — {notesTarget?.firstName} {notesTarget?.lastName}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-3 py-4">
            {notesLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : notes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No notes yet</p>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="rounded-md border p-3 space-y-1">
                  <p className="text-sm">{n.body}</p>
                  <p className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
          <div className="border-t pt-4 space-y-2">
            <Textarea rows={3} placeholder="Add a note…" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
            <Button size="sm" onClick={addNote} disabled={noteSaving || !noteBody.trim()}>
              {noteSaving ? "Adding…" : "Add Note"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
