// ess-app.jsx — Sentire Payroll ESS app shell: top bar + stack routing + bottom nav
// Exports to window: ESSApp

const { EMPLOYEE } = window.ESS;

const TABS = [
  { id: "home", label: "Home", icon: "home" },
  { id: "pay", label: "Pay", icon: "wallet" },
  { id: "leave", label: "Leave", icon: "leave" },
  { id: "time", label: "Time", icon: "clock" },
  { id: "profile", label: "Profile", icon: "user" },
];

// view registry: view name -> { comp, title }
function viewFor(view, param) {
  const R = window;
  switch (view) {
    case "pay": return { comp: R.PayScreen, title: "Pay" };
    case "leave": return { comp: R.LeaveScreen, title: "Leave" };
    case "time": return { comp: R.TimeScreen, title: "Time" };
    case "profile": return { comp: R.ProfileScreen, title: "Profile" };
    case "payslip": return { comp: R.PayslipDetail, title: "Payslip", back: true };
    case "leaveRequest": return { comp: R.LeaveRequest, title: "Request leave", back: true };
    case "request": {
      const map = { ot: "Overtime", reimb: "Reimbursement", coe: "Certificate", leave: "Leave" };
      return { comp: R.RequestScreen, title: map[param] || "New request", back: true };
    }
    case "settings": return { comp: R.SettingsScreen, title: "Settings", back: true };
    case "announcement": return { comp: R.AnnouncementScreen, title: "Announcement", back: true };
    case "clock": return { comp: R.ClockScreen, title: param === "out" ? "Clock out" : "Clock in", back: true };
    default: return { comp: R.HomeScreen, title: "Home" };
  }
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function ESSApp({ initialTab = "home", initialView = null, initialParam = null }) {
  const start = initialView
    ? [{ tab: initialTab, view: initialView, param: initialParam }]
    : [{ tab: initialTab, view: initialTab === "home" ? null : initialTab, param: null }];
  const [stack, setStack] = React.useState(start);
  const top = stack[stack.length - 1];
  const activeTab = top.tab;

  const nav = React.useMemo(() => ({
    go: (view, param) => setStack((s) => [...s, { tab: s[s.length - 1].tab, view, param }]),
    back: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    tab: (id) => setStack([{ tab: id, view: id === "home" ? null : id, param: null }]),
  }), []);
  const [clockedIn, setClockedIn] = React.useState(false);

  const isHome = activeTab === "home" && !top.view;
  const isSub = !!top.view && !["pay", "leave", "time", "profile"].includes(top.view);
  const meta = top.view ? viewFor(top.view, top.param) : viewFor(activeTab, null);
  const Screen = meta.comp;

  // header
  let header;
  if (isHome) {
    header = (
      <header className="e-top e-top-home">
        <div className="e-greet">
          <i>{greeting()},</i>
          <b>{EMPLOYEE.first} 👋</b>
          <span>{EMPLOYEE.company}</span>
        </div>
        <button className="e-bell" aria-label="Notifications"><EIcon name="bell" size={21} /><em></em></button>
      </header>
    );
  } else if (isSub) {
    header = (
      <header className="e-top e-top-sub">
        <button className="e-back" onClick={() => nav.back()} aria-label="Back"><EIcon name="chevL" size={22} /></button>
        <h1>{meta.title}</h1>
        <span className="e-back-spacer"></span>
      </header>
    );
  } else {
    header = (
      <header className="e-top e-top-root">
        <h1>{meta.title}</h1>
      </header>
    );
  }

  return (
    <ESSNav.Provider value={{ ...nav, clockedIn, setClockedIn }}>
      <div className="e-app">
        {header}
        <div className="e-body">
          <div className="e-screen" key={activeTab + ":" + (top.view || "root") + ":" + (top.param || "")}>
            <Screen param={top.param} />
          </div>
        </div>
        <nav className="e-bottomnav">
          {TABS.map((t) => (
            <button key={t.id} className={"e-navitem" + (activeTab === t.id ? " is-on" : "")} onClick={() => nav.tab(t.id)}>
              <EIcon name={t.icon} size={23} fill={false} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </ESSNav.Provider>
  );
}

window.ESSApp = ESSApp;
