// org-chart.jsx — Organization Chart module for the Sentire Payroll admin shell.
// Defines the reporting structure: CEO → COO/CFO/Directors → Managers → Supervisors → staff.
// Registers page "orgchart" into window.PAGES + a Workforce nav item.
// Depends on window: PIcon, Card, Btn, Badge, PageHead, Field, Select, EmpAvatar, PNav, NAV_GROUPS, PA

const OC_D = window.PA;

// ---------- department colour coding (keyed off the Departments module) ----------
const OC_DEPT_PIN = { "Executive": "#C7913D" };
const OC_DEPT_FALLBACK = ["#E8693A", "#3E63A0", "#4F9373", "#A0627D", "#5E7FB1", "#8A6253", "#C7913D", "#B5683E"];
const OC_DEPT_COLOR = {};
OC_D.DEPARTMENTS.forEach((d, i) => { OC_DEPT_COLOR[d.name] = OC_DEPT_PIN[d.name] || OC_DEPT_FALLBACK[i % OC_DEPT_FALLBACK.length]; });
const ocDeptColor = (d) => OC_DEPT_COLOR[d] || "#6B6259";

// ---------- vacant executive layer (sourced from the Positions module) ----------
// C-level roles live in window.PA.POSITIONS (dept "Executive", count 0 = unfilled).
// Reporting LINES are defined here — the Positions module stores roles, not relationships.
const OC_EXEC_META = {
  "Chief Executive Officer": { id: "V-CEO", reportsTo: null },
  "Chief Operating Officer": { id: "V-COO", reportsTo: "V-CEO" },
  "Chief Financial Officer": { id: "V-CFO", reportsTo: "V-CEO" },
};
const OC_VACANT = OC_D.POSITIONS
  .filter((p) => p.dept === "Executive" && OC_EXEC_META[p.title])
  .map((p) => ({ id: OC_EXEC_META[p.title].id, position: p.title, dept: p.dept, branch: "Makati HQ", vacant: true }));

// ---------- base reporting map (who reports to whom) ----------
const OC_BASE_MANAGER = {
  // report directly to CEO
  "E-0001": "V-CEO", // HR Director
  "E-0005": "V-CEO", // Sales Director
  // under COO
  "E-0007": "V-COO", // Operations Manager
  "E-0011": "V-COO", // Engineering Lead
  "E-0019": "V-COO", // Warehouse Supervisor
  // under CFO
  "E-0002": "V-CFO", // Finance Manager
  // HR Director's team
  "E-0003": "E-0001", // HR Generalist
  // Sales Director's team
  "E-0006": "E-0005", "E-0016": "E-0005", "E-0024": "E-0005", "E-0017": "E-0005",
  // Operations Manager → Supervisor → associates
  "E-0015": "E-0007", // Operations Supervisor
  "E-0008": "E-0015", "E-0014": "E-0015", "E-0021": "E-0015", "E-0023": "E-0015",
  // Engineering Lead → Senior → engineers
  "E-0004": "E-0011", // Senior Software Engineer
  "E-0012": "E-0004", "E-0013": "E-0004", "E-0022": "E-0004",
  // Finance Manager's team
  "E-0010": "E-0002", "E-0018": "E-0002",
  // Warehouse Supervisor's team
  "E-0009": "E-0019", "E-0020": "E-0019",
};
// wire exec reporting lines from OC_EXEC_META
Object.values(OC_EXEC_META).forEach((m) => { OC_BASE_MANAGER[m.id] = m.reportsTo; });

// ---------- all nodes ----------
const OC_NODES = [
  ...OC_VACANT.map((v) => ({ ...v, name: "Unfilled position", initials: "" })),
  ...OC_D.EMP.map((e) => ({ id: e.id, name: e.name, position: e.position, dept: e.dept, branch: e.branch, initials: e.initials, vacant: false })),
];
const ocNode = (id) => OC_NODES.find((n) => n.id === id);

