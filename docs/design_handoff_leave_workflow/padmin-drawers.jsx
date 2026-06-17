// padmin-drawers.jsx — full-page forms (registered into PAGES) + genuine overlays

const DR = window.PA;
const EMP_NAMES = DR.EMP.map(e => e.name);
const DEPT_NAMES = DR.DEPARTMENTS.map(d => d.name);
const BRANCH_NAMES = DR.BRANCHES.map(b => b.name);
const POS_TITLES = DR.POSITIONS.map(p => p.title);

// ================= FORM PRIMITIVES =================
// field: { k, label, type, options?, ph?, hint?, req?, span?, rows? }
// types: text | email | tel | date | number | money | select | textarea | segmented
function FieldRenderer({ field, value, onChange }) {
  const f = field;

  // ---- structural / non-input blocks ----
  if (f.type === "section") {
    return <div className="pa-fsection span2">{f.label}</div>;
  }
  if (f.type === "note") {
    return (
      <div className="pa-fnote span2">
        <span className="pa-fnote-ic">?</span>
        <div>{(f.lines || [f.label]).map((ln, i) => <p key={i}>{ln}</p>)}</div>
      </div>
    );
  }
  if (f.type === "photo") {
    return (
      <div className="pa-fphoto span2">
        <div className="pa-fphoto-tile"><PIcon name="employees" size={30} /></div>
        <button type="button" className="pa-fphoto-btn">Change photo</button>
      </div>
    );
  }
  if (f.type === "toggle") {
    return (
      <div className="pa-ftoggle span2">
        <span>{f.label}</span>
        <Toggle on={!!value} onChange={onChange} />
      </div>
    );
  }
  if (f.type === "adder") {
    return (
      <div className="pa-fadder span2">
        <div className="pa-fadder-head">
          <span>{f.label}</span>
          <button type="button" className="pa-addbtn" aria-label={"Add " + f.label}><PIcon name="plus" size={15} /></button>
        </div>
        <div className="pa-fadder-empty">N/A</div>
      </div>
    );
  }

  const common = { className: "pa-input", value: value ?? "", onChange: (e) => onChange(e.target.value), placeholder: f.ph };
  let control;
  if (f.type === "select") {
    const sel = (
      <select className="pa-input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>{f.ph || "Select…"}</option>
        {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
    control = f.add
      ? (<div className="pa-selectadd">{sel}<button type="button" className="pa-addbtn sm" aria-label={"Add " + f.label}><PIcon name="plus" size={14} /></button></div>)
      : sel;
  } else if (f.type === "textarea") {
    control = <textarea {...common} rows={f.rows || 3}></textarea>;
  } else if (f.type === "segmented") {
    control = (
      <div className="pa-segfield">
        {f.options.map((o) => (
          <button type="button" key={o} className={value === o ? "is-on" : ""} onClick={() => onChange(o)}>{o}</button>
        ))}
      </div>
    );
  } else if (f.type === "money") {
    control = <div className="pa-money"><input className="pa-input" type="text" inputMode="numeric" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={f.ph || "0.00"} /></div>;
  } else {
    control = <input {...common} type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text"} />;
  }
  return (
    <div className={"pa-fld" + (f.span === 2 ? " span2" : "")}>
      <label className="pa-flabel">{f.label}{f.req && <span className="pa-req">*</span>}</label>
      {control}
      {f.hint && <span className="pa-fhint">{f.hint}</span>}
    </div>
  );
}

function FieldGrid({ fields, values, set }) {
  return (
    <div className="pa-fgrid">
      {fields.map((f, i) => <FieldRenderer key={f.k || f.type + "-" + i} field={f} value={values[f.k]} onChange={(v) => set(f.k, v)} />)}
    </div>
  );
}

function useForm(initial) {
  const [values, setValues] = React.useState(initial || {});
  const set = React.useCallback((k, v) => setValues((p) => ({ ...p, [k]: v })), []);
  const reset = React.useCallback(() => setValues(initial || {}), []);
  return [values, set, reset];
}

function navLabel(id) {
  const found = window.NAV_GROUPS.flatMap(g => g.items).find(([i]) => i === id);
  return found ? found[1] : "Back";
}

// ================= ADD EMPLOYEE — FULL PAGE WIZARD =================
const NATIONS = ["Philippines", "United States", "Singapore", "Japan", "Australia", "Other"];
const PRIVACY = ["Not Accessible", "Employee", "Manager"];
const ETHNICITIES = ["Tagalog", "Cebuano", "Ilocano", "Bicolano", "Waray", "Other"];
const RELIGIONS = ["Roman Catholic", "Iglesia ni Cristo", "Islam", "Protestant", "Born Again", "Other"];
const SENSE = ["Normal", "Mild", "Moderate", "Severe"];
const LIMB = ["Normal", "Limited", "None"];

const EMP_STEPS = [
  { id: "Personal", sub: "Identity & IDs", fields: [
    { type: "photo" },
    { k: "empid", label: "ID", type: "text", ph: "E-0025", req: true, span: 2 },
    { k: "first", label: "First Name", type: "text", ph: "Juan", req: true },
    { k: "middle", label: "Middle Name", type: "text", ph: "Ponce" },
    { k: "last", label: "Last Name", type: "text", ph: "dela Cruz", req: true, span: 2 },
    { k: "gender", label: "Gender", type: "select", options: ["Female", "Male", "Other"], req: true, ph: "Select…", span: 2 },
    { k: "birth", label: "Birth Date", type: "date", req: true, span: 2 },
    { k: "nationality", label: "Nationality", type: "select", options: NATIONS, ph: "Select…", span: 2 },
    { k: "natid", label: "National ID", type: "text", ph: "0000-0000-0000", req: true },
    { k: "passport", label: "Passport", type: "text", ph: "P0000000A" },
    { k: "ethnicity", label: "Ethnicity", type: "select", add: true, options: ETHNICITIES, ph: "Select…" },
    { k: "religion", label: "Religion", type: "select", add: true, options: RELIGIONS, ph: "Select…" },
    { k: "allowUpdate", type: "toggle", label: "Allow employee to update profile by 2026-06-20" },
  ]},
  { id: "Government IDs", sub: "SSS, PhilHealth, Pag-IBIG, TIN", fields: [
    { k: "sss", label: "SSS", type: "text", ph: "00-0000000-0", span: 2 },
    { k: "philhealth", label: "PhilHealth", type: "text", ph: "00-000000000-0", span: 2 },
    { k: "pagibig", label: "Pag-IBIG", type: "text", ph: "0000-0000-0000", span: 2 },
    { k: "tin", label: "TIN", type: "text", ph: "000-000-000-000", span: 2 },
  ]},
  { id: "Job", sub: "Placement & terms", fields: [
    { k: "dateJoined", label: "Date Joined", type: "date", req: true },
    { k: "endProbation", label: "End of Probation", type: "date" },
    { k: "timeClock", type: "toggle", label: "Time Clock Needed" },
    { type: "section", label: "Placement" },
    { k: "placeEffective", label: "Effective Date", type: "date", req: true, span: 2 },
    { k: "position", label: "Job Position", type: "select", add: true, options: POS_TITLES, req: true, ph: "Select…", span: 2 },
    { k: "lineManager", label: "Line Manager", type: "select", options: EMP_NAMES, ph: "Select…", span: 2 },
    { k: "dept", label: "Department", type: "select", add: true, options: DEPT_NAMES, ph: "Select…", span: 2 },
    { k: "branch", label: "Branch", type: "select", add: true, options: BRANCH_NAMES, ph: "Select…", span: 2 },
    { k: "level", label: "Level", type: "select", add: true, options: ["Entry", "Junior", "Mid", "Senior", "Lead", "Manager"], ph: "Select…", span: 2 },
    { type: "section", label: "Employment Terms" },
    { k: "termEffective", label: "Effective Date", type: "date", req: true, span: 2 },
    { k: "jobType", label: "Job Type", type: "select", options: ["Permanent", "Contract", "Probationary", "Casual", "Project-based"], ph: "Permanent" },
    { k: "jobDesc", label: "Description", type: "select", options: ["Confirmed", "Probation", "Resigned", "Terminated"], ph: "Confirmed" },
    { k: "leaveWorkflow", label: "Leave Workflow", type: "select", add: true, options: ["DEFAULT", "Executive", "Field Staff"], ph: "DEFAULT", span: 2 },
    { k: "workday", label: "Workday", type: "select", add: true, options: ["DEFAULT", "Mon–Fri", "Shift"], ph: "DEFAULT", span: 2 },
    { k: "holiday", label: "Holiday", type: "select", add: true, options: ["DEFAULT", "NCR", "Regional"], ph: "DEFAULT", span: 2 },
    { k: "termStart", label: "Term Start", type: "date" },
    { k: "termEnd", label: "Term End", type: "date" },
  ]},
  { id: "Salary", sub: "Pay & payment", fields: [
    { type: "section", label: "Salary" },
    { k: "salEffective", label: "Effective Date", type: "date", req: true, span: 2 },
    { k: "basicSalary", label: "Basic Salary", type: "money", ph: "45,000" },
    { k: "currency", label: "Currency", type: "select", options: ["PHP", "USD", "SGD"], ph: "PHP" },
    { type: "note", label: "For hourly rate, you may use Earning." },
    { k: "nextReview", label: "Next Review Date", type: "date", span: 2 },
    { k: "earning", type: "adder", label: "Earning" },
    { k: "deduction", type: "adder", label: "Deduction" },
    { k: "bonus", type: "adder", label: "Bonus" },
    { k: "statutory", type: "adder", label: "Statutory Contribution" },
    { type: "section", label: "Payment" },
    { k: "bank", label: "Bank", type: "select", add: true, options: ["BDO", "BPI", "UnionBank", "Metrobank", "GCash"], ph: "Select…" },
    { k: "iban", label: "IBAN / Bank Account", type: "text", ph: "0000 0000 0000" },
    { k: "payCycle", label: "Pay Cycle", type: "select", options: ["Monthly", "Semi-monthly", "Weekly"], ph: "Monthly" },
    { k: "payMethod", label: "Method", type: "select", options: ["Cash", "Bank transfer", "Check", "GCash"], ph: "Cash" },
  ]},
  { id: "Family", sub: "Spouse & children", fields: [
    { type: "section", label: "Spouse" },
    { k: "maritalStatus", label: "Marital Status", type: "select", options: ["Single", "Married", "Widowed", "Separated"], ph: "Single", span: 2 },
    { k: "spouseWorking", type: "toggle", label: "Spouse Working" },
    { k: "spFirst", label: "First Name", type: "text", ph: "First name" },
    { k: "spMiddle", label: "Middle Name", type: "text", ph: "Middle name" },
    { k: "spLast", label: "Last Name", type: "text", ph: "Last name", span: 2 },
    { k: "spBirth", label: "Birth Date", type: "date", span: 2 },
    { k: "spNationality", label: "Nationality", type: "select", options: NATIONS, ph: "Philippines", span: 2 },
    { k: "spNatid", label: "National ID", type: "text", ph: "0000-0000-0000" },
    { k: "spPassport", label: "Passport", type: "text", ph: "P0000000A" },
    { k: "spEthnicity", label: "Ethnicity", type: "select", add: true, options: ETHNICITIES, ph: "Select…" },
    { k: "spReligion", label: "Religion", type: "select", add: true, options: RELIGIONS, ph: "Select…" },
    { type: "section", label: "Children" },
    { k: "numChildren", label: "Number of Children", type: "number", ph: "0", span: 2 },
  ]},
  { id: "Contact", sub: "Web, phone, address", fields: [
    { type: "section", label: "Web" },
    { k: "email", label: "Email (for Employee Web Account invitation)", type: "email", ph: "name@email.com", span: 2 },
    { k: "blog", label: "Blog / Homepage", type: "text", ph: "https://", span: 2 },
    { type: "section", label: "Phone" },
    { k: "officePhone", label: "Office Phone", type: "tel", ph: "+63 2 0000 0000", span: 2 },
    { k: "mobilePhone", label: "Mobile Phone", type: "tel", ph: "+63 9XX XXX XXXX", span: 2 },
    { k: "housePhone", label: "House Phone", type: "tel", ph: "+63 2 0000 0000", span: 2 },
    { type: "section", label: "Address" },
    { k: "address1", label: "Address1", type: "text", ph: "House no., street", span: 2 },
    { k: "address2", label: "Address2", type: "text", ph: "Barangay, district", span: 2 },
    { k: "city", label: "City", type: "text", ph: "City" },
    { k: "postcode", label: "Postcode", type: "text", ph: "0000" },
    { k: "state", label: "State", type: "text", ph: "Province" },
    { k: "country", label: "Country / Region", type: "select", options: NATIONS, ph: "Philippines" },
  ]},
  { id: "Health", sub: "Physical & senses", fields: [
    { type: "section", label: "Physical" },
    { k: "height", label: "Height (cm)", type: "number", ph: "170" },
    { k: "weight", label: "Weight (kg)", type: "number", ph: "65" },
    { k: "bloodType", label: "Blood Type", type: "select", options: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"], ph: "Select…", span: 2 },
    { type: "section", label: "Vision" },
    { k: "visionL", label: "Left", type: "select", options: SENSE, ph: "Select…" },
    { k: "visionR", label: "Right", type: "select", options: SENSE, ph: "Select…" },
    { type: "section", label: "Hearing" },
    { k: "hearingL", label: "Left", type: "select", options: SENSE, ph: "Select…" },
    { k: "hearingR", label: "Right", type: "select", options: SENSE, ph: "Select…" },
    { type: "section", label: "Hand" },
    { k: "handL", label: "Left", type: "select", options: LIMB, ph: "Select…" },
    { k: "handR", label: "Right", type: "select", options: LIMB, ph: "Select…" },
    { type: "section", label: "Leg" },
    { k: "legL", label: "Left", type: "select", options: LIMB, ph: "Select…" },
    { k: "legR", label: "Right", type: "select", options: LIMB, ph: "Select…" },
  ]},
  { id: "Directory", sub: "Access & privacy", fields: [
    { type: "section", label: "Access Right" },
    { k: "empRole", label: "Employee Role", type: "select", options: ["Guest", "Employee", "Manager", "Admin"], ph: "Employee", span: 2 },
    { type: "note", lines: [
      "Guest: No access to the Employee Directory.",
      "Employee: Access to Privacy Level marked as Employee.",
      "Manager: Access to Privacy Level marked as either Employee or Manager.",
    ]},
    { type: "section", label: "Privacy Level" },
    { k: "pvEmail", label: "Email", type: "select", options: PRIVACY, ph: "Employee" },
    { k: "pvBlog", label: "Blog / Homepage", type: "select", options: PRIVACY, ph: "Employee" },
    { k: "pvOfficePhone", label: "Office Phone", type: "select", options: PRIVACY, ph: "Employee" },
    { k: "pvMobilePhone", label: "Mobile Phone", type: "select", options: PRIVACY, ph: "Employee" },
    { k: "pvHousePhone", label: "House Phone", type: "select", options: PRIVACY, ph: "Not Accessible" },
    { k: "pvAddress", label: "Address", type: "select", options: PRIVACY, ph: "Not Accessible" },
    { k: "pvEmergency", label: "In Case of Emergency", type: "select", options: PRIVACY, ph: "Manager" },
    { k: "pvBirthday", label: "Birthday", type: "select", options: PRIVACY, ph: "Employee" },
    { k: "pvFamilyBirthday", label: "Family Birthday", type: "select", options: PRIVACY, ph: "Employee" },
    { k: "pvAnniversary", label: "Anniversary", type: "select", options: PRIVACY, ph: "Employee" },
  ]},
  { id: "Others", sub: "Remarks", fields: [
    { type: "section", label: "Remark" },
    { k: "remark", label: "Remark", type: "textarea", ph: "Remark (2000 characters max)", rows: 6, span: 2 },
  ]},
];

function AddEmployeePage() {
  const nav = React.useContext(PNav);
  const [step, setStep] = React.useState(0);
  const [values, set, reset] = useForm({
    gender: "Female", nationality: "Philippines", jobType: "Permanent", jobDesc: "Confirmed",
    leaveWorkflow: "DEFAULT", workday: "DEFAULT", holiday: "DEFAULT", currency: "PHP",
    payCycle: "Monthly", payMethod: "Cash", maritalStatus: "Single", spNationality: "Philippines",
    country: "Philippines", empRole: "Employee", numChildren: "0", timeClock: true,
    pvEmail: "Employee", pvBlog: "Employee", pvOfficePhone: "Employee", pvMobilePhone: "Employee",
    pvHousePhone: "Not Accessible", pvAddress: "Not Accessible", pvEmergency: "Manager",
    pvBirthday: "Employee", pvFamilyBirthday: "Employee", pvAnniversary: "Employee",
  });
  const [saved, setSaved] = React.useState(false);
  const last = step === EMP_STEPS.length - 1;
  const cur = EMP_STEPS[step];
  const fullName = [values.first, values.last].filter(Boolean).join(" ") || "New employee";

  if (saved) {
    return (
      <>
        <div className="pa-crumb">
          <button onClick={() => nav.go("employees")}>Employees</button>
          <PIcon name="chevR" size={14} /><span>Add Employee</span>
        </div>
        <div className="pa-formdone">
          <Card>
            <SuccessState title={fullName + " created"} sub={(values.position || "Employee") + " · " + (values.dept || "—") + " · joined " + (values.dateJoined || "—")} />
            <ul className="pa-deflist">
              <li><span>Employee ID</span><b className="pa-mono">{values.empid || "E-0025"}</b></li>
              <li><span>Job type</span><b>{values.jobType || "Permanent"}</b></li>
              <li><span>Basic salary</span><b className="pa-mono">{values.basicSalary ? "₱" + values.basicSalary : "—"}</b></li>
              <li><span>Status</span><b>{values.jobDesc || "Probationary"}</b></li>
            </ul>
            <div className="pa-formbar">
              <div className="pa-formbar-btns">
                <Btn kind="ghost" onClick={() => { reset(); setStep(0); setSaved(false); }}>Add another</Btn>
                <Btn kind="primary" icon="arrowR" onClick={() => nav.go("employees")}>Back to Employees</Btn>
              </div>
            </div>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="pa-crumb">
        <button onClick={() => nav.go("employees")}>Employees</button>
        <PIcon name="chevR" size={14} /><span>Add Employee</span>
      </div>
      <PageHead title="Add Employee" sub="Create a complete employee record" />
      <div className="pa-wizardpage">
        <div className="pa-vsteps">
          {EMP_STEPS.map((s, i) => (
            <button key={s.id} className={"pa-vstep" + (i === step ? " is-now" : i < step ? " is-done" : "")}
              disabled={i > step} onClick={() => i < step && setStep(i)}>
              <span className="pa-step-num">{i < step ? <PIcon name="check" size={13} /> : i + 1}</span>
              <span className="pa-vstep-txt"><b>{s.id}</b><i>{s.sub}</i></span>
            </button>
          ))}
        </div>
        <div>
          <Card title={cur.id + " details"}>
            <FieldGrid fields={cur.fields} values={values} set={set} />
          </Card>
          <div className="pa-formbar">
            <span className="pa-wizard-count">Step {step + 1} of {EMP_STEPS.length}</span>
            <div className="pa-formbar-btns">
              {step > 0 && <Btn kind="ghost" icon="chevL" onClick={() => setStep(step - 1)}>Back</Btn>}
              <Btn kind="ghost" onClick={() => nav.go("employees")}>Cancel</Btn>
              {last
                ? <Btn kind="primary" icon="check" onClick={() => setSaved(true)}>Save employee</Btn>
                : <Btn kind="primary" icon="arrowR" onClick={() => setStep(step + 1)}>Continue</Btn>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ================= SCHEMA-DRIVEN FORMS =================
const FORM_SCHEMAS = {
  department: { title: "Add Department", sub: "Create an organizational unit", back: "departments", sections: [
    { fields: [
      { k: "name", label: "Department name", type: "text", ph: "e.g. Engineering", req: true, span: 2 },
      { k: "code", label: "Code", type: "text", ph: "ENG" },
      { k: "branch", label: "Primary branch", type: "select", options: BRANCH_NAMES, ph: "Select branch" },
      { k: "head", label: "Department head", type: "select", options: EMP_NAMES, ph: "Select employee", span: 2 },
      { k: "desc", label: "Description", type: "textarea", ph: "What this department does…", span: 2 },
    ]},
  ]},
  branch: { title: "Add Branch", sub: "Register a work location", back: "branches", sections: [
    { fields: [
      { k: "name", label: "Branch name", type: "text", ph: "e.g. Makati HQ", req: true },
      { k: "code", label: "Code", type: "text", ph: "MKT" },
      { k: "region", label: "Region", type: "select", options: ["NCR", "Region III", "Region IV-A", "Region VII", "Region XI"], ph: "Select…" },
      { k: "city", label: "City / Municipality", type: "text", ph: "Makati City" },
      { k: "address", label: "Address", type: "textarea", ph: "Street, building, city", span: 2 },
      { k: "tin", label: "Branch TIN (RDO)", type: "text", ph: "000-000-000-001", span: 2 },
    ]},
  ]},
  position: { title: "Add Position", sub: "Define a job title", back: "positions", sections: [
    { fields: [
      { k: "title", label: "Position title", type: "text", ph: "e.g. Software Engineer", req: true, span: 2 },
      { k: "dept", label: "Department", type: "select", options: DEPT_NAMES, ph: "Select department" },
      { k: "level", label: "Level", type: "select", options: ["Rank & File", "Professional", "Senior", "Supervisor", "Manager", "Director"], ph: "Select…" },
      { k: "headcount", label: "Approved headcount", type: "number", ph: "5" },
      { k: "salaryBand", label: "Salary band", type: "text", ph: "₱40,000 – ₱70,000" },
      { k: "desc", label: "Job description", type: "textarea", ph: "Key responsibilities…", span: 2 },
    ]},
  ]},
  location: { title: "Add Location", sub: "A geofenced clock-in site", back: "locations", sections: [
    { fields: [
      { k: "name", label: "Location name", type: "text", ph: "e.g. Makati HQ — Lobby", req: true, span: 2 },
      { k: "branch", label: "Branch", type: "select", options: BRANCH_NAMES, ph: "Select branch" },
      { k: "radius", label: "Geofence radius (m)", type: "number", ph: "100" },
      { k: "address", label: "Address", type: "textarea", ph: "Street, city", span: 2 },
      { k: "coords", label: "Coordinates", type: "text", ph: "14.5547, 121.0244", hint: "Latitude, longitude", span: 2 },
    ]},
  ]},
  loan: { title: "Add Loan", sub: "Set up an employee loan & amortization", back: "loans", sections: [
    { fields: [
      { k: "employee", label: "Employee", type: "select", options: EMP_NAMES, req: true, ph: "Select employee", span: 2 },
      { k: "type", label: "Loan type", type: "select", options: ["Company Loan", "SSS Salary Loan", "Pag-IBIG MPL", "SSS Calamity Loan"], req: true, ph: "Select…" },
      { k: "principal", label: "Principal amount", type: "money", ph: "120,000", req: true },
      { k: "term", label: "Term (months)", type: "number", ph: "24" },
      { k: "amort", label: "Per-cutoff amortization", type: "money", ph: "4,000", hint: "Auto-deducted each payroll" },
      { k: "start", label: "First deduction", type: "date" },
      { k: "ref", label: "Reference / loan no.", type: "text", ph: "Optional" },
    ]},
  ]},
  component: { title: "Add Pay Component", sub: "An earning, allowance or deduction", back: "components", sections: [
    { fields: [
      { k: "name", label: "Component name", type: "text", ph: "e.g. Rice Allowance", req: true, span: 2 },
      { k: "category", label: "Category", type: "segmented", options: ["Earning", "Deduction"] },
      { k: "taxable", label: "Tax treatment", type: "segmented", options: ["Taxable", "Non-taxable"] },
      { k: "method", label: "Computation", type: "select", options: ["Fixed amount", "Percentage of basic", "Per-hour rate", "Custom formula"], ph: "Select…" },
      { k: "amount", label: "Amount / rate", type: "money", ph: "1,500" },
      { k: "applies", label: "Applies to", type: "select", options: ["All employees", "Monthly only", "Daily only", "Selected employees", "DTR-based"], ph: "Select…", span: 2 },
    ]},
  ]},
  leave: { title: "File Leave", sub: "Submit a leave request", back: "leave", sections: [
    { fields: [
      { k: "employee", label: "Employee", type: "select", options: EMP_NAMES, req: true, ph: "Select employee", span: 2 },
      { k: "type", label: "Leave type", type: "select", options: ["Vacation Leave", "Sick Leave", "Emergency Leave", "Maternity Leave", "Paternity Leave", "Solo Parent Leave"], req: true, ph: "Select…" },
      { k: "halfday", label: "Duration", type: "segmented", options: ["Whole day", "Half day"] },
      { k: "from", label: "From", type: "date", req: true },
      { k: "to", label: "To", type: "date", req: true },
      { k: "reason", label: "Reason", type: "textarea", ph: "Reason for leave…", span: 2 },
    ]},
  ]},
  claim: { title: "New Claim", sub: "File a reimbursement or benefit claim", back: "claims", sections: [
    { fields: [
      { k: "employee", label: "Employee", type: "select", options: EMP_NAMES, req: true, ph: "Select employee", span: 2 },
      { k: "type", label: "Claim type", type: "select", options: ["Reimbursement", "Medical", "Travel", "Representation"], req: true, ph: "Select…" },
      { k: "amount", label: "Amount", type: "money", ph: "1,850", req: true },
      { k: "date", label: "Date incurred", type: "date" },
      { k: "desc", label: "Description", type: "textarea", ph: "What is being claimed…", span: 2 },
      { k: "receipt", label: "Receipt / attachment", type: "text", ph: "Upload file…", hint: "OR / official receipt", span: 2 },
    ]},
  ]},
  role: { title: "Add Role", sub: "Define an access role", back: "roles", sections: [
    { fields: [
      { k: "name", label: "Role name", type: "text", ph: "e.g. Branch Manager", req: true, span: 2 },
      { k: "template", label: "Start from template", type: "select", options: ["Blank", "HR Manager", "Payroll Officer", "Department Head", "Read-only Auditor"], ph: "Blank" },
      { k: "scope", label: "Data scope", type: "select", options: ["All branches", "Own branch", "Own department"], ph: "Select…" },
      { k: "desc", label: "Description", type: "textarea", ph: "What this role can do…", span: 2 },
    ]},
  ]},
  holiday: { title: "Add Holiday", sub: "Add to the 2026 calendar", back: "holiday", sections: [
    { fields: [
      { k: "name", label: "Holiday name", type: "text", ph: "e.g. Founding Anniversary", req: true, span: 2 },
      { k: "date", label: "Date", type: "date", req: true },
      { k: "type", label: "Type", type: "segmented", options: ["Regular", "Special"] },
      { k: "scope", label: "Coverage", type: "select", options: ["Nationwide", "Specific branch", "Company-wide"], ph: "Nationwide" },
      { k: "recurring", label: "Repeats yearly", type: "segmented", options: ["Yes", "No"] },
    ]},
  ]},
  job: { title: "Post Job", sub: "Open a new requisition", back: "recruitment", sections: [
    { fields: [
      { k: "title", label: "Job title", type: "text", ph: "e.g. Software Engineer", req: true, span: 2 },
      { k: "dept", label: "Department", type: "select", options: DEPT_NAMES, ph: "Select…" },
      { k: "branch", label: "Branch", type: "select", options: BRANCH_NAMES, ph: "Select…" },
      { k: "empType", label: "Employment type", type: "select", options: ["Regular", "Probationary", "Project-based", "Contractual"], ph: "Select…" },
      { k: "openings", label: "Openings", type: "number", ph: "1" },
      { k: "desc", label: "Job description", type: "textarea", ph: "Role summary & requirements…", span: 2 },
    ]},
  ]},
  announcement: { title: "New Announcement", sub: "Post to the employee portal", back: "announcements", sections: [
    { fields: [
      { k: "title", label: "Title", type: "text", ph: "e.g. Mid-year reviews", req: true, span: 2 },
      { k: "audience", label: "Audience", type: "select", options: ["All employees", "By department", "By branch"], ph: "All employees" },
      { k: "tag", label: "Tag", type: "select", options: ["HR", "Benefits", "Holiday", "General", "Urgent"], ph: "Select…" },
      { k: "body", label: "Message", type: "textarea", rows: 5, ph: "Write the announcement…", span: 2 },
    ]},
  ]},
  dtr: { title: "New DTR Submission", sub: "Submit a daily time record", back: "time", sections: [
    { fields: [
      { k: "employee", label: "Employee", type: "select", options: EMP_NAMES, req: true, ph: "Select employee", span: 2 },
      { k: "cutoff", label: "Cutoff period", type: "select", options: ["Jun 1 – 15, 2026", "Jun 16 – 30, 2026"], ph: "Select…" },
      { k: "days", label: "Days worked", type: "number", ph: "11" },
      { k: "ot", label: "Overtime hours", type: "number", ph: "4.5" },
      { k: "late", label: "Late (mins)", type: "number", ph: "0" },
      { k: "notes", label: "Notes", type: "textarea", ph: "Optional…", span: 2 },
    ]},
  ]},
  payrun: { title: "New Payroll Run", sub: "Start a payroll cycle", back: "payruns", sections: [
    { fields: [
      { k: "cutoff", label: "Cutoff period", type: "select", options: ["Jun 16 – 30, 2026", "Jul 1 – 15, 2026"], req: true, ph: "Select…", span: 2 },
      { k: "payDate", label: "Pay date", type: "date", req: true },
      { k: "type", label: "Run type", type: "select", options: ["Regular", "13th Month", "Final Pay", "Special"], ph: "Regular" },
      { k: "scope", label: "Include", type: "select", options: ["All employees", "By department", "By branch", "Monthly only", "Daily only"], ph: "All employees", span: 2 },
    ]},
  ]},
  asset: { title: "Add Asset", sub: "Register company equipment", back: "assets", sections: [
    { fields: [
      { k: "name", label: "Asset name", type: "text", ph: "e.g. MacBook Pro 14\"", req: true, span: 2 },
      { k: "tag", label: "Asset tag", type: "text", ph: "DC-LAP-014" },
      { k: "category", label: "Category", type: "select", options: ["Laptop", "Phone", "Monitor", "Vehicle", "Tool", "Other"], ph: "Select…" },
      { k: "assignee", label: "Assigned to", type: "select", options: EMP_NAMES, ph: "Unassigned" },
      { k: "value", label: "Acquisition value", type: "money", ph: "85,000" },
      { k: "acquired", label: "Date acquired", type: "date" },
    ]},
  ]},
  default: { title: "New Record", sub: "Fill in the details", back: "dashboard", sections: [
    { fields: [
      { k: "name", label: "Name", type: "text", ph: "Enter a name…", req: true, span: 2 },
      { k: "desc", label: "Description", type: "textarea", ph: "Optional description…", span: 2 },
    ]},
  ]},
};

function SuccessState({ icon = "checkCircle", title, sub }) {
  return (
    <div className="pa-form-success">
      <span className="pa-approve-check"><PIcon name={icon} size={46} /></span>
      <h3>{title}</h3>
      <p className="pa-muted">{sub}</p>
    </div>
  );
}

function SchemaFormPage({ param }) {
  const nav = React.useContext(PNav);
  const schema = FORM_SCHEMAS[param] || FORM_SCHEMAS.default;
  const [values, set, reset] = useForm({});
  const [saved, setSaved] = React.useState(false);
  const backId = schema.back || "dashboard";

  return (
    <>
      <div className="pa-crumb">
        <button onClick={() => nav.go(backId)}>{navLabel(backId)}</button>
        <PIcon name="chevR" size={14} /><span>{schema.title}</span>
      </div>
      <PageHead title={schema.title} sub={schema.sub} />
      <div className="pa-formpage">
        {saved ? (
          <Card>
            <SuccessState title={(values.name || values.title || values.employee || "Record") + " saved"}
              sub="This is a live mockup — the form captured your input and would persist to the backend." />
            <div className="pa-formbar">
              <div className="pa-formbar-btns">
                <Btn kind="ghost" onClick={() => { reset(); setSaved(false); }}>Add another</Btn>
                <Btn kind="primary" icon="arrowR" onClick={() => nav.go(backId)}>Back to {navLabel(backId)}</Btn>
              </div>
            </div>
          </Card>
        ) : (
          <>
            {schema.sections.map((sec, i) => (
              <Card key={i} title={sec.title || "Details"}>
                <FieldGrid fields={sec.fields} values={values} set={set} />
              </Card>
            ))}
            <div className="pa-formbar">
              <div className="pa-formbar-btns">
                <Btn kind="ghost" onClick={() => nav.go(backId)}>Cancel</Btn>
                <Btn kind="primary" icon="check" onClick={() => setSaved(true)}>Save</Btn>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ================= OVERLAYS (genuine, non-form) =================
function SwitchCompanyDrawer({ onClose }) {
  const cos = [
    { short: "DC", name: "Demo Corporation", plan: "Growth Plan", on: true },
    { short: "AF", name: "Acme Foods Inc.", plan: "Enterprise" },
    { short: "NR", name: "Northwind Retail", plan: "Pro" },
  ];
  return (
    <Drawer title="Switch company" sub="You have access to 3 workspaces" onClose={onClose}>
      <ul className="pa-colist">
        {cos.map((c) => (
          <li key={c.short} className={"pa-coitem" + (c.on ? " is-on" : "")} onClick={onClose}>
            <span className="pa-co-tile">{c.short}</span>
            <div className="pa-coitem-txt"><b>{c.name}</b><i>{c.plan}</i></div>
            {c.on && <span className="pa-co-check"><PIcon name="check" size={16} /></span>}
          </li>
        ))}
      </ul>
    </Drawer>
  );
}

function SearchDrawer({ onClose }) {
  const nav = React.useContext(PNav);
  const [q, setQ] = React.useState("");
  const emp = DR.EMP.filter(e => q && (e.name.toLowerCase().includes(q.toLowerCase()) || e.id.toLowerCase().includes(q.toLowerCase()))).slice(0, 6);
  const navMatches = q ? window.NAV_GROUPS.flatMap(g => g.items).filter(([id, label]) => label.toLowerCase().includes(q.toLowerCase())).slice(0, 4) : [];
  return (
    <div className="pa-search-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pa-searchbox" role="dialog">
        <label className="pa-searchbox-in">
          <PIcon name="search" size={19} />
          <input autoFocus placeholder="Search employees, pages…" value={q} onChange={(e) => setQ(e.target.value)} />
          <kbd>Esc</kbd>
        </label>
        <div className="pa-searchbox-results">
          {!q && <div className="pa-search-hint">Try “Caloy”, “payroll”, or an employee ID like E-0011</div>}
          {emp.length > 0 && <div className="pa-search-group">Employees</div>}
          {emp.map((e) => (
            <button key={e.id} className="pa-search-item" onClick={() => { nav.go("employee", e.id); onClose(); }}>
              <EmpAvatar initials={e.initials} id={e.id} size={30} />
              <div><b>{e.name}</b><i>{e.position} · {e.id}</i></div>
              <PIcon name="arrowR" size={15} />
            </button>
          ))}
          {navMatches.length > 0 && <div className="pa-search-group">Pages</div>}
          {navMatches.map(([id, label, icon]) => (
            <button key={id} className="pa-search-item" onClick={() => { nav.go(id); onClose(); }}>
              <span className="pa-search-pageic"><PIcon name={icon} size={16} /></span>
              <div><b>{label}</b></div>
              <PIcon name="arrowR" size={15} />
            </button>
          ))}
          {q && emp.length === 0 && navMatches.length === 0 && <div className="pa-search-hint">No matches for “{q}”.</div>}
        </div>
      </div>
    </div>
  );
}

function NotificationsDrawer({ onClose }) {
  const items = [
    { t: "orange", ic: "payruns", title: "Payroll PR-2026-12 is ready for review", time: "10 min ago" },
    { t: "amber", ic: "leave", title: "Trina Yu filed a Vacation Leave request", time: "1 hour ago" },
    { t: "blue", ic: "time", title: "3 DTR submissions need verification", time: "2 hours ago" },
    { t: "green", ic: "check", title: "BIR 1601-C filed successfully", time: "Yesterday" },
  ];
  return (
    <Drawer title="Notifications" sub="4 new updates" onClose={onClose}>
      <ul className="pa-notiflist">
        {items.map((n, i) => (
          <li key={i}><span className="pa-attn-ic" data-t={n.t}><PIcon name={n.ic} size={15} /></span>
            <div><b>{n.title}</b><i>{n.time}</i></div>
          </li>
        ))}
      </ul>
    </Drawer>
  );
}

function ApproveRunDrawer({ onClose }) {
  const nav = React.useContext(PNav);
  const r = DR.PAYROLL_RUNS[0];
  const [done, setDone] = React.useState(false);
  return (
    <Drawer title={done ? "Run approved" : "Approve & lock run"} sub={r.period} onClose={onClose}
      footer={done
        ? <Btn kind="primary" full onClick={() => { onClose(); nav.go("bankfiles"); }}>Generate bank file</Btn>
        : <><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn kind="primary" icon="check" onClick={() => setDone(true)}>Approve {r.emp} payslips</Btn></>}>
      {done ? (
        <div className="pa-approve-done">
          <span className="pa-approve-check"><PIcon name="checkCircle" size={44} /></span>
          <h3>{r.id} locked</h3>
          <p className="pa-muted">{r.emp} payslips approved · {DR.peso(r.net)} ready to disburse on {r.payDate}.</p>
        </div>
      ) : (
        <>
          <p className="pa-muted" style={{ marginTop: 0 }}>Review the summary before locking. Once approved, payslips can't be edited without re-opening the run.</p>
          <ul className="pa-deflist">
            <li><span>Employees</span><b>{r.emp}</b></li>
            <li><span>Gross pay</span><b className="pa-mono">{DR.peso(r.gross)}</b></li>
            <li><span>Total deductions</span><b className="pa-mono">{DR.peso(r.deductions)}</b></li>
            <li className="pa-deflist-total"><span>Net disbursement</span><b className="pa-mono">{DR.peso(r.net)}</b></li>
          </ul>
        </>
      )}
    </Drawer>
  );
}

function DrawerHost({ drawer, onClose }) {
  if (!drawer) return null;
  switch (drawer.kind) {
    case "switch-company": return <SwitchCompanyDrawer onClose={onClose} />;
    case "search": return <SearchDrawer onClose={onClose} />;
    case "notifications": return <NotificationsDrawer onClose={onClose} />;
    case "approve-run": return <ApproveRunDrawer onClose={onClose} />;
    default: return null;
  }
}

// register form pages into the router
window.PAGES["new-employee"] = AddEmployeePage;
window.PAGES["form"] = SchemaFormPage;
window.DrawerHost = DrawerHost;
window.FORM_SCHEMAS = FORM_SCHEMAS;
