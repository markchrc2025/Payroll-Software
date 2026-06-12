// ess-screens-b.jsx — Leave, Leave request, Time, Profile, Settings, Announcement, Request form
// Exports to window: LeaveScreen, LeaveRequest, TimeScreen, ProfileScreen,
//   SettingsScreen, AnnouncementScreen, RequestScreen

const { peso0, EMPLOYEE, LEAVE_BAL, LEAVE_HISTORY, ATTENDANCE, ANNOUNCEMENTS, REQUEST_TYPES } = window.ESS;

// ============================ LEAVE ============================
function LeaveScreen() {
  const nav = React.useContext(ESSNav);
  return (
    <div className="e-stack">
      <div className="e-leavebals">
        {LEAVE_BAL.map((l) => (
          <ECard key={l.code} className="e-lbal">
            <div className="e-lbal-ring">
              <ERing value={l.used} total={l.total} color={l.color} size={64} />
              <b>{l.total - l.used}</b>
            </div>
            <div className="e-lbal-meta">
              <b>{l.type}</b>
              <i>{l.used} used · {l.total} total</i>
            </div>
          </ECard>
        ))}
      </div>

      <EBtn kind="primary" icon="plus" full onClick={() => nav.go("leaveRequest")}>Request leave</EBtn>

      <ESection>Request history</ESection>
      {LEAVE_HISTORY.map((r, i) => (
        <ECard key={i} className="e-lhist">
          <div className="e-lhist-top">
            <b>{r.type}</b>
            <EStatus>{r.status}</EStatus>
          </div>
          <div className="e-lhist-meta">
            <span><EIcon name="cal" size={14} /> {r.dates}</span>
            <span>{r.days} {r.days > 1 ? "days" : "day"}</span>
          </div>
          <p className="e-lhist-reason">{r.reason}</p>
        </ECard>
      ))}
    </div>
  );
}

function LeaveRequest() {
  const nav = React.useContext(ESSNav);
  const [type, setType] = React.useState("Vacation Leave");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [done, setDone] = React.useState(false);

  if (done) return (
    <div className="e-success">
      <span className="e-success-ic"><EIcon name="checkCircle" size={48} /></span>
      <h3>Request submitted</h3>
      <p>Your {type.toLowerCase()} request was sent to {EMPLOYEE.manager} for approval. You'll be notified once it's reviewed.</p>
      <EBtn kind="primary" full onClick={() => nav.back()}>Back to Leave</EBtn>
    </div>
  );

  return (
    <div className="e-stack e-form">
      <label className="e-flabel">Leave type</label>
      <div className="e-chiprow">
        {LEAVE_BAL.map((l) => (
          <button key={l.code} className={"e-typechip" + (type === l.type ? " is-on" : "")} onClick={() => setType(l.type)}>{l.type}</button>
        ))}
      </div>

      <div className="e-frow">
        <div><label className="e-flabel">From</label>
          <div className="e-finput"><EIcon name="cal" size={17} /><input type="text" placeholder="Jun 20" value={from} onChange={(e) => setFrom(e.target.value)} /></div></div>
        <div><label className="e-flabel">To</label>
          <div className="e-finput"><EIcon name="cal" size={17} /><input type="text" placeholder="Jun 21" value={to} onChange={(e) => setTo(e.target.value)} /></div></div>
      </div>

      <label className="e-flabel">Reason</label>
      <textarea className="e-ftext" rows="3" placeholder="Add a short note for your manager…" value={reason} onChange={(e) => setReason(e.target.value)}></textarea>

      <div className="e-balnote">
        <EIcon name="leave" size={16} />
        <span>{LEAVE_BAL.find(l => l.type === type) ? (LEAVE_BAL.find(l => l.type === type).total - LEAVE_BAL.find(l => l.type === type).used) : 0} days remaining for {type}</span>
      </div>

      <EBtn kind="primary" full onClick={() => setDone(true)}>Submit request</EBtn>
    </div>
  );
}

