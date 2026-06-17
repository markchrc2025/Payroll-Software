"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Crown, Users, Briefcase, Building2, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type EmpSummary = {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  position?: { title: string } | null;
  department?: { name: string } | null;
};

type RoleAssignment = {
  employeeId: string;
  name: string;
  employeeNumber: string;
  positionTitle: string;
} | null;

type OrgRoleMap = {
  hr_manager: RoleAssignment;
  ceo: RoleAssignment;
};

const SINGLETON_ROLES = [
  {
    key: "hr_manager" as const,
    label: "HR Manager",
    description: "Approves leave on behalf of HR. Receives notifications for all leave decisions.",
    icon: ShieldCheck,
    color: "#4F9373",
  },
  {
    key: "ceo" as const,
    label: "CEO / Owner",
    description: "Final approver for workflows that require executive sign-off.",
    icon: Crown,
    color: "#C7913D",
  },
];

const RESOLVED_ROLES = [
  {
    label: "Supervisor",
    icon: Users,
    description: "Resolved from each employee's \"Reports To\" field (Employee → immediateSupervisorId).",
    where: "Set on the employee profile or via the Org Chart.",
  },
  {
    label: "Line Manager",
    icon: Briefcase,
    description: "Resolved from each employee's \"Manager\" field (Employee → managerId).",
    where: "Set on the employee profile.",
  },
  {
    label: "Department Head",
    icon: Building2,
    description: "Resolved from the employee's department's \"Head\" field.",
    where: "Set on each department in Employer → Departments.",
  },
];

const NONE = "__none__";

export default function ApprovalRolesPage() {
  const [roles, setRoles] = useState<OrgRoleMap>({ hr_manager: null, ceo: null });
  const [employees, setEmployees] = useState<EmpSummary[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadingEmps, setLoadingEmps] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});

  async function loadRoles() {
    setLoadingRoles(true);
    const res = await fetch("/api/org-roles");
    const json = await res.json();
    const data: OrgRoleMap = json.data ?? { hr_manager: null, ceo: null };
    setRoles(data);
    // Set draft to current value (or NONE sentinel)
    const init: Record<string, string> = {};
    for (const r of SINGLETON_ROLES) {
      init[r.key] = data[r.key]?.employeeId ?? NONE;
    }
    setDraft(init);
    setLoadingRoles(false);
  }

  async function loadEmployees() {
    setLoadingEmps(true);
    const res = await fetch("/api/employees?limit=500&status=REGULAR,PROBATIONARY,CONTRACTUAL,PROJECT_BASED");
    const json = await res.json();
    setEmployees(json.data ?? []);
    setLoadingEmps(false);
  }

  useEffect(() => {
    loadRoles();
    loadEmployees();
  }, []);

  async function save(roleKey: "hr_manager" | "ceo") {
    const empId = draft[roleKey];
    setSaving((s) => ({ ...s, [roleKey]: true }));
    try {
      if (!empId || empId === NONE) {
        // Clear assignment
        const res = await fetch(`/api/org-roles/${roleKey}`, { method: "DELETE" });
        if (!res.ok) { toast.error("Failed to clear role"); return; }
        toast.success("Role cleared");
      } else {
        const res = await fetch(`/api/org-roles/${roleKey}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId: empId }),
        });
        if (!res.ok) { toast.error("Failed to assign role"); return; }
        toast.success("Role assigned");
      }
      await loadRoles();
    } finally {
      setSaving((s) => ({ ...s, [roleKey]: false }));
    }
  }

  const empName = (e: EmpSummary) =>
    `${[e.firstName, e.lastName].filter(Boolean).join(" ")} (${e.employeeNumber})`;

  const isDirty = (roleKey: string) => {
    const currentId = roles[roleKey as keyof OrgRoleMap]?.employeeId ?? NONE;
    return draft[roleKey] !== currentId;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Approval Roles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Assign which employees hold org-wide approval roles used in Leave Approval Workflows.
        </p>
      </div>

      {/* Assignable singleton roles */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Org-wide roles</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {SINGLETON_ROLES.map((role) => {
            const Icon = role.icon;
            const current = loadingRoles ? null : roles[role.key];
            const draftVal = draft[role.key] ?? NONE;
            const dirty = isDirty(role.key);

            return (
              <div key={role.key} className="rounded-xl border bg-card p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-10 w-10 flex-none items-center justify-center rounded-xl"
                    style={{ background: role.color + "1c", color: role.color }}
                  >
                    <Icon size={20} />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{role.label}</p>
                      {current && !loadingRoles && (
                        <Badge variant="secondary" className="text-xs">Assigned</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
                  </div>
                </div>

                {loadingRoles || loadingEmps ? (
                  <Skeleton className="h-9 w-full rounded-lg" />
                ) : (
                  <div className="space-y-3">
                    <Select value={draftVal} onValueChange={(v) => setDraft({ ...draft, [role.key]: v ?? NONE })}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose an employee…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>
                          <span className="text-muted-foreground italic">— Unassigned —</span>
                        </SelectItem>
                        {employees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>{empName(e)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {current && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CheckCircle2 size={13} style={{ color: role.color }} />
                        Currently: <span className="font-medium text-foreground">{current.name}</span>
                        {current.positionTitle && <span>· {current.positionTitle}</span>}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={!dirty || saving[role.key]}
                        onClick={() => save(role.key)}
                      >
                        {saving[role.key] ? "Saving…" : "Save"}
                      </Button>
                      {current && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saving[role.key]}
                          onClick={() => setDraft({ ...draft, [role.key]: NONE })}
                          title="Clear assignment"
                        >
                          <X size={14} />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Automatically resolved roles — informational */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Auto-resolved roles</h2>
        <p className="text-sm text-muted-foreground">
          These roles are resolved automatically from employee records — no assignment needed here.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {RESOLVED_ROLES.map((role) => {
            const Icon = role.icon;
            return (
              <div key={role.label} className="rounded-xl border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Icon size={16} className="text-muted-foreground" />
                  <span className="font-medium text-sm">{role.label}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{role.description}</p>
                <p className="text-xs text-muted-foreground/70 leading-relaxed">{role.where}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
