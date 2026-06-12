// ess-screens-a.jsx — Home, Pay (payslips + tax forms), Payslip detail
// Exports to window: HomeScreen, PayScreen, PayslipDetail

const { peso, peso0, EMPLOYEE, PAYDAY, PAYSLIPS, TAXFORMS, LEAVE_BAL, ATTENDANCE, ANNOUNCEMENTS } = window.ESS;

function QuickAction({ icon, label, tone, onClick }) {
  return (
    <button className="e-qa" onClick={onClick}>
      <span className="e-qa-ic" data-tone={tone}><EIcon name={icon} size={21} /></span>
      <span className="e-qa-lb">{label}</span>
    </button>
  );
}

function HomeScreen() {
  const nav = React.useContext(ESSNav);
  const latest = PAYSLIPS[0];
  const now = useNow();
  const tnow = fmtTime(now);
  const clockedIn = nav.clockedIn;
  return (
    <div className="e-stack">
      {/* CLOCK IN/OUT — front widget */}
      <div className="e-clockhero" data-on={clockedIn}>
        <div className="e-hero-tex" aria-hidden="true"></div>
        <div className="e-clockhero-top">
          <span><EIcon name="cal" size={14} /> {ATTENDANCE.today.date}</span>
          <span className="e-hero-pill">{clockedIn ? "Clocked in" : "Not clocked in"}</span>
        </div>
        <div className="e-clockhero-time">
          {tnow.hm}<i>{tnow.ap}</i>
        </div>
        <div className="e-clockhero-sub">
          {clockedIn
            ? <><EIcon name="checkCircle" size={14} /> In since {ATTENDANCE.today.in} · {ATTENDANCE.today.schedule}</>
            : <><EIcon name="clock" size={14} /> Shift {ATTENDANCE.today.schedule}</>}
        </div>
        <button className="e-clockhero-btn" data-out={clockedIn}
          onClick={() => nav.go("clock", clockedIn ? "out" : "in")}>
          <EIcon name="camera" size={19} />
          {clockedIn ? "Clock Out" : "Clock In"}
        </button>
        <span className="e-clockhero-hint">Selfie verification required</span>
      </div>

      {/* payday — secondary */}
      <ECard className="e-payday" onClick={() => nav.go("payslip", latest.id)}>
        <span className="e-payday-ic"><EIcon name="wallet" size={20} /></span>
        <div className="e-payday-meta">
          <i>Next payday · {PAYDAY.date}</i>
          <b>{peso0(PAYDAY.estNet)} <em>est. net</em></b>
        </div>
        <span className="e-payday-pill">in {PAYDAY.inDays} days</span>
      </ECard>

      {/* quick actions */}
      <div className="e-qa-row">
        <QuickAction icon="leave" label="Request leave" tone="sage" onClick={() => nav.go("leaveRequest")} />
        <QuickAction icon="clock" label="File OT" tone="blue" onClick={() => nav.go("request", "ot")} />
        <QuickAction icon="wallet" label="Reimburse" tone="amber" onClick={() => nav.go("request", "reimb")} />
        <QuickAction icon="doc" label="COE" tone="slate" onClick={() => nav.go("request", "coe")} />
      </div>

      {/* leave balances */}
      <ESection action="Manage" onAction={() => nav.tab("leave")}>Leave balance</ESection>
      <ECard className="e-balcard" onClick={() => nav.tab("leave")}>
        {LEAVE_BAL.map((l) => (
          <div className="e-bal" key={l.code}>
            <div className="e-bal-ring">
              <ERing value={l.used} total={l.total} color={l.color} size={50} />
              <b>{l.total - l.used}</b>
            </div>
            <span>{l.code}</span>
            <i>{l.total - l.used} left</i>
          </div>
        ))}
      </ECard>

      {/* announcements */}
      <ESection>Announcements</ESection>
      {ANNOUNCEMENTS.map((a) => (
        <ECard key={a.id} className="e-ann" onClick={() => nav.go("announcement", a.id)}>
          <span className="e-ann-ic"><EIcon name="megaphone" size={18} /></span>
          <div className="e-ann-body">
            <div className="e-ann-top"><EChip tone="sage">{a.tag}</EChip><span>{a.date}</span></div>
            <b>{a.title}</b>
          </div>
          <EIcon name="chevR" size={17} />
        </ECard>
      ))}

      {/* recent payslips */}
      <ESection action="See all" onAction={() => nav.tab("pay")}>Recent payslips</ESection>
      {PAYSLIPS.slice(0, 2).map((p) => (
        <ECard key={p.id} className="e-psrow" onClick={() => nav.go("payslip", p.id)}>
          <div className="e-psrow-l">
            <span className="e-psrow-ic"><EIcon name="wallet" size={19} /></span>
            <div><b>{p.period}</b><i>Paid {p.payDate}</i></div>
          </div>
          <div className="e-psrow-r"><b>{peso0(p.net)}</b><EIcon name="chevR" size={16} /></div>
        </ECard>
      ))}
    </div>
  );
}

