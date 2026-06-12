// central-shell.jsx — Sentire Central Portal shell + shared UI primitives
// Exports to window: Icon, Badge, StatCard, Card, Sidebar, Topbar, PageHead, fmtPeso

const { peso } = window.CP;

// nav context: { goPage(id), goTenant(id), goBack() }
const CPNav = React.createContext({ goPage: () => {}, goTenant: () => {}, goBack: () => {} });

// ---- icon set (stroke, 1.7) ------------------------------------------------
const ICONS = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  tenants: "M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 21V9h4a1 1 0 0 1 1 1v11M3 21h18M7.5 8h.01M7.5 12h.01M11 8h.01M11 12h.01",
  billing: "M5 3h14a1 1 0 0 1 1 1v17l-3-2-2 2-2-2-2 2-2-2-3 2V4a1 1 0 0 1 1-1zM8 8h8M8 12h8M8 16h5",
  support: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 8 2.6h.1A1.7 1.7 0 0 0 9 1.1V1a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 14.9 2.6a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1A1.7 1.7 0 0 0 22.9 9H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  analytics: "M3 3v18h18M7 14l3-3 3 3 5-6",
  audit: "M12 2l8 3v6c0 4.5-3 8.3-8 9.5C7 19.3 4 15.5 4 11V5l8-3zM9 11.5l2 2 4-4.5",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  chevR: "M9 6l6 6-6 6",
  refresh: "M21 12a9 9 0 1 1-3-6.7M21 4v4h-4",
};
function Icon({ name, size = 18, sw = 1.7, fill = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
         style={{ flex: "none" }}>
      <path d={ICONS[name]} stroke="currentColor" strokeWidth={sw}
            strokeLinecap="round" strokeLinejoin="round" fill={fill ? "currentColor" : "none"} />
    </svg>
  );
}

// ---- status badge ----------------------------------------------------------
const BADGE = {
  "Active": ["#1f7a4d", "#e7f4ec"], "Trialing": ["#9a6a12", "#fbf1dc"],
  "Past due": ["#b23b34", "#fbe9e7"], "Cancelled": ["#6b6259", "#efeae3"],
  "Paid": ["#1f7a4d", "#e7f4ec"], "Overdue": ["#b23b34", "#fbe9e7"], "Pending": ["#9a6a12", "#fbf1dc"],
  "Open": ["#b23b34", "#fbe9e7"], "Invited": ["#9a6a12", "#fbf1dc"], "System": ["#5e5048", "#efeae3"],
  "Urgent": ["#b23b34", "#fbe9e7"], "High": ["#c2552f", "#fdeee6"], "Normal": ["#3e63a0", "#e9eff7"], "Low": ["#6b6259", "#efeae3"],
  "Custom": ["#7a5230", "#f6ece3"],
};
function Badge({ children, tone }) {
  const [c, bg] = BADGE[tone || children] || ["#6b6259", "#efeae3"];
  return <span className="cp-badge" style={{ color: c, background: bg }}>{children}</span>;
}
function PlanBadge({ plan }) {
  const map = { Starter: ["#5e5048", "#efeae3"], Pro: ["#c2552f", "#fdeee6"], Enterprise: ["#2A2420", "#efe7df"] };
  const [c, bg] = map[plan] || map.Starter;
  return <span className="cp-badge" style={{ color: c, background: bg }}>{plan}</span>;
}

// ---- stat card -------------------------------------------------------------
function StatCard({ label, value, icon, tone, delta, sub }) {
  return (
    <div className="cp-stat">
      <div className="cp-stat-top">
        <span className="cp-stat-label">{label}</span>
        <span className="cp-stat-ic" data-tone={tone}><Icon name={icon} size={16} /></span>
      </div>
      <div className="cp-stat-val">{value}</div>
      {(delta || sub) && (
        <div className="cp-stat-sub">
          {delta && <span className="cp-delta" data-dir={delta > 0 ? "up" : "down"}>{delta > 0 ? "▲" : "▼"} {Math.abs(delta)}%</span>}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </div>
  );
}

function Card({ title, action, children, pad = true }) {
  return (
    <section className="cp-card">
      {(title || action) && (
        <header className="cp-card-head">
          <h3>{title}</h3>
          {action}
        </header>
      )}
      <div className={pad ? "cp-card-body" : ""}>{children}</div>
    </section>
  );
}

// ---- sidebar ---------------------------------------------------------------
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "tenants", label: "Tenants", icon: "tenants" },
  { id: "billing", label: "Billing", icon: "billing" },
  { id: "support", label: "Support", icon: "support" },
  { id: "analytics", label: "Analytics", icon: "analytics", isNew: true },
  { id: "audit", label: "Audit log", icon: "audit", isNew: true },
  { id: "settings", label: "Settings", icon: "settings" },
];

function Sidebar({ active, onNav }) {
  return (
    <aside className="cp-side">
      <div className="cp-brand">
        <span className="cp-brand-tile">
          <NexusMark variant="mesh" size={24} lineW={3.4} onDark core="#E8693A" />
        </span>
        <span className="cp-brand-txt">
          <b>Sentire Central</b>
          <i>Super Admin Portal</i>
        </span>
      </div>

      <nav className="cp-nav">
        {NAV.map((n) => (
          <button key={n.id} className={"cp-navitem" + (active === n.id ? " is-active" : "")}
                  onClick={() => onNav(n.id)}>
            <Icon name={n.icon} size={19} />
            <span>{n.label}</span>
            {n.isNew && <em className="cp-new">New</em>}
            {active === n.id && <span className="cp-nav-caret"><Icon name="chevR" size={15} /></span>}
          </button>
        ))}
      </nav>

      <div className="cp-side-foot">
        <span className="cp-avatar">C</span>
        <span className="cp-user">
          <b>Christian Canlubo</b>
          <i>mark.canlubo@gmail.com</i>
          <em>Super Admin</em>
        </span>
      </div>
    </aside>
  );
}

function Topbar() {
  return (
    <div className="cp-top">
      <label className="cp-topsearch">
        <Icon name="search" size={17} />
        <input placeholder="Search tenants, invoices, tickets…" />
        <kbd>⌘K</kbd>
      </label>
      <div className="cp-top-right">
        <span className="cp-env"><i></i>Production</span>
        <button className="cp-iconbtn" aria-label="Notifications">
          <Icon name="bell" size={19} /><em className="cp-dot"></em>
        </button>
      </div>
    </div>
  );
}

function PageHead({ title, sub, actions }) {
  return (
    <div className="cp-pagehead">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="cp-pagehead-act">{actions}</div>}
    </div>
  );
}

Object.assign(window, { Icon, Badge, PlanBadge, StatCard, Card, Sidebar, Topbar, PageHead, NAV, CPNav });
