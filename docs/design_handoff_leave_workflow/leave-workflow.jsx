// leave-workflow.jsx — Leave Approval Workflow module for the Sentire Payroll admin shell
// Approvers & recipients are ORG-CHART ROLES (resolved per employee at filing time),
// not specific people. Registers page "leaveworkflow" into window.PAGES + a nav item.
// Depends on window: PIcon, Card, Btn, Badge, Toggle, PageHead, Drawer, PNav, NAV_GROUPS

// ---------- org-chart roles (low → high in hierarchy) ----------
const ORG_ROLES = [
  { k: "supervisor", label: "Supervisor", icon: "employees", desc: "The employee's direct supervisor" },
  { k: "line_manager", label: "Line Manager", icon: "positions", desc: "The employee's reporting manager" },
  { k: "dept_head", label: "Head of Department", icon: "departments", desc: "Head of the employee's department" },
  { k: "hr_manager", label: "HR Manager", icon: "requests", desc: "The HR manager on record" },
  { k: "ceo", label: "CEO / Owner", icon: "roles", desc: "Company owner or chief executive" },
];
const roleByKey = (k) => ORG_ROLES.find((r) => r.k === k) || { k, label: k, icon: "roles", desc: "" };

// ---------- notify options ----------
const NOTIFY_OPTS = [
  { k: "none", label: "Do not notify additional recipients", desc: "Only the approvers in the sequence are notified." },
  { k: "final", label: "Final approval only", desc: "Notify recipients when the request is fully approved." },
  { k: "finalrej", label: "Final approval / rejection", desc: "Notify on the final approve or reject decision." },
  { k: "interim", label: "Final & interim approval / rejection / escalation", desc: "Notify on every approver decision and escalation." },
  { k: "all", label: "All application-related events", desc: "Includes new filings, cancellations and every status change." },
];

// ---------- seed templates (approvers/recipients are role keys) ----------
const SEED = [
  {
    id: "wf-default", code: "DEFAULT", description: "Default leave approval flow for all employees",
    active: true, notify: "finalrej", recipients: ["hr_manager"],
    approvers: ["line_manager", "dept_head"],
  },
  {
    id: "wf-exec", code: "EXECUTIVE", description: "Senior & director-level leave requests",
    active: true, notify: "interim", recipients: ["hr_manager"],
    approvers: ["dept_head", "ceo"],
  },
  {
    id: "wf-field", code: "FIELD STAFF", description: "Daily-paid field and warehouse staff",
    active: false, notify: "none", recipients: [],
    approvers: ["supervisor"],
  },
];

const LS_KEY = "sentire-leaveflow-v2";
function loadTemplates() {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
  return SEED;
}
function saveTemplates(t) { try { localStorage.setItem(LS_KEY, JSON.stringify(t)); } catch (e) {} }
function notifyLabel(k) { const o = NOTIFY_OPTS.find((x) => x.k === k); return o ? o.label : "—"; }

// ---------- role icon tile ----------
function RoleTile({ role, size = 38 }) {
  const r = roleByKey(role);
  return <span className="lw-roletile" style={{ width: size, height: size }}><PIcon name={r.icon} size={Math.round(size * 0.5)} /></span>;
}

// ---------- compact role sequence (list cards) ----------
function RoleStack({ roles }) {
  return (
    <div className="lw-rolestack">
      {roles.map((k, i) => (
        <React.Fragment key={k + i}>
          {i > 0 && <span className="lw-rolestack-arrow"><PIcon name="chevR" size={12} sw={2.4} /></span>}
          <span className="lw-rolestack-tile" title={roleByKey(k).label}><PIcon name={roleByKey(k).icon} size={13} /></span>
        </React.Fragment>
      ))}
    </div>
  );
}

// ============================ LIST VIEW ============================
function WorkflowList({ templates, onOpen, onNew }) {
  return (
    <>
      <PageHead
        title="Leave Approval Workflow"
        sub="Templates that define how employees' leave requests are routed and approved across the org chart."
        actions={<Btn kind="primary" icon="plus" onClick={onNew}>New Workflow</Btn>}
      />
      <div className="lw-listgrid">
        {templates.map((t) => (
          <button className="lw-tcard" key={t.id} onClick={() => onOpen(t.id)}>
            <div className="lw-tcard-top">
              <span className="lw-tcard-ic"><PIcon name="leave" size={20} /></span>
              <Badge tone={t.active ? "Active" : "Draft"}>{t.active ? "Active" : "Inactive"}</Badge>
            </div>
            <h3>{t.code}</h3>
            <p className="lw-tcard-desc">{t.description}</p>
            <div className="lw-tcard-foot">
              <div className="lw-tcard-seq">
                <RoleStack roles={t.approvers} />
                <span className="lw-tcard-steps">{t.approvers.length}-step approval</span>
              </div>
              <span className="lw-tcard-go"><PIcon name="chevR" size={16} /></span>
            </div>
          </button>
        ))}
        <button className="lw-tcard lw-tcard-add" onClick={onNew}>
          <span className="lw-addbig"><PIcon name="plus" size={22} /></span>
          <b>New workflow template</b>
          <i>Define a new approval sequence</i>
        </button>
      </div>
    </>
  );
}

