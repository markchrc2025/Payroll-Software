// ess-desktop-screens-b.jsx — Leave (+ request modal), Time, Profile
// Exports to window: DLeave, DLeaveModal, DTime, DProfile

const { peso0: dPeso0, EMPLOYEE: DEMP, LEAVE_BAL: DLB, LEAVE_HISTORY: DLH, ATTENDANCE: DATT } = window.ESS;

// ============================ LEAVE ============================
function DLeave() {
  const nav = React.useContext(DNav);
  return (
    <React.Fragment>
      <div className="d-pagehead">
        <div>
          <h1>Leave</h1>
          <p>Balances and request history</p>
        </div>
        <EBtn kind="primary" icon="plus" onClick={() => nav.openModal("leave")}>Request leave</EBtn>
      </div>

      <div className="d-leavebals">
        {DLB.map((l) => (
          <ECard key={l.code} className="e-lbal">
            <div className="e-lbal-ring">
              <ERing value={l.used} total={l.total} color={l.color} size={62} />
              <b>{l.total - l.used}</b>
            </div>
            <div className="e-lbal-meta">
              <b>{l.type}</b>
              <i>{l.used} used · {l.total} total</i>
            </div>
          </ECard>
        ))}
      </div>

      <ESection>Request history</ESection>
      <ECard className="d-tablecard">
        <table className="d-table">
          <thead>
            <tr><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th></tr>
          </thead>
          <tbody>
            {DLH.map((r, i) => (
              <tr key={i}>
                <td><b className="d-cellmain">{r.type}</b></td>
                <td className="d-cellmuted">{r.dates}</td>
                <td className="d-cellmuted">{r.days}</td>
                <td className="d-cellmuted">{r.reason}</td>
                <td><EStatus>{r.status}</EStatus></td>
              </tr>
            ))}
          </tbody>
        </table>
      </ECard>
    </React.Fragment>
  );
}

