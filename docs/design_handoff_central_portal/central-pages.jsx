// central-pages.jsx — page bodies for Sentire Central Portal
// Exports to window: PAGES (map id -> component)

const { peso, TENANTS, INVOICES, TICKETS, PACKAGES, ADMINS, ROLES, AUDIT, REVENUE, KPI } = window.CP;

const btnPrimary = "cp-btn cp-btn-primary";
const btnGhost = "cp-btn cp-btn-ghost";

// ============================ DASHBOARD ============================
function DashboardPage() {
  const max = Math.max(...REVENUE.map(r => r.v));
  return (
    <>
      <PageHead title="Dashboard" sub="Platform overview across all tenants and subscriptions"
        actions={<button className={btnPrimary}><Icon name="plus" size={16} /> Onboard tenant</button>} />

      <div className="cp-stats cp-stats-5">
        <StatCard label="MRR" value={peso(KPI.mrr)} icon="analytics" tone="orange" delta={6} sub="vs last month" />
        <StatCard label="Active tenants" value={KPI.active} icon="tenants" tone="green" delta={12} />
        <StatCard label="Employees paid" value={KPI.employees.toLocaleString("en-PH")} icon="dashboard" tone="blue" sub="this cycle" />
        <StatCard label="Trialing" value={KPI.trialing} icon="support" tone="amber" sub="2 expiring soon" />
        <StatCard label="Past due" value={KPI.pastDue} icon="billing" tone="red" sub={peso(KPI.outstanding) + " outstanding"} />
      </div>

      <div className="cp-grid-2">
        <Card title="Recurring revenue" action={<span className="cp-muted">Last 12 months</span>}>
          <div className="cp-chart">
            {REVENUE.map((r, i) => (
              <div className="cp-bar-wrap" key={r.m}>
                <div className="cp-bar" style={{ height: (r.v / max * 100) + "%" }}
                     data-last={i === REVENUE.length - 1}>
                  <span className="cp-bar-tip">{peso(r.v * 1000)}</span>
                </div>
                <span className="cp-bar-lbl">{r.m}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Needs attention">
          <ul className="cp-attn">
            <li><span className="cp-attn-ic" data-t="red"><Icon name="billing" size={15} /></span>
              <div><b>BlueReef Hospitality</b><i>Invoice INV-2058 overdue · {peso(18000)}</i></div>
              <button className={btnGhost}>Review</button></li>
            <li><span className="cp-attn-ic" data-t="red"><Icon name="support" size={15} /></span>
              <div><b>Urgent ticket · BlueReef</b><i>Payroll run failed — bank file rejected</i></div>
              <button className={btnGhost}>Open</button></li>
            <li><span className="cp-attn-ic" data-t="amber"><Icon name="tenants" size={15} /></span>
              <div><b>Kape Manila Co.</b><i>Trial ends in 4 days · no card on file</i></div>
              <button className={btnGhost}>Nudge</button></li>
          </ul>
        </Card>
      </div>

      <Card title="Recent tenants" action={<a className="cp-link" href="#">View all <Icon name="chevR" size={14} /></a>}>
        <TenantTable rows={TENANTS.slice(0, 5)} compact />
      </Card>
    </>
  );
}

// shared tenant table
function TenantTable({ rows, compact }) {
  const nav = React.useContext(CPNav);
  return (
    <table className="cp-table">
      <thead><tr>
        <th>Company</th><th>Plan</th><th className="cp-num">Employees</th>
        <th>Status</th><th className="cp-num">MRR</th>{!compact && <th>Health</th>}<th>Since</th><th></th>
      </tr></thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id} className="cp-row cp-row-click" onClick={() => nav.goTenant(t.id)}>
            <td><div className="cp-co"><span className="cp-co-logo">{t.name[0]}</span>
              <div><b>{t.name}</b><i>{t.slug}</i></div></div></td>
            <td><PlanBadge plan={t.plan} /></td>
            <td className="cp-num">{t.emp.toLocaleString("en-PH")}</td>
            <td><Badge>{t.status}</Badge></td>
            <td className="cp-num">{t.mrr ? peso(t.mrr) : "—"}</td>
            {!compact && <td><HealthBar v={t.health} /></td>}
            <td className="cp-muted">{t.since}</td>
            <td className="cp-chev"><Icon name="chevR" size={16} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function HealthBar({ v }) {
  const c = v >= 80 ? "#1f7a4d" : v >= 50 ? "#c2552f" : "#b23b34";
  return (
    <span className="cp-health">
      <span className="cp-health-track"><i style={{ width: v + "%", background: c }}></i></span>
      <em style={{ color: c }}>{v}</em>
    </span>
  );
}

// ============================ TENANTS ============================
function TenantsPage() {
  const [q, setQ] = React.useState("");
  const [plan, setPlan] = React.useState("All plans");
  const [status, setStatus] = React.useState("All statuses");
  const rows = TENANTS.filter(t =>
    (q === "" || t.name.toLowerCase().includes(q.toLowerCase())) &&
    (plan === "All plans" || t.plan === plan) &&
    (status === "All statuses" || t.status === status));
  return (
    <>
      <PageHead title="Tenants" sub={TENANTS.length + " companies on the platform"}
        actions={<>
          <button className={btnGhost}><Icon name="refresh" size={15} /> Refresh</button>
          <button className={btnPrimary}><Icon name="plus" size={16} /> Add tenant</button>
        </>} />
      <Card pad={false}>
        <div className="cp-filters">
          <label className="cp-field"><Icon name="search" size={16} />
            <input placeholder="Search tenants…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <select value={plan} onChange={(e) => setPlan(e.target.value)}>
            {["All plans", "Starter", "Pro", "Enterprise"].map(o => <option key={o}>{o}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {["All statuses", "Active", "Trialing", "Past due", "Cancelled"].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        {rows.length ? <TenantTable rows={rows} /> :
          <div className="cp-empty">No tenants match those filters.</div>}
      </Card>
    </>
  );
}

// ============================ BILLING ============================
function BillingPage() {
  const [tab, setTab] = React.useState("Overview");
  const tabs = ["Overview", "Subscriptions", "Packages", "Payment history"];
  return (
    <>
      <PageHead title="Billing" sub="Packages, subscriptions, invoices and payments across all clients"
        actions={<button className={btnPrimary}><Icon name="plus" size={16} /> New invoice</button>} />
      <div className="cp-tabs">
        {tabs.map(t => (
          <button key={t} className={"cp-tab" + (tab === t ? " is-active" : "")} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "Overview" && <>
        <div className="cp-stats cp-stats-4">
          <StatCard label="Monthly recurring revenue" value={peso(KPI.mrr)} icon="analytics" tone="orange" delta={6} />
          <StatCard label="Active subscriptions" value={KPI.active + KPI.pastDue} icon="tenants" tone="blue" />
          <StatCard label="Outstanding" value={peso(KPI.outstanding)} icon="billing" tone="red" sub="2 invoices" />
          <StatCard label="Collected this month" value={peso(KPI.collected)} icon="billing" tone="green" />
        </div>
        <Card title="Recent invoices" action={<a className="cp-link" href="#">Export <Icon name="chevR" size={14} /></a>}>
          <InvoiceTable rows={INVOICES} />
        </Card>
      </>}

      {tab === "Subscriptions" && (
        <Card title="Active subscriptions">
          <table className="cp-table">
            <thead><tr><th>Tenant</th><th>Plan</th><th className="cp-num">Seats</th><th className="cp-num">MRR</th><th>Renews</th><th>Status</th></tr></thead>
            <tbody>
              {TENANTS.filter(t => t.mrr > 0).map(t => (
                <tr key={t.id} className="cp-row">
                  <td><b>{t.name}</b></td><td><PlanBadge plan={t.plan} /></td>
                  <td className="cp-num">{t.emp.toLocaleString("en-PH")}</td>
                  <td className="cp-num">{peso(t.mrr)}</td>
                  <td className="cp-muted">Jul 1, 2026</td><td><Badge>{t.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "Packages" && (
        <div className="cp-pkgs">
          {PACKAGES.map(p => (
            <div key={p.name} className={"cp-pkg" + (p.popular ? " is-pop" : "")}>
              {p.popular && <span className="cp-pkg-pop">Most popular</span>}
              <h4>{p.name}</h4>
              <div className="cp-pkg-price">{p.price ? peso(p.price) : "Custom"}<span>{p.price ? p.unit : ""}</span></div>
              <p className="cp-pkg-blurb">{p.blurb}</p>
              <ul>{p.features.map(f => <li key={f}><Icon name="audit" size={14} /> {f}</li>)}</ul>
              <div className="cp-pkg-foot"><span className="cp-muted">{p.tenants} tenants</span>
                <button className={btnGhost}>Edit</button></div>
            </div>
          ))}
        </div>
      )}

      {tab === "Payment history" && (
        <Card title="Payment history"><InvoiceTable rows={INVOICES} /></Card>
      )}
    </>
  );
}
function InvoiceTable({ rows }) {
  return (
    <table className="cp-table">
      <thead><tr><th>Invoice</th><th>Tenant</th><th className="cp-num">Amount</th><th>Status</th><th>Issued</th><th></th></tr></thead>
      <tbody>
        {rows.map(i => (
          <tr key={i.id} className="cp-row">
            <td><b className="cp-mono">{i.id}</b></td><td>{i.tenant}</td>
            <td className="cp-num">{peso(i.amount)}</td><td><Badge>{i.status}</Badge></td>
            <td className="cp-muted">{i.issued}</td><td className="cp-chev"><Icon name="chevR" size={16} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ============================ SUPPORT ============================
function SupportPage() {
  return (
    <>
      <PageHead title="Support" sub="Tickets, accounts and trials that need your attention" />
      <div className="cp-stats cp-stats-4">
        <StatCard label="Open tickets" value={KPI.openTickets} icon="support" tone="red" sub="1 urgent" />
        <StatCard label="Avg first response" value="1h 48m" icon="analytics" tone="green" delta={-14} sub="within SLA" />
        <StatCard label="Past due accounts" value={KPI.pastDue} icon="billing" tone="amber" />
        <StatCard label="Trials expiring · 7d" value={KPI.trialing} icon="tenants" tone="blue" />
      </div>

      <Card title="Ticket queue" action={<a className="cp-link" href="#">All tickets <Icon name="chevR" size={14} /></a>}>
        <table className="cp-table">
          <thead><tr><th>ID</th><th>Subject</th><th>Tenant</th><th>Priority</th><th>Agent</th><th className="cp-num">Age</th><th></th></tr></thead>
          <tbody>
            {TICKETS.map(t => (
              <tr key={t.id} className="cp-row">
                <td><b className="cp-mono">{t.id}</b></td>
                <td className="cp-subj">{t.subject}</td>
                <td className="cp-muted">{t.tenant}</td>
                <td><Badge>{t.priority}</Badge></td>
                <td>{t.agent === "Unassigned" ? <span className="cp-unassigned">Unassigned</span> : t.agent}</td>
                <td className="cp-num cp-muted">{t.age}</td>
                <td className="cp-chev"><Icon name="chevR" size={16} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="cp-grid-2">
        <Card title="Past due accounts">
          <ul className="cp-attn">
            <li><span className="cp-attn-ic" data-t="red"><Icon name="tenants" size={15} /></span>
              <div><b>BlueReef Hospitality</b><i>₱18,000 · 15 days overdue</i></div>
              <button className={btnGhost}>Contact</button></li>
          </ul>
        </Card>
        <Card title="Trials expiring soon">
          <ul className="cp-attn">
            <li><span className="cp-attn-ic" data-t="amber"><Icon name="tenants" size={15} /></span>
              <div><b>Kape Manila Co.</b><i>Ends Jun 16 · no card on file</i></div>
              <button className={btnGhost}>Nudge</button></li>
            <li><span className="cp-attn-ic" data-t="amber"><Icon name="tenants" size={15} /></span>
              <div><b>Verde Agritech</b><i>Ends Jun 19 · engaged</i></div>
              <button className={btnGhost}>Nudge</button></li>
          </ul>
        </Card>
      </div>
    </>
  );
}

// ============================ ANALYTICS ============================
function AnalyticsPage() {
  const planMix = [
    { k: "Enterprise", n: 2, c: "#2A2420" }, { k: "Pro", n: 5, c: "#E8693A" }, { k: "Starter", n: 3, c: "#C7913D" },
  ];
  const total = planMix.reduce((a, b) => a + b.n, 0);
  return (
    <>
      <PageHead title="Analytics" sub="Growth, retention and revenue trends across the platform" />
      <div className="cp-stats cp-stats-4">
        <StatCard label="Net revenue retention" value="112%" icon="analytics" tone="green" delta={3} />
        <StatCard label="Churn (90d)" value="2.1%" icon="tenants" tone="amber" delta={-0.4} />
        <StatCard label="Avg revenue / tenant" value={peso(Math.round(KPI.mrr / (KPI.active + KPI.pastDue)))} icon="billing" tone="orange" />
        <StatCard label="Trial → paid" value="68%" icon="support" tone="blue" delta={5} />
      </div>
      <div className="cp-grid-2">
        <Card title="MRR growth" action={<span className="cp-muted">12 months</span>}>
          <div className="cp-chart">
            {REVENUE.map((r, i) => (
              <div className="cp-bar-wrap" key={r.m}>
                <div className="cp-bar" style={{ height: (r.v / 180 * 100) + "%" }} data-last={i === REVENUE.length - 1}></div>
                <span className="cp-bar-lbl">{r.m}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Plan mix">
          <div className="cp-donut-wrap">
            <Donut data={planMix} total={total} />
            <ul className="cp-legend">
              {planMix.map(p => <li key={p.k}><i style={{ background: p.c }}></i>{p.k}<b>{p.n}</b></li>)}
            </ul>
          </div>
        </Card>
      </div>
    </>
  );
}
function Donut({ data, total }) {
  let acc = 0; const R = 54, C = 2 * Math.PI * R;
  return (
    <svg width="150" height="150" viewBox="0 0 150 150">
      <circle cx="75" cy="75" r={R} fill="none" stroke="#efeae3" strokeWidth="18" />
      {data.map((d, i) => {
        const len = d.n / total * C; const off = acc; acc += len;
        return <circle key={i} cx="75" cy="75" r={R} fill="none" stroke={d.c} strokeWidth="18"
          strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off}
          transform="rotate(-90 75 75)" strokeLinecap="butt" />;
      })}
      <text x="75" y="71" textAnchor="middle" className="cp-donut-n">{total}</text>
      <text x="75" y="90" textAnchor="middle" className="cp-donut-l">tenants</text>
    </svg>
  );
}

// ============================ AUDIT LOG ============================
function AuditPage() {
  const tone = { security: "red", billing: "orange", tenant: "blue", system: "slate" };
  return (
    <>
      <PageHead title="Audit log" sub="Every privileged action in the Central Portal — exportable for compliance"
        actions={<button className={btnGhost}><Icon name="chevR" size={15} /> Export CSV</button>} />
      <Card pad={false}>
        <div className="cp-filters">
          <label className="cp-field"><Icon name="search" size={16} /><input placeholder="Search actions, admins, tenants…" /></label>
          <select><option>All event types</option><option>Security</option><option>Billing</option><option>Tenant</option><option>System</option></select>
          <select><option>Last 7 days</option><option>Last 30 days</option><option>All time</option></select>
        </div>
        <ul className="cp-feed">
          {AUDIT.map((a, i) => (
            <li key={i}>
              <span className="cp-feed-dot" data-t={tone[a.kind]}></span>
              <div className="cp-feed-body">
                <p><b>{a.who}</b> {a.action} <b>{a.target}</b></p>
                <i>{a.time} · {a.ip}</i>
              </div>
              <span className="cp-feed-kind" data-t={tone[a.kind]}>{a.kind}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

// ============================ SETTINGS ============================
function SettingsPage() {
  return (
    <>
      <PageHead title="Settings" sub="Central Portal administrators, roles and access" />
      <Card title="Roles" action={<button className={btnPrimary}><Icon name="plus" size={16} /> Add role</button>}>
        <p className="cp-card-note">Define what each administrator can see and do.</p>
        <table className="cp-table">
          <thead><tr><th>Name</th><th>Description</th><th className="cp-num">Permissions</th><th className="cp-num">Admins</th><th>Type</th><th></th></tr></thead>
          <tbody>
            {ROLES.map(r => (
              <tr key={r.name} className="cp-row">
                <td><b>{r.name}</b></td><td className="cp-muted cp-desc">{r.desc}</td>
                <td className="cp-num"><span className="cp-pill">{r.perms}</span></td>
                <td className="cp-num">{r.admins}</td><td><Badge tone={r.type}>{r.type}</Badge></td>
                <td><button className={btnGhost}>Permissions</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Administrators" action={<button className={btnPrimary}><Icon name="plus" size={16} /> Invite admin</button>}>
        <p className="cp-card-note">Central Portal users and their assigned roles.</p>
        <table className="cp-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th></th></tr></thead>
          <tbody>
            {ADMINS.map(a => (
              <tr key={a.email} className="cp-row">
                <td><div className="cp-co"><span className="cp-co-logo cp-co-user">{a.name[0]}</span>
                  <b>{a.name}{a.you && <em className="cp-you"> (you)</em>}</b></div></td>
                <td className="cp-muted">{a.email}</td>
                <td><span className="cp-rolepill">{a.role}</span></td>
                <td><Badge>{a.status}</Badge></td>
                <td className="cp-muted">{a.last}</td>
                <td className="cp-rowact"><button className={btnGhost}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Security">
        <ul className="cp-toggles">
          <li><div><b>Enforce 2FA for all admins</b><i>Require a second factor at every sign-in.</i></div><Toggle on /></li>
          <li><div><b>Restrict by IP allowlist</b><i>Only allow portal access from approved networks.</i></div><Toggle /></li>
          <li><div><b>Auto sign-out after 30 min idle</b><i>Recommended for shared workstations.</i></div><Toggle on /></li>
        </ul>
      </Card>
    </>
  );
}
function Toggle({ on }) {
  const [v, setV] = React.useState(!!on);
  return <button className={"cp-toggle" + (v ? " is-on" : "")} onClick={() => setV(!v)} aria-pressed={v}><span></span></button>;
}

// ============================ TENANT DETAIL ============================
const PLAN_INFO = {
  Starter: { price: 4500, seats: "Up to 50 employees", feats: ["1 pay schedule", "Gov't remittances", "Email support"] },
  Pro: { price: 12000, seats: "Up to 1,000 employees", feats: ["Unlimited schedules", "Multi-company", "Priority support", "API access"] },
  Enterprise: { price: null, seats: "Unlimited + SLA", feats: ["Dedicated CSM", "SSO / SCIM", "Custom integrations", "99.99% SLA"] },
};

// synthesize a subscription history for a tenant
function subHistory(t) {
  const rows = [{ date: t.since, event: "Subscribed", detail: t.plan + " plan", kind: "tenant" }];
  if (t.plan === "Enterprise") rows.unshift({ date: "Mar 2, 2026", event: "Upgraded", detail: "Pro → Enterprise", kind: "billing" });
  if (t.status === "Past due") rows.unshift({ date: "May 28, 2026", event: "Payment failed", detail: "Card declined · retry scheduled", kind: "security" });
  if (t.status === "Cancelled") rows.unshift({ date: "Jun 11, 2026", event: "Cancelled", detail: "Auto-suspended · non-payment", kind: "security" });
  if (t.status === "Trialing") rows[0] = { date: t.since, event: "Started trial", detail: "14-day · ends " + (t.trialEnds || "—"), kind: "tenant" };
  rows.unshift({ date: "Jun 1, 2026", event: "Renewed", detail: t.mrr ? peso(t.mrr) + " charged" : "Trial — no charge", kind: "billing" });
  return rows;
}

function InfoStat({ label, value, sub }) {
  return <div className="cp-info"><span className="cp-info-l">{label}</span><b className="cp-info-v">{value}</b>{sub && <i className="cp-info-s">{sub}</i>}</div>;
}

function TenantDetail({ id }) {
  const nav = React.useContext(CPNav);
  const [tab, setTab] = React.useState("Overview");
  const t = TENANTS.find(x => x.id === id);
  if (!t) return <div className="cp-empty">Tenant not found.</div>;
  const pkg = PLAN_INFO[t.plan];
  const invoices = INVOICES.filter(i => i.tenant === t.name);
  const tickets = TICKETS.filter(k => k.tenant === t.name);
  const subs = subHistory(t);
  const tabs = ["Overview", "Billing", "Subscription history", "Support", "Activity"];
  const feedTone = { tenant: "blue", billing: "orange", security: "red", system: "slate" };

  return (
    <>
      <div className="cp-crumb">
        <button onClick={() => nav.goPage("tenants")}>Tenants</button>
        <Icon name="chevR" size={14} /><span>{t.name}</span>
      </div>

      <div className="cp-th">
        <div className="cp-th-id">
          <span className="cp-th-logo">{t.name[0]}</span>
          <div>
            <h1>{t.name}</h1>
            <p><span className="cp-mono">{t.slug}</span> · {t.region} · Owner {t.owner}</p>
          </div>
          <div className="cp-th-badges"><PlanBadge plan={t.plan} /><Badge>{t.status}</Badge></div>
        </div>
        <div className="cp-th-act">
          <button className={btnGhost}>Impersonate</button>
          <button className={btnGhost}>Suspend</button>
          <button className={btnPrimary}>Manage subscription</button>
        </div>
      </div>

      <div className="cp-infogrid">
        <InfoStat label="Employees" value={t.emp.toLocaleString("en-PH")} />
        <InfoStat label="MRR" value={t.mrr ? peso(t.mrr) : "—"} sub={t.mrr ? "billed monthly" : "on trial"} />
        <InfoStat label="Customer since" value={t.since} />
        <InfoStat label="Account health" value={t.health + " / 100"} sub={t.health >= 80 ? "Healthy" : t.health >= 50 ? "At risk" : "Critical"} />
      </div>

      <div className="cp-tabs">
        {tabs.map(x => <button key={x} className={"cp-tab" + (tab === x ? " is-active" : "")} onClick={() => setTab(x)}>{x}</button>)}
      </div>

      {tab === "Overview" && <div className="cp-grid-2">
        <Card title="Company details">
          <ul className="cp-deflist">
            <li><span>Legal name</span><b>{t.name}</b></li>
            <li><span>Workspace ID</span><b className="cp-mono">{t.slug}</b></li>
            <li><span>Primary contact</span><b>{t.owner}</b></li>
            <li><span>Region</span><b>{t.region}</b></li>
            <li><span>Employees</span><b>{t.emp.toLocaleString("en-PH")}</b></li>
            <li><span>Status</span><b><Badge>{t.status}</Badge></b></li>
          </ul>
        </Card>
        <Card title="Current package">
          <div className="cp-planbox">
            <div className="cp-planbox-top"><b>{t.plan}</b><span>{pkg.price ? peso(pkg.price) + "/mo" : "Custom"}</span></div>
            <p className="cp-muted">{pkg.seats}</p>
            <ul className="cp-pkg" style={{ margin: "14px 0 0" }}>
              {pkg.feats.map(f => <li key={f}><Icon name="audit" size={14} /> {f}</li>)}
            </ul>
          </div>
        </Card>
      </div>}

      {tab === "Billing" && <Card title="Invoices" action={<a className="cp-link" href="#">New invoice <Icon name="chevR" size={14} /></a>}>
        {invoices.length ? <InvoiceTable rows={invoices} /> : <div className="cp-empty">No invoices for this tenant yet.</div>}
      </Card>}

      {tab === "Subscription history" && <Card pad={false}>
        <ul className="cp-feed">
          {subs.map((s, i) => (
            <li key={i}>
              <span className="cp-feed-dot" data-t={feedTone[s.kind]}></span>
              <div className="cp-feed-body"><p><b>{s.event}</b> — {s.detail}</p><i>{s.date}</i></div>
            </li>
          ))}
        </ul>
      </Card>}

      {tab === "Support" && <Card title={"Tickets (" + tickets.length + ")"}>
        {tickets.length ? (
          <table className="cp-table">
            <thead><tr><th>ID</th><th>Subject</th><th>Priority</th><th>Agent</th><th className="cp-num">Age</th></tr></thead>
            <tbody>
              {tickets.map(k => (
                <tr key={k.id} className="cp-row">
                  <td><b className="cp-mono">{k.id}</b></td><td className="cp-subj">{k.subject}</td>
                  <td><Badge>{k.priority}</Badge></td>
                  <td>{k.agent === "Unassigned" ? <span className="cp-unassigned">Unassigned</span> : k.agent}</td>
                  <td className="cp-num cp-muted">{k.age}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="cp-empty">No support tickets — this account is running smoothly.</div>}
      </Card>}

      {tab === "Activity" && <Card pad={false}>
        <ul className="cp-feed">
          <li><span className="cp-feed-dot" data-t="blue"></span><div className="cp-feed-body"><p><b>{t.owner}</b> ran payroll for {t.emp.toLocaleString("en-PH")} employees</p><i>Jun 10, 2026 · 2:31 PM</i></div></li>
          <li><span className="cp-feed-dot" data-t="orange"></span><div className="cp-feed-body"><p>Invoice {invoices[0] ? invoices[0].id : "—"} {t.status === "Past due" ? "failed" : "paid"}</p><i>Jun 1, 2026 · 9:00 AM</i></div></li>
          <li><span className="cp-feed-dot" data-t="slate"></span><div className="cp-feed-body"><p>Added 3 new employees</p><i>May 27, 2026 · 11:14 AM</i></div></li>
          <li><span className="cp-feed-dot" data-t="blue"></span><div className="cp-feed-body"><p><b>{t.owner}</b> signed in</p><i>{t.since} · first login</i></div></li>
        </ul>
      </Card>}
    </>
  );
}

window.TenantDetail = TenantDetail;
window.PAGES = {
  dashboard: DashboardPage, tenants: TenantsPage, billing: BillingPage,
  support: SupportPage, analytics: AnalyticsPage, audit: AuditPage, settings: SettingsPage,
};
