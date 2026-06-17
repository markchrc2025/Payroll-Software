// padmin-data.jsx — seed data for Sentire Payroll · Tenant-Admin mockup
// Currency: PHP (₱). Exports to window: PA

const peso = (n, dec = 0) =>
  "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const pesoC = (n) => peso(n, 2);

// ---- company / session ----
const COMPANY = {
  name: "Demo Corporation",
  plan: "Growth Plan",
  short: "DC",
  tin: "009-218-447-000",
  payday: "Every 15th & end of month",
  cutoff: "Jun 1 – 15, 2026",
};
const SESSION = { name: "Juan dela Cruz", role: "Tenant Admin", email: "juan@democorp.ph", initials: "JD" };

// ---- departments ----
const DEPARTMENTS = [
  { id: "exec", name: "Executive", head: "Vacant", head_id: null, count: 0, branch: "Makati HQ" },
  { id: "ops", name: "Operations", head: "Ramon Cruz", head_id: "E-0007", count: 9, branch: "Makati HQ" },
  { id: "fin", name: "Finance & Accounting", head: "Liza Tan", head_id: "E-0002", count: 5, branch: "Makati HQ" },
  { id: "eng", name: "Engineering", head: "Caloy Reyes", head_id: "E-0011", count: 8, branch: "BGC Annex" },
  { id: "sales", name: "Sales & Marketing", head: "Bea Dizon", head_id: "E-0005", count: 6, branch: "Makati HQ" },
  { id: "hr", name: "People & Culture", head: "Anna Lim", head_id: "E-0003", count: 3, branch: "Makati HQ" },
  { id: "wh", name: "Warehouse", head: "Jose Rivera", head_id: "E-0019", count: 5, branch: "Cebu Hub" },
];

// ---- branches ----
const BRANCHES = [
  { id: "mkt", name: "Makati HQ", city: "Makati City", region: "NCR", count: 18, address: "Ayala Ave., Makati City" },
  { id: "bgc", name: "BGC Annex", city: "Taguig City", region: "NCR", count: 8, address: "11th Ave., BGC, Taguig" },
  { id: "ceb", name: "Cebu Hub", city: "Cebu City", region: "Region VII", count: 7, address: "Cebu Business Park" },
  { id: "dvo", name: "Davao Office", city: "Davao City", region: "Region XI", count: 3, address: "J.P. Laurel Ave., Davao" },
];

// ---- positions (single source of truth for org-chart roles) ----
const POSITIONS = [
  // executive layer — count 0 = unfilled (rendered as vacant nodes on the org chart)
  { id: "p-ceo", title: "Chief Executive Officer", dept: "Executive", level: "Executive", count: 0 },
  { id: "p-coo", title: "Chief Operating Officer", dept: "Executive", level: "Executive", count: 0 },
  { id: "p-cfo", title: "Chief Financial Officer", dept: "Executive", level: "Executive", count: 0 },
  // directors & managers
  { id: "p9", title: "HR Director", dept: "People & Culture", level: "Director", count: 1 },
  { id: "p10", title: "Sales Director", dept: "Sales & Marketing", level: "Director", count: 1 },
  { id: "p11", title: "Operations Manager", dept: "Operations", level: "Manager", count: 1 },
  { id: "p12", title: "Finance Manager", dept: "Finance & Accounting", level: "Manager", count: 1 },
  { id: "p13", title: "Engineering Lead", dept: "Engineering", level: "Manager", count: 1 },
  // supervisors & individual contributors
  { id: "p2", title: "Operations Supervisor", dept: "Operations", level: "Supervisor", count: 1 },
  { id: "p14", title: "Warehouse Supervisor", dept: "Warehouse", level: "Supervisor", count: 1 },
  { id: "p5", title: "Senior Software Engineer", dept: "Engineering", level: "Senior", count: 1 },
  { id: "p3", title: "Accountant", dept: "Finance & Accounting", level: "Professional", count: 1 },
  { id: "p16", title: "Payroll Officer", dept: "Finance & Accounting", level: "Professional", count: 1 },
  { id: "p4", title: "Software Engineer", dept: "Engineering", level: "Professional", count: 2 },
  { id: "p15", title: "QA Engineer", dept: "Engineering", level: "Professional", count: 1 },
  { id: "p6", title: "Account Executive", dept: "Sales & Marketing", level: "Professional", count: 4 },
  { id: "p8", title: "HR Generalist", dept: "People & Culture", level: "Professional", count: 1 },
  { id: "p17", title: "Marketing Associate", dept: "Sales & Marketing", level: "Rank & File", count: 1 },
  { id: "p1", title: "Operations Associate", dept: "Operations", level: "Rank & File", count: 4 },
  { id: "p7", title: "Warehouse Staff", dept: "Warehouse", level: "Rank & File", count: 2 },
];

