"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  Building2, Users, Calculator, Boxes, FileCheck, Bell, ShieldCheck,
  CircleCheck, Star, Mail, LogIn, Lock, Pencil, CreditCard, Activity,
  Calendar, Receipt, Landmark, Plus, Network, Clock, Smartphone, Shield,
  Home, Coins, FileText, MessageSquare, BellRing, HeartPulse, Loader2,
} from "lucide-react";

const NAVY = "#E8693A";
const BORDER = "#E5E7EB";
const BORDER2 = "#F3F4F6";
const TXT = "#111827";
const SUB = "#6B7280";
const MUTE = "#9CA3AF";

const TIER_PILL: Record<string, string> = {
  PRO: "bg-violet-100 text-violet-700",
  GROWTH: "bg-blue-50 text-blue-700",
  STARTER: "bg-gray-100 text-gray-700",
};
const STATUS_PILL: Record<string, string> = {
  ACTIVE: "bg-green-50 text-green-700",
  TRIALING: "bg-amber-50 text-amber-800",
  PAST_DUE: "bg-red-50 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};
const PLAN_LIMIT: Record<string, string> = { STARTER: "50", GROWTH: "200", PRO: "Unlimited" };

type Tenant = {
  id: string; name: string; tradeName: string | null; companyCode: string | null;
  subdomain: string | null; industry: string | null; subscriptionTier: string;
  subscriptionStatus: string; trialEndsAt: string | null; billingEmail: string | null;
  featureFlags: Record<string, boolean>;
  payrollCycle: string | null; payDay1: number | null; payDay2: number | null;
  statutoryCutoffRule: string | null; thirteenthMonthBasis: string | null; workingDaysDenominator: number | null;
  contactEmail: string | null; contactPhone: string | null; tinNumber: string | null;
  address: string | null; city: string | null; province: string | null; zipCode: string | null;
  createdAt: string; updatedAt: string;
  _count: { employees: number; users: number; payrollBooks: number };
};
type User = {
  id: string; firstName: string; lastName: string; email: string;
  systemRole: string; isActive: boolean; lastLoginAt: string | null; createdAt: string;
};

const TABS = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "payroll", label: "Payroll setup", icon: Calculator },
  { id: "modules", label: "HR modules", icon: Boxes },
  { id: "compliance", label: "Compliance", icon: FileCheck },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "access", label: "Access & roles", icon: ShieldCheck },
] as const;
type TabId = typeof TABS[number]["id"];

const MODULES: { key: string; name: string; desc: string; icon: LucideIcon }[] = [
  { key: "hris", name: "HRIS — Human resource information system", desc: "Employee profiles, 201 files, org structure, asset tracking, incident management & movement forms", icon: Users },
  { key: "ats", name: "ATS — Applicant tracking system", desc: "Kanban recruitment pipeline, applicant stages, 1-click convert to employee", icon: Network },
  { key: "timeAttendance", name: "Time & attendance", desc: "GPS geofencing clock-in with selfie capture, kiosk mode, shift scheduling, leave management, DTR approval chain, OT", icon: Clock },
  { key: "payroll", name: "Payroll", desc: "Gross-to-net computation engine, payroll book & sheet, expense claims, custom pay components, bank file generation", icon: Calculator },
  { key: "compliance", name: "Compliance & statutory reports", desc: "SSS R-1A/R-3, PhilHealth ER2/RF1, Pag-IBIG MCRF, BIR 1601-C, Form 2316, Alphalist", icon: FileCheck },
  { key: "ess", name: "ESS — Employee self-service mobile PWA", desc: "Clock-in, payslip viewing (PIN-protected), leave & OT filing, expense claims, profile management", icon: Smartphone },
];

