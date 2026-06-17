"use client";

/**
 * /org-chart — Organization Chart
 *
 * Visualises the company reporting structure as an interactive top-down tree
 * (CSS-connector nested <ul>/<li>). Reporting line = Employee.immediateSupervisorId
 * (person → person) or Employee.reportsToPositionId (person → vacant exec role).
 *
 *  • Drag a person card onto another person or a vacant role to re-assign their
 *    manager (cycle-guarded client- AND server-side). Persists via
 *    PATCH /api/org-chart/reassign; "Reset structure" reverts this session's edits.
 *  • Zoom (buttons + Ctrl/Cmd-wheel, 0.4–1.6) and pan (drag empty canvas).
 *  • Search + department + branch filters dim non-matches (tree stays intact).
 *  • Collapse/expand any subtree, or all at once.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search, Download, RefreshCw, Plus, Minus, X, ChevronDown,
  Briefcase, Building2, Crosshair, Workflow, CheckCircle2,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getInitials } from "@/lib/avatar";

// ─── Department colour coding (pins the handoff palette, then falls back) ──────
const DEPT_PIN: Record<string, string> = {
  "Executive": "#C7913D",
  "Operations": "#E8693A",
  "Engineering": "#3E63A0",
  "Finance & Accounting": "#4F9373",
  "Sales & Marketing": "#A0627D",
  "People & Culture": "#5E7FB1",
  "Warehouse": "#8A6253",
};
const DEPT_FALLBACK = ["#E8693A", "#3E63A0", "#4F9373", "#A0627D", "#5E7FB1", "#8A6253", "#C7913D", "#B5683E"];

const Z_MIN = 0.4, Z_MAX = 1.6;
const SYNTH_ID = "__root__";
const ALL_DEPTS = "All departments";
const ALL_BRANCHES = "All branches";

// ─── Data types (from GET /api/org-chart) ─────────────────────────────────────
type EmpRow = {
  id: string;
  employeeNumber: string;
  name: string;
  positionId: string | null;
  positionTitle: string;
  department: string;
  branch: string;
  immediateSupervisorId: string | null;
  reportsToPositionId: string | null;
};
type VacRow = { id: string; title: string; department: string };
type Ref = { id: string; name: string };
type OrgData = {
  companyName: string;
  employees: EmpRow[];
  vacantPositions: VacRow[];
  departments: Ref[];
  branches: Ref[];
};

type Node = {
  id: string;
  kind: "emp" | "vac" | "root";
  name: string;
  position: string;
  dept: string;
  branch: string;
  vacant: boolean;
  employeeNumber?: string;
  positionId?: string; // for vacant nodes (the underlying Position id)
};

export default function OrgChartPage() {
  const router = useRouter();

  const [data, setData] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);

  // employees is the live, editable copy (drag updates it optimistically)
  const [employees, setEmployees] = useState<EmpRow[]>([]);
  // original reporting captured the first time we touch an employee this session
  const sessionEdits = useRef<Map<string, { immediateSupervisorId: string | null; reportsToPositionId: string | null }>>(new Map());
  const [editCount, setEditCount] = useState(0);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [q, setQ] = useState("");
  const [dept, setDept] = useState(ALL_DEPTS);
  const [branch, setBranch] = useState(ALL_BRANCHES);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const dragRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const pendingCenter = useRef<{ rx: number; ry: number } | null>(null);
  const centeredRef = useRef(false);

  const [zoom, setZoom] = useState(() => {
    try { return parseFloat(localStorage.getItem("sentire-orgchart-zoom-v1") || "") || 1; } catch { return 1; }
  });
  const [natSize, setNatSize] = useState({ w: 0, h: 0 });
  const [panning, setPanning] = useState(false);
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const natRef = useRef(natSize); natRef.current = natSize;

  // ── load ──
  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/org-chart");
    const json = await res.json();
    // API envelopes success as { data, message } (see lib/api-response.ts).
    const payload: OrgData | null = json?.data ?? null;
    setData(payload);
    setEmployees(payload?.employees ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── department colour map ──
  const deptColor = useMemo(() => {
    const map: Record<string, string> = {};
    (data?.departments ?? []).forEach((d, i) => {
      map[d.name] = DEPT_PIN[d.name] || DEPT_FALLBACK[i % DEPT_FALLBACK.length];
    });
    return (name: string) => map[name] || DEPT_PIN[name] || "#6B6259";
  }, [data?.departments]);

  // ── build the graph (nodes, parent map, children map, root, stats) ──
  const graph = useMemo(() => {
    const empNodes: Node[] = employees.map((e) => ({
      id: e.id, kind: "emp", name: e.name, position: e.positionTitle,
      dept: e.department, branch: e.branch, vacant: false, employeeNumber: e.employeeNumber,
    }));
    const vacNodes: Node[] = (data?.vacantPositions ?? []).map((v) => ({
      id: "V-" + v.id, kind: "vac", name: "Unfilled position", position: v.title,
      dept: v.department, branch: "", vacant: true, positionId: v.id,
    }));
    const nodes = [...vacNodes, ...empNodes];
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const empById = new Map(employees.map((e) => [e.id, e]));
    const vacIds = new Set(vacNodes.map((n) => n.id));

    // positionId → incumbent employee id (deterministic: lowest employeeNumber)
    const incumbentByPos = new Map<string, string>();
    for (const e of employees) {
      if (!e.positionId) continue;
      const cur = incumbentByPos.get(e.positionId);
      if (!cur || e.employeeNumber < (empById.get(cur)?.employeeNumber ?? "￿")) {
        incumbentByPos.set(e.positionId, e.id);
      }
    }

    const parentId = new Map<string, string | null>();
    for (const n of nodes) {
      if (n.kind === "vac") { parentId.set(n.id, null); continue; }
      const e = empById.get(n.id)!;
      if (e.immediateSupervisorId && empById.has(e.immediateSupervisorId)) {
        parentId.set(n.id, e.immediateSupervisorId);
      } else if (e.reportsToPositionId) {
        const vacId = "V-" + e.reportsToPositionId;
        if (vacIds.has(vacId)) parentId.set(n.id, vacId);
        else {
          const inc = incumbentByPos.get(e.reportsToPositionId);
          parentId.set(n.id, inc && inc !== n.id ? inc : null);
        }
      } else {
        parentId.set(n.id, null);
      }
    }

    const topNodes = nodes.filter((n) => parentId.get(n.id) == null);

    let root: Node;
    let synthetic = false;
    if (topNodes.length === 1) {
      root = topNodes[0];
    } else {
      synthetic = true;
      root = {
        id: SYNTH_ID, kind: "root", name: data?.companyName ?? "Organization",
        position: "All employees", dept: "", branch: "", vacant: false,
      };
    }

    const childrenMap = new Map<string, Node[]>();
    for (const n of nodes) {
      const p = parentId.get(n.id);
      if (p == null) continue;
      const arr = childrenMap.get(p);
      if (arr) arr.push(n); else childrenMap.set(p, [n]);
    }
    if (synthetic) childrenMap.set(SYNTH_ID, topNodes);

    // ancestor walk for cycle guard + max depth
    const parentForWalk = (id: string): string | null => {
      if (id === SYNTH_ID) return null;
      return parentId.get(id) ?? (synthetic ? SYNTH_ID : null);
    };
    const isAncestor = (ancestorId: string, nodeId: string): boolean => {
      const seen = new Set<string>();
      let cur = parentForWalk(nodeId);
      while (cur) {
        if (cur === ancestorId) return true;
        if (seen.has(cur)) break;
        seen.add(cur);
        cur = parentForWalk(cur);
      }
      return false;
    };

    let maxDepth = 0;
    for (const n of nodes) {
      let d = 1, cur: string | null = n.id;
      const seen = new Set<string>();
      while ((cur = parentForWalk(cur)) && !seen.has(cur)) { seen.add(cur); d++; }
      maxDepth = Math.max(maxDepth, d);
    }

    return { nodes, nodeById, root, synthetic, childrenMap, parentId, isAncestor, maxDepth,
      peopleCount: empNodes.length, vacantCount: vacNodes.length };
  }, [employees, data?.vacantPositions, data?.companyName]);

  const childrenOf = useCallback((id: string) => graph.childrenMap.get(id) ?? [], [graph]);

  // ── filters ──
  const filtering = q.trim() !== "" || dept !== ALL_DEPTS || branch !== ALL_BRANCHES;
  const matches = useCallback((n: Node) => {
    if (n.kind !== "emp") return false;
    const okQ = q.trim() === "" ||
      (n.name + " " + n.position + " " + (n.employeeNumber ?? "")).toLowerCase().includes(q.trim().toLowerCase());
    const okD = dept === ALL_DEPTS || n.dept === dept;
    const okB = branch === ALL_BRANCHES || n.branch === branch;
    return okQ && okD && okB;
  }, [q, dept, branch]);
  const matchCount = useMemo(() => graph.nodes.filter((n) => matches(n)).length, [graph.nodes, matches]);

  // ── collapse / expand ──
  const onToggle = (id: string) => setCollapsed((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => {
    const rootId = graph.root.id;
    const withKids = graph.nodes
      .filter((n) => childrenOf(n.id).length > 0 && n.id !== rootId)
      .map((n) => n.id);
    setCollapsed(new Set(withKids));
  };

  // ── open profile ──
  const onOpen = (n: Node) => {
    if (n.kind !== "emp") return;
    router.push(`/employees/${encodeURIComponent(n.employeeNumber ?? n.id)}`);
  };

  // ── drag-to-reassign ──
  const validDrop = useCallback((dId: string | null, targetId: string) => {
    if (!dId || dId === targetId) return false;
    const dn = graph.nodeById.get(dId), tn = graph.nodeById.get(targetId);
    if (!dn || !tn || dn.kind !== "emp") return false;       // only people are draggable
    if (tn.kind === "root") return false;                    // synthetic root is inert
    if (graph.parentId.get(dId) === targetId) return false;  // already reports here
    if (graph.isAncestor(dId, targetId)) return false;       // would create a cycle
    return true;
  }, [graph]);

  const showFlash = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 2600); };

  const reassign = useCallback(async (empId: string, target: Node) => {
    const before = employees.find((e) => e.id === empId);
    if (!before) return;
    // capture original once
    if (!sessionEdits.current.has(empId)) {
      sessionEdits.current.set(empId, {
        immediateSupervisorId: before.immediateSupervisorId,
        reportsToPositionId: before.reportsToPositionId,
      });
      setEditCount(sessionEdits.current.size);
    }
    const patch = target.kind === "vac"
      ? { immediateSupervisorId: null, reportsToPositionId: target.positionId ?? null }
      : { immediateSupervisorId: target.id, reportsToPositionId: null };

    setEmployees((prev) => prev.map((e) => (e.id === empId ? { ...e, ...patch } : e)));

    const res = await fetch("/api/org-chart/reassign", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: empId,
        targetEmployeeId: target.kind === "vac" ? null : target.id,
        targetPositionId: target.kind === "vac" ? target.positionId : null,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      // Revert — but only if our optimistic patch is still the current value, so
      // a slower failing request can't clobber a later successful re-assign.
      setEmployees((prev) => prev.map((e) => {
        if (e.id !== empId) return e;
        const stillOurs = e.immediateSupervisorId === patch.immediateSupervisorId && e.reportsToPositionId === patch.reportsToPositionId;
        return stillOurs ? { ...e, immediateSupervisorId: before.immediateSupervisorId, reportsToPositionId: before.reportsToPositionId } : e;
      }));
      toast.error(j.error ?? "Could not re-assign");
      return;
    }
    const tLabel = target.kind === "vac" ? target.position : target.name;
    showFlash(`${before.name} now reports to ${tLabel}`);
  }, [employees]);

  const resetStructure = useCallback(async () => {
    const edits = Array.from(sessionEdits.current.entries());
    if (edits.length === 0) return;
    await Promise.all(edits.map(([empId, orig]) =>
      fetch("/api/org-chart/reassign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: empId,
          targetEmployeeId: orig.immediateSupervisorId,
          targetPositionId: orig.reportsToPositionId,
        }),
      }),
    ));
    setEmployees((prev) => prev.map((e) => {
      const orig = sessionEdits.current.get(e.id);
      return orig ? { ...e, ...orig } : e;
    }));
    sessionEdits.current.clear();
    setEditCount(0);
    showFlash("Reporting structure reset");
  }, []);

  const dragProps = (node: Node) => {
    const dropHandlers = {
      onDragOver: (e: React.DragEvent) => { if (validDrop(dragRef.current, node.id)) { e.preventDefault(); setDropId(node.id); } },
      onDragLeave: () => setDropId((d) => (d === node.id ? null : d)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (validDrop(dragRef.current, node.id)) reassign(dragRef.current!, node);
        setDragId(null); setDropId(null); dragRef.current = null;
      },
    };
    if (node.kind === "vac") return dropHandlers;
    if (node.kind === "root") return {};
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        dragRef.current = node.id; setDragId(node.id);
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", node.id); } catch {}
      },
      onDragEnd: () => { setDragId(null); setDropId(null); dragRef.current = null; },
      ...dropHandlers,
    };
  };

  // ── CSV export ──
  const exportCsv = () => {
    const empById = new Map(employees.map((e) => [e.id, e]));
    const managerName = (e: EmpRow) => {
      if (e.immediateSupervisorId) return empById.get(e.immediateSupervisorId)?.name ?? "";
      if (e.reportsToPositionId) {
        const v = data?.vacantPositions.find((p) => p.id === e.reportsToPositionId);
        return v ? `${v.title} (vacant)` : "";
      }
      return "";
    };
    const rows = [["Employee No", "Name", "Position", "Department", "Branch", "Reports To"]];
    employees.forEach((e) => rows.push([e.employeeNumber, e.name, e.positionTitle, e.department, e.branch, managerName(e)]));
    const csv = rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "organization-chart.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── zoom + pan ──
  useEffect(() => { try { localStorage.setItem("sentire-orgchart-zoom-v1", String(zoom)); } catch {} }, [zoom]);

  useLayoutEffect(() => {
    const el = canvasRef.current; if (!el) return;
    setNatSize({ w: el.offsetWidth, h: el.offsetHeight });
  }, [graph, collapsed, loading]);

  // centre on the root once after first measure
  useLayoutEffect(() => {
    const el = scrollRef.current; if (!el || !natSize.w || centeredRef.current) return;
    centeredRef.current = true;
    el.scrollLeft = Math.max(0, (natSize.w * zoom - el.clientWidth) / 2);
    el.scrollTop = 0;
  }, [natSize.w, zoom]);

  // preserve the focal point across a zoom change
  useLayoutEffect(() => {
    const el = scrollRef.current, pc = pendingCenter.current;
    if (el && pc && natSize.w) {
      el.scrollLeft = pc.rx * natSize.w * zoom - el.clientWidth / 2;
      el.scrollTop = pc.ry * natSize.h * zoom - el.clientHeight / 2;
      pendingCenter.current = null;
    }
  }, [zoom, natSize.w, natSize.h]);

  const zoomTo = useCallback((nz: number) => {
    nz = Math.min(Z_MAX, Math.max(Z_MIN, Math.round(nz * 100) / 100));
    const el = scrollRef.current, ns = natRef.current, z0 = zoomRef.current;
    if (el && ns.w) {
      const cx = el.scrollLeft + el.clientWidth / 2, cy = el.scrollTop + el.clientHeight / 2;
      pendingCenter.current = { rx: cx / (ns.w * z0), ry: cy / (ns.h * z0) };
    }
    setZoom(nz);
  }, []);

  const resetView = () => {
    pendingCenter.current = null;
    setZoom(1);
    requestAnimationFrame(() => {
      const el = scrollRef.current, ns = natRef.current; if (!el) return;
      el.scrollLeft = Math.max(0, (ns.w - el.clientWidth) / 2); el.scrollTop = 0;
    });
  };

  // Ctrl/Cmd + wheel to zoom
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomTo(zoomRef.current - e.deltaY * 0.0018); }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  const onPanDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest?.(".oc-card")) return;
    const el = scrollRef.current; if (!el) return;
    panRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    setPanning(true);
  };
  const onPanMove = (e: React.PointerEvent) => {
    if (!panRef.current) return;
    const el = scrollRef.current; if (!el) return;
    el.scrollLeft = panRef.current.sl - (e.clientX - panRef.current.x);
    el.scrollTop = panRef.current.st - (e.clientY - panRef.current.y);
  };
  const onPanUp = () => { if (panRef.current) { panRef.current = null; setPanning(false); } };

  // ── card renderer ──
  function OcCard({ node }: { node: Node }) {
    const kids = childrenOf(node.id).length;
    const isCollapsed = collapsed.has(node.id);
    const c = deptColor(node.dept);
    const dim = filtering && node.kind === "emp" && !matches(node);
    const hit = q.trim() !== "" && node.kind === "emp" && matches(node);
    const cls = "oc-card"
      + (node.vacant ? " is-vacant" : "")
      + (node.kind === "root" ? " is-root" : "")
      + (dragId === node.id ? " is-dragging" : "")
      + (dropId === node.id ? " is-drop" : "")
      + (dim ? " is-dim" : "")
      + (hit ? " is-hit" : "");

    const coded = !node.vacant && node.kind === "emp";

    return (
      <div className={cls} style={coded ? ({ ["--ocd" as string]: c } as React.CSSProperties) : undefined} {...dragProps(node)}>
        <span className="oc-card-strip" style={coded ? { background: c } : undefined} />
        <div className="oc-card-main" onClick={() => onOpen(node)} style={node.kind === "root" ? { cursor: "default" } : undefined}>
          {node.kind === "vac" ? (
            <span className="oc-av-vacant" style={{ width: 42, height: 42 }}>
              <Briefcase size={19} />
            </span>
          ) : node.kind === "root" ? (
            <span className="oc-av-vacant" style={{ width: 42, height: 42, borderStyle: "solid", color: "var(--acc)" }}>
              <Building2 size={20} />
            </span>
          ) : (
            <span className="oc-av" style={{ width: 42, height: 42, fontSize: 16.8, background: c + "22", color: c }}>
              {getInitials(node.name)}
            </span>
          )}
          <div className="oc-card-txt">
            {node.vacant ? (
              <b className="oc-card-name oc-vac-name">{node.position}</b>
            ) : (
              <>
                <b className="oc-card-name">{node.name}</b>
                <i className="oc-card-pos">{node.position}</i>
              </>
            )}
          </div>
        </div>
        <div className="oc-card-foot">
          {node.vacant ? (
            <span className="oc-vac-badge"><Plus size={12} strokeWidth={2.4} /> Vacant</span>
          ) : node.kind === "root" ? (
            <span className="oc-deptchip oc-deptchip-plain">Company</span>
          ) : (
            <span className="oc-deptchip" style={{ background: c + "1c", color: c, borderColor: c + "33" }}>{node.dept || "—"}</span>
          )}
          {kids > 0 && (
            <button
              className={"oc-toggle" + (isCollapsed ? " is-collapsed" : "")}
              onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
              title={isCollapsed ? `Expand ${kids} reports` : "Collapse"}
            >
              <span className="oc-toggle-n">{kids}</span>
              {isCollapsed ? <Plus size={12} strokeWidth={2.4} /> : <ChevronDown size={12} strokeWidth={2.4} />}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── recursive tree ──
  function TreeNode({ node }: { node: Node }) {
    const kids = childrenOf(node.id);
    const isCollapsed = collapsed.has(node.id);
    return (
      <li>
        <OcCard node={node} />
        {kids.length > 0 && !isCollapsed && (
          <ul>{kids.map((k) => <TreeNode key={k.id} node={k} />)}</ul>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Organization Chart</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define the company&apos;s reporting structure — drag any person onto a new manager to re-assign them.
          </p>
        </div>
        <div className="flex flex-none items-center gap-2">
          {/* The org chart only *reads* positions — creating one lives in the
              Positions module. This shortcut opens it in a new tab so the
              current chart view (zoom / pan / filters) is preserved. */}
          <a
            href="/positions"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: "sm" })}
            title="Create a position (opens Positions in a new tab)"
          >
            <Plus className="mr-1.5 h-4 w-4" /> New position
          </a>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-1.5 h-4 w-4" /> Export
          </Button>
          {editCount > 0 && (
            <Button variant="outline" size="sm" onClick={resetStructure}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Reset structure
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[460px] w-full rounded-[14px]" />
      ) : (
        <>
          {/* Stat strip */}
          <div className="oc-statbar">
            <div className="oc-stat"><span className="oc-stat-n">{graph.peopleCount}</span><span className="oc-stat-l">People</span></div>
            <div className="oc-stat"><span className="oc-stat-n">{data?.departments.length ?? 0}</span><span className="oc-stat-l">Departments</span></div>
            <div className="oc-stat"><span className="oc-stat-n oc-stat-vac">{graph.vacantCount}</span><span className="oc-stat-l">Vacant roles</span></div>
            <div className="oc-stat"><span className="oc-stat-n">{graph.maxDepth}</span><span className="oc-stat-l">Reporting levels</span></div>
            <div className="oc-stat-hint"><Workflow size={15} /> Drag a card onto a manager to re-assign reporting</div>
          </div>

          {/* Toolbar */}
          <div className="oc-toolbar">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Find a person or role…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={dept} onValueChange={(v) => setDept(v ?? ALL_DEPTS)}>
              <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_DEPTS}>{ALL_DEPTS}</SelectItem>
                {(data?.departments ?? []).map((d) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={branch} onValueChange={(v) => setBranch(v ?? ALL_BRANCHES)}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_BRANCHES}>{ALL_BRANCHES}</SelectItem>
                {(data?.branches ?? []).map((b) => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="oc-toolbar-r">
              {filtering && <span className="oc-matchcount">{matchCount} match{matchCount === 1 ? "" : "es"}</span>}
              <div className="oc-expandbtns">
                <button className="oc-xbtn" onClick={expandAll} title="Expand all"><Plus size={15} /></button>
                <button className="oc-xbtn" onClick={collapseAll} title="Collapse all"><X size={15} /></button>
              </div>
            </div>
          </div>

          {/* Canvas */}
          <div className="oc-stage">
            <div
              className={"oc-scroll" + (panning ? " is-panning" : "")}
              ref={scrollRef}
              onPointerDown={onPanDown}
              onPointerMove={onPanMove}
              onPointerUp={onPanUp}
              onPointerLeave={onPanUp}
            >
              <div className="oc-zoomwrap" style={{ width: natSize.w ? natSize.w * zoom : undefined, height: natSize.h ? natSize.h * zoom : undefined }}>
                <div ref={canvasRef} className="oc-canvas oc-vtree" style={{ transform: `scale(${zoom})` }}>
                  <ul className="oc-rootul"><TreeNode node={graph.root} /></ul>
                </div>
              </div>
            </div>

            <div className="oc-zoombar">
              <button onClick={() => zoomTo(zoom - 0.15)} title="Zoom out" aria-label="Zoom out"><Minus size={16} /></button>
              <button className="oc-zoomval" onClick={resetView} title="Reset to 100%">{Math.round(zoom * 100)}%</button>
              <button onClick={() => zoomTo(zoom + 0.15)} title="Zoom in" aria-label="Zoom in"><Plus size={16} /></button>
              <span className="oc-zoomsep" />
              <button onClick={resetView} title="Centre & reset" aria-label="Centre"><Crosshair size={16} /></button>
            </div>
          </div>
        </>
      )}

      {flash && <div className="oc-flash"><CheckCircle2 size={17} /> {flash}</div>}
    </div>
  );
}
