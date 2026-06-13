// ess-desktop-shell.jsx — Sentire Payroll ESS · desktop shell: topbar + routing + clock-in modal
// Exports to window: SentireMark, DNav, ESSDesktop

const DNav = React.createContext({ go: () => {}, openModal: () => {}, closeModal: () => {} });

function SentireMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" style={{ flex: "none", display: "block" }}>
      <g stroke="#2A2420" strokeWidth="3.4" strokeLinecap="round" opacity="0.5">
        <line x1="24" y1="24" x2="24" y2="11.5"></line>
        <line x1="24" y1="24" x2="38.5" y2="24"></line>
        <line x1="24" y1="24" x2="19.55" y2="36.22"></line>
        <line x1="24" y1="24" x2="10.84" y2="19.21"></line>
      </g>
      <g stroke="#2A2420" strokeWidth="2.55" strokeLinecap="round" opacity="0.18">
        <line x1="24" y1="11.5" x2="38.5" y2="24"></line>
        <line x1="38.5" y1="24" x2="19.55" y2="36.22"></line>
        <line x1="19.55" y1="36.22" x2="10.84" y2="19.21"></line>
        <line x1="10.84" y1="19.21" x2="24" y2="11.5"></line>
      </g>
      <circle cx="24" cy="11.5" r="3.68" fill="#2A2420"></circle>
      <circle cx="38.5" cy="24" r="4.13" fill="#2A2420"></circle>
      <circle cx="19.55" cy="36.22" r="3.85" fill="#2A2420"></circle>
      <circle cx="10.84" cy="19.21" r="3.43" fill="#2A2420"></circle>
      <circle cx="24" cy="24" r="5" fill="var(--e-acc, #E8693A)"></circle>
    </svg>
  );
}

const D_NAV_ITEMS = [
  { id: "dashboard", label: "Home", icon: "home" },
  { id: "pay", label: "Pay", icon: "wallet" },
  { id: "leave", label: "Leave", icon: "leave" },
  { id: "time", label: "Time", icon: "clock" },
];

const D_PAGE_REGISTRY = () => ({
  dashboard: window.DDashboard,
  pay: window.DPay,
  leave: window.DLeave,
  time: window.DTime,
  profile: window.DProfile,
  dtr: window.DDTRPeriods,
  "dtr-detail": window.DDTRDetail,
});

