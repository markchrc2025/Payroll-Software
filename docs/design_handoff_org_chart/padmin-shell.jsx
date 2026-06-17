// padmin-shell.jsx — Sentire Payroll Tenant-Admin · shell + shared UI primitives
// Exports to window: PIcon, SentireMark, Sidebar, Topbar, PageHead, Badge, StatCard,
//   Card, Btn, Toggle, Drawer, EmpAvatar, Field, Select, NAV_GROUPS, PNav

const { peso, pesoC, COMPANY, SESSION } = window.PA;

const PNav = React.createContext({ go: () => {}, route: { page: "dashboard" }, openDrawer: () => {}, closeDrawer: () => {} });

// ---- Sentire Nexus mark ----
function SentireMark({ size = 30, onDark = true }) {
  const ink = onDark ? "#F7F3EF" : "#2A2420";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" style={{ flex: "none", display: "block" }}>
      <g stroke={ink} strokeWidth="3.4" strokeLinecap="round" opacity="0.5">
        <line x1="24" y1="24" x2="24" y2="11.5"></line>
        <line x1="24" y1="24" x2="38.5" y2="24"></line>
        <line x1="24" y1="24" x2="19.55" y2="36.22"></line>
        <line x1="24" y1="24" x2="10.84" y2="19.21"></line>
      </g>
      <g stroke={ink} strokeWidth="2.55" strokeLinecap="round" opacity="0.18">
        <line x1="24" y1="11.5" x2="38.5" y2="24"></line>
        <line x1="38.5" y1="24" x2="19.55" y2="36.22"></line>
        <line x1="19.55" y1="36.22" x2="10.84" y2="19.21"></line>
        <line x1="10.84" y1="19.21" x2="24" y2="11.5"></line>
      </g>
      <circle cx="24" cy="11.5" r="3.68" fill={ink}></circle>
      <circle cx="38.5" cy="24" r="4.13" fill={ink}></circle>
      <circle cx="19.55" cy="36.22" r="3.85" fill={ink}></circle>
      <circle cx="10.84" cy="19.21" r="3.43" fill={ink}></circle>
      <circle cx="24" cy="24" r="5" fill="#E8693A"></circle>
    </svg>
  );
}

// ---- icon set (stroke 1.7) ----
const ICONS = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  employees: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11",
  departments: "M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 21V9h4a1 1 0 0 1 1 1v11M3 21h18M7.5 8h.01M7.5 12h.01M11 8h.01M11 12h.01",
  branches: "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9",
  locations: "M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  positions: "M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM14 7h-4V5h4z",
  assets: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96L12 12l8.73-5.04M12 22V12",
  incidents: "M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
  movements: "M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7",
  requests: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6",
  claims: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  announcements: "M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6",
  recruitment: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 11l2 2 4-4",
  time: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  leave: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 16l2 2 4-4",
  payruns: "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM2 10h20M6 15h4",
  components: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  loans: "M3 21h18M5 21V11l7-5 7 5v10M9 21v-6h6v6M12 3v2",
  bankfiles: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6M9 9h1",
  govreports: "M12 2l8 3v6c0 4.5-3 8.3-8 9.5C7 19.3 4 15.5 4 11V5l8-3zM9 11.5l2 2 4-4.5",
  analytics: "M3 3v18h18M7 14l3-3 3 3 5-6",
  branding: "M3 7h18M3 7l2-3h14l2 3M3 7v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M9 11a3 3 0 0 0 6 0",
  payrules: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  premium: "M19 5L5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  holiday: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM12 14l1 2 2 .3-1.5 1.4.4 2-1.9-1-1.9 1 .4-2L9 16.3l2-.3z",
  policies: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  roles: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM12 15v2",
  kiosks: "M2 4h20v12H2zM8 20h8M12 16v4M7 8h2M7 11h6",
  ai: "M12 3a3 3 0 0 1 3 3 3 3 0 0 1 0 6 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 0-6 3 3 0 0 1 3-3zM12 8v.01M9 16v3a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-3",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  plus: "M12 5v14M5 12h14",
  chevR: "M9 6l6 6-6 6",
  chevD: "M6 9l6 6 6-6",
  chevL: "M15 6l-6 6 6 6",
  swap: "M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4",
  x: "M18 6L6 18M6 6l12 12",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  refresh: "M21 12a9 9 0 1 1-3-6.7M21 4v4h-4",
  filter: "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
  check: "M20 6L9 17l-5-5",
  checkCircle: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3",
  more: "M12 12h.01M19 12h.01M5 12h.01",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  cake: "M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1M2 21h20M7 8v3M12 8v3M17 8v3M7 4h.01M12 3h.01M17 4h.01",
  wallet: "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z",
  arrowR: "M5 12h14M12 5l7 7-7 7",
  doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 8 2.6h.1A1.7 1.7 0 0 0 9 1.1V1a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 14.9 2.6a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1A1.7 1.7 0 0 0 22.9 9H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
};
function PIcon({ name, size = 18, sw = 1.7 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "none" }}>
      <path d={ICONS[name] || ICONS.dashboard} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---- nav groups (mirrors the live app sidebar) ----
