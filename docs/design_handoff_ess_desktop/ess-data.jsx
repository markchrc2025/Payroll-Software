// ess-data.jsx — Sentire Payroll · Employee Self-Service mock data (PH context, ₱)
// Exports to window: ESS

const peso = (n) => "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const peso0 = (n) => "₱" + n.toLocaleString("en-PH");

const EMPLOYEE = {
  first: "Maria", name: "Maria Santos", initials: "MS",
  id: "ACME-0412", position: "Operations Supervisor", dept: "Operations",
  company: "Acme Foods Inc.", workspace: "acme-foods",
  hired: "Jan 15, 2022", tenure: "4 yrs 5 mos", employment: "Regular", manager: "Ramon Cruz",
  email: "maria@acmefoods.com", phone: "+63 917 555 0142",
  address: "14 Mabini St, Quezon City, Metro Manila",
  birthdate: "Mar 8, 1994", civil: "Single",
  monthly: 42000, semiMonthly: 21000,
  bank: "BPI", bankAcct: "•••• 3344",
  gov: { SSS: "34-1234567-8", PhilHealth: "12-345678901-2", "Pag-IBIG": "1234-5678-9012", TIN: "234-567-890-000" },
};

// next payday
const PAYDAY = { date: "Jun 15, 2026", inDays: 3, period: "Jun 1 – 15, 2026", estNet: 21490 };

// payslip detail builder
function payslip(id, period, payDate, basic, ot, otHrs, allowance, sss, phil, pagibig, tax, late, status) {
  const gross = basic + ot + allowance;
  const ded = sss + phil + pagibig + tax + late;
  return {
    id, period, payDate, status,
    earnings: [
      { label: "Basic pay", sub: "Semi-monthly", amt: basic },
      { label: "Overtime", sub: otHrs + " hrs", amt: ot },
      { label: "Allowance", sub: "Meal & transport", amt: allowance },
    ].filter(e => e.amt > 0),
    deductions: [
      { label: "SSS contribution", amt: sss },
      { label: "PhilHealth", amt: phil },
      { label: "Pag-IBIG", amt: pagibig },
      { label: "Withholding tax", amt: tax },
      { label: "Tardiness", sub: late ? "32 mins" : "", amt: late },
    ].filter(d => d.amt > 0),
    gross, totalDed: ded, net: gross - ded,
  };
}

const PAYSLIPS = [
  payslip("ps-0531", "May 16 – 31, 2026", "May 31, 2026", 21000, 1856.25, "12", 1500, 675, 472.5, 100, 1433.75, 60, "Paid"),
  payslip("ps-0515", "May 1 – 15, 2026", "May 15, 2026", 21000, 1237.5, "8", 1500, 675, 472.5, 100, 1340, 0, "Paid"),
  payslip("ps-0430", "Apr 16 – 30, 2026", "Apr 30, 2026", 21000, 928.13, "6", 1500, 675, 472.5, 100, 1295, 120, "Paid"),
  payslip("ps-0415", "Apr 1 – 15, 2026", "Apr 15, 2026", 21000, 1546.88, "10", 1500, 675, 472.5, 100, 1388, 0, "Paid"),
  payslip("ps-0331", "Mar 16 – 31, 2026", "Mar 31, 2026", 21000, 618.75, "4", 1500, 675, 472.5, 100, 1248, 0, "Paid"),
  payslip("ps-13m", "13th Month Pay 2025", "Dec 12, 2025", 38500, 0, "0", 0, 0, 0, 0, 0, 0, "Paid"),
];

const TAXFORMS = [
  { id: "2316-2025", name: "BIR Form 2316", year: "2025", sub: "Certificate of Compensation Payment / Tax Withheld" },
  { id: "2316-2024", name: "BIR Form 2316", year: "2024", sub: "Certificate of Compensation Payment / Tax Withheld" },
];

const LEAVE_BAL = [
  { type: "Vacation Leave", code: "VL", used: 7.5, total: 15, color: "#4F9373" },
  { type: "Sick Leave", code: "SL", used: 5, total: 15, color: "#3E63A0" },
  { type: "Emergency Leave", code: "EL", used: 1, total: 3, color: "#C2552F" },
];