// ---- employees ----
const EMP = [
  ["E-0001", "Juan dela Cruz", "People & Culture", "HR Director", "Makati HQ", "Monthly", 95000, "Active", "M", "Jan 5, 2021"],
  ["E-0002", "Liza Tan", "Finance & Accounting", "Finance Manager", "Makati HQ", "Monthly", 88000, "Active", "F", "Mar 2, 2021"],
  ["E-0003", "Anna Lim", "People & Culture", "HR Generalist", "Makati HQ", "Monthly", 42000, "Active", "F", "Aug 19, 2022"],
  ["E-0004", "Marco Villanueva", "Engineering", "Senior Software Engineer", "BGC Annex", "Monthly", 110000, "Active", "M", "Feb 14, 2022"],
  ["E-0005", "Bea Dizon", "Sales & Marketing", "Sales Director", "Makati HQ", "Monthly", 92000, "Active", "F", "Jun 1, 2021"],
  ["E-0006", "Paolo Gomez", "Sales & Marketing", "Account Executive", "Makati HQ", "Monthly", 38000, "Active", "M", "Sep 12, 2023"],
  ["E-0007", "Ramon Cruz", "Operations", "Operations Manager", "Makati HQ", "Monthly", 78000, "Active", "M", "Nov 3, 2020"],
  ["E-0008", "Trina Yu", "Operations", "Operations Associate", "Makati HQ", "Daily", 1100, "Active", "F", "Jan 8, 2024"],
  ["E-0009", "Nards Aquino", "Warehouse", "Warehouse Staff", "Cebu Hub", "Daily", 720, "Active", "M", "Mar 17, 2024"],
  ["E-0010", "Karen Flores", "Finance & Accounting", "Accountant", "Makati HQ", "Monthly", 52000, "Active", "F", "Jul 5, 2022"],
  ["E-0011", "Caloy Reyes", "Engineering", "Engineering Lead", "BGC Annex", "Monthly", 125000, "Active", "M", "Apr 20, 2020"],
  ["E-0012", "Mika Santos", "Engineering", "Software Engineer", "BGC Annex", "Monthly", 68000, "Active", "F", "Oct 1, 2023"],
  ["E-0013", "Dino Pascual", "Engineering", "Software Engineer", "BGC Annex", "Monthly", 65000, "Active", "M", "Jan 15, 2024"],
  ["E-0014", "Grace Mendoza", "Operations", "Operations Associate", "Makati HQ", "Daily", 1100, "Active", "F", "May 6, 2024"],
  ["E-0015", "Erwin Salazar", "Operations", "Operations Supervisor", "Makati HQ", "Monthly", 48000, "Active", "M", "Aug 22, 2022"],
  ["E-0016", "Joy Ramirez", "Sales & Marketing", "Account Executive", "Cebu Hub", "Monthly", 36000, "Active", "F", "Feb 1, 2024"],
  ["E-0017", "Ben Tiu", "Sales & Marketing", "Marketing Associate", "Makati HQ", "Monthly", 34000, "On Leave", "M", "Jun 19, 2023"],
  ["E-0018", "Cathy Uy", "Finance & Accounting", "Payroll Officer", "Makati HQ", "Monthly", 46000, "Active", "F", "Mar 8, 2023"],
  ["E-0019", "Jose Rivera", "Warehouse", "Warehouse Supervisor", "Cebu Hub", "Monthly", 41000, "Active", "M", "Sep 1, 2021"],
  ["E-0020", "Rina Cabrera", "Warehouse", "Warehouse Staff", "Cebu Hub", "Daily", 720, "Active", "F", "Apr 3, 2024"],
  ["E-0021", "Tomas Bautista", "Operations", "Operations Associate", "Davao Office", "Daily", 1050, "Active", "M", "Jun 10, 2024"],
  ["E-0022", "Patricia Lao", "Engineering", "QA Engineer", "BGC Annex", "Monthly", 58000, "Probationary", "F", "Apr 1, 2026"],
  ["E-0023", "Miguel Torres", "Operations", "Operations Associate", "Davao Office", "Daily", 1050, "Active", "M", "Feb 12, 2024"],
  ["E-0024", "Sofia Reyes", "Sales & Marketing", "Account Executive", "Makati HQ", "Monthly", 37000, "Probationary", "F", "May 2, 2026"],
].map(([id, name, dept, position, branch, salaryType, rate, status, sex, hired]) => ({
  id, name, dept, position, branch, salaryType, rate, status, sex, hired,
  initials: name.split(" ").map(w => w[0]).slice(0, 2).join(""),
}));

