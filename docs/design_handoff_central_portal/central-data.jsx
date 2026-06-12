// central-data.jsx — seed data for Sentire Central Portal mockups
// Currency: PHP (₱). Exports to window: CP

const peso = (n) => "₱" + n.toLocaleString("en-PH");

const TENANTS = [
  { id: "acme", name: "Acme Foods Inc.", slug: "acme-foods", plan: "Enterprise", status: "Active", emp: 1204, mrr: 48000, since: "Jan 12, 2026", health: 96, owner: "Maria Santos", region: "NCR" },
  { id: "sierra", name: "Sierra Manufacturing", slug: "sierra-mfg", plan: "Enterprise", status: "Active", emp: 2050, mrr: 72000, since: "Nov 3, 2025", health: 99, owner: "Ramon Cruz", region: "Calabarzon" },
  { id: "northwind", name: "Northwind Retail", slug: "northwind", plan: "Pro", status: "Active", emp: 540, mrr: 24000, since: "Feb 20, 2026", health: 88, owner: "Liza Tan", region: "NCR" },
  { id: "mabuhay", name: "Mabuhay Logistics", slug: "mabuhay-log", plan: "Pro", status: "Active", emp: 312, mrr: 18000, since: "Mar 1, 2026", health: 91, owner: "Jose Rivera", region: "Central Luzon" },
  { id: "bluereef", name: "BlueReef Hospitality", slug: "bluereef", plan: "Pro", status: "Past due", emp: 188, mrr: 18000, since: "Dec 15, 2025", health: 54, owner: "Anna Lim", region: "Western Visayas" },
  { id: "pixel", name: "Pixel Foundry", slug: "pixel-foundry", plan: "Pro", status: "Active", emp: 78, mrr: 12000, since: "Apr 8, 2026", health: 93, owner: "Caloy Reyes", region: "NCR" },
  { id: "kape", name: "Kape Manila Co.", slug: "kape-manila", plan: "Starter", status: "Trialing", emp: 24, mrr: 0, since: "Jun 2, 2026", health: 72, owner: "Bea Dizon", region: "NCR", trialEnds: "Jun 16, 2026" },
  { id: "verde", name: "Verde Agritech", slug: "verde-agri", plan: "Pro", status: "Trialing", emp: 96, mrr: 0, since: "Jun 5, 2026", health: 80, owner: "Paolo Gomez", region: "Davao", trialEnds: "Jun 19, 2026" },
  { id: "lakwatsa", name: "Lakwatsa Travel", slug: "lakwatsa", plan: "Starter", status: "Active", emp: 41, mrr: 4500, since: "May 9, 2026", health: 84, owner: "Trina Yu", region: "Cebu" },
  { id: "oldtown", name: "Old Town Bakery", slug: "oldtown", plan: "Starter", status: "Cancelled", emp: 12, mrr: 0, since: "Oct 1, 2025", health: 20, owner: "Nards Aquino", region: "NCR" },
];

const INVOICES = [
  { id: "INV-2061", tenant: "Sierra Manufacturing", amount: 72000, status: "Paid", issued: "Jun 1, 2026" },
  { id: "INV-2060", tenant: "Acme Foods Inc.", amount: 48000, status: "Paid", issued: "Jun 1, 2026" },
  { id: "INV-2059", tenant: "Northwind Retail", amount: 24000, status: "Paid", issued: "Jun 1, 2026" },
  { id: "INV-2058", tenant: "BlueReef Hospitality", amount: 18000, status: "Overdue", issued: "May 28, 2026" },
  { id: "INV-2057", tenant: "Mabuhay Logistics", amount: 18000, status: "Paid", issued: "Jun 1, 2026" },
  { id: "INV-2056", tenant: "Pixel Foundry", amount: 12000, status: "Paid", issued: "Jun 1, 2026" },
  { id: "INV-2055", tenant: "Lakwatsa Travel", amount: 4500, status: "Pending", issued: "Jun 8, 2026" },
];

const TICKETS = [
  { id: "T-4821", tenant: "BlueReef Hospitality", subject: "Payroll run failed — bank file rejected", priority: "Urgent", status: "Open", age: "2h", agent: "Unassigned" },
  { id: "T-4820", tenant: "Acme Foods Inc.", subject: "Bulk import: 40 employees stuck in 'pending'", priority: "High", status: "Open", age: "5h", agent: "Joy R." },
  { id: "T-4818", tenant: "Northwind Retail", subject: "13th-month computation question", priority: "Normal", status: "Open", age: "1d", agent: "Mike T." },
  { id: "T-4815", tenant: "Kape Manila Co.", subject: "How do I add a pay schedule?", priority: "Low", status: "Pending", age: "1d", agent: "Joy R." },
  { id: "T-4810", tenant: "Sierra Manufacturing", subject: "SSO (Azure AD) setup assistance", priority: "Normal", status: "Open", age: "2d", agent: "Mike T." },
];