// ---------- persistence of drag-reassignments ----------
const OC_LS = "sentire-orgchart-v1";
function ocLoadOverrides() {
  try { const raw = localStorage.getItem(OC_LS); if (raw) return JSON.parse(raw); } catch (e) {}
  return {};
}
function ocSaveOverrides(o) { try { localStorage.setItem(OC_LS, JSON.stringify(o)); } catch (e) {} }

// ============================ AVATAR / CARD PARTS ============================
function OcAvatar({ node, size, coded }) {
  if (node.vacant) {
    return (
      <span className="oc-av-vacant" style={{ width: size, height: size }}>
        <PIcon name="positions" size={Math.round(size * 0.46)} />
      </span>
    );
  }
  const c = ocDeptColor(node.dept);
  const style = coded
    ? { width: size, height: size, fontSize: size * 0.4, background: c + "22", color: c }
    : { width: size, height: size, fontSize: size * 0.4 };
  return <span className={"pa-avatar oc-av" + (coded ? " is-coded" : "")} style={style}>{node.initials}</span>;
}

function OcDeptChip({ dept, coded }) {
  if (coded) {
    const c = ocDeptColor(dept);
    return <span className="oc-deptchip" style={{ background: c + "1c", color: c, borderColor: c + "33" }}>{dept}</span>;
  }
  return <span className="oc-deptchip oc-deptchip-plain">{dept}</span>;
}

// ============================ TREE CARD ============================
function OcTreeCard(p) {
  const { node, kids, collapsed, coded, isDrag, isDrop, onToggle, dragProps, onOpen } = p;
  const c = ocDeptColor(node.dept);
  const cls = "oc-card"
    + (node.vacant ? " is-vacant" : "")
    + (isDrag ? " is-dragging" : "")
    + (isDrop ? " is-drop" : "")
    + (p.dimmed ? " is-dim" : "")
    + (p.hit ? " is-hit" : "");
  return (
    <div className={cls} style={coded && !node.vacant ? { "--ocd": c } : null} {...dragProps}>
      <span className="oc-card-strip" style={coded && !node.vacant ? { background: c } : null}></span>
      <div className="oc-card-main" onClick={() => onOpen(node)}>
        <OcAvatar node={node} size={42} coded={coded} />
        <div className="oc-card-txt">
          {node.vacant
            ? <b className="oc-card-name oc-vac-name">{node.position}</b>
            : <><b className="oc-card-name">{node.name}</b><i className="oc-card-pos">{node.position}</i></>}
        </div>
      </div>
      <div className="oc-card-foot">
        {node.vacant
          ? <span className="oc-vac-badge"><PIcon name="plus" size={12} sw={2.4} /> Vacant</span>
          : <OcDeptChip dept={node.dept} coded={coded} />}
        {kids > 0 && (
          <button className={"oc-toggle" + (collapsed ? " is-collapsed" : "")} onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
            title={collapsed ? "Expand " + kids + " reports" : "Collapse"}>
            <span className="oc-toggle-n">{kids}</span>
            <PIcon name={collapsed ? "plus" : "chevD"} size={12} sw={2.4} />
          </button>
        )}
      </div>
    </div>
  );
}

// ============================ RECURSIVE TREE ============================
function OcTreeNode(props) {
  const { node, ctx } = props;
  const kids = ctx.childrenOf(node.id);
  const collapsed = ctx.collapsed.has(node.id);
  return (
    <li>
      <OcTreeCard
        node={node}
        kids={kids.length}
        collapsed={collapsed}
        coded={ctx.coded}
        isDrag={ctx.dragId === node.id}
        isDrop={ctx.dropId === node.id}
        dimmed={ctx.dimmed(node)}
        hit={ctx.hit(node)}
        onToggle={ctx.onToggle}
        onOpen={ctx.onOpen}
        dragProps={ctx.dragProps(node)}
      />
      {kids.length > 0 && !collapsed && (
        <ul>{kids.map((k) => <OcTreeNode key={k.id} node={k} ctx={ctx} />)}</ul>
      )}
    </li>
  );
}

