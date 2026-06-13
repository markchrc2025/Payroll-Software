// padmin-pages-1.jsx — Dashboard, Employees (+ detail), Departments, Workforce generic pages

const D = window.PA;

// ============================ DASHBOARD ============================
function DashboardPage() {
  const nav = React.useContext(PNav);
  const max = Math.max(...D.HEADCOUNT.map(h => h.v));
  return (
    <>
      <PageHead
        title="Dashboard"
        sub="Saturday, June 13, 2026"
        actions={<>
          <Btn kind="ghost" icon="download">Export</Btn>
          <Btn kind="primary" icon="payruns" onClick={() => nav.go("payruns")}>Run payroll</Btn>
        </>} />

      <div className="pa-stats-4">
        <StatCard label="Active Employees" value={D.KPI.activeEmp} icon="employees" tone="orange" sub="Non-resigned headcount" delta={3} onClick={() => nav.go("employees")} />
        <StatCard label="Departments" value={D.KPI.departments} icon="departments" tone="green" sub="Across the company" onClick={() => nav.go("departments")} />
        <StatCard label="Branches" value={D.KPI.branches} icon="branches" tone="blue" sub="All locations" onClick={() => nav.go("branches")} />
        <StatCard label="Next Payroll" value={D.peso(D.PAYROLL_RUNS[0].net)} icon="wallet" tone="amber" sub={"Draft · pays " + D.PAYROLL_RUNS[0].payDate} onClick={() => nav.go("payruns")} />
      </div>

      {/* action-needed strip */}
      <Card className="pa-mb" title="Needs your attention" action={<span className="pa-muted">3 items</span>}>
        <ul className="pa-attn">
          <li>
            <span className="pa-attn-ic" data-t="orange"><PIcon name="payruns" size={16} /></span>
            <div><b>June 1–15 payroll is in draft</b><i>36 employees · {D.peso(D.PAYROLL_RUNS[0].gross)} gross — review and approve before Jun 20</i></div>
            <Btn kind="ghost" onClick={() => nav.go("payruns")}>Review</Btn>
          </li>
          <li>
            <span className="pa-attn-ic" data-t="amber"><PIcon name="leave" size={16} /></span>
            <div><b>{D.KPI.pendingLeave} leave requests pending</b><i>Ben Tiu, Trina Yu and Anna Lim are waiting for approval</i></div>
            <Btn kind="ghost" onClick={() => nav.go("leave")}>Open</Btn>
          </li>
          <li>
            <span className="pa-attn-ic" data-t="blue"><PIcon name="time" size={16} /></span>
            <div><b>{D.KPI.pendingDtr} DTR submissions to verify</b><i>Daily-rate staff submitted timesheets for the current cutoff</i></div>
            <Btn kind="ghost" onClick={() => nav.go("time")}>Verify</Btn>
          </li>
        </ul>
      </Card>

      <div className="pa-grid-2">
        {/* headcount chart */}
        <Card title="Headcount" sub="Active employees, last 6 months">
          <div className="pa-chart">
            {D.HEADCOUNT.map((h, i) => (
              <div className="pa-bar-wrap" key={h.m}>
                <div className="pa-bar" style={{ height: (h.v / max * 100) + "%" }} data-last={i === D.HEADCOUNT.length - 1}>
                  <span className="pa-bar-tip">{h.v}</span>
                </div>
                <span className="pa-bar-lbl">{h.m}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* payroll snapshot */}
        <Card title="This month's payroll" sub="Two cutoffs · June 2026">
          <ul className="pa-deflist">
            <li><span>Monthly payroll cost</span><b>{D.peso(D.KPI.monthlyPayroll)}</b></li>
            <li><span>Gross pay (cutoff 1)</span><b>{D.peso(D.PAYROLL_RUNS[0].gross)}</b></li>
            <li><span>Statutory + tax</span><b>{D.peso(D.PAYROLL_RUNS[0].deductions)}</b></li>
            <li><span>Net to disburse</span><b className="pa-accent">{D.peso(D.PAYROLL_RUNS[0].net)}</b></li>
          </ul>
          <div className="pa-runbar">
            <div className="pa-runbar-track">
              <i style={{ width: "76%" }}></i>
            </div>
            <span className="pa-muted">Take-home is <b>76%</b> of gross this cutoff</span>
          </div>
        </Card>
      </div>

      <div className="pa-grid-3">
        {/* on leave */}
        <Card title="On Leave Today" action={<a className="pa-link" onClick={() => nav.go("leave")}>1 person</a>}>
          <ul className="pa-mini">
            <li>
              <EmpAvatar initials="BT" id="E-0017" size={36} />
              <div className="pa-mini-txt"><b>Ben Tiu</b><i>Sick Leave · until Jun 13</i></div>
              <Badge>On Leave</Badge>
            </li>
          </ul>
        </Card>

        {/* birthdays */}
        <Card title="Birthdays This Week" action={<span className="pa-muted">2 coming up</span>}>
          <ul className="pa-mini">
            {D.BIRTHDAYS.map((b) => (
              <li key={b.id}>
                <EmpAvatar initials={b.name.split(" ").map(w => w[0]).join("")} id={b.id} size={36} />
                <div className="pa-mini-txt"><b>{b.name}</b><i>{b.dept}</i></div>
                <span className="pa-date-chip"><b>{b.date.split(" ")[1]}</b><i>{b.day}</i></span>
              </li>
            ))}
          </ul>
        </Card>

        {/* holidays */}
        <Card title="Upcoming Holidays" action={<span className="pa-muted">PH 2026</span>}>
          <ul className="pa-holidays">
            {D.HOLIDAYS.slice(0, 3).map((h) => (
              <li key={h.name}>
                <span className="pa-date-chip"><b>{h.date.split(" ")[1]}</b><i>{h.day}</i></span>
                <div className="pa-mini-txt"><b>{h.name}</b><i>{h.day}, {h.date}</i></div>
                <div className="pa-holiday-meta"><Badge>{h.type}</Badge><i>{h.in}</i></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

// ============================ EMPLOYEES ============================
function EmployeesPage() {
  const nav = React.useContext(PNav);
  const [q, setQ] = React.useState("");
  const [dept, setDept] = React.useState("All departments");
  const [branch, setBranch] = React.useState("All branches");
  const [status, setStatus] = React.useState("All statuses");

  const rows = D.EMP.filter(e =>
    (q === "" || e.name.toLowerCase().includes(q.toLowerCase()) || e.id.toLowerCase().includes(q.toLowerCase())) &&
    (dept === "All departments" || e.dept === dept) &&
    (branch === "All branches" || e.branch === branch) &&
    (status === "All statuses" || e.status === status));

  return (
    <>
      <PageHead
        title="Employees"
        sub={D.KPI.activeEmp + " active employees across " + D.KPI.departments + " departments and " + D.KPI.branches + " branches"}
        actions={<>
          <Btn kind="ghost" icon="upload">Import CSV</Btn>
          <Btn kind="primary" icon="plus" onClick={() => nav.go("new-employee")}>Add Employee</Btn>
        </>} />

      <Card pad={false}>
        <div className="pa-filters">
          <Field icon="search" placeholder="Search by name or ID…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={dept} onChange={setDept} options={["All departments", ...D.DEPARTMENTS.map(d => d.name)]} />
          <Select value={branch} onChange={setBranch} options={["All branches", ...D.BRANCHES.map(b => b.name)]} />
          <Select value={status} onChange={setStatus} options={["All statuses", "Active", "Probationary", "On Leave"]} />
          <Btn kind="ghost" icon="download">Export</Btn>
        </div>

        {rows.length ? (
          <table className="pa-table">
            <thead><tr>
              <th>Employee</th><th>Department</th><th>Position</th><th>Branch</th>
              <th>Salary Type</th><th className="pa-num">Rate</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="pa-row pa-row-click" onClick={() => nav.go("employee", e.id)}>
                  <td><div className="pa-person">
                    <EmpAvatar initials={e.initials} id={e.id} size={36} />
                    <div><b>{e.name}</b><i>{e.id}</i></div>
                  </div></td>
                  <td>{e.dept}</td>
                  <td>{e.position}</td>
                  <td>{e.branch}</td>
                  <td><span className="pa-saltype">{e.salaryType}</span></td>
                  <td className="pa-num pa-mono">{e.salaryType === "Daily" ? D.peso(e.rate) + "/day" : D.peso(e.rate)}</td>
                  <td><Badge>{e.status}</Badge></td>
                  <td className="pa-chev"><PIcon name="chevR" size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="pa-empty">No employees match those filters.</div>}

        <div className="pa-tablefoot">Showing {rows.length} of {D.EMP.length} employees</div>
      </Card>
    </>
  );
}

// ============================ EMPLOYEE DETAIL ============================
function EmployeeDetail({ param }) {
  const nav = React.useContext(PNav);
  const [tab, setTab] = React.useState("Overview");
  const e = D.EMP.find(x => x.id === param);
  if (!e) return <div className="pa-empty">Employee not found.</div>;
  const slip = D.PAYSLIPS.find(p => p.id === e.id);
  const loan = D.LOANS.find(l => l.id === e.id && l.status === "Active");
  const tabs = ["Overview", "Compensation", "Payslips", "Time & Leave", "Documents"];

  const monthly = e.salaryType === "Daily" ? e.rate * 22 : e.rate;

  return (
    <>
      <div className="pa-crumb">
        <button onClick={() => nav.go("employees")}>Employees</button>
        <PIcon name="chevR" size={14} /><span>{e.name}</span>
      </div>

      <div className="pa-emphead">
        <div className="pa-emphead-id">
          <EmpAvatar initials={e.initials} id={e.id} size={64} />
          <div>
            <h1>{e.name}</h1>
            <p>{e.position} · {e.dept}</p>
            <div className="pa-emphead-badges">
              <Badge>{e.status}</Badge>
              <span className="pa-pill"><PIcon name="locations" size={13} /> {e.branch}</span>
              <span className="pa-pill pa-mono">{e.id}</span>
            </div>
          </div>
        </div>
        <div className="pa-emphead-act">
          <Btn kind="ghost" icon="edit" onClick={() => nav.go("new-employee")}>Edit</Btn>
          <Btn kind="primary" icon="wallet" onClick={() => nav.go("payruns")}>View payslip</Btn>
        </div>
      </div>

      <div className="pa-infogrid">
        <div className="pa-info"><span className="pa-info-l">Monthly Rate</span><b className="pa-info-v">{D.peso(monthly)}</b><i className="pa-info-s">{e.salaryType}</i></div>
        <div className="pa-info"><span className="pa-info-l">Net This Cutoff</span><b className="pa-info-v">{slip ? D.peso(slip.net) : "—"}</b><i className="pa-info-s">Jun 1–15</i></div>
        <div className="pa-info"><span className="pa-info-l">Date Hired</span><b className="pa-info-v" style={{ fontSize: 19 }}>{e.hired}</b><i className="pa-info-s">Tenure 2y</i></div>
        <div className="pa-info"><span className="pa-info-l">Active Loan</span><b className="pa-info-v">{loan ? D.peso(loan.balance) : "—"}</b><i className="pa-info-s">{loan ? loan.type : "None"}</i></div>
      </div>

      <div className="pa-tabs">
        {tabs.map(t => <button key={t} className={"pa-tab" + (tab === t ? " is-active" : "")} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === "Overview" && (
        <div className="pa-grid-2">
          <Card title="Personal details">
            <ul className="pa-deflist">
              <li><span>Employee ID</span><b className="pa-mono">{e.id}</b></li>
              <li><span>Full name</span><b>{e.name}</b></li>
              <li><span>Department</span><b>{e.dept}</b></li>
              <li><span>Position</span><b>{e.position}</b></li>
              <li><span>Branch</span><b>{e.branch}</b></li>
              <li><span>Employment status</span><b><Badge>{e.status}</Badge></b></li>
            </ul>
          </Card>
          <Card title="Government IDs">
            <ul className="pa-deflist">
              <li><span>TIN</span><b className="pa-mono">441-{e.id.slice(2)}-001</b></li>
              <li><span>SSS</span><b className="pa-mono">34-{e.id.slice(2)}789-0</b></li>
              <li><span>PhilHealth</span><b className="pa-mono">07-{e.id.slice(2)}5512-3</b></li>
              <li><span>Pag-IBIG</span><b className="pa-mono">1211-{e.id.slice(2)}-4408</b></li>
              <li><span>Bank</span><b>BDO · ****{e.id.slice(2)}</b></li>
            </ul>
          </Card>
        </div>
      )}

      {tab === "Compensation" && (
        <Card title="Compensation structure" sub="Recurring earnings and allowances applied each cutoff">
          <table className="pa-table">
            <thead><tr><th>Component</th><th>Type</th><th>Frequency</th><th className="pa-num">Amount</th></tr></thead>
            <tbody>
              <tr className="pa-row"><td><b>Basic Pay</b></td><td><Badge>Earning</Badge></td><td>Per cutoff</td><td className="pa-num pa-mono">{D.peso(monthly / 2)}</td></tr>
              <tr className="pa-row"><td><b>Transportation Allowance</b></td><td><Badge>Allowance</Badge></td><td>Per cutoff</td><td className="pa-num pa-mono">{D.peso(2000)}</td></tr>
              {monthly > 60000 && <tr className="pa-row"><td><b>Meal Allowance</b></td><td><Badge>Allowance</Badge></td><td>Per cutoff</td><td className="pa-num pa-mono">{D.peso(1500)}</td></tr>}
              <tr className="pa-row"><td><b>13th Month Pay</b></td><td><Badge>Earning</Badge></td><td>Year-end</td><td className="pa-num pa-mono">{D.peso(monthly)}</td></tr>
            </tbody>
          </table>
        </Card>
      )}

      {tab === "Payslips" && (
        slip ? (
          <Card title="Latest payslip" sub="Jun 1–15, 2026 · Draft" action={<Btn kind="ghost" icon="download">PDF</Btn>}>
            <div className="pa-payslip">
              <div className="pa-payslip-col">
                <h4>Earnings</h4>
                <ul className="pa-deflist">
                  <li><span>Basic pay</span><b className="pa-mono">{D.peso(slip.basic)}</b></li>
                  <li><span>Allowances</span><b className="pa-mono">{D.peso(slip.allow)}</b></li>
                  <li><span>Overtime</span><b className="pa-mono">{D.peso(slip.ot)}</b></li>
                  <li className="pa-deflist-total"><span>Gross pay</span><b className="pa-mono">{D.peso(slip.gross)}</b></li>
                </ul>
              </div>
              <div className="pa-payslip-col">
                <h4>Deductions</h4>
                <ul className="pa-deflist">
                  <li><span>SSS</span><b className="pa-mono">{D.peso(slip.sss)}</b></li>
                  <li><span>PhilHealth</span><b className="pa-mono">{D.peso(slip.philhealth)}</b></li>
                  <li><span>Pag-IBIG</span><b className="pa-mono">{D.peso(slip.pagibig)}</b></li>
                  <li><span>Withholding tax</span><b className="pa-mono">{D.peso(slip.tax)}</b></li>
                  <li><span>Loans</span><b className="pa-mono">{D.peso(slip.loans)}</b></li>
                  <li className="pa-deflist-total"><span>Total deductions</span><b className="pa-mono">{D.peso(slip.gross - slip.net)}</b></li>
                </ul>
              </div>
            </div>
            <div className="pa-payslip-net">
              <span>Net pay</span><b>{D.peso(slip.net)}</b>
            </div>
          </Card>
        ) : <div className="pa-empty">No payslip for this employee in the current cutoff.</div>
      )}

      {tab === "Time & Leave" && (
        <div className="pa-grid-2">
          <Card title="Leave balances">
            <ul className="pa-deflist">
              <li><span>Vacation Leave</span><b>9.5 / 15 days</b></li>
              <li><span>Sick Leave</span><b>12 / 15 days</b></li>
              <li><span>Emergency Leave</span><b>3 / 3 days</b></li>
            </ul>
          </Card>
          <Card title="This cutoff (Jun 1–15)">
            <ul className="pa-deflist">
              <li><span>Days present</span><b>11 days</b></li>
              <li><span>Late</span><b>0 instances</b></li>
              <li><span>Overtime</span><b>{slip ? (slip.ot > 0 ? "4.5 hrs" : "0 hrs") : "0 hrs"}</b></li>
              <li><span>Leaves taken</span><b>0 days</b></li>
            </ul>
          </Card>
        </div>
      )}

      {tab === "Documents" && (
        <Card title="Documents" sub="Contracts, IDs and compliance files">
          <ul className="pa-filelist">
            {["Employment Contract.pdf", "BIR Form 2316 (2025).pdf", "Valid ID — Driver's License.jpg", "SSS E-1 Form.pdf"].map((f) => (
              <li key={f}><span className="pa-file-ic"><PIcon name="doc" size={18} /></span><b>{f}</b><Btn kind="ghost" icon="download">Download</Btn></li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

// ============================ DEPARTMENTS ============================
function DepartmentsPage() {
  const nav = React.useContext(PNav);
  return (
    <>
      <PageHead title="Departments" sub={D.DEPARTMENTS.length + " departments organising " + D.KPI.activeEmp + " employees"}
        actions={<Btn kind="primary" icon="plus" onClick={() => nav.go("form", "department")}>Add Department</Btn>} />
      <div className="pa-cardgrid">
        {D.DEPARTMENTS.map((d) => (
          <div className="pa-deptcard" key={d.id}>
            <div className="pa-deptcard-top">
              <span className="pa-deptcard-ic"><PIcon name="departments" size={20} /></span>
              <button className="pa-iconbtn-sm"><PIcon name="more" size={16} /></button>
            </div>
            <h3>{d.name}</h3>
            <p className="pa-muted">Headed by {d.head}</p>
            <div className="pa-deptcard-foot">
              <span className="pa-deptcard-count"><b>{d.count}</b> employees</span>
              <span className="pa-pill"><PIcon name="locations" size={12} /> {d.branch}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ============================ BRANCHES ============================
function BranchesPage() {
  const nav = React.useContext(PNav);
  return (
    <>
      <PageHead title="Branches" sub={D.BRANCHES.length + " branches across the Philippines"}
        actions={<Btn kind="primary" icon="plus" onClick={() => nav.go("form", "branch")}>Add Branch</Btn>} />
      <Card pad={false}>
        <table className="pa-table">
          <thead><tr><th>Branch</th><th>City</th><th>Region</th><th className="pa-num">Headcount</th><th>Address</th><th></th></tr></thead>
          <tbody>
            {D.BRANCHES.map((b) => (
              <tr key={b.id} className="pa-row">
                <td><div className="pa-person"><span className="pa-branch-ic"><PIcon name="branches" size={16} /></span><b>{b.name}</b></div></td>
                <td>{b.city}</td><td>{b.region}</td>
                <td className="pa-num"><b>{b.count}</b></td>
                <td className="pa-muted">{b.address}</td>
                <td className="pa-chev"><PIcon name="chevR" size={16} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ============================ POSITIONS ============================
function PositionsPage() {
  const nav = React.useContext(PNav);
  return (
    <>
      <PageHead title="Positions" sub={D.POSITIONS.length + " job titles defined"}
        actions={<Btn kind="primary" icon="plus" onClick={() => nav.go("form", "position")}>Add Position</Btn>} />
      <Card pad={false}>
        <table className="pa-table">
          <thead><tr><th>Position</th><th>Department</th><th>Level</th><th className="pa-num">Filled</th><th></th></tr></thead>
          <tbody>
            {D.POSITIONS.map((p) => (
              <tr key={p.id} className="pa-row">
                <td><b>{p.title}</b></td><td>{p.dept}</td>
                <td><span className="pa-saltype">{p.level}</span></td>
                <td className="pa-num"><b>{p.count}</b></td>
                <td className="pa-chev"><PIcon name="chevR" size={16} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

Object.assign(window, { DashboardPage, EmployeesPage, EmployeeDetail, DepartmentsPage, BranchesPage, PositionsPage });