const PACKAGES = [
  { name: "Starter", price: 4500, unit: "/mo", blurb: "Up to 50 employees", tenants: 2, features: ["1 pay schedule", "Gov't remittances", "Email support"] },
  { name: "Pro", price: 12000, unit: "/mo", blurb: "Up to 1,000 employees", tenants: 5, features: ["Unlimited schedules", "Multi-company", "Priority support", "API access"], popular: true },
  { name: "Enterprise", price: null, unit: "custom", blurb: "Unlimited + SLA", tenants: 2, features: ["Dedicated CSM", "SSO / SCIM", "Custom integrations", "99.99% SLA"] },
];

const ADMINS = [
  { name: "Christian Canlubo", you: true, email: "mark.canlubo@gmail.com", role: "Super Admin", status: "Active", last: "Jun 12, 2026" },
  { name: "Joy Ramos", email: "joy@sentire.io", role: "Support Lead", status: "Active", last: "Jun 12, 2026" },
  { name: "Mike Tan", email: "mike@sentire.io", role: "Support Agent", status: "Active", last: "Jun 11, 2026" },
  { name: "Dana Cruz", email: "dana@sentire.io", role: "Billing Manager", status: "Active", last: "Jun 10, 2026" },
  { name: "Karl Uy", email: "karl@sentire.io", role: "Support Agent", status: "Invited", last: "—" },
];

const ROLES = [
  { name: "Super Admin", desc: "Full, unrestricted access to all Central Portal features. Built-in.", perms: 24, admins: 1, type: "System" },
  { name: "Billing Manager", desc: "Manage packages, subscriptions, invoices and payments.", perms: 9, admins: 1, type: "Custom" },
  { name: "Support Lead", desc: "Full support queue, tenant impersonation, refunds up to ₱10k.", perms: 14, admins: 1, type: "Custom" },
  { name: "Support Agent", desc: "View and respond to tickets; read-only on billing.", perms: 7, admins: 2, type: "Custom" },
];

const AUDIT = [
  { who: "Christian Canlubo", action: "Reset password", target: "own account", time: "Today, 6:24 PM", ip: "112.198.x.x", kind: "security" },
  { who: "Dana Cruz", action: "Marked invoice INV-2058 as", target: "follow-up", time: "Today, 4:02 PM", ip: "112.198.x.x", kind: "billing" },
  { who: "Joy Ramos", action: "Impersonated tenant", target: "BlueReef Hospitality", time: "Today, 3:55 PM", ip: "180.190.x.x", kind: "security" },
  { who: "System", action: "Auto-suspended tenant", target: "Old Town Bakery (non-payment)", time: "Jun 11, 9:00 AM", ip: "—", kind: "system" },
  { who: "Mike Tan", action: "Onboarded tenant", target: "Verde Agritech", time: "Jun 5, 11:20 AM", ip: "180.190.x.x", kind: "tenant" },
  { who: "Christian Canlubo", action: "Created role", target: "Billing Manager", time: "Jun 3, 2:14 PM", ip: "112.198.x.x", kind: "security" },
];

// 12-month revenue (₱ thousands) for the dashboard chart
const REVENUE = [78, 84, 90, 96, 108, 120, 132, 141, 150, 162, 174, 180].map((v, i) => ({
  m: ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"][i], v,
}));

const sum = (arr, k) => arr.reduce((a, b) => a + (k ? b[k] : b), 0);
const KPI = {
  total: TENANTS.length,
  active: TENANTS.filter(t => t.status === "Active").length,
  trialing: TENANTS.filter(t => t.status === "Trialing").length,
  pastDue: TENANTS.filter(t => t.status === "Past due").length,
  cancelled: TENANTS.filter(t => t.status === "Cancelled").length,
  mrr: sum(TENANTS, "mrr"),
  employees: sum(TENANTS, "emp"),
  outstanding: sum(INVOICES.filter(i => i.status === "Overdue" || i.status === "Pending"), "amount"),
  collected: sum(INVOICES.filter(i => i.status === "Paid"), "amount"),
  openTickets: TICKETS.filter(t => t.status === "Open").length,
};

window.CP = { peso, TENANTS, INVOICES, TICKETS, PACKAGES, ADMINS, ROLES, AUDIT, REVENUE, KPI };