const STATUTORY: { name: string; icon: LucideIcon; detail: string }[] = [
  { name: "SSS", icon: Shield, detail: "Social Security System · MSC table 2024 · Employer 9.5% / Employee 4.5%" },
  { name: "PhilHealth", icon: HeartPulse, detail: "Philippine Health Insurance · 5% of basic (ER 2.5% / EE 2.5%) · AO 2023-0016" },
  { name: "Pag-IBIG (HDMF)", icon: Home, detail: "Home Development Mutual Fund · 2% EE / 2% ER · capped at PHP 100/mo employee" },
  { name: "BIR TRAIN", icon: Landmark, detail: "Withholding tax on compensation · TRAIN Law (RA 10963) · annual tables" },
];
const DE_MINIMIS: [string, string][] = [
  ["Rice subsidy", "PHP 3,000 / mo"],
  ["Medical cash allowance", "PHP 1,500 / sem"],
  ["Uniform & clothing", "PHP 6,000 / yr"],
  ["Laundry allowance", "PHP 300 / mo"],
  ["Achievement awards", "PHP 10,000 / yr"],
  ["13th month & other", "PHP 90,000 / yr"],
];
const ROLE_PERMS: [string, string][] = [
  ["Company admin", "Full access"],
  ["HR manager", "All HR modules · payroll read"],
  ["Payroll manager", "Payroll run · statutory reports"],
  ["Supervisor", "DTR edit · leave/OT approval"],
  ["Manager", "DTR final approval · audit log"],
  ["Employee", "ESS only (own records)"],
];
// featureFlags-backed toggles: [key, label, sublabel, default]
const PAYROLL_TOGGLES: [string, string, string, boolean][] = [
  ["pay_mwe", "Minimum wage employees (MWE)", "MWE are exempt from withholding tax", true],
  ["pay_nsd", "Night shift differential", "+10% for work between 10PM-6AM", true],
  ["pay_bonus", "Off-cycle bonus runs", "Allow skip-statutory flag on bonus payrolls", true],
];
const REPORT_TOGGLES: [string, string, string, boolean][] = [
  ["rep_autogen", "Auto-generate after each payroll run", "SSS R-1A/R-3, PhilHealth ER2/RF1, Pag-IBIG MCRF, BIR 1601-C", true],
  ["rep_annual", "Annual reports (BIR 2316 & Alphalist)", "Generated each January for the preceding tax year", true],
  ["rep_finalpay", "Final pay documents (Quitclaim & 2316)", "Auto-generated on employee offboarding", true],
];
const EMAIL_NOTIFS: [string, string, string, boolean][] = [
  ["notif_email_payslip", "Payslip published", "Sent to each employee", true],
  ["notif_email_leave", "Leave approved / rejected", "Sent to employee", true],
  ["notif_email_ot", "OT approved / rejected", "Sent to employee", true],
  ["notif_email_dtr", "DTR submission reminder", "Sent at cutoff end", true],
  ["notif_email_expense", "Expense claim update", "Sent to employee", false],
  ["notif_email_statutory", "Statutory rate update", "Sent to company admin", true],
];
const SMS_NOTIFS: [string, string, string, boolean][] = [
  ["notif_sms_activation", "ESS activation link", "Sent on employee creation", true],
  ["notif_sms_ot", "OT approved / rejected", "For employees without email", true],
  ["notif_sms_geofence", "Clock-in geofence alert", "Optional - per branch", false],
];
const PUSH_NOTIFS: [string, string, boolean][] = [
  ["notif_push_payslip", "Payslip released", true],
  ["notif_push_leave", "Leave approved / rejected", true],
  ["notif_push_dtr", "DTR submission reminder", true],
];
const SECURITY: [string, string, string, boolean][] = [
  ["sec_ssl", "Enforce SSL on all connections", "", true],
  ["sec_pin", "Payslip PIN protection", "Employees must enter PIN to view payslip", true],
  ["sec_bankapproval", "Bank account change approval", "Profile update requests require HR approval", true],
];
const BANKS: [string, string, string, boolean][] = [
  ["bank_bdo", "BDO Unibank", "CSV - PESONET format", true],
  ["bank_bpi", "BPI", "TXT - BPI payroll format", true],
  ["bank_unionbank", "UnionBank", "XLSX - EON payroll format", false],
  ["bank_metrobank", "Metrobank", "CSV - Metrobank batch format", false],
];
const TA_SUB: [string, string][] = [
  ["ta_gps", "GPS geofencing"], ["ta_kiosk", "Kiosk mode"],
  ["ta_selfie", "Selfie capture"], ["ta_dtr", "DTR approval chain"],
];
function Toggle({ on, onClick, disabled, small }: { on: boolean; onClick?: () => void; disabled?: boolean; small?: boolean }) {
  const w = small ? 28 : 34; const h = small ? 15 : 18; const knob = small ? 11 : 14;
  return (
    <button onClick={onClick} disabled={disabled} aria-label="toggle"
      className="relative rounded-full transition-colors disabled:opacity-50 flex-shrink-0"
      style={{ width: w, height: h, background: on ? NAVY : "#D1D5DB" }}>
      <span className="absolute rounded-full bg-white transition-all" style={{ width: knob, height: knob, top: 2, left: on ? w - knob - 2 : 2 }} />
    </button>
  );
}