const LEAVE_HISTORY = [
  { type: "Vacation Leave", dates: "Jun 20 – 21, 2026", days: 2, status: "Pending", reason: "Family trip to Baguio" },
  { type: "Sick Leave", dates: "May 12, 2026", days: 1, status: "Approved", reason: "Fever / flu" },
  { type: "Vacation Leave", dates: "Apr 4 – 5, 2026", days: 2, status: "Approved", reason: "Personal" },
  { type: "Emergency Leave", dates: "Mar 18, 2026", days: 1, status: "Approved", reason: "Family emergency" },
  { type: "Vacation Leave", dates: "Feb 2, 2026", days: 1, status: "Rejected", reason: "Peak season — declined" },
];

const ATTENDANCE = {
  today: { date: "Thursday, Jun 12", in: "8:02 AM", out: null, status: "On time", schedule: "8:00 AM – 5:00 PM" },
  period: { label: "Jun 1 – 15", present: 8, late: 1, absent: 0, otHrs: 6.5 },
  log: [
    { day: "Jun 11", in: "7:58 AM", out: "5:04 PM", tag: "Present", tone: "green", ot: 0, late: 0 },
    { day: "Jun 10", in: "8:12 AM", out: "6:30 PM", tag: "Late · OT 1.5h", tone: "amber", ot: 1.5, late: 12 },
    { day: "Jun 9", in: "7:55 AM", out: "7:02 PM", tag: "Present · OT 2h", tone: "green", ot: 2, late: 0 },
    { day: "Jun 8", in: "8:00 AM", out: "5:08 PM", tag: "Present", tone: "green", ot: 0, late: 0 },
    { day: "Jun 7", in: "—", out: "—", tag: "Rest day", tone: "slate", ot: 0, late: 0 },
    { day: "Jun 6", in: "—", out: "—", tag: "Rest day", tone: "slate", ot: 0, late: 0 },
    { day: "Jun 5", in: "8:01 AM", out: "8:06 PM", tag: "Present · OT 3h", tone: "green", ot: 3, late: 0 },
  ],
};

// DTR payroll periods (semi-monthly groups)
const DTR_PERIODS = [
  { id: "p-0615", label: "Jun 1 – 15, 2026", group: "Semi-monthly · 1st half", payDate: "Jun 15, 2026", due: "Jun 13, 2026", status: "Open", days: 8, late: 1, lateMins: 12, absent: 0, ot: 6.5, current: true },
  { id: "p-0531", label: "May 16 – 31, 2026", group: "Semi-monthly · 2nd half", payDate: "May 31, 2026", due: "May 29, 2026", status: "Approved", days: 11, late: 1, lateMins: 32, absent: 0, ot: 12 },
  { id: "p-0515", label: "May 1 – 15, 2026", group: "Semi-monthly · 1st half", payDate: "May 15, 2026", due: "May 13, 2026", status: "Approved", days: 10, late: 0, lateMins: 0, absent: 0, ot: 8 },
  { id: "p-0430", label: "Apr 16 – 30, 2026", group: "Semi-monthly · 2nd half", payDate: "Apr 30, 2026", due: "Apr 28, 2026", status: "Approved", days: 11, late: 2, lateMins: 41, absent: 0, ot: 6 },
  { id: "p-0415", label: "Apr 1 – 15, 2026", group: "Semi-monthly · 1st half", payDate: "Apr 15, 2026", due: "Apr 13, 2026", status: "Approved", days: 10, late: 0, lateMins: 0, absent: 1, ot: 10 },
];

const ANNOUNCEMENTS = [
  { id: "a1", tag: "Payroll", title: "June 15 payday moves to June 13", body: "Due to the Independence Day holiday, the mid-month payout will be released two days early. No action needed.", date: "2 days ago" },
  { id: "a2", tag: "Benefits", title: "Enroll HMO dependents until Jun 30", body: "Add up to 3 dependents to your health plan at no extra cost this enrollment window.", date: "5 days ago" },
];

const REQUEST_TYPES = [
  { id: "leave", label: "Leave", icon: "leave" },
  { id: "ot", label: "Overtime", icon: "clock" },
  { id: "reimb", label: "Reimbursement", icon: "wallet" },
  { id: "coe", label: "COE request", icon: "doc" },
];

window.ESS = {
  peso, peso0, EMPLOYEE, PAYDAY, PAYSLIPS, TAXFORMS,
  LEAVE_BAL, LEAVE_HISTORY, ATTENDANCE, ANNOUNCEMENTS, REQUEST_TYPES, DTR_PERIODS,
};
