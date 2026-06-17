"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CalendarCheck2,
  ChevronRight,
  Plus,
  X,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Users,
  Briefcase,
  Building2,
  ShieldCheck,
  Crown,
  Check,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// ─── Org-chart roles ──────────────────────────────────────────────────────────

type RoleKey = "supervisor" | "line_manager" | "dept_head" | "hr_manager" | "ceo";

const ORG_ROLES: { k: RoleKey; label: string; icon: React.ElementType; desc: string }[] = [
  { k: "supervisor",   label: "Supervisor",          icon: Users,       desc: "The employee's direct supervisor" },
  { k: "line_manager", label: "Line Manager",         icon: Briefcase,   desc: "The employee's reporting manager" },
  { k: "dept_head",    label: "Head of Department",   icon: Building2,   desc: "Head of the employee's department" },
  { k: "hr_manager",   label: "HR Manager",           icon: ShieldCheck, desc: "The HR manager on record" },
  { k: "ceo",          label: "CEO / Owner",          icon: Crown,       desc: "Company owner or chief executive" },
];

function roleByKey(k: RoleKey) {
  return ORG_ROLES.find((r) => r.k === k) ?? ORG_ROLES[0];
}

// ─── Notify options ───────────────────────────────────────────────────────────

type NotifyKey = "none" | "final" | "finalrej" | "interim" | "all";

const NOTIFY_OPTS: { k: NotifyKey; label: string; desc: string }[] = [
  { k: "none",     label: "Do not notify additional recipients",              desc: "Only the approvers in the sequence are notified." },
  { k: "final",    label: "Final approval only",                              desc: "Notify recipients when the request is fully approved." },
  { k: "finalrej", label: "Final approval / rejection",                       desc: "Notify on the final approve or reject decision." },
  { k: "interim",  label: "Final & interim approval / rejection / escalation", desc: "Notify on every approver decision and escalation." },
  { k: "all",      label: "All application-related events",                   desc: "Includes new filings, cancellations and every status change." },
];

function notifyLabel(k: NotifyKey) {
  return NOTIFY_OPTS.find((o) => o.k === k)?.label ?? "—";
}

// ─── Data types ───────────────────────────────────────────────────────────────

type LeaveWorkflow = {
  id: string;
  code: string;
  description: string | null;
  isActive: boolean;
  approvers: RoleKey[];
  notify: NotifyKey;
  recipients: RoleKey[];
};

// ─── Small role icon tile ─────────────────────────────────────────────────────

function RoleTile({ roleKey, size = 38 }: { roleKey: RoleKey; size?: number }) {
  const role = roleByKey(roleKey);
  const Icon = role.icon;
  const iconPx = Math.round(size * 0.47);
  return (
    <span
      className="flex flex-none items-center justify-center rounded-[10px]"
      style={{
        width: size,
        height: size,
        background: "var(--acc-soft, #fdeee6)",
        color: "var(--acc, #E8693A)",
      }}
    >
      <Icon style={{ width: iconPx, height: iconPx }} />
    </span>
  );
}

// ─── Compact role sequence (used on list cards) ───────────────────────────────

