// padmin-pages-2.jsx — Time & Attendance, Leave, Payroll Runs (+ detail), Pay Components, Loans

const T = window.PA;

// ============================ TIME & ATTENDANCE ============================
function TimePage() {
  const nav = React.useContext(PNav);
  const [tab, setTab] = React.useState("DTR Records");
  const [q, setQ] = React.useState("");
  const tabs = ["DTR Records", "OT Applications", "Shift Schedules", "Attendance Logs"];
  const rows = T.DTR.filter(d => q === "" || d.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHead title="Time &amp; Attendance" sub="Daily Time Record management for the current cutoff"
        actions={<Btn kind="primary" icon="plus" onClick={() => nav.go("form", "dtr")}>New Submission</Btn>} />

      <div className="pa-segtabs">
        {tabs.map(t => <button key={t} className={"pa-segtab" + (tab === t ? " is-active" : "")} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === "DTR Records" && (
        <Card pad={false}>
          <div className="pa-filters">
            <Field icon="search" placeholder="Search employee…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select value="Jun 1 – 15, 2026" onChange={() => {}} options={["Jun 1 – 15, 2026", "May 16 – 31, 2026"]} />
            <Select value="All departments" onChange={() => {}} options={["All departments", ...T.DEPARTMENTS.map(d => d.name)]} />
            <Btn kind="ghost" icon="refresh">Refresh</Btn>
          </div>
          <div className="pa-tablefoot pa-tablefoot-top">{rows.length} submissions</div>
          <table className="pa-table">
            <thead><tr><th>Employee</th><th>Cutoff Period</th><th className="pa-num">Days</th><th className="pa-num">Late</th><th className="pa-num">OT (hrs)</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="pa-row">
                  <td><div className="pa-person">
                    <EmpAvatar initials={d.name.split(" ").map(w => w[0]).join("")} id={d.id} size={34} />
                    <div><b>{d.name}</b><i>{d.dept}</i></div>
                  </div></td>
                  <td>{d.cutoff}</td>
                  <td className="pa-num pa-mono">{d.days}</td>
                  <td className="pa-num pa-mono">{d.late || "—"}</td>
                  <td className="pa-num pa-mono">{d.ot}</td>
                  <td><Badge>{d.status}</Badge></td>
                  <td className="pa-rowact">{d.status === "Submitted" ? <Btn kind="ghost">Verify</Btn> : <span className="pa-muted">✓ Verified</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "OT Applications" && (
        <Card title="Overtime applications" sub="Pending pre-approval for the current cutoff">
          <table className="pa-table">
            <thead><tr><th>Employee</th><th>Date</th><th className="pa-num">Hours</th><th>Reason</th><th>Status</th><th></th></tr></thead>
            <tbody>
              <tr className="pa-row"><td><b>Trina Yu</b></td><td>Jun 10</td><td className="pa-num pa-mono">2.5</td><td className="pa-muted">Month-end inventory</td><td><Badge>Approved</Badge></td><td></td></tr>
              <tr className="pa-row"><td><b>Nards Aquino</b></td><td>Jun 11</td><td className="pa-num pa-mono">3.0</td><td className="pa-muted">Shipment dispatch</td><td><Badge>Pending</Badge></td><td className="pa-rowact"><Btn kind="ghost">Review</Btn></td></tr>
              <tr className="pa-row"><td><b>Grace Mendoza</b></td><td>Jun 12</td><td className="pa-num pa-mono">2.0</td><td className="pa-muted">Order backlog</td><td><Badge>Pending</Badge></td><td className="pa-rowact"><Btn kind="ghost">Review</Btn></td></tr>
            </tbody>
          </table>
        </Card>
      )}

      {tab === "Shift Schedules" && (
        <Card title="Shift schedules" sub="Assigned working patterns by group">
          <table className="pa-table">
            <thead><tr><th>Schedule</th><th>Hours</th><th>Rest days</th><th className="pa-num">Assigned</th></tr></thead>
            <tbody>
              <tr className="pa-row"><td><b>Standard Day</b></td><td>9:00 AM – 6:00 PM</td><td>Sat, Sun</td><td className="pa-num">28</td></tr>
              <tr className="pa-row"><td><b>Warehouse AM</b></td><td>6:00 AM – 3:00 PM</td><td>Sun</td><td className="pa-num">5</td></tr>
              <tr className="pa-row"><td><b>Flexible (Eng)</b></td><td>Core 10 AM – 4 PM</td><td>Sat, Sun</td><td className="pa-num">8</td></tr>
            </tbody>
          </table>
        </Card>
      )}

      {tab === "Attendance Logs" && (
        <Card title="Attendance logs" sub="Raw clock-in / clock-out events">
          <table className="pa-table">
            <thead><tr><th>Employee</th><th>Date</th><th>Time In</th><th>Time Out</th><th>Source</th></tr></thead>
            <tbody>
              <tr className="pa-row"><td><b>Trina Yu</b></td><td>Jun 12</td><td className="pa-mono">8:58 AM</td><td className="pa-mono">6:32 PM</td><td><span className="pa-pill">Kiosk · Makati</span></td></tr>
              <tr className="pa-row"><td><b>Grace Mendoza</b></td><td>Jun 12</td><td className="pa-mono">9:14 AM</td><td className="pa-mono">6:05 PM</td><td><span className="pa-pill">Mobile selfie</span></td></tr>
              <tr className="pa-row"><td><b>Nards Aquino</b></td><td>Jun 12</td><td className="pa-mono">5:57 AM</td><td className="pa-mono">3:08 PM</td><td><span className="pa-pill">Kiosk · Cebu</span></td></tr>
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

// ============================ LEAVE ============================
function LeavePage() {
  const nav = React.useContext(PNav);
  const [filter, setFilter] = React.useState("All");
  const rows = T.LEAVE.filter(l => filter === "All" || l.status === filter);
  const pending = T.LEAVE.filter(l => l.status === "Pending").length;
  return (
    <>
      <PageHead title="Leave" sub={pending + " requests awaiting your approval"}
        actions={<Btn kind="primary" icon="plus" onClick={() => nav.go("form", "leave")}>File Leave</Btn>} />

      <div className="pa-stats-4">
        <StatCard label="Pending" value={pending} icon="leave" tone="amber" sub="Needs action" />
        <StatCard label="Approved (Jun)" value="4" icon="check" tone="green" sub="This month" />
        <StatCard label="On Leave Today" value="1" icon="employees" tone="orange" sub="Ben Tiu" />
        <StatCard label="Avg VL Balance" value="9.2" icon="calendar" tone="blue" sub="days remaining" />
      </div>

      <Card pad={false} title="Leave requests" action={
        <div className="pa-seg">
          {["All", "Pending", "Approved"].map(f => (
            <button key={f} className={"pa-seg-btn" + (filter === f ? " is-on" : "")} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
      }>
        <table className="pa-table">
          <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th className="pa-num">Days</th><th>Reason</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((l, i) => (
              <tr key={i} className="pa-row">
                <td><div className="pa-person">
                  <EmpAvatar initials={l.name.split(" ").map(w => w[0]).join("")} id={l.id} size={34} />
                  <div><b>{l.name}</b><i>{l.id}</i></div>
                </div></td>
                <td><span className="pa-saltype">{l.type}</span></td>
                <td>{l.from} – {l.to}</td>
                <td className="pa-num pa-mono">{l.days}</td>
                <td className="pa-muted pa-desc">{l.reason}</td>
                <td><Badge>{l.status}</Badge></td>
                <td className="pa-rowact">
                  {l.status === "Pending"
                    ? <div className="pa-rowbtns"><Btn kind="approve">Approve</Btn><Btn kind="ghost">Deny</Btn></div>
                    : <span className="pa-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ============================ PAYROLL RUNS ============================
function PayrollRunsPage() {
  const nav = React.useContext(PNav);
  const draft = T.PAYROLL_RUNS[0];
  return (
    <>
      <PageHead title="Payroll Runs" sub="Process, review and disburse employee compensation"
        actions={<Btn kind="primary" icon="plus" onClick={() => nav.go("form", "payrun")}>New Run</Btn>} />

      {/* active draft hero */}
      <div className="pa-runhero">
        <div className="pa-runhero-main">
          <div className="pa-runhero-tag"><Badge>Draft</Badge><span className="pa-mono">{draft.id}</span></div>
          <h2>{draft.period}</h2>
          <p>{draft.emp} employees · pays out {draft.payDate}</p>
          <div className="pa-runhero-stats">
            <div><span>Gross</span><b>{T.peso(draft.gross)}</b></div>
            <div><span>Deductions</span><b>{T.peso(draft.deductions)}</b></div>
            <div><span>Net pay</span><b className="pa-accent">{T.peso(draft.net)}</b></div>
          </div>
        </div>
        <div className="pa-runhero-side">
          <div className="pa-runsteps">
            <div className="pa-runstep is-done"><span><PIcon name="check" size={13} /></span> Timesheets imported</div>
            <div className="pa-runstep is-done"><span><PIcon name="check" size={13} /></span> Pay computed</div>
            <div className="pa-runstep is-now"><span>3</span> Review &amp; approve</div>
            <div className="pa-runstep"><span>4</span> Generate bank file</div>
          </div>
          <Btn kind="primary" icon="arrowR" full onClick={() => nav.go("payrun", draft.id)}>Review run</Btn>
        </div>
      </div>

      <Card pad={false} title="Run history">
        <table className="pa-table">
          <thead><tr><th>Run</th><th>Period</th><th>Pay Date</th><th className="pa-num">Employees</th><th className="pa-num">Gross</th><th className="pa-num">Net</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {T.PAYROLL_RUNS.map((r) => (
              <tr key={r.id} className="pa-row pa-row-click" onClick={() => nav.go("payrun", r.id)}>
                <td><b className="pa-mono">{r.id}</b></td>
                <td>{r.period}</td>
                <td className="pa-muted">{r.payDate}</td>
                <td className="pa-num pa-mono">{r.emp}</td>
                <td className="pa-num pa-mono">{T.peso(r.gross)}</td>
                <td className="pa-num pa-mono">{T.peso(r.net)}</td>
                <td><Badge>{r.status}</Badge></td>
                <td className="pa-chev"><PIcon name="chevR" size={16} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ============================ PAYROLL RUN DETAIL ============================
function PayrollRunDetail({ param }) {
  const nav = React.useContext(PNav);
  const run = T.PAYROLL_RUNS.find(r => r.id === param) || T.PAYROLL_RUNS[0];
  const [q, setQ] = React.useState("");
  const slips = T.PAYSLIPS.filter(s => q === "" || s.name.toLowerCase().includes(q.toLowerCase()));
  const isDraft = run.status === "Draft";

  return (
    <>
      <div className="pa-crumb">
        <button onClick={() => nav.go("payruns")}>Payroll Runs</button>
        <PIcon name="chevR" size={14} /><span>{run.id}</span>
      </div>

      <div className="pa-emphead">
        <div className="pa-emphead-id">
          <span className="pa-run-ic"><PIcon name="payruns" size={28} /></span>
          <div>
            <h1>{run.period}</h1>
            <p>Run {run.id} · {run.emp} employees · pays {run.payDate}</p>
            <div className="pa-emphead-badges"><Badge>{run.status}</Badge><span className="pa-pill">Semi-monthly</span></div>
          </div>
        </div>
        <div className="pa-emphead-act">
          <Btn kind="ghost" icon="download">Export</Btn>
          {isDraft
            ? <Btn kind="primary" icon="check" onClick={() => nav.openDrawer("approve-run")}>Approve &amp; lock</Btn>
            : <Btn kind="primary" icon="bankfiles" onClick={() => nav.go("bankfiles")}>Bank file</Btn>}
        </div>
      </div>

      <div className="pa-infogrid">
        <div className="pa-info"><span className="pa-info-l">Gross Pay</span><b className="pa-info-v">{T.peso(run.gross)}</b></div>
        <div className="pa-info"><span className="pa-info-l">Statutory + Tax</span><b className="pa-info-v">{T.peso(run.deductions)}</b></div>
        <div className="pa-info"><span className="pa-info-l">Net Disbursement</span><b className="pa-info-v pa-accent">{T.peso(run.net)}</b></div>
        <div className="pa-info"><span className="pa-info-l">Employees</span><b className="pa-info-v">{run.emp}</b><i className="pa-info-s">2 daily-rate</i></div>
      </div>

      <Card pad={false} title="Payslip register" sub="Per-employee computation — click to drill in" action={
        <Field icon="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      }>
        <table className="pa-table">
          <thead><tr>
            <th>Employee</th><th className="pa-num">Basic</th><th className="pa-num">Allow.</th><th className="pa-num">OT</th>
            <th className="pa-num">Gross</th><th className="pa-num">SSS/PH/HDMF</th><th className="pa-num">Tax</th>
            <th className="pa-num">Loans</th><th className="pa-num">Net Pay</th>
          </tr></thead>
          <tbody>
            {slips.map((s) => (
              <tr key={s.id} className="pa-row pa-row-click" onClick={() => nav.go("employee", s.id)}>
                <td><div className="pa-person">
                  <EmpAvatar initials={s.name.split(" ").map(w => w[0]).join("")} id={s.id} size={32} />
                  <div><b>{s.name}</b><i>{s.dept}</i></div>
                </div></td>
                <td className="pa-num pa-mono">{T.peso(s.basic)}</td>
                <td className="pa-num pa-mono">{T.peso(s.allow)}</td>
                <td className="pa-num pa-mono">{s.ot ? T.peso(s.ot) : "—"}</td>
                <td className="pa-num pa-mono">{T.peso(s.gross)}</td>
                <td className="pa-num pa-mono pa-muted">{T.peso(s.sss + s.philhealth + s.pagibig)}</td>
                <td className="pa-num pa-mono pa-muted">{T.peso(s.tax)}</td>
                <td className="pa-num pa-mono pa-muted">{s.loans ? T.peso(s.loans) : "—"}</td>
                <td className="pa-num pa-mono"><b className="pa-accent">{T.peso(s.net)}</b></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="pa-table-totals">
              <td>Showing top {slips.length} of {run.emp}</td>
              <td className="pa-num pa-mono" colSpan="3"></td>
              <td className="pa-num pa-mono">{T.peso(run.gross)}</td>
              <td className="pa-num pa-mono" colSpan="3">deductions {T.peso(run.deductions)}</td>
              <td className="pa-num pa-mono"><b>{T.peso(run.net)}</b></td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </>
  );
}

// ============================ PAY COMPONENTS ============================
function PayComponentsPage() {
  const nav = React.useContext(PNav);
  const [tab, setTab] = React.useState("Earnings");
  const list = tab === "Earnings" ? T.PAY_COMPONENTS.earnings : T.PAY_COMPONENTS.deductions;
  return (
    <>
      <PageHead title="Pay Components" sub="Reusable earnings, allowances and deductions used across payroll"
        actions={<Btn kind="primary" icon="plus" onClick={() => nav.go("form", "component")}>Add Component</Btn>} />
      <div className="pa-segtabs">
        {["Earnings", "Deductions"].map(t => <button key={t} className={"pa-segtab" + (tab === t ? " is-active" : "")} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      <Card pad={false}>
        <table className="pa-table">
          <thead><tr><th>Component</th><th>Type</th><th>Taxable</th><th>Computation</th><th>Applies to</th><th></th></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.name} className="pa-row">
                <td><b>{c.name}</b></td>
                <td><Badge>{c.type}</Badge></td>
                <td>{c.taxable ? <span className="pa-yes">Taxable</span> : <span className="pa-muted">Non-taxable</span>}</td>
                <td className="pa-muted pa-mono">{c.formula}</td>
                <td className="pa-muted">{c.applies}</td>
                <td className="pa-rowact"><Btn kind="ghost" icon="edit">Edit</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ============================ LOANS ============================
function LoansPage() {
  const nav = React.useContext(PNav);
  const active = T.LOANS.filter(l => l.status === "Active");
  const totalBal = active.reduce((a, l) => a + l.balance, 0);
  const totalAmort = active.reduce((a, l) => a + l.amort, 0);
  return (
    <>
      <PageHead title="Loans" sub="Employee loans and amortizations deducted each payroll"
        actions={<Btn kind="primary" icon="plus" onClick={() => nav.go("form", "loan")}>Add Loan</Btn>} />
      <div className="pa-stats-4">
        <StatCard label="Active Loans" value={active.length} icon="loans" tone="orange" />
        <StatCard label="Outstanding Balance" value={T.peso(totalBal)} icon="wallet" tone="amber" />
        <StatCard label="Per-cutoff Amort." value={T.peso(totalAmort)} icon="components" tone="blue" sub="Auto-deducted" />
        <StatCard label="Settled (YTD)" value="1" icon="check" tone="green" />
      </div>
      <Card pad={false} title="Loan ledger">
        <table className="pa-table">
          <thead><tr><th>Employee</th><th>Type</th><th className="pa-num">Principal</th><th className="pa-num">Balance</th><th className="pa-num">Amortization</th><th>Term</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {T.LOANS.map((l, i) => (
              <tr key={i} className="pa-row">
                <td><div className="pa-person">
                  <EmpAvatar initials={l.name.split(" ").map(w => w[0]).join("")} id={l.id} size={34} />
                  <div><b>{l.name}</b><i>{l.id}</i></div>
                </div></td>
                <td><span className="pa-saltype">{l.type}</span></td>
                <td className="pa-num pa-mono">{T.peso(l.principal)}</td>
                <td className="pa-num pa-mono">{l.balance ? T.peso(l.balance) : "—"}</td>
                <td className="pa-num pa-mono">{l.amort ? T.peso(l.amort) : "—"}</td>
                <td className="pa-muted">{l.term}</td>
                <td><Badge>{l.status}</Badge></td>
                <td className="pa-chev"><PIcon name="chevR" size={16} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

Object.assign(window, { TimePage, LeavePage, PayrollRunsPage, PayrollRunDetail, PayComponentsPage, LoansPage });