// ---------- leave request modal ----------
function DLeaveModal() {
  const nav = React.useContext(DNav);
  const [type, setType] = React.useState("Vacation Leave");
  const [reason, setReason] = React.useState("");
  const [done, setDone] = React.useState(false);
  const bal = DLB.find((l) => l.type === type);

  return (
    <div className="d-modal-ov" onClick={(e) => { if (e.target === e.currentTarget) nav.closeModal(); }}>
      <div className="d-modal" role="dialog" aria-label="Request leave">
        {done ? (
          <div className="d-modal-success">
            <span className="e-success-ic"><EIcon name="checkCircle" size={46} /></span>
            <h3>Request submitted</h3>
            <p>Your {type.toLowerCase()} request was sent to {DEMP.manager} for approval. You'll be notified once it's reviewed.</p>
            <EBtn kind="primary" full onClick={() => nav.closeModal()}>Done</EBtn>
          </div>
        ) : (
          <React.Fragment>
            <div className="d-modal-head">
              <b>Request leave</b>
              <button className="d-modal-x" onClick={() => nav.closeModal()} aria-label="Close"><EIcon name="x" size={17} /></button>
            </div>

            <label className="e-flabel">Leave type</label>
            <div className="e-chiprow">
              {DLB.map((l) => (
                <button key={l.code} className={"e-typechip" + (type === l.type ? " is-on" : "")} onClick={() => setType(l.type)}>{l.type}</button>
              ))}
            </div>

            <div className="e-frow">
              <div>
                <label className="e-flabel">From</label>
                <div className="e-finput"><EIcon name="cal" size={17} /><input type="text" placeholder="Jun 20" /></div>
              </div>
              <div>
                <label className="e-flabel">To</label>
                <div className="e-finput"><EIcon name="cal" size={17} /><input type="text" placeholder="Jun 21" /></div>
              </div>
            </div>

            <label className="e-flabel">Reason</label>
            <textarea className="e-ftext" rows="3" placeholder="Add a short note for your manager…"
              value={reason} onChange={(e) => setReason(e.target.value)}></textarea>

            <div className="e-balnote">
              <EIcon name="leave" size={16} />
              <span>{bal ? bal.total - bal.used : 0} days remaining for {type}</span>
            </div>

            <div className="d-modal-actions">
              <EBtn kind="ghost" onClick={() => nav.closeModal()}>Cancel</EBtn>
              <EBtn kind="primary" onClick={() => setDone(true)}>Submit request</EBtn>
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

// ============================ TIME ============================
function DTime() {
  const nav = React.useContext(DNav);
  const now = useNow();
  const tn = fmtTime(now);
  const t = DATT;
  const clockedIn = nav.clockedIn;
  return (
    <React.Fragment>
      <div className="d-pagehead">
        <div>
          <h1>Time &amp; attendance</h1>
          <p>{t.today.date} · Shift {t.today.schedule}</p>
        </div>
        <EBtn kind="primary" icon="doc" onClick={() => nav.go("dtr")}>Submit DTR</EBtn>
      </div>

      <div className="d-grid d-timegrid">
        <div className="d-col">
          <div className="e-clock">
            <div className="e-clock-time">{tn.hm}<span className="d-clock-ap">{tn.ap}</span></div>
            <div className="e-clock-day">{t.today.date}</div>
            <div className="e-clock-sched"><EIcon name="clock" size={15} /> {t.today.schedule}</div>
            <button className={"e-clock-btn" + (clockedIn ? " is-out" : "")} onClick={() => nav.openModal(clockedIn ? "clock-out" : "clock-in")}>
              {clockedIn ? "Clock out" : "Clock in"}
            </button>
            <span className="e-clock-status">{clockedIn ? "Clocked in since " + t.today.in + " · On time" : "Not clocked in · selfie verification required"}</span>
          </div>

          <ESection>This period · {t.period.label}</ESection>
          <div className="d-timestats">
            <ECard className="e-tstat"><b>{t.period.present}</b><span>Present</span></ECard>
            <ECard className="e-tstat"><b className="e-amber">{t.period.late}</b><span>Late</span></ECard>
            <ECard className="e-tstat"><b>{t.period.absent}</b><span>Absent</span></ECard>
            <ECard className="e-tstat"><b className="e-sage">{t.period.otHrs}</b><span>OT hrs</span></ECard>
          </div>
        </div>

        <div className="d-col">
          <ESection>Attendance log</ESection>
          <ECard className="d-tablecard">
            <table className="d-table">
              <thead>
                <tr><th>Date</th><th>Time in</th><th>Time out</th><th>Status</th></tr>
              </thead>
              <tbody>
                {t.log.map((d, i) => (
                  <tr key={i}>
                    <td><b className="d-cellmain">{d.day}</b></td>
                    <td className={d.in === "—" ? "d-cellmuted" : "d-num-cell"}>{d.in}</td>
                    <td className={d.out === "—" ? "d-cellmuted" : "d-num-cell"}>{d.out}</td>
                    <td><EChip tone={d.tone}>{d.tag}</EChip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ECard>
        </div>
      </div>
    </React.Fragment>
  );
}

// ============================ PROFILE ============================
function DProfile() {
  const nav = React.useContext(DNav);
  const e = DEMP;
  const row = (icon, label, value) => (
    <div className="e-prow"><span className="e-prow-ic"><EIcon name={icon} size={17} /></span><span className="e-prow-l">{label}</span><b className="e-prow-v">{value}</b></div>
  );
  return (
    <React.Fragment>
      <div className="d-pagehead">
        <div>
          <h1>Profile</h1>
          <p>Personal records, employment, and government numbers</p>
        </div>
      </div>

      <div className="d-grid d-profilegrid">
        <div className="d-col">
          <ECard className="d-idcard">
            <EAvatar initials={e.initials} size={68} />
            <h3>{e.name}</h3>
            <p>{e.position} · {e.dept}</p>
            <div className="e-phead-tags"><EChip tone="sage">{e.employment}</EChip><EChip tone="slate">{e.id}</EChip></div>
          </ECard>

          <ECard className="e-pcard">
            {row("building", "Company", e.company)}
            {row("user", "Manager", e.manager)}
            {row("cal", "Date hired", e.hired)}
            {row("clock", "Tenure", e.tenure)}
          </ECard>

          <button className="e-logout" onClick={() => nav.go("dashboard")}><EIcon name="logout" size={18} /> Log out</button>
          <p className="e-version">Sentire Payroll · ESS v1.0</p>
        </div>

        <div className="d-col">
          <ESection>Personal</ESection>
          <ECard className="e-pcard">
            {row("mail", "Email", e.email)}
            {row("phone", "Mobile", e.phone)}
            {row("pin", "Address", e.address)}
            {row("cal", "Birthdate", e.birthdate)}
            {row("user", "Civil status", e.civil)}
          </ECard>

          <ESection>Pay &amp; government</ESection>
          <ECard className="e-pcard">
            {row("card", "Bank account", e.bank + " " + e.bankAcct)}
            {row("shield", "SSS", e.gov.SSS)}
            {row("shield", "PhilHealth", e.gov.PhilHealth)}
            {row("shield", "Pag-IBIG", e.gov["Pag-IBIG"])}
            {row("shield", "TIN", e.gov.TIN)}
          </ECard>
        </div>
      </div>
    </React.Fragment>
  );
}

Object.assign(window, { DLeave, DLeaveModal, DTime, DProfile });