function RoleStack({ roles }: { roles: RoleKey[] }) {
  return (
    <div className="flex items-center gap-1">
      {roles.map((k, i) => {
        const role = roleByKey(k);
        const Icon = role.icon;
        return (
          <span key={k + i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            <span
              title={role.label}
              className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg"
              style={{ background: "var(--acc-soft, #fdeee6)", color: "var(--acc, #E8693A)" }}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
          </span>
        );
      })}
    </div>
  );
}

// ─── Timeline sequence builder ────────────────────────────────────────────────

function SequenceBuilder({
  approvers,
  onReorder,
  onRemove,
  onAdd,
  canAdd,
}: {
  approvers: RoleKey[];
  onReorder: (next: RoleKey[]) => void;
  onRemove: (i: number) => void;
  onAdd: () => void;
  canAdd: boolean;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  function handleDrop(from: number | null, to: number | null) {
    if (from === null || to === null || from === to) return;
    const next = [...approvers];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
  }

  function move(i: number, dir: -1 | 1) {
    const to = i + dir;
    if (to < 0 || to >= approvers.length) return;
    handleDrop(i, to);
  }

  return (
    <div className="relative pl-1">
      {/* Start node */}
      <div className="flex items-center gap-3.5">
        <span
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full border-[1.5px] border-dashed ml-[5px]"
          style={{ borderColor: "#cfc4b5", background: "var(--bg, #F6F2EC)", color: "var(--muted-clr, #6B6259)" }}
        >
          <Users className="h-4 w-4" />
        </span>
        <div>
          <p className="font-sans text-[13.5px] font-semibold text-[#2A2420]">Employee files leave</p>
          <p className="text-[12px] text-muted-foreground">Request enters the approval flow</p>
        </div>
      </div>

      {/* Stage rows */}
      {approvers.map((k, i) => {
        const role = roleByKey(k);
        const dragging = dragIdx === i;
        const isOver = overIdx === i && dragIdx !== null && dragIdx !== i;

        return (
          <div key={k + i} className="relative pl-0">
            {/* Connector line */}
            <span
              className="absolute left-[21px] top-[-10px] z-0 w-0.5"
              style={{
                height: "calc(100% + 20px)",
                background: "var(--line, #ECE6DD)",
              }}
            />
            {/* Stage card */}
            <div
              draggable
              onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
              onDragEnd={() => { handleDrop(dragIdx, overIdx); setDragIdx(null); setOverIdx(null); }}
              onDrop={(e) => e.preventDefault()}
              className="relative z-10 my-2.5 flex items-center gap-3 rounded-[12px] border bg-white px-3 py-[11px] transition-all"
              style={{
                borderColor: isOver ? "var(--acc, #E8693A)" : dragging ? "#d6ccc4" : "var(--line, #ECE6DD)",
                boxShadow: isOver ? "0 0 0 3px var(--acc-soft, #fdeee6)" : "none",
                opacity: dragging ? 0.4 : 1,
              }}
            >
              <GripVertical
                className="h-4 w-4 flex-none cursor-grab text-muted-foreground active:cursor-grabbing"
                style={{ letterSpacing: "-3px" }}
              />
              <span
                className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full font-sans text-[12.5px] font-bold text-white"
                style={{
                  background: "var(--acc, #E8693A)",
                  boxShadow: "0 0 0 4px #fff, 0 4px 10px -5px rgba(232,105,58,.9)",
                }}
              >
                {i + 1}
              </span>
              <RoleTile roleKey={k} size={38} />
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[14px] font-semibold leading-tight">{role.label}</p>
                <p className="text-[12px] text-muted-foreground">{role.desc}</p>
              </div>
              <div className="flex flex-none items-center gap-1">
                <button
                  className="flex h-7 w-7 items-center justify-center rounded-lg border bg-white text-muted-foreground transition-colors hover:bg-[#f6f1ea] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label="Move up"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  className="flex h-7 w-7 items-center justify-center rounded-lg border bg-white text-muted-foreground transition-colors hover:bg-[#f6f1ea] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                  disabled={i === approvers.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Move down"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-lg border bg-white text-muted-foreground transition-colors hover:border-[#f3cfca] hover:bg-[#fbe9e7] hover:text-[#b23b34]"
                  onClick={() => onRemove(i)}
                  aria-label="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Add level row */}
      {canAdd && (
        <div className="relative pl-0">
          <span
            className="absolute left-[21px] top-[-10px] z-0 h-[32px] w-0.5"
            style={{ background: "var(--line, #ECE6DD)" }}
          />
          <button
            onClick={onAdd}
            className="relative z-10 my-2.5 flex w-full items-center gap-3 rounded-[12px] border-[1.5px] border-dashed px-3 py-[11px] font-sans text-[13.5px] font-semibold text-muted-foreground transition-all hover:border-[var(--acc)] hover:bg-[var(--acc-soft)] hover:text-[#C2552F]"
            style={{ borderColor: "var(--line, #ECE6DD)" }}
          >
            <span
              className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-[1.5px] border-dashed"
              style={{
                borderColor: "#cdc2b3",
                background: "#fff",
                color: "var(--acc, #E8693A)",
                boxShadow: "0 0 0 4px #fff",
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </span>
            Add approval level
          </button>
        </div>
      )}

      {/* Connector before finish node */}
      <span
        className="absolute left-[21px] z-0 h-[22px] w-0.5"
        style={{ bottom: 34, background: "var(--line, #ECE6DD)" }}
      />

      {/* Approved finish node */}
      <div className="relative mt-2 flex items-center gap-3.5">
        <span
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full border-[1.5px] ml-[5px]"
          style={{ borderColor: "#b6dcc4", background: "#e7f4ec", color: "#1f7a4d" }}
        >
          <Check className="h-4 w-4" />
        </span>
        <div>
          <p className="font-sans text-[13.5px] font-semibold text-[#2A2420]">Leave approved</p>
          <p className="text-[12px] text-muted-foreground">Employee &amp; recipients notified</p>
        </div>
      </div>
    </div>
  );
}

// ─── Role picker (Sheet) ──────────────────────────────────────────────────────

function RolePicker({
  title,
  sub,
  exclude,
  onPick,
  onClose,
}: {
  title: string;
  sub: string;
  exclude: RoleKey[];
  onPick: (k: RoleKey) => void;
  onClose: () => void;
}) {
  const available = ORG_ROLES.filter((r) => !exclude.includes(r.k));

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <p className="text-sm text-muted-foreground">{sub}</p>
        </SheetHeader>
        <div className="mt-5 flex flex-col gap-2">
          {available.length === 0 ? (
            <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
              All org-chart roles have been added.
            </p>
          ) : (
            available.map((r) => (
                <button
                  key={r.k}
                  onClick={() => onPick(r.k)}
                  className="flex items-center gap-3 rounded-[11px] border border-[var(--line)] bg-white px-3 py-2.5 text-left transition-all hover:border-[var(--acc)] hover:bg-[var(--acc-soft)]"
                >
                  <RoleTile roleKey={r.k} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-[13.5px] font-semibold">{r.label}</p>
                    <p className="text-[12px] text-muted-foreground">{r.desc}</p>
                  </div>
                  <span
                    className="flex h-7 w-7 flex-none items-center justify-center rounded-lg"
                    style={{ background: "var(--bg, #F6F2EC)", color: "var(--acc, #E8693A)" }}
                  >
                    <Plus className="h-4 w-4" />
                  </span>
                </button>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Workflow list ─────────────────────────────────────────────────────────────

function WorkflowList({
  templates,
  loading,
  onOpen,
  onNew,
}: {
  templates: LeaveWorkflow[];
  loading: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leave Approval Workflow</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Templates that define how employees&apos; leave requests are routed and approved across the org chart.
          </p>
        </div>
        <Button onClick={onNew} className="flex-none">
          <Plus className="mr-1.5 h-4 w-4" /> New Workflow
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[210px] w-full rounded-[14px]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => onOpen(t.id)}
              className="group flex flex-col rounded-[14px] border bg-white p-[18px] text-left transition-all hover:-translate-y-0.5 hover:border-[#ddd3c6] hover:shadow-[0_12px_28px_-20px_rgba(42,36,32,0.45)]"
            >
              <div className="mb-3.5 flex items-center justify-between">
                <span
                  className="flex h-[42px] w-[42px] items-center justify-center rounded-[11px]"
                  style={{ background: "var(--acc-soft, #fdeee6)", color: "var(--acc, #E8693A)" }}
                >
                  <CalendarCheck2 className="h-5 w-5" />
                </span>
                <Badge variant={t.isActive ? "default" : "secondary"} className="text-xs">
                  {t.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <h3 className="mb-1 font-sans text-[18px] font-semibold tracking-[-0.01em]">{t.code}</h3>
              <p className="min-h-[38px] text-[13px] leading-[1.45] text-muted-foreground">
                {t.description ?? ""}
              </p>
              <div className="mt-4 flex items-center justify-between border-t pt-3.5" style={{ borderColor: "var(--line-2, #f1ece4)" }}>
                <div className="flex items-center gap-2.5">
                  <RoleStack roles={t.approvers} />
                  <span className="font-sans text-[12.5px] font-semibold text-muted-foreground">
                    {t.approvers.length}-step approval
                  </span>
                </div>
                <ChevronRight
                  className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-[var(--acc)]"
                  style={{ color: "var(--muted-2, #9b9085)" }}
                />
              </div>
            </button>
          ))}

          {/* Add card */}
          <button
            onClick={onNew}
            className="flex min-h-[210px] flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed text-muted-foreground transition-all hover:border-[var(--acc)] hover:text-[#C2552F]"
          >
            <span
              className="mb-2.5 flex h-12 w-12 items-center justify-center rounded-[13px] transition-all"
              style={{ background: "var(--bg, #F6F2EC)", color: "var(--acc, #E8693A)" }}
            >
              <Plus className="h-5 w-5" />
            </span>
            <b className="font-sans text-[14px] font-semibold text-foreground">New workflow template</b>
            <i className="font-normal text-[12.5px] text-muted-foreground">Define a new approval sequence</i>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Workflow detail / editor ──────────────────────────────────────────────────

function WorkflowDetail({
  template,
  onBack,
  onSave,
}: {
  template: LeaveWorkflow;
  onBack: () => void;
  onSave: (draft: LeaveWorkflow) => Promise<void>;
}) {
  const [draft, setDraft] = useState<LeaveWorkflow>(() => JSON.parse(JSON.stringify(template)));
  const [picker, setPicker] = useState<"approver" | "recipient" | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function set<K extends keyof LeaveWorkflow>(k: K, v: LeaveWorkflow[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  const canAdd = draft.approvers.length < ORG_ROLES.length;
  const notifyOn = draft.notify !== "none";

  async function handleSave() {
    if (!draft.code.trim()) { toast.error("Code is required"); return; }
    if (draft.approvers.length === 0) { toast.error("Add at least one approval level"); return; }
    setSaving(true);
    try {
      await onSave(draft);
      setSavedFlash(true);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setSavedFlash(false), 1900);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <button
          onClick={onBack}
          className="hover:text-foreground transition-colors"
        >
          Leave Approval Workflow
        </button>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{draft.code || "New workflow"}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span
            className="flex h-[54px] w-[54px] flex-none items-center justify-center rounded-[14px]"
            style={{ background: "var(--acc-soft, #fdeee6)", color: "var(--acc, #E8693A)" }}
          >
            <CalendarCheck2 className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-sans text-[26px] font-semibold tracking-[-0.025em] leading-tight">
              {draft.code || "New workflow"}
            </h1>
            <p className="mt-0.5 text-[13.5px] text-muted-foreground">
              {draft.approvers.length}-step sequence · Notify: {notifyLabel(draft.notify)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Active toggle pill */}
          <div
            className="flex items-center gap-2.5 rounded-[10px] border bg-white px-3.5 py-[7px]"
            style={{ borderColor: "var(--line, #ECE6DD)" }}
          >
            <span className="font-sans text-[13px] font-semibold">
              {draft.isActive ? "Active" : "Inactive"}
            </span>
            <Switch
              checked={draft.isActive}
              onCheckedChange={(v) => set("isActive", v)}
            />
          </div>
          <Button variant="outline" onClick={onBack}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {savedFlash ? (
              <><Check className="mr-1.5 h-4 w-4" /> Saved</>
            ) : (
              <><Check className="mr-1.5 h-4 w-4" /> {saving ? "Saving…" : "Save workflow"}</>
            )}
          </Button>
        </div>
      </div>

      {/* Two-column body */}
      <div
        className="grid gap-4 items-start"
        style={{ gridTemplateColumns: "1fr 360px" }}
      >
        {/* Main — approval sequence */}
        <div className="space-y-3">
          <div className="rounded-[14px] border bg-white overflow-hidden">
            {/* Card header */}
            <div
              className="flex items-center justify-between gap-3.5 border-b px-[18px] py-[15px]"
              style={{ borderColor: "var(--line-2, #f1ece4)" }}
            >
              <div>
                <h3 className="font-sans text-[15.5px] font-semibold tracking-[-0.01em]">Approval sequence</h3>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  Requests route top-to-bottom through these org-chart roles. Drag a level or use the arrows to reorder.
                </p>
              </div>
              {canAdd && (
                <Button variant="outline" size="sm" onClick={() => setPicker("approver")}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add level
                </Button>
              )}
            </div>

            {/* Card body */}
            <div className="px-[18px] py-5">
              {draft.approvers.length === 0 ? (
                <div className="flex flex-col items-center py-7 text-center">
                  <span
                    className="mb-3 flex h-[54px] w-[54px] items-center justify-center rounded-[14px]"
                    style={{ background: "var(--bg, #F6F2EC)", color: "var(--muted-clr, #6B6259)" }}
                  >
                    <Users className="h-6 w-6" />
                  </span>
                  <b className="font-sans text-[15px] font-semibold">No approval levels yet</b>
                  <p className="mb-4 mt-1 text-[13px] text-muted-foreground">
                    Add at least one org-chart role to route leave requests.
                  </p>
                  <Button onClick={() => setPicker("approver")}>
                    <Plus className="mr-1.5 h-4 w-4" /> Add first level
                  </Button>
                </div>
              ) : (
                <SequenceBuilder
                  approvers={draft.approvers}
                  canAdd={canAdd}
                  onReorder={(next) => set("approvers", next)}
                  onRemove={(i) => set("approvers", draft.approvers.filter((_, idx) => idx !== i))}
                  onAdd={() => setPicker("approver")}
                />
              )}
            </div>
          </div>

          {/* Info note */}
          <div className="flex items-start gap-3 rounded-[10px] border bg-white px-4 py-3.5" style={{ borderColor: "var(--line, #ECE6DD)" }}>
            <Info className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" />
            <div className="text-[12.5px] text-muted-foreground leading-relaxed space-y-1">
              <p>Each level is resolved from the employee&apos;s position in the <b className="font-semibold text-foreground">organization chart</b> at the time of filing — no need to name specific people.</p>
              <p>This workflow is assigned to employees via their <b className="font-semibold text-foreground">Employment Terms</b>.</p>
            </div>
          </div>
        </div>

        {/* Side — details + notify */}
        <div className="space-y-4">
          {/* Details card */}
          <div className="rounded-[14px] border bg-white overflow-hidden">
            <div className="border-b px-4 py-3" style={{ borderColor: "var(--line-2, #f1ece4)" }}>
              <h3 className="font-sans text-[14px] font-semibold">Details</h3>
            </div>
            <div className="space-y-3.5 p-4">
              <div className="space-y-1.5">
                <Label>Code <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. DEFAULT"
                  value={draft.code}
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description <span className="text-destructive">*</span></Label>
                <Textarea
                  rows={2}
                  placeholder="What this workflow is for…"
                  value={draft.description ?? ""}
                  onChange={(e) => set("description", e.target.value || null)}
                />
              </div>
            </div>
          </div>

          {/* Notify card */}
          <div className="rounded-[14px] border bg-white overflow-hidden">
            <div className="border-b px-4 py-3" style={{ borderColor: "var(--line-2, #f1ece4)" }}>
              <h3 className="font-sans text-[14px] font-semibold">Notify additional recipients</h3>
            </div>
            <div className="p-4">
              <div className="flex flex-col gap-2">
                {NOTIFY_OPTS.map((o) => {
                  const on = draft.notify === o.k;
                  return (
                    <button
                      key={o.k}
                      onClick={() => set("notify", o.k)}
                      className="flex items-start gap-2.5 rounded-[11px] border p-3 text-left transition-all"
                      style={{
                        borderColor: on ? "var(--acc, #E8693A)" : "var(--line, #ECE6DD)",
                        background: on ? "var(--acc-soft, #fdeee6)" : "#fff",
                      }}
                    >
                      {/* Radio dot */}
                      <span
                        className="mt-[2px] flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border-2 transition-all"
                        style={{ borderColor: on ? "var(--acc, #E8693A)" : "#cfc4b5" }}
                      >
                        <span
                          className="h-[9px] w-[9px] rounded-full transition-transform"
                          style={{
                            background: "var(--acc, #E8693A)",
                            transform: on ? "scale(1)" : "scale(0)",
                          }}
                        />
                      </span>
                      <span>
                        <b className="block font-sans text-[13px] font-semibold leading-[1.3] text-foreground">{o.label}</b>
                        <i className="mt-0.5 block font-normal text-[11.5px] leading-[1.35] text-muted-foreground">{o.desc}</i>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Recipient roles sub-section */}
              {notifyOn && (
                <div
                  className="mt-4 border-t pt-4"
                  style={{ borderColor: "var(--line-2, #f1ece4)" }}
                >
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="font-sans text-[12.5px] font-semibold">Recipient roles</span>
                    {draft.recipients.length < ORG_ROLES.length && (
                      <button
                        className="inline-flex items-center gap-1 font-sans text-[12.5px] font-semibold text-[#C2552F] hover:underline"
                        onClick={() => setPicker("recipient")}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add
                      </button>
                    )}
                  </div>
                  {draft.recipients.length === 0 ? (
                    <p
                      className="rounded-[9px] border border-dashed p-3 text-[12.5px] text-muted-foreground"
                      style={{ borderColor: "var(--line, #ECE6DD)", background: "var(--bg, #F6F2EC)" }}
                    >
                      No additional recipient roles selected.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {draft.recipients.map((k, i) => {
                        const role = roleByKey(k);
                        const Icon = role.icon;
                        return (
                          <span
                            key={k + i}
                            className="inline-flex items-center gap-1.5 rounded-full border bg-[var(--bg,#F6F2EC)] py-1 pl-1 pr-2 font-sans text-[12.5px] font-medium"
                            style={{ borderColor: "var(--line, #ECE6DD)" }}
                          >
                            <span
                              className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[6px]"
                              style={{ background: "var(--acc-soft, #fdeee6)", color: "var(--acc, #E8693A)" }}
                            >
                              <Icon className="h-3 w-3" />
                            </span>
                            {role.label}
                            <button
                              className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-muted-foreground hover:bg-[#fbe9e7] hover:text-[#b23b34]"
                              onClick={() => set("recipients", draft.recipients.filter((_, idx) => idx !== i))}
                              aria-label="Remove"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Role pickers */}
      {picker === "approver" && (
        <RolePicker
          title="Add approval level"
          sub="Pick the org-chart role that approves at this stage"
          exclude={draft.approvers}
          onPick={(k) => { set("approvers", [...draft.approvers, k]); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "recipient" && (
        <RolePicker
          title="Add recipient role"
          sub="Notify this role about leave decisions"
          exclude={draft.recipients}
          onPick={(k) => { set("recipients", [...draft.recipients, k]); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function LeaveWorkflowPage() {
  const [templates, setTemplates] = useState<LeaveWorkflow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState<{ mode: "list" | "detail"; id: string | null }>({ mode: "list", id: null });

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch("/api/leave-workflows");
    const json = await res.json();
    setTemplates(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openTemplate(id: string) {
    setView({ mode: "detail", id });
  }

  async function newTemplate() {
    const res  = await fetch("/api/leave-workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "NEW", description: "", isActive: true, approvers: [], notify: "finalrej", recipients: [] }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? "Failed to create"); return; }
    setTemplates((prev) => [...prev, json.data]);
    setView({ mode: "detail", id: json.data.id });
  }

  async function saveTemplate(draft: LeaveWorkflow) {
    const res  = await fetch(`/api/leave-workflows/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code:        draft.code,
        description: draft.description,
        isActive:    draft.isActive,
        approvers:   draft.approvers,
        notify:      draft.notify,
        recipients:  draft.recipients,
      }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error ?? "Failed to save"); throw new Error(json.error); }
    setTemplates((prev) => prev.map((t) => (t.id === json.data.id ? json.data : t)));
    toast.success("Workflow saved");
  }

  if (view.mode === "detail") {
    const tpl = templates.find((t) => t.id === view.id);
    if (!tpl) { setView({ mode: "list", id: null }); return null; }
    return (
      <WorkflowDetail
        template={tpl}
        onBack={() => { setView({ mode: "list", id: null }); load(); }}
        onSave={saveTemplate}
      />
    );
  }

  return (
    <WorkflowList
      templates={templates}
      loading={loading}
      onOpen={openTemplate}
      onNew={newTemplate}
    />
  );
}