// ============================ TIME ============================
function TimeScreen() {
  const [clockedIn, setClockedIn] = React.useState(true);
  const t = ATTENDANCE;
  return (
    <div className="e-stack">
      <div className="e-clock">
        <div className="e-clock-time">{t.today.in}</div>
        <div className="e-clock-day">{t.today.date}</div>
        <div className="e-clock-sched"><EIcon name="clock" size={15} /> {t.today.schedule}</div>
        <button className={"e-clock-btn" + (clockedIn ? " is-out" : "")} onClick={() => setClockedIn(!clockedIn)}>
          {clockedIn ? "Clock out" : "Clock in"}
        </button>
        <span className="e-clock-status">{clockedIn ? "Clocked in since " + t.today.in + " · On time" : "Not clocked in"}</span>
      </div>

      <ESection>This period · {t.period.label}</ESection>
      <div className="e-timestats">
        <ECard className="e-tstat"><b>{t.period.present}</b><span>Present</span></ECard>
        <ECard className="e-tstat"><b className="e-amber">{t.period.late}</b><span>Late</span></ECard>
        <ECard className="e-tstat"><b>{t.period.absent}</b><span>Absent</span></ECard>
        <ECard className="e-tstat"><b className="e-sage">{t.period.otHrs}</b><span>OT hrs</span></ECard>
      </div>

      <ESection>Attendance log</ESection>
      <ECard className="e-logcard">
        {t.log.map((d, i) => (
          <div className="e-logrow" key={i}>
            <div className="e-logday"><b>{d.day.split(" ")[1]}</b><i>{d.day.split(" ")[0]}</i></div>
            <div className="e-logtime">
              {d.in === "—" ? <span className="e-logrest">Rest day</span> : <><b>{d.in}</b><span>→</span><b>{d.out}</b></>}
            </div>
            <EChip tone={d.tone}>{d.tag}</EChip>
          </div>
        ))}
      </ECard>
    </div>
  );
}

// ============================ PROFILE ============================
function ProfileScreen() {
  const nav = React.useContext(ESSNav);
  const e = EMPLOYEE;
  const row = (icon, label, value) => (
    <div className="e-prow"><span className="e-prow-ic"><EIcon name={icon} size={17} /></span><span className="e-prow-l">{label}</span><b className="e-prow-v">{value}</b></div>
  );
  return (
    <div className="e-stack">
      <div className="e-phead">
        <EAvatar initials={e.initials} size={72} />
        <h3>{e.name}</h3>
        <p>{e.position}</p>
        <div className="e-phead-tags"><EChip tone="sage">{e.employment}</EChip><EChip tone="slate">{e.id}</EChip></div>
      </div>

      <ESection>Personal</ESection>
      <ECard className="e-pcard">
        {row("mail", "Email", e.email)}
        {row("phone", "Mobile", e.phone)}
        {row("pin", "Address", e.address)}
        {row("cal", "Birthdate", e.birthdate)}
      </ECard>

      <ESection>Employment</ESection>
      <ECard className="e-pcard">
        {row("building", "Company", e.company)}
        {row("briefcase", "Position", e.position)}
        {row("user", "Manager", e.manager)}
        {row("cal", "Date hired", e.hired + " · " + e.tenure)}
      </ECard>

      <ESection>Pay & government</ESection>
      <ECard className="e-pcard">
        {row("card", "Bank account", e.bank + " " + e.bankAcct)}
        {row("shield", "SSS", e.gov.SSS)}
        {row("shield", "PhilHealth", e.gov.PhilHealth)}
        {row("shield", "Pag-IBIG", e.gov["Pag-IBIG"])}
        {row("shield", "TIN", e.gov.TIN)}
      </ECard>

      <ECard className="e-pcard">
        <button className="e-prow e-prow-tap" onClick={() => nav.go("settings")}>
          <span className="e-prow-ic"><EIcon name="gear" size={17} /></span><span className="e-prow-l">Settings</span><EIcon name="chevR" size={16} />
        </button>
        <button className="e-prow e-prow-tap" onClick={() => nav.go("request", "coe")}>
          <span className="e-prow-ic"><EIcon name="doc" size={17} /></span><span className="e-prow-l">Request certificate (COE)</span><EIcon name="chevR" size={16} />
        </button>
      </ECard>

      <button className="e-logout" onClick={() => nav.tab("home")}><EIcon name="logout" size={18} /> Log out</button>
      <p className="e-version">Sentire Payroll · ESS v1.0</p>
    </div>
  );
}

