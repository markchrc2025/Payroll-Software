// ess-desktop-dtr.jsx — DTR: payroll period selection + review & submit
// Exports to window: DDTRPeriods, DDTRDetail

const { EMPLOYEE: DTR_EMP, ATTENDANCE: DTR_ATT, DTR_PERIODS } = window.ESS;

const DTR_TONE = { Open: "amber", Submitted: "sage", Approved: "green", Locked: "slate" };

// ---------- period selection ----------
function DDTRPeriods() {
  const nav = React.useContext(DNav);
  const open = DTR_PERIODS.find((p) => p.status === "Open");
  return (
    <React.Fragment>
      <div className="d-pagehead">
        <div>
          <h1>Submit DTR</h1>
          <p>Select a payroll period to review and submit your daily time record</p>
        </div>
        <EBtn kind="ghost" icon="chevL" onClick={() => nav.go("time")}>Back to Time</EBtn>
      </div>

      {open && (
        <div className="d-dtr-due">
          <EIcon name="clock" size={17} />
          <span><b>{open.label}</b> is open for submission — due <b>{open.due}</b> so payroll can run on {open.payDate}.</span>
          <EBtn kind="primary" onClick={() => nav.go("dtr-detail", open.id)}>Review &amp; submit</EBtn>
        </div>
      )}

      <ESection>Payroll periods · {DTR_EMP.company}</ESection>
      <ECard className="d-tablecard">
        <table className="d-table">
          <thead>
            <tr><th>Period</th><th>Group</th><th>Pay date</th><th>Days</th><th>OT hrs</th><th>DTR status</th><th></th></tr>
          </thead>
          <tbody>
            {DTR_PERIODS.map((p) => (
              <tr key={p.id} className="d-rowlink" onClick={() => nav.go("dtr-detail", p.id)}>
                <td><b className="d-cellmain">{p.label}</b>{p.current && <span className="d-dtr-now">Current</span>}</td>
                <td className="d-cellmuted">{p.group}</td>
                <td className="d-cellmuted">{p.payDate}</td>
                <td className="d-cellmuted">{p.days}</td>
                <td className="d-cellmuted">{p.ot}</td>
                <td><EChip tone={DTR_TONE[p.status]}>{p.status}</EChip></td>
                <td className="d-cellchev"><EIcon name="chevR" size={15} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </ECard>
      <p className="e-ps-note"><EIcon name="shield" size={14} /> Submitted DTRs are routed to {DTR_EMP.manager} for approval before payroll processing.</p>
    </React.Fragment>
  );
}

// ---------- period review + submit ----------
function DDTRDetail({ param }) {
  const nav = React.useContext(DNav);
  const p = DTR_PERIODS.find((x) => x.id === param) || DTR_PERIODS[0];
  const [certified, setCertified] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(p.status !== "Open");
  const status = submitted ? (p.status === "Open" ? "Submitted" : p.status) : "Open";

  return (
    <React.Fragment>
      <div className="d-pagehead">
        <div>
          <h1>DTR · {p.label}</h1>
          <p>{p.group} · Pay date {p.payDate} · <EChip tone={DTR_TONE[status]}>{status}</EChip></p>
        </div>
        <EBtn kind="ghost" icon="chevL" onClick={() => nav.go("dtr")}>All periods</EBtn>
      </div>

      <div className="d-grid d-timegrid">
        <div className="d-col">
          <ESection>Period summary</ESection>
          <div className="d-timestats">
            <ECard className="e-tstat"><b>{p.days}</b><span>Days present</span></ECard>
            <ECard className="e-tstat"><b className="e-amber">{p.lateMins || 0}<i className="d-tstat-unit">min</i></b><span>Tardiness</span></ECard>
            <ECard className="e-tstat"><b>{p.absent}</b><span>Absent</span></ECard>
            <ECard className="e-tstat"><b className="e-sage">{p.ot}<i className="d-tstat-unit">hrs</i></b><span>Overtime</span></ECard>
          </div>

          {submitted ? (
            <div className="d-dtr-submitcard">
              <span className="e-success-ic"><EIcon name="checkCircle" size={40} /></span>
              <b>{status === "Approved" ? "DTR approved" : "DTR submitted"}</b>
              <p>{status === "Approved"
                ? "This period was approved and processed in payroll."
                : "Sent to " + DTR_EMP.manager + " for approval. You'll be notified once it's reviewed."}</p>
            </div>
          ) : (
            <div className="d-dtr-submitcard">
              <label className="d-dtr-cert">
                <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} />
                <span>I certify that the entries above are a true and accurate record of my attendance for {p.label}.</span>
              </label>
              <EBtn kind="primary" icon="check" full disabled={!certified} onClick={() => setSubmitted(true)}>Submit DTR</EBtn>
              <p className="d-dtr-note">Due {p.due} · goes to {DTR_EMP.manager} for approval</p>
            </div>
          )}
        </div>

        <div className="d-col">
          <ESection>Daily time record</ESection>
          <ECard className="d-tablecard">
            <table className="d-table">
              <thead>
                <tr><th>Date</th><th>Time in</th><th>Time out</th><th>OT hrs</th><th>Tardiness</th><th>Status</th></tr>
              </thead>
              <tbody>
                {DTR_ATT.log.map((d, i) => (
                  <tr key={i}>
                    <td><b className="d-cellmain">{d.day}</b></td>
                    <td className={d.in === "—" ? "d-cellmuted" : "d-num-cell"}>{d.in}</td>
                    <td className={d.out === "—" ? "d-cellmuted" : "d-num-cell"}>{d.out}</td>
                    <td className={d.ot ? "d-num-cell e-sage" : "d-cellmuted"}>{d.ot ? d.ot + " h" : "—"}</td>
                    <td className={d.late ? "d-num-cell e-amber" : "d-cellmuted"}>{d.late ? d.late + " min" : "—"}</td>
                    <td><EChip tone={d.tone}>{d.tag}</EChip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ECard>
          <p className="e-hint">Spot an error? File a time-correction request before submitting — corrections after submission go through your manager.</p>
        </div>
      </div>
    </React.Fragment>
  );
}

Object.assign(window, { DDTRPeriods, DDTRDetail });