// ============================ OUTLINE ROW ============================
function OcOutlineNode(props) {
  const { node, ctx, depth } = props;
  const kids = ctx.childrenOf(node.id);
  const collapsed = ctx.collapsed.has(node.id);
  const c = ocDeptColor(node.dept);
  return (
    <>
      <div className={"oc-orow" + (ctx.dimmed(node) ? " is-dim" : "") + (ctx.hit(node) ? " is-hit" : "")
          + (ctx.dragId === node.id ? " is-dragging" : "") + (ctx.dropId === node.id ? " is-drop" : "")}
        style={{ paddingLeft: 14 + depth * 26 }} {...ctx.dragProps(node)}>
        <button className={"oc-orow-tw" + (kids.length ? "" : " is-leaf") + (collapsed ? " is-collapsed" : "")}
          onClick={() => kids.length && ctx.onToggle(node.id)} aria-label="Toggle">
          {kids.length > 0 && <PIcon name="chevD" size={14} sw={2.2} />}
        </button>
        <span className="oc-orow-rail" style={ctx.coded && !node.vacant ? { background: c } : null}></span>
        <div className="oc-orow-main" onClick={() => ctx.onOpen(node)}>
          <OcAvatar node={node} size={32} coded={ctx.coded} />
          <div className="oc-orow-txt">
            {node.vacant
              ? <b className="oc-vac-name">{node.position}</b>
              : <><b>{node.name}</b><i>{node.position}</i></>}
          </div>
          {node.vacant
            ? <span className="oc-vac-badge"><PIcon name="plus" size={11} sw={2.4} /> Vacant</span>
            : <OcDeptChip dept={node.dept} coded={ctx.coded} />}
          {kids.length > 0 && <span className="oc-orow-count">{kids.length}</span>}
        </div>
      </div>
      {kids.length > 0 && !collapsed && kids.map((k) => <OcOutlineNode key={k.id} node={k} ctx={ctx} depth={depth + 1} />)}
    </>
  );
}