function SettingsScreen() {
  const Toggle = ({ on }) => {
    const [v, setV] = React.useState(on);
    return <button className={"e-toggle" + (v ? " is-on" : "")} onClick={() => setV(!v)} aria-pressed={v}><span></span></button>;
  };
  const trow = (icon, label, sub, node) => (
    <div className="e-srow"><span className="e-prow-ic"><EIcon name={icon} size={17} /></span><div className="e-srow-t"><b>{label}</b>{sub && <i>{sub}</i>}</div>{node}</div>
  );
  return (
    <div className="e-stack">
      <ESection>Notifications</ESection>
      <ECard className="e-pcard">
        {trow("wallet", "Payslip ready", "When a new payslip is released", <Toggle on={true} />)}
        {trow("leave", "Leave updates", "Approvals and rejections", <Toggle on={true} />)}
        {trow("megaphone", "Announcements", "Company-wide notices", <Toggle on={false} />)}
      </ECard>
      <ESection>Security</ESection>
      <ECard className="e-pcard">
        {trow("fingerprint", "Biometric unlock", "Use Face ID to open the app", <Toggle on={true} />)}
        {trow("shield", "Change password", null, <EIcon name="chevR" size={16} />)}
      </ECard>
      <ESection>Appearance</ESection>
      <ECard className="e-pcard">
        {trow("moon", "Dark mode", "Match system setting", <Toggle on={false} />)}
      </ECard>
    </div>
  );
}

function AnnouncementScreen({ param }) {
  const a = ANNOUNCEMENTS.find((x) => x.id === param) || ANNOUNCEMENTS[0];
  return (
    <div className="e-stack">
      <div className="e-anndetail">
        <div className="e-ann-top"><EChip tone="sage">{a.tag}</EChip><span>{a.date}</span></div>
        <h2>{a.title}</h2>
        <p>{a.body}</p>
        <p>If you have questions, reach out to the People team through the Requests tab or your supervisor.</p>
        <div className="e-annfrom">
          <EAvatar initials="HR" size={36} color="#6b6259" />
          <div><b>People & Culture</b><i>Acme Foods Inc.</i></div>
        </div>
      </div>
    </div>
  );
}

function RequestScreen({ param }) {
  const nav = React.useContext(ESSNav);
  const rt = REQUEST_TYPES.find((r) => r.id === param) || REQUEST_TYPES[0];
  const [done, setDone] = React.useState(false);
  const copy = {
    ot: { title: "Overtime", field: "Hours worked", ph: "e.g. 2.5", note: "OT must be pre-approved by your supervisor." },
    reimb: { title: "Reimbursement", field: "Amount (₱)", ph: "e.g. 850", note: "Attach receipts after submitting." },
    coe: { title: "Certificate of Employment", field: "Purpose", ph: "e.g. Bank loan", note: "Ready within 3 working days." },
    leave: { title: "Leave", field: "Days", ph: "e.g. 2", note: "" },
  }[rt.id];

  if (done) return (
    <div className="e-success">
      <span className="e-success-ic"><EIcon name="checkCircle" size={48} /></span>
      <h3>{copy.title} request sent</h3>
      <p>{EMPLOYEE.manager} and the People team have been notified. Track the status under your requests.</p>
      <EBtn kind="primary" full onClick={() => nav.back()}>Done</EBtn>
    </div>
  );

  return (
    <div className="e-stack e-form">
      <div className="e-reqhead">
        <span className="e-qa-ic" data-tone="sage"><EIcon name={rt.icon} size={22} /></span>
        <div><b>File a {copy.title.toLowerCase()} request</b><i>Sent to {EMPLOYEE.manager} for approval</i></div>
      </div>
      <label className="e-flabel">{copy.field}</label>
      <div className="e-finput"><input type="text" placeholder={copy.ph} /></div>
      <label className="e-flabel">Date</label>
      <div className="e-finput"><EIcon name="cal" size={17} /><input type="text" placeholder="Jun 12, 2026" /></div>
      <label className="e-flabel">Notes</label>
      <textarea className="e-ftext" rows="3" placeholder="Add details…"></textarea>
      {copy.note && <div className="e-balnote"><EIcon name="shield" size={16} /><span>{copy.note}</span></div>}
      <EBtn kind="primary" full onClick={() => setDone(true)}>Submit request</EBtn>
    </div>
  );
}

Object.assign(window, { LeaveScreen, LeaveRequest, TimeScreen, ProfileScreen, SettingsScreen, AnnouncementScreen, RequestScreen });