const NAV_GROUPS = [
  { label: "Overview", items: [["dashboard", "Dashboard", "dashboard"]] },
  { label: "Workforce", items: [
    ["employees", "Employees", "employees"], ["departments", "Departments", "departments"],
    ["branches", "Branches", "branches"], ["locations", "Locations", "locations"],
    ["positions", "Positions", "positions"], ["assets", "Assets", "assets"],
  ]},
  { label: "HR Ops", items: [
    ["incidents", "Incidents", "incidents"], ["movements", "Movements", "movements"],
    ["requests", "Profile Requests", "requests"], ["claims", "Claims", "claims"],
    ["announcements", "Announcements", "announcements"],
  ]},
  { label: "Talent", items: [["recruitment", "Recruitment", "recruitment"]] },
  { label: "Time", items: [["time", "Time & Attendance", "time"], ["leave", "Leave", "leave"]] },
  { label: "Payroll", items: [
    ["payruns", "Payroll Runs", "payruns"], ["components", "Pay Components", "components"],
    ["loans", "Loans", "loans"], ["bankfiles", "Bank Files", "bankfiles"],
  ]},
  { label: "Compliance", items: [["govreports", "Gov't Reports", "govreports"], ["analytics", "Analytics", "analytics"]] },
  { label: "Settings", items: [
    ["payrules", "Pay Rules", "payrules"],
    ["premium", "Premium Rates", "premium"], ["holiday", "Holiday Calendar", "holiday"],
    ["policies", "Leave Policies", "policies"], ["roles", "Roles & Permissions", "roles"],
    ["kiosks", "Kiosks", "kiosks"], ["ai", "AI Assistant", "ai"],
  ]},
];
const NEW_ITEMS = { ai: true, analytics: true };