// ============================ PAGE ============================
function OrgChartPage() {
  const nav = React.useContext(PNav);
  const t = window.OC_TWEAKS || {};
  const layout = t.layout || "tree";
  const coded = t.deptColors !== false;

  const [overrides, setOverrides] = React.useState(ocLoadOverrides);
  const [collapsed, setCollapsed] = React.useState(() => new Set());
  const [q, setQ] = React.useState("");
  const [dept, setDept] = React.useState("All departments");
  const [branch, setBranch] = React.useState("All branches");
  const [dragId, setDragId] = React.useState(null);
  const [dropId, setDropId] = React.useState(null);
  const [flash, setFlash] = React.useState(null);
  const dragRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const panRef = React.useRef(null);
  const pendingCenter = React.useRef(null);
  const centeredRef = React.useRef("");
  const [zoom, setZoom] = React.useState(() => { try { return parseFloat(localStorage.getItem("sentire-orgchart-zoom-v1")) || 1; } catch (e) { return 1; } });
  const [natSize, setNatSize] = React.useState({ w: 0, h: 0 });
  const [panning, setPanning] = React.useState(false);
  const zoomRef = React.useRef(zoom); zoomRef.current = zoom;
  const natRef = React.useRef(natSize); natRef.current = natSize;
  const Z_MIN = 0.4, Z_MAX = 1.6;

  const managerOf = React.useCallback(
    (id) => (id in overrides ? overrides[id] : OC_BASE_MANAGER[id]) ?? null, [overrides]);
  const childrenOf = React.useCallback(
    (id) => OC_NODES.filter((n) => managerOf(n.id) === id), [managerOf]);
  const root = OC_NODES.find((n) => managerOf(n.id) === null) || OC_NODES[0];

  const isDescendant = React.useCallback((id, ancestorId) => {
    let cur = managerOf(id);
    while (cur) { if (cur === ancestorId) return true; cur = managerOf(cur); }
    return false;
  }, [managerOf]);

  const validDrop = React.useCallback((dragId, targetId) => {
    if (!dragId || !targetId || dragId === targetId) return false;
    if (ocNode(dragId).vacant) return false;        // execs are structural
    if (managerOf(dragId) === targetId) return false; // already reports here
    if (isDescendant(targetId, dragId)) return false; // would create a cycle
    return true;
  }, [managerOf, isDescendant]);

  const reassign = (dId, tId) => {
    const next = { ...overrides, [dId]: tId };
    setOverrides(next); ocSaveOverrides(next);
    const dn = ocNode(dId), tn = ocNode(tId);
    setFlash((dn.name) + " now reports to " + (tn.vacant ? tn.position : tn.name));
    setTimeout(() => setFlash(null), 2600);
  };

  // ---- filter / search state ----
  const filtering = q.trim() !== "" || dept !== "All departments" || branch !== "All branches";
  const matches = React.useCallback((n) => {
    const okQ = q.trim() === "" ||
      (n.name + " " + n.position + " " + n.id).toLowerCase().includes(q.trim().toLowerCase());
    const okD = dept === "All departments" || n.dept === dept;
    const okB = branch === "All branches" || n.branch === branch;
    return okQ && okD && okB;
  }, [q, dept, branch]);
  const matchCount = OC_NODES.filter((n) => !n.vacant && matches(n)).length;

  const onToggle = (id) => setCollapsed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => {
    const withKids = OC_NODES.filter((n) => childrenOf(n.id).length > 0 && managerOf(n.id) !== null).map((n) => n.id);
    setCollapsed(new Set(withKids));
  };
  const resetStructure = () => { setOverrides({}); ocSaveOverrides({}); setFlash("Reporting structure reset"); setTimeout(() => setFlash(null), 2200); };

  const onOpen = (node) => { if (!node.vacant) nav.go("employee", node.id); };

  // ---- zoom + pan ----
  React.useEffect(() => { try { localStorage.setItem("sentire-orgchart-zoom-v1", String(zoom)); } catch (e) {} }, [zoom]);

  // measure the canvas at its natural (unscaled) size — offsetWidth ignores transforms
  React.useLayoutEffect(() => {
    const el = canvasRef.current; if (!el) return;
    setNatSize({ w: el.offsetWidth, h: el.offsetHeight });
  }, [layout, overrides, collapsed, coded]);

  // centre on the root once per layout (tree is wider than the viewport)
  React.useLayoutEffect(() => {
    const el = scrollRef.current; if (!el || !natSize.w) return;
    if (centeredRef.current === layout) return;
    centeredRef.current = layout;
    if (layout === "horizontal") { el.scrollLeft = 0; el.scrollTop = Math.max(0, (natSize.h * zoom - el.clientHeight) / 2); }
    else { el.scrollLeft = Math.max(0, (natSize.w * zoom - el.clientWidth) / 2); el.scrollTop = 0; }
  }, [layout, natSize.w]);

  // preserve the focal point across a zoom change
  React.useLayoutEffect(() => {
    const el = scrollRef.current, pc = pendingCenter.current;
    if (el && pc && natSize.w) {
      el.scrollLeft = pc.rx * natSize.w * zoom - el.clientWidth / 2;
      el.scrollTop = pc.ry * natSize.h * zoom - el.clientHeight / 2;
      pendingCenter.current = null;
    }
  }, [zoom, natSize.w]);

  const zoomTo = (nz) => {
    nz = Math.min(Z_MAX, Math.max(Z_MIN, Math.round(nz * 100) / 100));
    const el = scrollRef.current, ns = natRef.current, z0 = zoomRef.current;
    if (el && ns.w) {
      const cx = el.scrollLeft + el.clientWidth / 2, cy = el.scrollTop + el.clientHeight / 2;
      pendingCenter.current = { rx: cx / (ns.w * z0), ry: cy / (ns.h * z0) };
    }
    setZoom(nz);
  };
  const resetView = () => {
    pendingCenter.current = null;
    setZoom(1);
    requestAnimationFrame(() => {
      const el = scrollRef.current, ns = natRef.current; if (!el) return;
      if (layout === "horizontal") { el.scrollLeft = 0; el.scrollTop = Math.max(0, (ns.h - el.clientHeight) / 2); }
      else { el.scrollLeft = Math.max(0, (ns.w - el.clientWidth) / 2); el.scrollTop = 0; }
    });
  };

  // ctrl/cmd + wheel to zoom
  React.useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const onWheel = (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomTo(zoomRef.current - e.deltaY * 0.0018); } };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [layout]);

  // drag empty canvas to pan
  const onPanDown = (e) => {
    if (e.button !== 0 || (e.target.closest && e.target.closest(".oc-card"))) return;
    const el = scrollRef.current; if (!el) return;
    panRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    setPanning(true);
  };
  const onPanMove = (e) => {
    if (!panRef.current) return;
    const el = scrollRef.current;
    el.scrollLeft = panRef.current.sl - (e.clientX - panRef.current.x);
    el.scrollTop = panRef.current.st - (e.clientY - panRef.current.y);
  };
  const onPanUp = () => { if (panRef.current) { panRef.current = null; setPanning(false); } };

  const dragProps = (node) => {
    if (node.vacant) return {
      onDragOver: (e) => { if (validDrop(dragRef.current, node.id)) { e.preventDefault(); setDropId(node.id); } },
      onDragLeave: () => setDropId((d) => (d === node.id ? null : d)),
      onDrop: (e) => { e.preventDefault(); if (validDrop(dragRef.current, node.id)) reassign(dragRef.current, node.id); setDragId(null); setDropId(null); dragRef.current = null; },
    };
    return {
      draggable: true,
      onDragStart: (e) => { dragRef.current = node.id; setDragId(node.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", node.id); } catch (x) {} },
      onDragEnd: () => { setDragId(null); setDropId(null); dragRef.current = null; },
      onDragOver: (e) => { if (validDrop(dragRef.current, node.id)) { e.preventDefault(); setDropId(node.id); } },
      onDragLeave: () => setDropId((d) => (d === node.id ? null : d)),
      onDrop: (e) => { e.preventDefault(); if (validDrop(dragRef.current, node.id)) reassign(dragRef.current, node.id); setDragId(null); setDropId(null); dragRef.current = null; },
    };
  };

  const ctx = {
    childrenOf, collapsed, coded, dragId, dropId, onToggle, onOpen, dragProps,
    dimmed: (n) => filtering && !n.vacant && !matches(n),
    hit: (n) => q.trim() !== "" && !n.vacant && matches(n),
  };

  const overrideCount = Object.keys(overrides).filter((k) => overrides[k] !== OC_BASE_MANAGER[k]).length;
  const peopleCount = OC_NODES.filter((n) => !n.vacant).length;
  const maxDepth = React.useMemo(() => {
    let md = 1;
    OC_NODES.forEach((n) => { let d = 1, cur = n.id; while (managerOf(cur)) { d++; cur = managerOf(cur); } md = Math.max(md, d); });
    return md;
  }, [managerOf]);

  return (
    <>
      <PageHead
        title="Organization Chart"
        sub="Define the company's reporting structure — drag any person onto a new manager to re-assign them."
        actions={<>
          <Btn kind="ghost" icon="download">Export</Btn>
          {overrideCount > 0 && <Btn kind="ghost" icon="refresh" onClick={resetStructure}>Reset structure</Btn>}
        </>}
      />

      <div className="oc-statbar">
        <div className="oc-stat"><span className="oc-stat-n">{peopleCount}</span><span className="oc-stat-l">People</span></div>
        <div className="oc-stat"><span className="oc-stat-n">{OC_D.DEPARTMENTS.length}</span><span className="oc-stat-l">Departments</span></div>
        <div className="oc-stat"><span className="oc-stat-n oc-stat-vac">{OC_VACANT.length}</span><span className="oc-stat-l">Vacant roles</span></div>
        <div className="oc-stat"><span className="oc-stat-n">{maxDepth}</span><span className="oc-stat-l">Reporting levels</span></div>
        <div className="oc-stat-hint"><PIcon name="movements" size={15} /> Drag a card onto a manager to re-assign reporting</div>
      </div>

      <div className="oc-toolbar">
        <Field icon="search" placeholder="Find a person or role…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={dept} onChange={setDept} options={["All departments", ...OC_D.DEPARTMENTS.map((d) => d.name)]} />
        <Select value={branch} onChange={setBranch} options={["All branches", ...OC_D.BRANCHES.map((b) => b.name)]} />
        <div className="oc-toolbar-r">
          {filtering && <span className="oc-matchcount">{matchCount} match{matchCount === 1 ? "" : "es"}</span>}
          {layout !== "horizontal" && <div className="oc-expandbtns">
            <button className="oc-xbtn" onClick={expandAll} title="Expand all"><PIcon name="plus" size={15} /></button>
            <button className="oc-xbtn" onClick={collapseAll} title="Collapse all"><PIcon name="x" size={15} /></button>
          </div>}
        </div>
      </div>

      {layout === "outline" ? (
        <div className="oc-outline">
          <OcOutlineNode node={root} ctx={ctx} depth={0} />
        </div>
      ) : (
        <div className="oc-stage">
          <div className={"oc-scroll" + (panning ? " is-panning" : "")} ref={scrollRef}
            onPointerDown={onPanDown} onPointerMove={onPanMove} onPointerUp={onPanUp} onPointerLeave={onPanUp}>
            <div className="oc-zoomwrap" style={{ width: natSize.w ? natSize.w * zoom : undefined, height: natSize.h ? natSize.h * zoom : undefined }}>
              <div ref={canvasRef} className={"oc-canvas " + (layout === "horizontal" ? "oc-htree" : "oc-vtree")} style={{ transform: "scale(" + zoom + ")" }}>
                <ul className="oc-rootul"><OcTreeNode node={root} ctx={ctx} /></ul>
              </div>
            </div>
          </div>
          <div className="oc-zoombar">
            <button onClick={() => zoomTo(zoom - 0.15)} title="Zoom out" aria-label="Zoom out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14" /></svg>
            </button>
            <button className="oc-zoomval" onClick={resetView} title="Reset to 100%">{Math.round(zoom * 100)}%</button>
            <button onClick={() => zoomTo(zoom + 0.15)} title="Zoom in" aria-label="Zoom in">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <span className="oc-zoomsep"></span>
            <button onClick={resetView} title="Centre & reset" aria-label="Centre">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" /><circle cx="12" cy="12" r="2.4" /></svg>
            </button>
          </div>
        </div>
      )}

      {flash && <div className="oc-flash"><PIcon name="checkCircle" size={17} /> {flash}</div>}
    </>
  );
}

// ---------- register into shell ----------
window.PAGES = window.PAGES || {};
window.PAGES["orgchart"] = OrgChartPage;

(function addNav() {
  if (!window.NAV_GROUPS) return;
  const grp = window.NAV_GROUPS.find((g) => g.label === "Workforce");
  if (grp && !grp.items.some((it) => it[0] === "orgchart")) {
    const di = grp.items.findIndex((it) => it[0] === "departments");
    grp.items.splice((di < 0 ? grp.items.length : di + 1), 0, ["orgchart", "Org Chart", "branches"]);
  }
})();

window.OrgChartPage = OrgChartPage;
