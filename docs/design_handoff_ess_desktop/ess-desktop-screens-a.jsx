// ess-desktop-screens-a.jsx — Dashboard + Pay (two-pane payslips)
// Exports to window: DDashboard, DPay

const { peso, peso0, EMPLOYEE, PAYDAY, PAYSLIPS, TAXFORMS, LEAVE_BAL, ATTENDANCE, ANNOUNCEMENTS } = window.ESS;

function dGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function DQuickAction({ icon, label, tone, onClick }) {
  return (
    <button className="d-qa" onClick={onClick}>
      <span className="e-qa-ic" data-tone={tone}><EIcon name={icon} size={20} /></span>
      <span>{label}</span>
    </button>
  );
}

// ============================ DASHBOARD ============================
function DDashboard() {
  const nav = React.useContext(DNav);
  const now = useNow();
  const t = fmtTime(now);
  const clockedIn = nav.clockedIn;
  const latest = PAYSLIPS[0];

  return (
    <React.Fragment>
      <div className="d-pagehead">
        <div>
          <h1>{dGreeting()}, {EMPLOYEE.first} 👋</h1>
          <p>{EMPLOYEE.company} · {ATTENDANCE.today.date}</p>
        </div>
      </div>

      <div className="d-grid d-cols-main">
        <div className="d-col">
          {/* clock hero */}
          <div className="d-clockhero">
            <div className="e-hero-tex" aria-hidden="true"></div>
            <div className="d-clockhero-l">
              <div className="d-clockhero-top">
                <span><EIcon name="cal" size={14} /> {ATTENDANCE.today.date}</span>
                <span className="e-hero-pill">{clockedIn ? "Clocked in" : "Not clocked in"}</span>
              </div>
              <div className="d-clockhero-time">{t.hm}<i>{t.ap}</i></div>
              <div className="d-clockhero-sub">
                {clockedIn
                  ? <React.Fragment><EIcon name="checkCircle" size={14} /> In since {ATTENDANCE.today.in} · {ATTENDANCE.today.schedule}</React.Fragment>
                  : <React.Fragment><EIcon name="clock" size={14} /> Shift {ATTENDANCE.today.schedule}</React.Fragment>}
              </div>
            </div>
            <div className="d-clockhero-r">
              <button className="e-clockhero-btn" onClick={() => nav.openModal(clockedIn ? "clock-out" : "clock-in")}>
                <EIcon name="camera" size={18} />
                {clockedIn ? "Clock Out" : "Clock In"}
              </button>
              <span className="d-clockhero-hint">Selfie verification required</span>
            </div>
          </div>

          {/* quick actions */}
          <div className="d-qa-row">
            <DQuickAction icon="leave" label="Request leave" tone="sage" onClick={() => nav.openModal("leave")} />
            <DQuickAction icon="clock" label="File overtime" tone="blue" onClick={() => nav.go("time")} />
            <DQuickAction icon="wallet" label="Reimbursement" tone="amber" onClick={() => nav.go("pay")} />
            <DQuickAction icon="doc" label="Request COE" tone="slate" onClick={() => nav.go("profile")} />
          </div>

          {/* recent payslips */}
          <ESection action="See all" onAction={() => nav.go("pay")}>Recent payslips</ESection>
          <ECard className="d-tablecard">
            <table className="d-table">
              <thead>
                <tr><th>Pay period</th><th>Paid</th><th>Status</th><th className="d-num-th">Net pay</th><th></th></tr>
              </thead>
              <tbody>
                {PAYSLIPS.slice(0, 3).map((p) => (
                  <tr key={p.id} className="d-rowlink" onClick={() => nav.go("pay", p.id)}>
                    <td><b className="d-cellmain">{p.period}</b></td>
                    <td className="d-cellmuted">{p.payDate}</td>
                    <td><EStatus>{p.status}</EStatus></td>
                    <td className="d-num">{peso0(p.net)}</td>
                    <td className="d-cellchev"><EIcon name="chevR" size={15} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ECard>
        </div>

        <div className="d-col">
          {/* payday */}
          <ECard className="e-payday" onClick={() => nav.go("pay", latest.id)}>
            <span className="e-payday-ic"><EIcon name="wallet" size={20} /></span>
            <div className="e-payday-meta">
              <i>Next payday · {PAYDAY.date}</i>
              <b>{peso0(PAYDAY.estNet)} <em>est. net</em></b>
            </div>
            <span className="e-payday-pill">in {PAYDAY.inDays} days</span>
          </ECard>

          {/* leave balances */}
          <ESection action="Manage" onAction={() => nav.go("leave")}>Leave balance</ESection>
          <ECard className="e-balcard" onClick={() => nav.go("leave")}>
            {LEAVE_BAL.map((l) => (
              <div className="e-bal" key={l.code}>
                <div className="e-bal-ring">
                  <ERing value={l.used} total={l.total} color={l.color} size={52} />
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
            <ECard key={a.id} className="e-ann">
              <span className="e-ann-ic"><EIcon name="megaphone" size={18} /></span>
              <div className="e-ann-body">
                <div className="e-ann-top"><EChip tone="sage">{a.tag}</EChip><span>{a.date}</span></div>
                <b>{a.title}</b>
                <p className="d-ann-p">{a.body}</p>
              </div>
            </ECard>
          ))}
        </div>
      </div>
    </React.Fragment>
  );
}

// ============================ PAY ============================
function DPay({ param }) {
  const [tab, setTab] = React.useState("Payslips");
  const [sel, setSel] = React.useState(param || PAYSLIPS[0].id);
  const p = PAYSLIPS.find((x) => x.id === sel) || PAYSLIPS[0];
  const ytdNet = PAYSLIPS.filter(x => x.id !== "ps-13m").reduce((a, b) => a + b.net, 0);
  const ytdTax = PAYSLIPS.reduce((a, b) => a + (b.deductions.find(d => d.label === "Withholding tax")?.amt || 0), 0);

  return (
    <React.Fragment>
      <div className="d-pagehead">
        <div>
          <h1>Pay</h1>
          <p>Payslips, year-to-date totals, and tax certificates</p>
        </div>
        <div className="e-segment d-segment">
          {["Payslips", "Tax forms"].map((x) => (
            <button key={x} className={"e-seg" + (tab === x ? " is-on" : "")} onClick={() => setTab(x)}>{x}</button>
          ))}
        </div>
      </div>

      {tab === "Tax forms" ? (
        <div className="d-col" style={{ maxWidth: 720 }}>
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
        </div>
      ) : (
        <div className="d-grid d-paygrid">
          {/* list */}
          <div className="d-col">
            <div className="e-ytd">
              <div><span>Net pay · YTD</span><b>{peso0(ytdNet)}</b></div>
              <div className="e-ytd-div"></div>
              <div><span>Tax withheld · YTD</span><b>{peso0(ytdTax)}</b></div>
            </div>
            <div className="d-pslist">
              {PAYSLIPS.map((x) => (
                <button key={x.id} className={"d-psitem" + (x.id === sel ? " is-on" : "")} onClick={() => setSel(x.id)}>
                  <span className="e-psrow-ic" data-special={x.id === "ps-13m"}>
                    <EIcon name={x.id === "ps-13m" ? "coffee" : "wallet"} size={19} />
                  </span>
                  <span className="d-psitem-meta">
                    <b>{x.period}</b>
                    <i>Paid {x.payDate}</i>
                  </span>
                  <b className="d-psitem-amt">{peso0(x.net)}</b>
                </button>
              ))}
            </div>
          </div>

          {/* detail */}
          <ECard className="d-psdetail">
            <div className="d-psd-head">
              <div>
                <span className="d-psd-kicker">Net pay · {p.period}</span>
                <div className="d-psd-net">{peso(p.net)}</div>
                <div className="d-psd-sub">Paid {p.payDate} · <EStatus>{p.status}</EStatus></div>
              </div>
              <EBtn kind="ghost" icon="download">Download PDF</EBtn>
            </div>

            <div className="d-psd-cols">
              <div className="d-psd-col">
                <div className="e-bd-head"><span>Earnings</span><b>{peso(p.gross)}</b></div>
                {p.earnings.map((e, i) => (
                  <div className="e-bd-row" key={i}>
                    <div><span>{e.label}</span>{e.sub && <i>{e.sub}</i>}</div>
                    <b>{peso(e.amt)}</b>
                  </div>
                ))}
              </div>
              <div className="d-psd-col">
                <div className="e-bd-head"><span>Deductions</span><b className="e-neg">−{peso(p.totalDed)}</b></div>
                {p.deductions.map((d, i) => (
                  <div className="e-bd-row" key={i}>
                    <div><span>{d.label}</span>{d.sub && <i>{d.sub}</i>}</div>
                    <b>−{peso(d.amt)}</b>
                  </div>
                ))}
              </div>
            </div>

            <div className="e-ps-total">
              <span>Net pay</span><b>{peso(p.net)}</b>
            </div>
            <p className="e-ps-note"><EIcon name="shield" size={14} /> Deposited to {EMPLOYEE.bank} {EMPLOYEE.bankAcct}</p>
          </ECard>
        </div>
      )}
    </React.Fragment>
  );
}

Object.assign(window, { DDashboard, DPay });
