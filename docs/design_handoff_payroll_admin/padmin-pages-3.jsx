// padmin-pages-3.jsx — Gov't Reports, Analytics, Company & Branding, Roles, Holiday Calendar,
//                       Claims, Recruitment, Announcements + page registry & drawers

const G = window.PA;

// ============================ GOV'T REPORTS ============================
function GovReportsPage() {
  return (
    <>
      <PageHead title="Gov't Reports" sub="Statutory remittances and filings for SSS, PhilHealth, Pag-IBIG and BIR"
        actions={<Btn kind="primary" icon="download">Generate Batch</Btn>} />
      <div className="pa-stats-4">
        <StatCard label="SSS — May" value={G.peso(48600)} icon="govreports" tone="orange" sub="Due Jun 30" />
        <StatCard label="PhilHealth — May" value={G.peso(31200)} icon="govreports" tone="green" sub="Due Jun 30" />
        <StatCard label="Pag-IBIG — May" value={G.peso(7200)} icon="govreports" tone="blue" sub="Due Jun 30" />
        <StatCard label="BIR 1601-C" value={G.peso(142800)} icon="govreports" tone="amber" sub="Filed Jun 10" />
      </div>
      <Card pad={false} title="Report register">
        <table className="pa-table">
          <thead><tr><th>Report</th><th>Agency</th><th>Period</th><th>Due Date</th><th className="pa-num">Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {G.GOV_REPORTS.map((r, i) => (
              <tr key={i} className="pa-row">
                <td><div className="pa-person"><span className="pa-branch-ic"><PIcon name="govreports" size={16} /></span><b>{r.name}</b></div></td>
                <td><span className="pa-pill">{r.agency}</span></td>
                <td>{r.period}</td>
                <td className="pa-muted">{r.due}</td>
                <td className="pa-num pa-mono">{r.amount ? G.peso(r.amount) : "—"}</td>
                <td><Badge>{r.status}</Badge></td>
                <td className="pa-rowact"><Btn kind="ghost" icon="download">{r.status === "Filed" ? "Receipt" : "Generate"}</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ============================ ANALYTICS ============================
function AnalyticsPage() {
  const max = Math.max(...G.PAYROLL_RUNS.map(r => r.gross));
  const deptCost = [
    { k: "Engineering", v: 32, c: "#E8693A" }, { k: "Operations", v: 22, c: "#4F9373" },
    { k: "Sales & Mktg", v: 18, c: "#3e63a0" }, { k: "Finance", v: 14, c: "#C7913D" },
    { k: "People & Culture", v: 8, c: "#A0627D" }, { k: "Warehouse", v: 6, c: "#5E7FB1" },
  ];
  const total = deptCost.reduce((a, b) => a + b.v, 0);
  let acc = 0; const R = 54, C = 2 * Math.PI * R;
  return (
    <>
      <PageHead title="Analytics" sub="Workforce and payroll cost trends across the company" />
      <div className="pa-stats-4">
        <StatCard label="Monthly Payroll" value={G.peso(G.KPI.monthlyPayroll)} icon="wallet" tone="orange" delta={1} />
        <StatCard label="Avg Cost / Employee" value={G.peso(Math.round(G.KPI.monthlyPayroll / G.KPI.activeEmp))} icon="employees" tone="blue" />
        <StatCard label="Attrition (YTD)" value="4.2%" icon="movements" tone="amber" delta={-1} />
        <StatCard label="Overtime Cost" value={G.peso(28400)} icon="time" tone="green" sub="This cutoff" />
      </div>
      <div className="pa-grid-2">
        <Card title="Gross payroll" sub="Last 5 cutoffs">
          <div className="pa-chart">
            {[...G.PAYROLL_RUNS].reverse().map((r, i, arr) => (
              <div className="pa-bar-wrap" key={r.id}>
                <div className="pa-bar" style={{ height: (r.gross / max * 100) + "%" }} data-last={i === arr.length - 1}>
                  <span className="pa-bar-tip">{G.peso(r.gross)}</span>
                </div>
                <span className="pa-bar-lbl">{r.period.split(" ")[0]} {r.period.match(/\d+/)[0]}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Payroll cost by department">
          <div className="pa-donut-wrap">
            <svg width="150" height="150" viewBox="0 0 150 150">
              <circle cx="75" cy="75" r={R} fill="none" stroke="#efeae3" strokeWidth="18" />
              {deptCost.map((d, i) => {
                const len = d.v / total * C; const off = acc; acc += len;
                return <circle key={i} cx="75" cy="75" r={R} fill="none" stroke={d.c} strokeWidth="18"
                  strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 75 75)" />;
              })}
              <text x="75" y="71" textAnchor="middle" className="pa-donut-n">100%</text>
              <text x="75" y="90" textAnchor="middle" className="pa-donut-l">of payroll</text>
            </svg>
            <ul className="pa-legend">
              {deptCost.map(d => <li key={d.k}><i style={{ background: d.c }}></i>{d.k}<b>{d.v}%</b></li>)}
            </ul>
          </div>
        </Card>
      </div>
    </>
  );
}

// ============================ COMPANY & BRANDING ============================
function BrandingPage() {
  const c = G.COMPANY;
  return (
    <>
      <PageHead title="Company &amp; Branding" sub="Legal details, payroll defaults and brand identity"
        actions={<Btn kind="primary" icon="check">Save changes</Btn>} />
      <div className="pa-grid-2">
        <Card title="Company profile">
          <div className="pa-formgrid">
            <label className="pa-formrow"><span>Registered name</span><input className="pa-input" defaultValue={c.name} /></label>
            <label className="pa-formrow"><span>Trade name</span><input className="pa-input" defaultValue="Demo Corp" /></label>
            <label className="pa-formrow"><span>TIN</span><input className="pa-input pa-mono" defaultValue={c.tin} /></label>
            <label className="pa-formrow"><span>SSS Employer No.</span><input className="pa-input pa-mono" defaultValue="03-9-1234567-8" /></label>
            <label className="pa-formrow"><span>Industry</span><input className="pa-input" defaultValue="Technology Services" /></label>
            <label className="pa-formrow"><span>Pay schedule</span><input className="pa-input" defaultValue={c.payday} /></label>
          </div>
        </Card>
        <div>
          <Card title="Brand identity">
            <div className="pa-brandrow">
              <span className="pa-brand-tile pa-brand-tile-lg"><SentireMark size={34} /></span>
              <div className="pa-brandrow-txt">
                <b>Company logo</b>
                <p className="pa-muted">Shown on payslips, kiosks and the employee portal.</p>
                <Btn kind="ghost" icon="upload">Upload logo</Btn>
              </div>
            </div>
            <div className="pa-swatchrow">
              <span className="pa-info-l" style={{ display: "block", marginBottom: 10 }}>Brand color</span>
              <div className="pa-swatches">
                {["#E8693A", "#4F9373", "#3e63a0", "#A0627D", "#2A2420"].map((s, i) => (
                  <span key={s} className={"pa-swatch" + (i === 0 ? " is-on" : "")} style={{ background: s }}>{i === 0 && <PIcon name="check" size={15} />}</span>
                ))}
              </div>
            </div>
          </Card>
          <Card title="Payroll defaults" className="pa-mt">
            <ul className="pa-toggles">
              <li><div><b>Auto-compute statutory deductions</b><i>Use 2026 SSS, PhilHealth &amp; Pag-IBIG tables.</i></div><Toggle on /></li>
              <li><div><b>Round net pay to nearest peso</b><i>Avoids centavo amounts on bank files.</i></div><Toggle on /></li>
              <li><div><b>Email payslips on approval</b><i>Notify employees automatically.</i></div><Toggle /></li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

// ============================ ROLES & PERMISSIONS ============================
function RolesPage() {
  const nav = React.useContext(PNav);
  return (
    <>
      <PageHead title="Roles &amp; Permissions" sub="Control what each user can see and do in the workspace"
        actions={<Btn kind="primary" icon="plus" onClick={() => nav.go("form", "role")}>Add Role</Btn>} />
      <Card pad={false}>
        <table className="pa-table">
          <thead><tr><th>Role</th><th>Description</th><th className="pa-num">Permissions</th><th className="pa-num">Users</th><th>Type</th><th></th></tr></thead>
          <tbody>
            {G.ROLES.map((r) => (
              <tr key={r.name} className="pa-row">
                <td><div className="pa-person"><span className="pa-branch-ic"><PIcon name="roles" size={16} /></span><b>{r.name}</b></div></td>
                <td className="pa-muted pa-desc">{r.desc}</td>
                <td className="pa-num"><span className="pa-pill">{r.perms}</span></td>
                <td className="pa-num pa-mono">{r.users}</td>
                <td><Badge>{r.type}</Badge></td>
                <td className="pa-rowact"><Btn kind="ghost">Permissions</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ============================ HOLIDAY CALENDAR ============================
function HolidayPage() {
  const nav = React.useContext(PNav);
  return (
    <>
      <PageHead title="Holiday Calendar" sub="Philippine holidays for 2026 — drives premium pay computation"
        actions={<Btn kind="primary" icon="plus" onClick={() => nav.go("form", "holiday")}>Add Holiday</Btn>} />
      <Card pad={false}>
        <table className="pa-table">
          <thead><tr><th>Date</th><th>Day</th><th>Holiday</th><th>Type</th><th className="pa-num">Premium</th><th></th></tr></thead>
          <tbody>
            {G.HOLIDAYS.map((h) => (
              <tr key={h.name} className="pa-row">
                <td><span className="pa-date-chip"><b>{h.date.split(" ")[1]}</b><i>{h.date.split(" ")[0]}</i></span></td>
                <td>{h.day}</td>
                <td><b>{h.name}</b></td>
                <td><Badge>{h.type}</Badge></td>
                <td className="pa-num pa-mono">{h.type === "Regular" ? "200%" : "130%"}</td>
                <td className="pa-muted">{h.in}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ============================ CLAIMS ============================
function ClaimsPage() {
  const nav = React.useContext(PNav);
  return (
    <>
      <PageHead title="Claims" sub="Reimbursements and benefit claims awaiting review"
        actions={<Btn kind="primary" icon="plus" onClick={() => nav.go("form", "claim")}>New Claim</Btn>} />
      <Card pad={false}>
        <table className="pa-table">
          <thead><tr><th>Employee</th><th>Type</th><th>Description</th><th>Date</th><th className="pa-num">Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {G.CLAIMS.map((c, i) => (
              <tr key={i} className="pa-row">
                <td><div className="pa-person">
                  <EmpAvatar initials={c.name.split(" ").map(w => w[0]).join("")} id={c.id} size={34} />
                  <div><b>{c.name}</b><i>{c.id}</i></div>
                </div></td>
                <td><span className="pa-saltype">{c.type}</span></td>
                <td className="pa-muted pa-desc">{c.desc}</td>
                <td className="pa-muted">{c.date}</td>
                <td className="pa-num pa-mono">{G.peso(c.amount)}</td>
                <td><Badge>{c.status}</Badge></td>
                <td className="pa-rowact">{c.status === "Pending" ? <div className="pa-rowbtns"><Btn kind="approve">Approve</Btn><Btn kind="ghost">Deny</Btn></div> : <span className="pa-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ============================ RECRUITMENT ============================
function RecruitmentPage() {
  const nav = React.useContext(PNav);
  const stages = ["Screening", "Technical", "Final Interview", "Offer"];
  return (
    <>
      <PageHead title="Recruitment" sub="Open requisitions and candidate pipeline"
        actions={<Btn kind="primary" icon="plus" onClick={() => nav.go("form", "job")}>Post Job</Btn>} />
      <div className="pa-pipeline">
        {stages.map((st) => {
          const cands = G.RECRUITS.filter(r => r.stage === st);
          return (
            <div className="pa-pipecol" key={st}>
              <div className="pa-pipehead"><b>{st}</b><span className="pa-pill">{cands.length}</span></div>
              {cands.map((c) => (
                <div className="pa-candcard" key={c.name}>
                  <div className="pa-person">
                    <EmpAvatar initials={c.name.split(" ").map(w => w[0]).join("")} id={c.name} size={34} />
                    <div><b>{c.name}</b><i>{c.role}</i></div>
                  </div>
                  <div className="pa-candmeta"><span className="pa-muted">{c.dept}</span><span className="pa-muted">Applied {c.applied}</span></div>
                </div>
              ))}
              {!cands.length && <div className="pa-pipe-empty">No candidates</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ============================ ANNOUNCEMENTS ============================
function AnnouncementsPage() {
  const nav = React.useContext(PNav);
  return (
    <>
      <PageHead title="Announcements" sub="Company-wide posts shown in the employee portal"
        actions={<Btn kind="primary" icon="plus" onClick={() => nav.go("form", "announcement")}>New Post</Btn>} />
      <div className="pa-annlist">
        {G.ANNOUNCEMENTS.map((a, i) => (
          <div className="pa-anncard" key={i}>
            <span className="pa-ann-ic"><PIcon name="announcements" size={20} /></span>
            <div className="pa-ann-body">
              <div className="pa-ann-top"><h3>{a.title}</h3><span className="pa-pill">{a.tag}</span></div>
              <p className="pa-muted">Posted by {a.by} · {a.date}</p>
            </div>
            <button className="pa-iconbtn-sm"><PIcon name="more" size={16} /></button>
          </div>
        ))}
      </div>
    </>
  );
}

// ============================ PAGE REGISTRY ============================
const GENERICS = {
  locations: { title: "Locations", sub: "Work sites and geofenced clock-in points.", icon: "locations", points: ["Geofence radius per site", "Linked to attendance kiosks", "Map view of all locations"] },
  assets: { title: "Assets", sub: "Company-issued equipment per employee.", icon: "assets", points: ["Laptops, phones & tools", "Assignment & return logs", "Accountability forms"] },
  incidents: { title: "Incidents", sub: "Disciplinary cases and HR incident reports.", icon: "incidents", points: ["Case timeline & status", "Attach evidence & memos", "Resolution tracking"] },
  movements: { title: "Movements", sub: "Promotions, transfers and status changes.", icon: "movements", points: ["Promotion & transfer forms", "Salary adjustment history", "Approval workflow"] },
  requests: { title: "Profile Requests", sub: "Employee-initiated profile change requests.", icon: "requests", points: ["Bank & contact updates", "Document re-uploads", "Review & approve queue"] },
  bankfiles: { title: "Bank Files", sub: "Generate disbursement files per payroll run.", icon: "bankfiles", points: ["BDO, BPI & UnionBank formats", "PESONet & InstaPay batches", "Download & confirm upload"] },
  payrules: { title: "Pay Rules", sub: "Rounding, cutoffs and computation rules.", icon: "payrules", points: ["Cutoff & pay-date schedule", "Tardiness & undertime rules", "Proration settings"] },
  premium: { title: "Premium Rates", sub: "Overtime, night-differential and holiday multipliers.", icon: "premium", points: ["OT, ND & rest-day rates", "Regular & special holiday pay", "Per-branch overrides"] },
  policies: { title: "Leave Policies", sub: "Leave types, accruals and carry-over rules.", icon: "policies", points: ["VL, SL, EL & SPL types", "Accrual & carry-over caps", "Per-position eligibility"] },
  kiosks: { title: "Kiosks", sub: "Tablet clock-in stations per branch.", icon: "kiosks", points: ["Selfie + geofence verification", "Per-branch device pairing", "Offline sync"] },
  ai: { title: "AI Assistant", sub: "Ask questions about payroll, policies and data.", icon: "ai", points: ["“Who's on leave next week?”", "Draft announcements & memos", "Explain payslip computations"] },
};

function GenericRouted({ page }) {
  const g = GENERICS[page];
  const FK = { locations: "location", assets: "asset" };
  return <GenericPage title={g.title} sub={g.sub} icon={g.icon} points={g.points} formKey={FK[page] || "default"} />;
}

window.PAGES = {
  dashboard: DashboardPage,
  employees: EmployeesPage, employee: EmployeeDetail,
  departments: DepartmentsPage, branches: BranchesPage, positions: PositionsPage,
  time: TimePage, leave: LeavePage,
  payruns: PayrollRunsPage, payrun: PayrollRunDetail, components: PayComponentsPage, loans: LoansPage,
  govreports: GovReportsPage, analytics: AnalyticsPage,
  branding: BrandingPage, roles: RolesPage, holiday: HolidayPage,
  claims: ClaimsPage, recruitment: RecruitmentPage, announcements: AnnouncementsPage,
};
window.GENERICS = GENERICS;
window.GenericRouted = GenericRouted;