function Card({ title, icon: Icon, action, children, pad = true }: { title?: string; icon?: LucideIcon; action?: React.ReactNode; children: React.ReactNode; pad?: boolean }) {
  return (
    <div className="rounded-xl overflow-hidden bg-white" style={{ border: "1px solid " + BORDER }}>
      {title && (
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid " + BORDER2 }}>
          <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: TXT }}>
            {Icon && <Icon className="w-4 h-4" style={{ color: SUB }} />}{title}
          </span>
          {action}
        </div>
      )}
      <div style={{ padding: pad ? "14px 16px" : 0 }}>{children}</div>
    </div>
  );
}

function InfoRow({ k, v }: { k: string; v?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline py-1.5" style={{ borderBottom: "1px solid " + BORDER2 }}>
      <span className="text-xs" style={{ color: SUB }}>{k}</span>
      <span className="text-xs font-medium text-right" style={{ color: TXT, maxWidth: "62%" }}>{v ?? "—"}</span>
    </div>
  );
}

function SettingRow({ label, sub, ctrl }: { label: string; sub?: string; ctrl: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2.5" style={{ borderBottom: "1px solid " + BORDER2 }}>
      <div><div className="text-xs" style={{ color: TXT }}>{label}</div>{sub && <div className="text-[11px] mt-0.5" style={{ color: SUB }}>{sub}</div>}</div>
      <div className="flex items-center gap-2">{ctrl}</div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "#F9FAFB", border: "1px solid " + BORDER2 }}>
      <div className="text-[10px] mb-1" style={{ color: SUB }}>{label}</div>
      <div className="text-lg font-semibold" style={{ color: TXT }}>{value}</div>
      {sub && <div className="text-[10px] mt-0.5" style={{ color: MUTE }}>{sub}</div>}
    </div>
  );
}