// ---- payroll runs ----
const PAYROLL_RUNS = [
  { id: "PR-2026-12", period: "Jun 1 – 15, 2026", payDate: "Jun 20, 2026", status: "Draft", emp: 36, gross: 1186500, net: 902340, deductions: 284160 },
  { id: "PR-2026-11", period: "May 16 – 31, 2026", payDate: "Jun 5, 2026", status: "Paid", emp: 36, gross: 1182000, net: 899100, deductions: 282900 },
  { id: "PR-2026-10", period: "May 1 – 15, 2026", payDate: "May 20, 2026", status: "Paid", emp: 35, gross: 1154300, net: 878420, deductions: 275880 },
  { id: "PR-2026-09", period: "Apr 16 – 30, 2026", payDate: "May 5, 2026", status: "Paid", emp: 35, gross: 1151000, net: 876000, deductions: 275000 },
  { id: "PR-2026-08", period: "Apr 1 – 15, 2026", payDate: "Apr 20, 2026", status: "Paid", emp: 34, gross: 1120400, net: 853100, deductions: 267300 },
];

// payslip rows for the draft run detail
const PAYSLIPS = [
  { id: "E-0011", name: "Caloy Reyes", dept: "Engineering", basic: 62500, allow: 6000, ot: 0, gross: 68500, sss: 1350, philhealth: 1250, pagibig: 200, tax: 11890, loans: 4000, net: 49810 },
  { id: "E-0004", name: "Marco Villanueva", dept: "Engineering", basic: 55000, allow: 5000, ot: 2800, gross: 62800, sss: 1350, philhealth: 1100, pagibig: 200, tax: 9640, loans: 0, net: 50510 },
  { id: "E-0001", name: "Juan dela Cruz", dept: "People & Culture", basic: 47500, allow: 5000, ot: 0, gross: 52500, sss: 1350, philhealth: 950, pagibig: 200, tax: 7420, loans: 0, net: 42580 },
  { id: "E-0005", name: "Bea Dizon", dept: "Sales & Marketing", basic: 46000, allow: 6000, ot: 0, gross: 52000, sss: 1350, philhealth: 920, pagibig: 200, tax: 7250, loans: 2500, net: 39780 },
  { id: "E-0002", name: "Liza Tan", dept: "Finance & Accounting", basic: 44000, allow: 5000, ot: 0, gross: 49000, sss: 1350, philhealth: 880, pagibig: 200, tax: 6680, loans: 0, net: 39890 },
  { id: "E-0007", name: "Ramon Cruz", dept: "Operations", basic: 39000, allow: 4000, ot: 1500, gross: 44500, sss: 1350, philhealth: 780, pagibig: 200, tax: 5410, loans: 3000, net: 33760 },
  { id: "E-0012", name: "Mika Santos", dept: "Engineering", basic: 34000, allow: 3500, ot: 1200, gross: 38700, sss: 1215, philhealth: 680, pagibig: 200, tax: 3960, loans: 0, net: 32645 },
  { id: "E-0013", name: "Dino Pascual", dept: "Engineering", basic: 32500, allow: 3500, ot: 0, gross: 36000, sss: 1170, philhealth: 650, pagibig: 200, tax: 3480, loans: 1800, net: 28700 },
  { id: "E-0010", name: "Karen Flores", dept: "Finance & Accounting", basic: 26000, allow: 3000, ot: 800, gross: 29800, sss: 990, philhealth: 520, pagibig: 200, tax: 2240, loans: 0, net: 25850 },
  { id: "E-0015", name: "Erwin Salazar", dept: "Operations", basic: 24000, allow: 3000, ot: 1600, gross: 28600, sss: 945, philhealth: 480, pagibig: 200, tax: 1980, loans: 2200, net: 22795 },
];