// ---- sidebar ----
function Sidebar() {
  const nav = React.useContext(PNav);
  const PARENT = { employee: "employees", payrun: "payruns", "new-employee": "employees" };
  const p = nav.route.page;
  const active = p === "form"
    ? ((window.FORM_SCHEMAS[nav.route.param] || window.FORM_SCHEMAS.default).back)
    : (PARENT[p] || p);

  const activeGroup = NAV_GROUPS.find(g => g.items.some(([id]) => id === active));
  const activeGroupLabel = activeGroup ? activeGroup.label : "Overview";
  const [open, setOpen] = React.useState(() => {
    const o = {};
    NAV_GROUPS.forEach(g => { o[g.label] = g.label === activeGroupLabel || g.label === "Overview"; });
    return o;
  });
  React.useEffect(() => {
    setOpen(prev => prev[activeGroupLabel] ? prev : { ...prev, [activeGroupLabel]: true });
  }, [activeGroupLabel]);
  const toggle = (label) => setOpen(prev => ({ ...prev, [label]: !prev[label] }));

  const [collapsed, setCollapsed] = React.useState(() => {
    try { return localStorage.getItem("pa-side-collapsed") === "1"; } catch (e) { return false; }
  });
  React.useEffect(() => {
    try { localStorage.setItem("pa-side-collapsed", collapsed ? "1" : "0"); } catch (e) {}
  }, [collapsed]);

  return (
    <aside className={"pa-side" + (collapsed ? " is-collapsed" : "")}>
      <button className="pa-side-toggle" onClick={() => setCollapsed(c => !c)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        <PIcon name={collapsed ? "chevR" : "chevL"} size={15} />
      </button>
      <div className="pa-brand">
        <span className="pa-brand-tile"><SentireMark size={24} /></span>
        <span className="pa-brand-txt"><b>Sentire Payroll</b><i>HRIS &amp; Payroll</i></span>
      </div>

      <button className="pa-co" onClick={() => nav.openDrawer("switch-company")} title={collapsed ? COMPANY.name : undefined}>
        <span className="pa-co-tile">{COMPANY.short}</span>
        <span className="pa-co-txt"><b>{COMPANY.name}</b><i>{COMPANY.plan}</i></span>
        <span className="pa-co-swap"><PIcon name="swap" size={15} /></span>
      </button>

      <nav className="pa-nav">
        {NAV_GROUPS.map((g) => {
          const isOpen = !!open[g.label];
          const hasActive = g.items.some(([id]) => id === active);
          return (
            <div className={"pa-navgroup" + (isOpen ? " is-open" : "")} key={g.label}>
              <button className={"pa-navlabel" + (isOpen ? " is-open" : "")} onClick={() => toggle(g.label)}>
                <span>{g.label}</span>
                {!isOpen && hasActive && <em className="pa-navlabel-dot"></em>}
                <PIcon name="chevD" size={13} />
              </button>
              {(isOpen || collapsed) && g.items.map(([id, label, icon]) => (
                <button key={id} title={collapsed ? label : undefined} className={"pa-navitem" + (active === id ? " is-active" : "")} onClick={() => nav.go(id)}>
                  <PIcon name={icon} size={18} />
                  <span>{label}</span>
                  {NEW_ITEMS[id] && <em className="pa-new">New</em>}
                </button>
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

// ---- topbar ----
function Topbar() {
  const nav = React.useContext(PNav);
  const [menu, setMenu] = React.useState(false);
  React.useEffect(() => {
    if (!menu) return;
    const h = () => setMenu(false);
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [menu]);
  return (
    <header className="pa-top">
      <label className="pa-topsearch" onClick={() => nav.openDrawer("search")}>
        <PIcon name="search" size={17} />
        <input placeholder="Search employees…" readOnly />
        <kbd>⌘K</kbd>
      </label>
      <div className="pa-top-right">
        <button className="pa-iconbtn" aria-label="Notifications" onClick={() => nav.openDrawer("notifications")}>
          <PIcon name="bell" size={19} /><em className="pa-dot"></em>
        </button>
        <div className="pa-menuwrap" onClick={(e) => e.stopPropagation()}>
          <button className={"pa-me" + (menu ? " is-on" : "")} onClick={() => setMenu(!menu)}>
            <EmpAvatar initials={SESSION.initials} size={32} />
            <span className="pa-me-meta"><b>{SESSION.name}</b><i>{SESSION.role}</i></span>
            <PIcon name="chevD" size={15} />
          </button>
          {menu && (
            <div className="pa-memenu">
              <div className="pa-memenu-head">
                <EmpAvatar initials={SESSION.initials} size={38} />
                <div><b>{SESSION.name}</b><i>{SESSION.email}</i></div>
              </div>
              <button className="pa-memenu-item"><PIcon name="employees" size={16} /> My profile</button>
              <button className="pa-memenu-item" onClick={() => { setMenu(false); nav.go("branding"); }}><PIcon name="settings" size={16} /> Company settings</button>
              <button className="pa-memenu-item"><PIcon name="govreports" size={16} /> Security</button>
              <div className="pa-memenu-sep"></div>
              <button className="pa-memenu-item is-danger"><PIcon name="logout" size={16} /> Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// ---- page head ----
function PageHead({ title, sub, actions }) {
  return (
    <div className="pa-pagehead">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {actions && <div className="pa-pagehead-act">{actions}</div>}
    </div>
  );
}

// ---- badge ----
const BADGE = {
  "Active": ["#1f7a4d", "#e7f4ec"], "Paid": ["#1f7a4d", "#e7f4ec"], "Approved": ["#1f7a4d", "#e7f4ec"],
  "Filed": ["#1f7a4d", "#e7f4ec"], "Settled": ["#1f7a4d", "#e7f4ec"], "Ready": ["#3e63a0", "#e9eff7"],
  "Draft": ["#9a6a12", "#fbf1dc"], "Pending": ["#9a6a12", "#fbf1dc"], "Submitted": ["#9a6a12", "#fbf1dc"],
  "On Leave": ["#9a6a12", "#fbf1dc"], "Probationary": ["#7a5230", "#f6ece3"], "Open": ["#b23b34", "#fbe9e7"],
  "Overdue": ["#b23b34", "#fbe9e7"], "Regular": ["#3e63a0", "#e9eff7"], "Special": ["#c2552f", "#fdeee6"],
  "System": ["#5e5048", "#efeae3"], "Custom": ["#7a5230", "#f6ece3"], "Earning": ["#1f7a4d", "#e7f4ec"],
  "Allowance": ["#3e63a0", "#e9eff7"], "Statutory": ["#5e5048", "#efeae3"], "Loan": ["#c2552f", "#fdeee6"],
  "Deduction": ["#b23b34", "#fbe9e7"],
};
function Badge({ children, tone }) {
  const [c, bg] = BADGE[tone || children] || ["#6b6259", "#efeae3"];
  return <span className="pa-badge" style={{ color: c, background: bg }}>{children}</span>;
}

// ---- stat card ----
function StatCard({ label, value, icon, tone, sub, delta, onClick }) {
  return (
    <div className={"pa-stat" + (onClick ? " is-click" : "")} onClick={onClick}>
      <div className="pa-stat-top">
        <span className="pa-stat-label">{label}</span>
        <span className="pa-stat-ic" data-tone={tone}><PIcon name={icon} size={16} /></span>
      </div>
      <div className="pa-stat-val">{value}</div>
      {(sub || delta) && (
        <div className="pa-stat-sub">
          {delta != null && <span className="pa-delta" data-dir={delta >= 0 ? "up" : "down"}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%</span>}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </div>
  );
}

// ---- card ----
function Card({ title, sub, action, children, pad = true, className = "" }) {
  return (
    <section className={"pa-card " + className}>
      {(title || action) && (
        <header className="pa-card-head">
          <div>{title && <h3>{title}</h3>}{sub && <p>{sub}</p>}</div>
          {action}
        </header>
      )}
      <div className={pad ? "pa-card-body" : ""}>{children}</div>
    </section>
  );
}

// ---- button ----
function Btn({ kind = "ghost", icon, children, onClick, full, type = "button" }) {
  return (
    <button type={type} className={"pa-btn pa-btn-" + kind + (full ? " pa-btn-full" : "")} onClick={onClick}>
      {icon && <PIcon name={icon} size={16} />}{children}
    </button>
  );
}

// ---- toggle ----
function Toggle({ on, onChange }) {
  const [v, setV] = React.useState(!!on);
  const val = onChange ? on : v;
  return (
    <button className={"pa-toggle" + (val ? " is-on" : "")} onClick={() => { onChange ? onChange(!on) : setV(!v); }} aria-pressed={val}>
      <span></span>
    </button>
  );
}

// ---- avatar ----
const AV_TONES = ["#E8693A", "#4F9373", "#3e63a0", "#A0627D", "#C7913D", "#5E7FB1"];
function EmpAvatar({ initials, size = 34, id }) {
  const hash = (id || initials || "x").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const tone = AV_TONES[hash % AV_TONES.length];
  return (
    <span className="pa-avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: tone + "1f", color: tone }}>
      {initials}
    </span>
  );
}

// ---- form field / select ----
function Field({ icon, ...props }) {
  return (
    <label className="pa-field">
      {icon && <PIcon name={icon} size={16} />}
      <input {...props} />
    </label>
  );
}
function Select({ value, onChange, options, w }) {
  return (
    <select className="pa-select" value={value} onChange={(e) => onChange(e.target.value)} style={w ? { width: w } : null}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ---- drawer / modal ----
function Drawer({ title, sub, onClose, children, footer, wide }) {
  React.useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="pa-drawer-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={"pa-drawer" + (wide ? " is-wide" : "")} role="dialog">
        <header className="pa-drawer-head">
          <div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
          <button className="pa-drawer-x" onClick={onClose} aria-label="Close"><PIcon name="x" size={18} /></button>
        </header>
        <div className="pa-drawer-body">{children}</div>
        {footer && <footer className="pa-drawer-foot">{footer}</footer>}
      </div>
    </div>
  );
}

// ---- generic empty / placeholder page (for long-tail nav items) ----
function GenericPage({ title, sub, icon, points, formKey }) {
  const nav = React.useContext(PNav);
  return (
    <>
      <PageHead title={title} sub={sub} actions={<Btn kind="primary" icon="plus" onClick={() => nav.go("form", formKey || "default")}>New</Btn>} />
      <div className="pa-empty-page">
        <span className="pa-empty-ic"><PIcon name={icon} size={30} /></span>
        <h2>{title} workspace</h2>
        <p>{sub} This module is wired into the same warm Sentire shell — drop in tables, filters and detail views just like the other sections.</p>
        {points && (
          <ul className="pa-empty-points">
            {points.map((p) => <li key={p}><PIcon name="check" size={15} /> {p}</li>)}
          </ul>
        )}
      </div>
    </>
  );
}

Object.assign(window, {
  PIcon, SentireMark, Sidebar, Topbar, PageHead, Badge, StatCard, Card, Btn,
  Toggle, Drawer, EmpAvatar, Field, Select, GenericPage, NAV_GROUPS, PNav,
});