const SELECT_CLS = "rounded-md px-2 py-1.5 text-xs outline-none";
const SELECT_STYLE = { border: "1px solid #D1D5DB", background: "white", color: TXT } as const;
export default function TenantDetailClient({ tenant: initial, users }: { tenant: Tenant; users: User[] }) {
  const router = useRouter();
  const [tenant, setTenant] = useState(initial);
  const [tab, setTab] = useState<TabId>("overview");
  const [saving, setSaving] = useState(false);
  const [editSub, setEditSub] = useState(false);
  const [editTier, setEditTier] = useState(tenant.subscriptionTier);
  const [editStatus, setEditStatus] = useState(tenant.subscriptionStatus);
  const [editBilling, setEditBilling] = useState(tenant.billingEmail ?? "");
  const [editTrial, setEditTrial] = useState(tenant.trialEndsAt?.slice(0, 10) ?? "");
  const [editCompany, setEditCompany] = useState(false);
  const [coName, setCoName] = useState(tenant.name);
  const [coTrade, setCoTrade] = useState(tenant.tradeName ?? "");
  const [coTin, setCoTin] = useState(tenant.tinNumber ?? "");
  const [coIndustry, setCoIndustry] = useState(tenant.industry ?? "");
  const [coProvince, setCoProvince] = useState(tenant.province ?? "");
  const [coCode, setCoCode] = useState(tenant.companyCode ?? "");
  const [coAddress, setCoAddress] = useState(tenant.address ?? "");

  async function patchTenant(patch: Record<string, unknown>, optimistic?: Partial<Tenant>) {
    setSaving(true);
    if (optimistic) setTenant((t) => ({ ...t, ...optimistic }));
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      setTenant((t) => ({ ...t, ...json.data }));
      toast.success("Saved");
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally { setSaving(false); }
  }
  const flag = (key: string, def: boolean) => tenant.featureFlags[key] ?? def;
  async function toggleFlag(key: string, def: boolean) {
    const next = !(tenant.featureFlags[key] ?? def);
    setTenant((t) => ({ ...t, featureFlags: { ...t.featureFlags, [key]: next } }));
    await patchTenant({ featureFlagsPatch: { [key]: next } });
  }
  async function saveSub() {
    await patchTenant({ subscriptionTier: editTier, subscriptionStatus: editStatus, billingEmail: editBilling || null, trialEndsAt: editTrial ? new Date(editTrial).toISOString() : null });
    setEditSub(false);
  }
  async function saveCompany() {
    const patch = {
      name: coName.trim(),
      tradeName: coTrade.trim() || null,
      tinNumber: coTin.trim() || null,
      industry: coIndustry.trim() || null,
      province: coProvince.trim() || null,
      companyCode: coCode.trim() ? coCode.trim().toUpperCase() : null,
      address: coAddress.trim() || null,
    };
    // PATCH response doesn't echo these fields, so update local state optimistically.
    await patchTenant(patch, patch);
    setEditCompany(false);
  }

  const initials = tenant.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const subline = [tenant.tinNumber ? "TIN " + tenant.tinNumber : null, tenant.province, tenant.subdomain ? "app.sentire.ph/" + tenant.subdomain : null].filter(Boolean).join("  ·  ");
  const isActive = tenant.subscriptionStatus === "ACTIVE";
  const isTrial = tenant.subscriptionStatus === "TRIALING";
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={{ fontFamily: "var(--font-plus-jakarta-sans, sans-serif)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-medium flex-shrink-0" style={{ background: NAVY }}>{initials}</div>
        <div>
          <div className="text-base font-medium" style={{ color: TXT }}>{tenant.name}</div>
          <div className="text-[11px] mt-0.5" style={{ color: SUB }}>{subline || "—"}</div>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium" style={isActive ? { background: "rgba(11,122,62,0.1)", color: "#0b7a3e" } : isTrial ? { background: "rgba(179,92,0,0.1)", color: "#b35c00" } : { background: "#F3F4F6", color: SUB }}>
          <CircleCheck className="w-3 h-3" />{tenant.subscriptionStatus}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(232,105,58,0.1)", color: NAVY }}>
          <Star className="w-3 h-3" />{tenant.subscriptionTier} plan
        </span>
        <div className="ml-auto flex gap-2">
          <button onClick={() => { const e = tenant.contactEmail || tenant.billingEmail; if (e) window.location.href = "mailto:" + e; else toast.info("No admin email on file"); }} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium" style={{ border: "1px solid " + BORDER, background: "white", color: SUB }}><Mail className="w-3.5 h-3.5" />Email admin</button>
          <button onClick={() => toast.info("Impersonation is not enabled yet")} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium text-white" style={{ background: NAVY }}><LogIn className="w-3.5 h-3.5" />Impersonate</button>
          <button onClick={() => toast.info("Suspend is not enabled yet")} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium" style={{ border: "1px solid rgba(163,45,45,0.4)", background: "white", color: "#a32d2d" }}><Lock className="w-3.5 h-3.5" />Suspend</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-5 overflow-x-auto" style={{ borderBottom: "1px solid " + BORDER }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs whitespace-nowrap" style={tab === id ? { color: NAVY, borderBottom: "2px solid " + NAVY, fontWeight: 500, marginBottom: -1 } : { color: SUB, borderBottom: "2px solid transparent", marginBottom: -1 }}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-3 gap-2.5">
            <StatCard label="Active employees" value={tenant._count.employees} sub={"of " + (PLAN_LIMIT[tenant.subscriptionTier] || "—") + " slots"} />
            <StatCard label="Payroll runs" value={tenant._count.payrollBooks} sub={tenant.payrollCycle ? tenant.payrollCycle.replace("_", "-").toLowerCase() : "—"} />
            <StatCard label="Portal users" value={tenant._count.users} sub="admins & staff" />
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            <Card title="Company details" icon={Building2} action={!editCompany ? <button onClick={() => { setCoName(tenant.name); setCoTrade(tenant.tradeName ?? ""); setCoTin(tenant.tinNumber ?? ""); setCoIndustry(tenant.industry ?? ""); setCoProvince(tenant.province ?? ""); setCoCode(tenant.companyCode ?? ""); setCoAddress(tenant.address ?? ""); setEditCompany(true); }} className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md" style={{ border: "1px solid " + BORDER, color: SUB }}><Pencil className="w-3 h-3" />Edit</button> : undefined}>
              {editCompany ? (
                <div className="space-y-2.5">
                  <div className="space-y-1"><label className="text-[11px]" style={{ color: SUB }}>Legal name</label><input className={SELECT_CLS + " w-full"} style={SELECT_STYLE} value={coName} onChange={(e) => setCoName(e.target.value)} /></div>
                  <div className="space-y-1"><label className="text-[11px]" style={{ color: SUB }}>Trade name</label><input className={SELECT_CLS + " w-full"} style={SELECT_STYLE} value={coTrade} onChange={(e) => setCoTrade(e.target.value)} /></div>
                  <div className="space-y-1"><label className="text-[11px]" style={{ color: SUB }}>TIN</label><input className={SELECT_CLS + " w-full"} style={SELECT_STYLE} value={coTin} onChange={(e) => setCoTin(e.target.value)} /></div>
                  <div className="space-y-1"><label className="text-[11px]" style={{ color: SUB }}>Industry</label><input className={SELECT_CLS + " w-full"} style={SELECT_STYLE} value={coIndustry} onChange={(e) => setCoIndustry(e.target.value)} /></div>
                  <div className="space-y-1"><label className="text-[11px]" style={{ color: SUB }}>DOLE region</label><input className={SELECT_CLS + " w-full"} style={SELECT_STYLE} value={coProvince} onChange={(e) => setCoProvince(e.target.value)} /></div>
                  <div className="space-y-1"><label className="text-[11px]" style={{ color: SUB }}>Company code</label><input className={SELECT_CLS + " w-full"} style={SELECT_STYLE} value={coCode} onChange={(e) => setCoCode(e.target.value.toUpperCase())} placeholder="UPPERCASE + digits" /></div>
                  <div className="space-y-1"><label className="text-[11px]" style={{ color: SUB }}>Registered address</label><input className={SELECT_CLS + " w-full"} style={SELECT_STYLE} value={coAddress} onChange={(e) => setCoAddress(e.target.value)} /></div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={saveCompany} disabled={saving || !coName.trim()} className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md text-white disabled:opacity-60" style={{ background: NAVY }}>{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Save</button>
                    <button onClick={() => setEditCompany(false)} className="px-3 text-xs py-1.5 rounded-md" style={{ border: "1px solid " + BORDER, color: SUB }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow k="Legal name" v={tenant.name} />
                  <InfoRow k="Trade name" v={tenant.tradeName} />
                  <InfoRow k="TIN" v={tenant.tinNumber} />
                  <InfoRow k="Industry" v={tenant.industry} />
                  <InfoRow k="DOLE region" v={tenant.province} />
                  <InfoRow k="Company code" v={tenant.companyCode} />
                  <InfoRow k="Registered address" v={tenant.address} />
                </>
              )}
            </Card>
            <div className="flex flex-col gap-3.5">
              <Card title="Subscription & billing" icon={CreditCard} action={!editSub ? <button onClick={() => setEditSub(true)} className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md" style={{ border: "1px solid " + BORDER, color: SUB }}><Pencil className="w-3 h-3" />Edit</button> : undefined}>
                {editSub ? (
                  <div className="space-y-2.5">
                    <div className="space-y-1"><label className="text-[11px]" style={{ color: SUB }}>Plan tier</label><select className={SELECT_CLS + " w-full"} style={SELECT_STYLE} value={editTier} onChange={(e) => setEditTier(e.target.value)}>{["STARTER", "GROWTH", "PRO"].map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                    <div className="space-y-1"><label className="text-[11px]" style={{ color: SUB }}>Status</label><select className={SELECT_CLS + " w-full"} style={SELECT_STYLE} value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>{["ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED"].map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
                    <div className="space-y-1"><label className="text-[11px]" style={{ color: SUB }}>Trial ends</label><input type="date" className={SELECT_CLS + " w-full"} style={SELECT_STYLE} value={editTrial} onChange={(e) => setEditTrial(e.target.value)} /></div>
                    <div className="space-y-1"><label className="text-[11px]" style={{ color: SUB }}>Billing email</label><input type="email" className={SELECT_CLS + " w-full"} style={SELECT_STYLE} value={editBilling} onChange={(e) => setEditBilling(e.target.value)} /></div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={saveSub} disabled={saving} className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md text-white disabled:opacity-60" style={{ background: NAVY }}>{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Save</button>
                      <button onClick={() => setEditSub(false)} className="px-3 text-xs py-1.5 rounded-md" style={{ border: "1px solid " + BORDER, color: SUB }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <InfoRow k="Plan" v={<span className={"text-[10px] rounded-full px-2 py-0.5 " + (TIER_PILL[tenant.subscriptionTier] || "bg-gray-100 text-gray-700")}>{tenant.subscriptionTier}</span>} />
                    <InfoRow k="Status" v={<span className={"text-[10px] rounded-full px-2 py-0.5 " + (STATUS_PILL[tenant.subscriptionStatus] || "bg-gray-100 text-gray-500")}>{tenant.subscriptionStatus}</span>} />
                    <InfoRow k="Max employees" v={PLAN_LIMIT[tenant.subscriptionTier] || "—"} />
                    <InfoRow k="Billing email" v={tenant.billingEmail} />
                    <InfoRow k="Trial ends" v={tenant.trialEndsAt ? fmt(tenant.trialEndsAt) : "—"} />
                    <InfoRow k="Customer since" v={fmt(tenant.createdAt)} />
                  </>
                )}
              </Card>
              <Card title="System" icon={Activity}>
                <InfoRow k="Created" v={fmt(tenant.createdAt)} />
                <InfoRow k="Last updated" v={fmt(tenant.updatedAt)} />
                <InfoRow k="Company code" v={tenant.companyCode} />
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* PAYROLL SETUP */}
      {tab === "payroll" && (
        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3.5">
            <Card title="Payroll schedule" icon={Calendar}>
              <SettingRow label="Payroll frequency" ctrl={<select className={SELECT_CLS} style={SELECT_STYLE} value={tenant.payrollCycle ?? "SEMI_MONTHLY"} onChange={(e) => patchTenant({ payrollCycle: e.target.value }, { payrollCycle: e.target.value })}><option value="SEMI_MONTHLY">Semi-monthly</option><option value="MONTHLY">Monthly</option><option value="WEEKLY">Weekly</option><option value="BI_WEEKLY">Bi-weekly</option><option value="DAILY">Daily</option></select>} />
              <SettingRow label="Pay day 1" sub="Day of month for first cutoff" ctrl={<input className={SELECT_CLS} style={{ ...SELECT_STYLE, width: 64 }} type="number" value={tenant.payDay1 ?? ""} onChange={(e) => setTenant((t) => ({ ...t, payDay1: e.target.value === "" ? null : Number(e.target.value) }))} onBlur={(e) => patchTenant({ payDay1: e.target.value === "" ? null : Number(e.target.value) })} />} />
              <SettingRow label="Pay day 2" sub="Day of month for second cutoff" ctrl={<input className={SELECT_CLS} style={{ ...SELECT_STYLE, width: 64 }} type="number" value={tenant.payDay2 ?? ""} onChange={(e) => setTenant((t) => ({ ...t, payDay2: e.target.value === "" ? null : Number(e.target.value) }))} onBlur={(e) => patchTenant({ payDay2: e.target.value === "" ? null : Number(e.target.value) })} />} />
              <SettingRow label="Statutory deduction cutoff" sub="Which cutoff collects SSS, PhilHealth, Pag-IBIG" ctrl={<select className={SELECT_CLS} style={SELECT_STYLE} value={tenant.statutoryCutoffRule ?? "SECOND_CUTOFF"} onChange={(e) => patchTenant({ statutoryCutoffRule: e.target.value }, { statutoryCutoffRule: e.target.value })}><option value="SECOND_CUTOFF">2nd cutoff (16th-30th)</option><option value="FIRST_CUTOFF">1st cutoff (1st-15th)</option></select>} />
              <SettingRow label="Working days denominator" sub="Used for daily rate computation" ctrl={<select className={SELECT_CLS} style={SELECT_STYLE} value={String(tenant.workingDaysDenominator ?? 261)} onChange={(e) => patchTenant({ workingDaysDenominator: Number(e.target.value) }, { workingDaysDenominator: Number(e.target.value) })}><option value="261">261 days</option><option value="313">313 days</option><option value="365">365 days</option></select>} />
            </Card>
            <Card title="13th month & computation" icon={Receipt}>
              <SettingRow label="13th month method" sub="Basis for annual computation" ctrl={<select className={SELECT_CLS} style={SELECT_STYLE} value={tenant.thirteenthMonthBasis ?? "STRICT_DOLE"} onChange={(e) => patchTenant({ thirteenthMonthBasis: e.target.value }, { thirteenthMonthBasis: e.target.value })}><option value="STRICT_DOLE">Strict DOLE (basic pay)</option><option value="INCLUDE_ALLOWANCES">Include allowances</option></select>} />
              {PAYROLL_TOGGLES.map(([key, label, sub, def]) => <SettingRow key={key} label={label} sub={sub} ctrl={<Toggle on={flag(key, def)} disabled={saving} onClick={() => toggleFlag(key, def)} />} />)}
            </Card>
          </div>
          <Card title="Bank file generation" icon={Landmark} action={<button onClick={() => toast.info("Add bank coming soon")} className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md" style={{ border: "1px solid " + BORDER, color: SUB }}><Plus className="w-3 h-3" />Add bank</button>}>
            <div className="grid grid-cols-2 gap-2">
              {BANKS.map(([key, name, format, def]) => { const on = flag(key, def); return (
                <div key={key} className="flex items-center gap-2 rounded-md px-3 py-2.5" style={{ border: "1px solid " + (on ? "rgba(232,105,58,0.4)" : BORDER), background: on ? "rgba(232,105,58,0.03)" : "white" }}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: on ? "#0b7a3e" : "#D1D5DB" }} />
                  <div className="flex-1 min-w-0"><div className="text-xs font-medium" style={{ color: TXT }}>{name}</div><div className="text-[10px]" style={{ color: SUB }}>{format}</div></div>
                  <Toggle on={on} disabled={saving} onClick={() => toggleFlag(key, def)} />
                </div>
              ); })}
            </div>
          </Card>
          <p className="text-[11px] px-3 py-2 rounded-md" style={{ color: SUB, background: "#F9FAFB", border: "1px solid " + BORDER }}>All controls on this tab persist live — schedule fields save to the tenant record; toggles save to featureFlags.</p>
        </div>
      )}

      {/* HR MODULES */}
      {tab === "modules" && (
        <div className="flex flex-col gap-2.5">
          {MODULES.map((m) => { const on = flag(m.key, false); const Icon = m.icon; return (
            <div key={m.key} className="rounded-xl bg-white" style={{ border: "1px solid " + (on ? "rgba(232,105,58,0.3)" : BORDER) }}>
              <div className="flex items-start gap-2.5 p-3.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={on ? { background: "rgba(232,105,58,0.1)", color: NAVY } : { background: "#F3F4F6", color: MUTE }}><Icon className="w-4 h-4" /></div>
                <div className="flex-1 min-w-0"><div className="text-xs font-medium" style={{ color: on ? TXT : SUB }}>{m.name}</div><div className="text-[11px] mt-0.5 leading-relaxed" style={{ color: SUB }}>{m.desc}</div></div>
                <Toggle on={on} disabled={saving} onClick={() => toggleFlag(m.key, false)} />
              </div>
              {m.key === "timeAttendance" && on && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-3.5 pb-3.5 pt-3" style={{ borderTop: "1px solid " + BORDER2 }}>
                  {TA_SUB.map(([key, label]) => <div key={key} className="flex items-center justify-between"><span className="text-[11px]" style={{ color: TXT }}>{label}</span><Toggle small on={flag(key, true)} disabled={saving} onClick={() => toggleFlag(key, true)} /></div>)}
                </div>
              )}
            </div>
          ); })}
          <p className="text-[11px] px-3 py-2 rounded-md" style={{ color: SUB, background: "#F9FAFB", border: "1px solid " + BORDER }}>All module switches and sub-toggles write to the tenant featureFlags and persist immediately.</p>
        </div>
      )}

      {/* COMPLIANCE */}
      {tab === "compliance" && (
        <div className="flex flex-col gap-3.5">
          <Card title="Statutory deduction tables" icon={FileCheck} action={<span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: "rgba(11,122,62,0.1)", color: "#0b7a3e" }}>Auto-updated by Sentire</span>}>
            {STATUTORY.map((s) => { const Icon = s.icon; return (
              <div key={s.name} className="flex items-center gap-2.5 py-2.5" style={{ borderBottom: "1px solid " + BORDER2 }}>
                <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: "rgba(232,105,58,0.08)", color: NAVY }}><Icon className="w-3.5 h-3.5" /></div>
                <div className="text-xs font-medium" style={{ color: TXT, minWidth: 92 }}>{s.name}</div>
                <div className="text-[11px] flex-1" style={{ color: SUB }}>{s.detail}</div>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={{ background: "rgba(11,122,62,0.1)", color: "#0b7a3e" }}>Current</span>
              </div>
            ); })}
          </Card>
          <Card title="De minimis benefits ceilings" icon={Coins} action={<span className="text-[11px]" style={{ color: SUB }}>RR 29-2025 thresholds</span>}>
            <div className="grid grid-cols-2 gap-x-4">
              {DE_MINIMIS.map(([k, v]) => <InfoRow key={k} k={k} v={v} />)}
            </div>
          </Card>
          <Card title="Statutory report generation" icon={FileText}>
            {REPORT_TOGGLES.map(([key, label, sub, def]) => <SettingRow key={key} label={label} sub={sub} ctrl={<Toggle on={flag(key, def)} disabled={saving} onClick={() => toggleFlag(key, def)} />} />)}
          </Card>
        </div>
      )}

      {/* NOTIFICATIONS */}
      {tab === "notifications" && (
        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3.5">
            <Card title="Email notifications (Resend)" icon={Mail}>
              {EMAIL_NOTIFS.map(([key, label, sub, def]) => <SettingRow key={key} label={label} sub={sub} ctrl={<Toggle on={flag(key, def)} disabled={saving} onClick={() => toggleFlag(key, def)} />} />)}
            </Card>
            <div className="flex flex-col gap-3.5">
              <Card title="SMS (Semaphore PH)" icon={MessageSquare}>
                {SMS_NOTIFS.map(([key, label, sub, def]) => <SettingRow key={key} label={label} sub={sub} ctrl={<Toggle on={flag(key, def)} disabled={saving} onClick={() => toggleFlag(key, def)} />} />)}
              </Card>
              <Card title="Web push (ESS PWA)" icon={BellRing}>
                {PUSH_NOTIFS.map(([key, label, def]) => <SettingRow key={key} label={label} ctrl={<Toggle on={flag(key, def)} disabled={saving} onClick={() => toggleFlag(key, def)} />} />)}
              </Card>
            </div>
          </div>
          <p className="text-[11px] px-3 py-2 rounded-md" style={{ color: SUB, background: "#F9FAFB", border: "1px solid " + BORDER }}>Notification preferences persist to the tenant featureFlags. Channel delivery (Resend / Semaphore) is wired separately.</p>
        </div>
      )}

      {/* ACCESS & ROLES */}
      {tab === "access" && (
        <div className="flex flex-col gap-3.5">
          <Card title="Admin users" icon={Users} action={<button onClick={() => toast.info("Add admin coming soon")} className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md text-white" style={{ background: NAVY }}><Plus className="w-3 h-3" />Add admin</button>}>
            {users.length === 0 ? <p className="text-xs py-3" style={{ color: MUTE }}>No admin users yet.</p> : users.map((u) => (
              <div key={u.id} className="flex items-center gap-2.5 py-2" style={{ borderBottom: "1px solid " + BORDER2 }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0" style={{ background: "rgba(232,105,58,0.1)", color: NAVY }}>{(u.firstName[0] || "") + (u.lastName[0] || "")}</div>
                <div className="flex-1 min-w-0"><div className="text-xs font-medium" style={{ color: TXT }}>{u.firstName} {u.lastName}</div><div className="text-[11px]" style={{ color: SUB }}>{u.email}</div></div>
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ border: "1px solid " + BORDER, color: SUB }}>{u.systemRole}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={u.isActive ? { background: "rgba(11,122,62,0.1)", color: "#0b7a3e" } : { background: "#F3F4F6", color: MUTE }}>{u.isActive ? "Active" : "Inactive"}</span>
              </div>
            ))}
          </Card>
          <div className="grid grid-cols-2 gap-3.5">
            <Card title="Role permissions" icon={Network}>
              {ROLE_PERMS.map(([r, a]) => <InfoRow key={r} k={r} v={<span className="text-[11px]">{a}</span>} />)}
            </Card>
            <Card title="Security settings" icon={Lock}>
              {SECURITY.map(([key, label, sub, def]) => <SettingRow key={key} label={label} sub={sub} ctrl={<Toggle on={flag(key, def)} disabled={saving} onClick={() => toggleFlag(key, def)} />} />)}
              <SettingRow label="ESS session timeout" sub="Display-only (numeric setting, not yet stored)" ctrl={<><input className={SELECT_CLS} style={{ ...SELECT_STYLE, width: 55 }} type="number" defaultValue={8} /><span className="text-[11px]" style={{ color: SUB }}>hrs</span></>} />
            </Card>
          </div>
        </div>
      )}

    </div>
  );
}