// ---- pay components ----
const PAY_COMPONENTS = {
  earnings: [
    { name: "Basic Pay", type: "Earning", taxable: true, formula: "Monthly rate ÷ 2", applies: "All monthly" },
    { name: "Daily Wage", type: "Earning", taxable: true, formula: "Daily rate × days worked", applies: "All daily" },
    { name: "Overtime Pay", type: "Earning", taxable: true, formula: "Hourly × 1.25 × OT hrs", applies: "DTR-based" },
    { name: "Night Differential", type: "Earning", taxable: true, formula: "Hourly × 0.10 × ND hrs", applies: "DTR-based" },
    { name: "Transportation Allowance", type: "Allowance", taxable: false, formula: "Fixed ₱2,000", applies: "Selected" },
    { name: "Meal Allowance", type: "Allowance", taxable: false, formula: "Fixed ₱1,500", applies: "Selected" },
    { name: "13th Month Pay", type: "Earning", taxable: false, formula: "Annual basic ÷ 12", applies: "Year-end" },
  ],
  deductions: [
    { name: "SSS Contribution", type: "Statutory", taxable: false, formula: "2026 SSS table", applies: "All" },
    { name: "PhilHealth", type: "Statutory", taxable: false, formula: "5% ÷ 2 (shared)", applies: "All" },
    { name: "Pag-IBIG", type: "Statutory", taxable: false, formula: "₱200 fixed", applies: "All" },
    { name: "Withholding Tax", type: "Statutory", taxable: false, formula: "BIR TRAIN table", applies: "All" },
    { name: "SSS Salary Loan", type: "Loan", taxable: false, formula: "Amortization", applies: "Borrowers" },
    { name: "Company Loan", type: "Loan", taxable: false, formula: "Amortization", applies: "Borrowers" },
    { name: "Tardiness", type: "Deduction", taxable: false, formula: "Hourly × late hrs", applies: "DTR-based" },
  ],
};

// ---- loans ----
const LOANS = [
  { id: "E-0011", name: "Caloy Reyes", type: "Company Loan", principal: 120000, balance: 84000, amort: 4000, term: "30 mos", status: "Active" },
  { id: "E-0005", name: "Bea Dizon", type: "SSS Salary Loan", principal: 50000, balance: 22500, amort: 2500, term: "24 mos", status: "Active" },
  { id: "E-0007", name: "Ramon Cruz", type: "Pag-IBIG MPL", principal: 80000, balance: 54000, amort: 3000, term: "36 mos", status: "Active" },
  { id: "E-0013", name: "Dino Pascual", type: "Company Loan", principal: 30000, balance: 19800, amort: 1800, term: "18 mos", status: "Active" },
  { id: "E-0015", name: "Erwin Salazar", type: "SSS Salary Loan", principal: 40000, balance: 8800, amort: 2200, term: "24 mos", status: "Active" },
  { id: "E-0002", name: "Liza Tan", type: "Company Loan", principal: 60000, balance: 0, amort: 0, term: "12 mos", status: "Settled" },
];