// ---------- clock in/out modal (selfie verification) ----------
function DClockModal({ out }) {
  const nav = React.useContext(DNav);
  const now = useNow();
  const t = fmtTime(now);
  const [step, setStep] = React.useState("camera"); // camera | review | done
  const [shot, setShot] = React.useState(null);
  const stamp = shot || t;
  const GEO_D = "Acme Foods HQ · Quezon City";

  return (
    <div className="d-modal-ov" onClick={(e) => { if (e.target === e.currentTarget) nav.closeModal(); }}>
      <div className="d-modal" role="dialog" aria-label={out ? "Clock out" : "Clock in"}>
        {step === "done" ? (
          <div className="d-modal-success">
            <span className="e-success-ic"><EIcon name="checkCircle" size={46} /></span>
            <h3>{out ? "Clocked out" : "Clocked in"} · {stamp.full}</h3>
            <p>{window.ESS.ATTENDANCE.today.date} · selfie verified at {GEO_D}.</p>
            <EBtn kind="primary" full onClick={() => nav.closeModal()}>Done</EBtn>
          </div>
        ) : (
          <React.Fragment>
            <div className="d-modal-head">
              <b>{out ? "Clock out" : "Clock in"} · selfie verification</b>
              <button className="d-modal-x" onClick={() => nav.closeModal()} aria-label="Close"><EIcon name="x" size={17} /></button>
            </div>
            <div className="e-geo"><EIcon name="pin" size={15} /> {GEO_D} · <b>{stamp.full}</b></div>
            <div className="e-viewfinder d-vf" data-captured={step === "review"}>
              <span className="e-vf-corner e-vf-tl"></span>
              <span className="e-vf-corner e-vf-tr"></span>
              <span className="e-vf-corner e-vf-bl"></span>
              <span className="e-vf-corner e-vf-br"></span>
              <div className="e-vf-guide">
                {step === "review" && <span className="e-vf-check"><EIcon name="check" size={36} /></span>}
              </div>
              {step === "camera" && <div className="e-vf-scan"></div>}
              <div className="e-vf-stamp"><EIcon name="pin" size={12} /> Acme Foods HQ · {stamp.full}</div>
            </div>
            <p className="e-vf-hint">
              {step === "camera"
                ? "Center your face in the frame, then capture."
                : "Looks good? Confirm to record your " + (out ? "clock-out" : "clock-in") + "."}
            </p>
            {step === "camera" ? (
              <div className="d-modal-actions">
                <EBtn kind="ghost" onClick={() => nav.closeModal()}>Cancel</EBtn>
                <EBtn kind="primary" icon="camera" onClick={() => { setShot(fmtTime(new Date())); setStep("review"); }}>Capture</EBtn>
              </div>
            ) : (
              <div className="d-modal-actions">
                <EBtn kind="ghost" icon="retake" onClick={() => setStep("camera")}>Retake</EBtn>
                <EBtn kind="primary" onClick={() => { nav.setClockedIn(!out); setStep("done"); }}>Confirm</EBtn>
              </div>
            )}
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

// ---------- shell ----------
function ESSDesktop({ page = "dashboard", param = null, modal = null }) {
  const [route, setRoute] = React.useState({ page, param });
  const [openModal, setOpenModal] = React.useState(modal); // "clock-in" | "clock-out" | "leave"
  const [clockedIn, setClockedIn] = React.useState(false);
  const { EMPLOYEE } = window.ESS;

  const nav = React.useMemo(() => ({
    go: (p, prm) => { setRoute({ page: p, param: prm == null ? null : prm }); setOpenModal(null); },
    openModal: (m) => setOpenModal(m),
    closeModal: () => setOpenModal(null),
  }), []);
  const navValue = { ...nav, clockedIn, setClockedIn };

  const pages = D_PAGE_REGISTRY();
  const Page = pages[route.page] || pages.dashboard;

  return (
    <DNav.Provider value={navValue}>
      <div className="d-app">
        <header className="d-top">
          <div className="d-top-in">
            <div className="d-brand">
              <SentireMark size={30} />
              <b>Sentire <span>Payroll</span></b>
            </div>
            <nav className="d-nav" aria-label="Main">
              {D_NAV_ITEMS.map((n) => (
                <button key={n.id} className={"d-navlink" + (route.page === n.id ? " is-on" : "")} onClick={() => nav.go(n.id)}>
                  <EIcon name={n.icon} size={17} />{n.label}
                </button>
              ))}
            </nav>
            <div className="d-topright">
              <button className="d-bell" aria-label="Notifications"><EIcon name="bell" size={19} /><em></em></button>
              <button className={"d-me" + (route.page === "profile" ? " is-on" : "")} onClick={() => nav.go("profile")}>
                <EAvatar initials={EMPLOYEE.initials} size={32} />
                <span className="d-me-meta">
                  <b>{EMPLOYEE.name}</b>
                  <i>{EMPLOYEE.id}</i>
                </span>
                <EIcon name="chevDown" size={15} />
              </button>
            </div>
          </div>
        </header>

        <main className="d-main">
          <div className="d-main-in" key={route.page + ":" + (route.param || "")}>
            <Page param={route.param} />
          </div>
        </main>

        {(openModal === "clock-in" || openModal === "clock-out") && <DClockModal out={openModal === "clock-out"} />}
        {openModal === "leave" && window.DLeaveModal && <window.DLeaveModal />}
      </div>
    </DNav.Provider>
  );
}

Object.assign(window, { SentireMark, DNav, ESSDesktop });