// ============================ SEQUENCE BUILDER ============================
// stage data = list of role keys. Renders per `layout`: timeline | cards | list
function SequenceBuilder({ approvers, layout, onReorder, onRemove, onAdd, canAdd }) {
  const [dragIdx, setDragIdx] = React.useState(null);
  const [overIdx, setOverIdx] = React.useState(null);

  const handleDrop = (from, to) => {
    if (from === null || to === null || from === to) return;
    const next = approvers.slice();
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onReorder(next);
  };
  const move = (i, dir) => { const to = i + dir; if (to < 0 || to >= approvers.length) return; handleDrop(i, to); };

  const stageCard = (key, i, variant) => {
    const r = roleByKey(key);
    const dragging = dragIdx === i;
    const over = overIdx === i && dragIdx !== null && dragIdx !== i;
    return (
      <div
        className={"lw-stage lw-stage-" + variant + (dragging ? " is-dragging" : "") + (over ? " is-over" : "")}
        key={key + i}
        draggable
        onDragStart={(ev) => { setDragIdx(i); ev.dataTransfer.effectAllowed = "move"; }}
        onDragOver={(ev) => { ev.preventDefault(); setOverIdx(i); }}
        onDragEnd={() => { handleDrop(dragIdx, overIdx); setDragIdx(null); setOverIdx(null); }}
        onDrop={(ev) => { ev.preventDefault(); }}
      >
        <span className="lw-stage-grip" title="Drag to reorder"><PIcon name="more" size={16} /></span>
        <span className="lw-stage-num">{i + 1}</span>
        <RoleTile role={key} size={38} />
        <div className="lw-stage-meta">
          <b>{r.label}</b>
          <i>{r.desc}</i>
        </div>
        <div className="lw-stage-act">
          <button className="lw-stage-mv" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><PIcon name="chevD" size={14} sw={2.4} /></button>
          <button className="lw-stage-mv" disabled={i === approvers.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><PIcon name="chevD" size={14} sw={2.4} /></button>
          <button className="lw-stage-rm" onClick={() => onRemove(i)} aria-label="Remove"><PIcon name="x" size={15} /></button>
        </div>
      </div>
    );
  };

  if (layout === "list") {
    return (
      <div className="lw-seq-list">
        {approvers.map((k, i) => stageCard(k, i, "row"))}
        {canAdd && <button className="lw-add-row" onClick={onAdd}><PIcon name="plus" size={15} /> Add approval level</button>}
      </div>
    );
  }

  if (layout === "cards") {
    return (
      <div className="lw-seq-cards">
        <div className="lw-flowchip lw-flowchip-start"><PIcon name="employees" size={16} /><span>Employee files</span></div>
        <span className="lw-flowarrow"><PIcon name="arrowR" size={16} /></span>
        {approvers.map((k, i) => (
          <React.Fragment key={k + i}>
            {stageCard(k, i, "card")}
            <span className="lw-flowarrow"><PIcon name="arrowR" size={16} /></span>
          </React.Fragment>
        ))}
        {canAdd && <><button className="lw-add-card" onClick={onAdd}><PIcon name="plus" size={18} /><span>Add</span></button>
        <span className="lw-flowarrow"><PIcon name="arrowR" size={16} /></span></>}
        <div className="lw-flowchip lw-flowchip-end"><PIcon name="checkCircle" size={16} /><span>Approved</span></div>
      </div>
    );
  }

  // timeline (default)
  return (
    <div className="lw-seq-timeline">
      <div className="lw-tl-end lw-tl-start">
        <span className="lw-tl-dot lw-tl-dot-start"><PIcon name="employees" size={15} /></span>
        <div className="lw-tl-endtxt"><b>Employee files leave</b><i>Request enters the approval flow</i></div>
      </div>
      {approvers.map((k, i) => (
        <div className="lw-tl-row" key={k + i}>
          <span className="lw-tl-connect"></span>
          {stageCard(k, i, "tl")}
        </div>
      ))}
      {canAdd && (
        <div className="lw-tl-row">
          <span className="lw-tl-connect"></span>
          <button className="lw-tl-add" onClick={onAdd}>
            <span className="lw-tl-addnum"><PIcon name="plus" size={16} /></span>
            <span>Add approval level</span>
          </button>
        </div>
      )}
      <div className="lw-tl-end lw-tl-finish">
        <span className="lw-tl-connect lw-tl-connect-last"></span>
        <span className="lw-tl-dot lw-tl-dot-end"><PIcon name="check" size={15} sw={2.6} /></span>
        <div className="lw-tl-endtxt"><b>Leave approved</b><i>Employee &amp; recipients notified</i></div>
      </div>
    </div>
  );
}

// ============================ DETAIL / EDITOR ============================
function WorkflowDetail({ template, layout, onBack, onSave }) {
  const [draft, setDraft] = React.useState(() => JSON.parse(JSON.stringify(template)));
  const [picker, setPicker] = React.useState(null); // 'approver' | 'recipient' | null
  const [savedFlash, setSavedFlash] = React.useState(false);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const addApprover = (k) => { set("approvers", [...draft.approvers, k]); setPicker(null); };
  const addRecipient = (k) => { set("recipients", [...draft.recipients, k]); setPicker(null); };

  const doSave = () => { onSave(draft); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1900); };
  const notifyOn = draft.notify !== "none";
  const canAddApprover = draft.approvers.length < ORG_ROLES.length;

  return (
    <>
      <div className="pa-crumb">
        <button onClick={onBack}>Leave Approval Workflow</button>
        <PIcon name="chevR" size={14} /><span>{draft.code || "New workflow"}</span>
      </div>

      <div className="lw-dethead">
        <div className="lw-dethead-l">
          <span className="lw-dethead-ic"><PIcon name="leave" size={24} /></span>
          <div>
            <h1>{draft.code || "New workflow"}</h1>
            <p>{draft.approvers.length}-step sequence · Notify: {notifyLabel(draft.notify)}</p>
          </div>
        </div>
        <div className="lw-dethead-r">
          <label className="lw-activeswitch">
            <span>{draft.active ? "Active" : "Inactive"}</span>
            <Toggle on={draft.active} onChange={(v) => set("active", v)} />
          </label>
          <Btn kind="ghost" onClick={onBack}>Cancel</Btn>
          <Btn kind="primary" icon="check" onClick={doSave}>{savedFlash ? "Saved" : "Save workflow"}</Btn>
        </div>
      </div>

      <div className="lw-detgrid">
        {/* MAIN — sequence */}
        <div>
          <Card pad={false}>
            <header className="lw-card-head">
              <div className="lw-card-head-txt">
                <h3>Approval sequence</h3>
                <p>Requests route top-to-bottom through these org-chart roles. Drag a level or use the arrows to reorder.</p>
              </div>
              {canAddApprover && <Btn kind="ghost" icon="plus" onClick={() => setPicker("approver")}>Add level</Btn>}
            </header>
            <div className="lw-card-body">
              {draft.approvers.length === 0 ? (
                <div className="lw-empty-seq">
                  <span className="lw-empty-ic"><PIcon name="roles" size={24} /></span>
                  <b>No approval levels yet</b>
                  <p>Add at least one org-chart role to route leave requests.</p>
                  <Btn kind="primary" icon="plus" onClick={() => setPicker("approver")}>Add first level</Btn>
                </div>
              ) : (
                <SequenceBuilder
                  approvers={draft.approvers}
                  layout={layout}
                  canAdd={canAddApprover}
                  onReorder={(next) => set("approvers", next)}
                  onRemove={(i) => set("approvers", draft.approvers.filter((_, idx) => idx !== i))}
                  onAdd={() => setPicker("approver")}
                />
              )}
            </div>
          </Card>

          <div className="pa-fnote" style={{ display: "flex" }}>
            <span className="pa-fnote-ic">?</span>
            <div>
              <p>Each level is resolved from the employee's position in the <b>organization chart</b> at the time of filing — no need to name specific people.</p>
              <p>This workflow is assigned to employees via their <b>Employment Terms</b>.</p>
            </div>
          </div>
        </div>

        {/* SIDE — settings */}
        <div className="lw-side">
          <Card title="Details">
            <div className="lw-fields">
              <label className="pa-fld">
                <span className="pa-flabel">Code <span className="pa-req">*</span></span>
                <input className="pa-input" value={draft.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="e.g. DEFAULT" />
              </label>
              <label className="pa-fld">
                <span className="pa-flabel">Description <span className="pa-req">*</span></span>
                <textarea className="pa-input" rows={2} value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="What this workflow is for…"></textarea>
              </label>
            </div>
          </Card>

          <Card title="Notify additional recipients" className="pa-mt">
            <div className="lw-notify">
              {NOTIFY_OPTS.map((o) => (
                <button key={o.k} className={"lw-notifyopt" + (draft.notify === o.k ? " is-on" : "")} onClick={() => set("notify", o.k)}>
                  <span className="lw-radio"><span></span></span>
                  <span className="lw-notifyopt-txt"><b>{o.label}</b><i>{o.desc}</i></span>
                </button>
              ))}
            </div>
            {notifyOn && (
              <div className="lw-recip">
                <div className="lw-recip-head">
                  <span>Recipient roles</span>
                  {draft.recipients.length < ORG_ROLES.length &&
                    <button className="lw-recip-add" onClick={() => setPicker("recipient")}><PIcon name="plus" size={14} /> Add</button>}
                </div>
                {draft.recipients.length === 0 ? (
                  <div className="lw-recip-empty">No additional recipient roles selected.</div>
                ) : (
                  <div className="lw-recip-list">
                    {draft.recipients.map((k, i) => {
                      const r = roleByKey(k);
                      return (
                        <span className="lw-recip-chip" key={k + i}>
                          <span className="lw-recip-roleic"><PIcon name={r.icon} size={13} /></span>
                          {r.label}
                          <button onClick={() => set("recipients", draft.recipients.filter((_, idx) => idx !== i))} aria-label="Remove"><PIcon name="x" size={12} sw={2.4} /></button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      {picker === "approver" && (
        <RolePicker
          title="Add approval level" sub="Pick the org-chart role that approves at this stage"
          exclude={draft.approvers} onPick={addApprover} onClose={() => setPicker(null)}
        />
      )}
      {picker === "recipient" && (
        <RolePicker
          title="Add recipient role" sub="Notify this role about leave decisions"
          exclude={draft.recipients} onPick={addRecipient} onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}

// ============================ ROLE PICKER (drawer) ============================
function RolePicker({ title, sub, exclude, onPick, onClose }) {
  const list = ORG_ROLES.filter((r) => !exclude.includes(r.k));
  return (
    <Drawer title={title} sub={sub} onClose={onClose}>
      <ul className="lw-picklist">
        {list.map((r) => (
          <li key={r.k}>
            <button onClick={() => onPick(r.k)}>
              <RoleTile role={r.k} size={38} />
              <div className="lw-pick-meta"><b>{r.label}</b><i>{r.desc}</i></div>
              <span className="lw-pick-add"><PIcon name="plus" size={16} /></span>
            </button>
          </li>
        ))}
        {list.length === 0 && <div className="lw-empty">All org-chart roles have been added.</div>}
      </ul>
    </Drawer>
  );
}

// ============================ PAGE WRAPPER ============================
function LeaveWorkflowPage() {
  const t = window.LW_TWEAKS || {};
  const layout = t.seqLayout || "timeline";
  const [templates, setTemplates] = React.useState(loadTemplates);
  const [view, setView] = React.useState({ mode: "list", id: null });

  const persist = (next) => { setTemplates(next); saveTemplates(next); };
  const openTemplate = (id) => setView({ mode: "detail", id });
  const newTemplate = () => {
    const blank = { id: "wf-" + Date.now(), code: "", description: "", active: true, notify: "finalrej", recipients: [], approvers: [] };
    persist([...templates, blank]);
    setView({ mode: "detail", id: blank.id });
  };
  const saveTemplate = (draft) => persist(templates.map((x) => (x.id === draft.id ? draft : x)));

  if (view.mode === "detail") {
    const tpl = templates.find((x) => x.id === view.id);
    if (!tpl) { setView({ mode: "list" }); return null; }
    return <WorkflowDetail template={tpl} layout={layout} onBack={() => setView({ mode: "list" })} onSave={saveTemplate} />;
  }
  return <WorkflowList templates={templates} onOpen={openTemplate} onNew={newTemplate} />;
}

// ---------- register into shell ----------
window.PAGES = window.PAGES || {};
window.PAGES["leaveworkflow"] = LeaveWorkflowPage;

(function addNav() {
  if (!window.NAV_GROUPS) return;
  const grp = window.NAV_GROUPS.find((g) => g.label === "Time");
  if (grp && !grp.items.some((it) => it[0] === "leaveworkflow")) {
    const li = grp.items.findIndex((it) => it[0] === "leave");
    grp.items.splice(li + 1, 0, ["leaveworkflow", "Leave Approval", "policies"]);
  }
})();

window.LeaveWorkflowPage = LeaveWorkflowPage;
window.LW_ORG_ROLES = ORG_ROLES;