// ---- leave requests ----
const LEAVE = [
  { id: "E-0017", name: "Ben Tiu", type: "Sick Leave", from: "Jun 12", to: "Jun 13", days: 2, status: "Pending", reason: "Medical — flu" },
  { id: "E-0008", name: "Trina Yu", type: "Vacation Leave", from: "Jun 18", to: "Jun 20", days: 3, status: "Pending", reason: "Family trip" },
  { id: "E-0012", name: "Mika Santos", type: "Vacation Leave", from: "Jun 25", to: "Jun 27", days: 3, status: "Approved", reason: "Personal" },
  { id: "E-0006", name: "Paolo Gomez", type: "Emergency Leave", from: "Jun 9", to: "Jun 9", days: 1, status: "Approved", reason: "Family emergency" },
  { id: "E-0016", name: "Joy Ramirez", type: "Sick Leave", from: "Jun 5", to: "Jun 6", days: 2, status: "Approved", reason: "Medical" },
  { id: "E-0003", name: "Anna Lim", type: "Vacation Leave", from: "Jul 1", to: "Jul 4", days: 4, status: "Pending", reason: "Out of town" },
];

// ---- DTR / attendance submissions ----
const DTR = [
  { id: "E-0008", name: "Trina Yu", dept: "Operations", cutoff: "Jun 1 – 15", days: 11, late: 1, ot: 4.5, status: "Submitted" },
  { id: "E-0009", name: "Nards Aquino", dept: "Warehouse", cutoff: "Jun 1 – 15", days: 12, late: 0, ot: 8, status: "Approved" },
  { id: "E-0014", name: "Grace Mendoza", dept: "Operations", cutoff: "Jun 1 – 15", days: 11, late: 2, ot: 2, status: "Submitted" },
  { id: "E-0021", name: "Tomas Bautista", dept: "Operations", cutoff: "Jun 1 – 15", days: 12, late: 0, ot: 6, status: "Approved" },
  { id: "E-0020", name: "Rina Cabrera", dept: "Warehouse", cutoff: "Jun 1 – 15", days: 10, late: 0, ot: 5.5, status: "Submitted" },
  { id: "E-0023", name: "Miguel Torres", dept: "Operations", cutoff: "Jun 1 – 15", days: 12, late: 1, ot: 3, status: "Approved" },
];

// ---- holidays (PH 2026) ----
const HOLIDAYS = [
  { date: "Jun 12", day: "Fri", name: "Independence Day", type: "Regular", in: "Today" },
  { date: "Aug 21", day: "Fri", name: "Ninoy Aquino Day", type: "Special", in: "in 69d" },
  { date: "Aug 31", day: "Mon", name: "National Heroes Day", type: "Regular", in: "in 79d" },
  { date: "Nov 1", day: "Sun", name: "All Saints' Day", type: "Special", in: "in 141d" },
  { date: "Nov 30", day: "Mon", name: "Bonifacio Day", type: "Regular", in: "in 170d" },
  { date: "Dec 25", day: "Fri", name: "Christmas Day", type: "Regular", in: "in 195d" },
  { date: "Dec 30", day: "Wed", name: "Rizal Day", type: "Regular", in: "in 200d" },
];

// ---- birthdays this week ----
const BIRTHDAYS = [
  { id: "E-0010", name: "Karen Flores", dept: "Finance & Accounting", date: "Jun 13", day: "Sat" },
  { id: "E-0021", name: "Tomas Bautista", dept: "Operations", date: "Jun 15", day: "Mon" },
];