function PayScreen() {
  const nav = React.useContext(ESSNav);
  const [tab, setTab] = React.useState("Payslips");
  const ytdNet = PAYSLIPS.filter(p => p.id !== "ps-13m").reduce((a, b) => a + b.net, 0);
  const ytdTax = PAYSLIPS.reduce((a, b) => a + (b.deductions.find(d => d.label === "Withholding tax")?.amt || 0), 0);
  return (
    <div className="e-stack">
      <div className="e-segment">
        {["Payslips", "Tax forms"].map((t) => (
          <button key={t} className={"e-seg" + (tab === t ? " is-on" : "")} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "Payslips" && <>
        <div className="e-ytd">
          <div><span>Net pay · YTD</span><b>{peso0(ytdNet)}</b></div>
          <div className="e-ytd-div"></div>
          <div><span>Tax withheld · YTD</span><b>{peso0(ytdTax)}</b></div>
        </div>
        {PAYSLIPS.map((p) => (
          <ECard key={p.id} className="e-psrow" onClick={() => nav.go("payslip", p.id)}>
            <div className="e-psrow-l">
              <span className="e-psrow-ic" data-special={p.id === "ps-13m"}>
                <EIcon name={p.id === "ps-13m" ? "coffee" : "wallet"} size={19} />
              </span>
              <div><b>{p.period}</b><i>Paid {p.payDate}</i></div>
            </div>
            <div className="e-psrow-r"><b>{peso0(p.net)}</b><EIcon name="chevR" size={16} /></div>
          </ECard>
        ))}
      </>}

      {tab === "Tax forms" && <>
        <p className="e-hint">Your annual tax certificates, ready to download for filing or loan applications.</p>
        {TAXFORMS.map((f) => (
          <ECard key={f.id} className="e-psrow">
            <div className="e-psrow-l">
              <span className="e-psrow-ic"><EIcon name="doc" size={19} /></span>
              <div><b>{f.name} · {f.year}</b><i>{f.sub}</i></div>
            </div>
            <button className="e-dlbtn" aria-label="Download"><EIcon name="download" size={18} /></button>
          </ECard>
        ))}
      </>}
    </div>
  );
}

function PayslipDetail({ param }) {
  const p = PAYSLIPS.find((x) => x.id === param) || PAYSLIPS[0];
  return (
    <div className="e-stack">
      <div className="e-ps-hero">
        <span>Net pay</span>
        <div className="e-ps-net">{peso(p.net)}</div>
        <div className="e-ps-sub">{p.period} · Paid {p.payDate}</div>
        <EStatus>{p.status}</EStatus>
      </div>

      <ECard className="e-breakdown">
        <div className="e-bd-head"><span>Earnings</span><b>{peso(p.gross)}</b></div>
        {p.earnings.map((e, i) => (
          <div className="e-bd-row" key={i}>
            <div><span>{e.label}</span>{e.sub && <i>{e.sub}</i>}</div>
            <b>{peso(e.amt)}</b>
          </div>
        ))}
      </ECard>

      <ECard className="e-breakdown">
        <div className="e-bd-head"><span>Deductions</span><b className="e-neg">−{peso(p.totalDed)}</b></div>
        {p.deductions.map((d, i) => (
          <div className="e-bd-row" key={i}>
            <div><span>{d.label}</span>{d.sub && <i>{d.sub}</i>}</div>
            <b>−{peso(d.amt)}</b>
          </div>
        ))}
      </ECard>

      <div className="e-ps-total">
        <span>Net pay</span><b>{peso(p.net)}</b>
      </div>
      <p className="e-ps-note"><EIcon name="shield" size={14} /> Deposited to {EMPLOYEE.bank} {EMPLOYEE.bankAcct}</p>

      <EBtn kind="primary" icon="download" full>Download payslip (PDF)</EBtn>
    </div>
  );
}

Object.assign(window, { HomeScreen, PayScreen, PayslipDetail });