// ---- gov't reports ----
const GOV_REPORTS = [
  { name: "SSS R-3 / R-5", agency: "SSS", period: "May 2026", due: "Jun 30, 2026", amount: 48600, status: "Ready" },
  { name: "PhilHealth RF-1", agency: "PhilHealth", period: "May 2026", due: "Jun 30, 2026", amount: 31200, status: "Ready" },
  { name: "Pag-IBIG MCRF", agency: "Pag-IBIG", period: "May 2026", due: "Jun 30, 2026", amount: 7200, status: "Ready" },
  { name: "BIR 1601-C", agency: "BIR", period: "May 2026", due: "Jun 10, 2026", amount: 142800, status: "Filed" },
  { name: "BIR 2316 (Annual)", agency: "BIR", period: "FY 2025", due: "Jan 31, 2026", amount: 0, status: "Filed" },
];

// ---- roles ----
const ROLES = [
  { name: "Tenant Admin", desc: "Full access to all modules and settings", perms: 42, users: 1, type: "System" },
  { name: "HR Manager", desc: "Workforce, time, leave and recruitment", perms: 28, users: 2, type: "Custom" },
  { name: "Payroll Officer", desc: "Payroll runs, pay components and bank files", perms: 19, users: 1, type: "Custom" },
  { name: "Department Head", desc: "Approve leave & DTR for own department", perms: 9, users: 6, type: "Custom" },
  { name: "Read-only Auditor", desc: "View reports and payroll history only", perms: 11, users: 1, type: "Custom" },
];

// ---- recruitment ----
const RECRUITS = [
  { name: "Andrea Lopez", role: "Software Engineer", dept: "Engineering", stage: "Final Interview", applied: "Jun 2" },
  { name: "Mark Villar", role: "Account Executive", dept: "Sales & Marketing", stage: "Screening", applied: "Jun 8" },
  { name: "Issa Domingo", role: "Accountant", dept: "Finance & Accounting", stage: "Offer", applied: "May 28" },
  { name: "Ryan Co", role: "QA Engineer", dept: "Engineering", stage: "Technical", applied: "Jun 5" },
];

// ---- announcements ----
const ANNOUNCEMENTS = [
  { title: "Mid-year performance reviews start July 1", by: "People & Culture", date: "Jun 10", tag: "HR" },
  { title: "New health card provider — enrollment until Jun 30", by: "People & Culture", date: "Jun 6", tag: "Benefits" },
  { title: "Office closure on Independence Day (Jun 12)", by: "Admin", date: "Jun 9", tag: "Holiday" },
];

// ---- claims ----
const CLAIMS = [
  { id: "E-0006", name: "Paolo Gomez", type: "Reimbursement", desc: "Client meeting transport", amount: 1850, status: "Pending", date: "Jun 9" },
  { id: "E-0016", name: "Joy Ramirez", type: "Reimbursement", desc: "Regional sales trip", amount: 6400, status: "Pending", date: "Jun 7" },
  { id: "E-0004", name: "Marco Villanueva", type: "Medical", desc: "Annual physical exam", amount: 3200, status: "Approved", date: "Jun 3" },
];

// ---- KPIs ----
const KPI = {
  activeEmp: 36,
  departments: 7,
  branches: 4,
  monthlyPayroll: 2368500,
  pendingLeave: 3,
  pendingDtr: 3,
  pendingClaims: 2,
};

// month-over-month headcount for chart
const HEADCOUNT = [
  { m: "Jan", v: 31 }, { m: "Feb", v: 32 }, { m: "Mar", v: 33 }, { m: "Apr", v: 34 },
  { m: "May", v: 35 }, { m: "Jun", v: 36 },
];

window.PA = {
  peso, pesoC, COMPANY, SESSION, DEPARTMENTS, BRANCHES, POSITIONS, EMP,
  PAYROLL_RUNS, PAYSLIPS, PAY_COMPONENTS, LOANS, LEAVE, DTR, HOLIDAYS, BIRTHDAYS,
  GOV_REPORTS, ROLES, RECRUITS, ANNOUNCEMENTS, CLAIMS, KPI, HEADCOUNT,
};
