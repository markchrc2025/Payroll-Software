"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";

// ---- SentireMark: 4-node constellation with accent center dot ----
function SentireMark({ size = 30 }: { size?: number }) {
  const ink = "#F7F7F7";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" style={{ flex: "none", display: "block" }}>
      <g stroke={ink} strokeWidth="3.4" strokeLinecap="round" opacity="0.5">
        <line x1="24" y1="24" x2="24" y2="11.5" />
        <line x1="24" y1="24" x2="38.5" y2="24" />
        <line x1="24" y1="24" x2="19.55" y2="36.22" />
        <line x1="24" y1="24" x2="10.84" y2="19.21" />
      </g>
      <g stroke={ink} strokeWidth="2.55" strokeLinecap="round" opacity="0.18">
        <line x1="24" y1="11.5" x2="38.5" y2="24" />
        <line x1="38.5" y1="24" x2="19.55" y2="36.22" />
        <line x1="19.55" y1="36.22" x2="10.84" y2="19.21" />
        <line x1="10.84" y1="19.21" x2="24" y2="11.5" />
      </g>
      <circle cx="24" cy="11.5" r="3.68" fill={ink} />
      <circle cx="38.5" cy="24" r="4.13" fill={ink} />
      <circle cx="19.55" cy="36.22" r="3.85" fill={ink} />
      <circle cx="10.84" cy="19.21" r="3.43" fill={ink} />
      <circle cx="24" cy="24" r="5" fill="#E8693A" />
    </svg>
  );
}

// ---- inline SVG icon set (stroke 1.7, 24×24 viewBox) ----
const ICON_PATHS: Record<string, string> = {
  dashboard:     "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  employees:     "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11",
  departments:   "M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 21V9h4a1 1 0 0 1 1 1v11M3 21h18M7.5 8h.01M7.5 12h.01M11 8h.01M11 12h.01",
  branches:      "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9",
  locations:     "M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  positions:     "M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM14 7h-4V5h4z",
  assets:        "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96L12 12l8.73-5.04M12 22V12",
  incidents:     "M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
  movements:     "M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7",
  requests:      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6",
  claims:        "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  announcements: "M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6",
  recruitment:   "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 11l2 2 4-4",
  time:          "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  leave:         "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 16l2 2 4-4",
  payruns:       "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM2 10h20M6 15h4",
  components:    "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  loans:         "M3 21h18M5 21V11l7-5 7 5v10M9 21v-6h6v6M12 3v2",
  bankfiles:     "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6M9 9h1",
  govreports:    "M12 2l8 3v6c0 4.5-3 8.3-8 9.5C7 19.3 4 15.5 4 11V5l8-3zM9 11.5l2 2 4-4.5",
  analytics:     "M3 3v18h18M7 14l3-3 3 3 5-6",
  payrules:      "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  premium:       "M19 5L5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  holiday:       "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM12 14l1 2 2 .3-1.5 1.4.4 2-1.9-1-1.9 1 .4-2L9 16.3l2-.3z",
  policies:      "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  roles:         "M7 11V7a5 5 0 0 1 10 0v4M5 11h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM12 15v2",
  kiosks:        "M2 4h20v12H2zM8 20h8M12 16v4M7 8h2M7 11h6",
  ai:            "M12 3a3 3 0 0 1 3 3 3 3 0 0 1 0 6 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 0-6 3 3 0 0 1 3-3zM12 8v.01M9 16v3a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-3",
};

function NavIcon({ name, size = 17 }: { name: string; size?: number }) {
  const d = ICON_PATHS[name] || ICON_PATHS.dashboard;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "none" }}>
      <path d={d} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---- nav structure ----
type NavItem = {
  href: string;
  label: string;
  icon: string;
  isNew?: boolean;
  /** Not yet built — rendered as a disabled "Soon" row, never navigates. */
  comingSoon?: boolean;
};
type NavSection = {
  label: string;
  items: NavItem[];
};

// Grouped to mirror hr.my's information architecture, using our own labels.
// Group order follows hr.my's menu sequence (Home → Employee → Expense Claim →
// Leave → Attendance → Document Workflow → Incident → Team → Payroll →
// Employer); groups hr.my doesn't expose (Recruitment, Insights & Tools) are
// kept and placed at the end. `comingSoon` items are functions hr.my exposes
// that we haven't built yet — shown as disabled "Soon" rows so the full
// structure is visible.
const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: "dashboard" }],
  },
  {
    label: "Employee",
    items: [
      { href: "/employees", label: "Employees", icon: "employees" },
      { href: "/profile-update-requests", label: "Profile Requests", icon: "requests" },
      { href: "/movements", label: "Movements", icon: "movements" },
      { href: "/placement", label: "Placement", icon: "positions" },
      { href: "/employment-terms", label: "Employment Terms", icon: "policies" },
      { href: "/background/education", label: "Education", icon: "govreports" },
      { href: "/background/experience", label: "Experience", icon: "recruitment" },
      { href: "/background/training", label: "Training", icon: "recruitment" },
      { href: "/background/legal-documents", label: "Legal Documents", icon: "claims" },
      { href: "/settings/roles", label: "Custom Role", icon: "roles" },
      { href: "/ess-portal", label: "Employee Self-Service", icon: "kiosks" },
    ],
  },
  {
    // PAY-197 (Mark, 20 Nov 2026): the Offboarding module, a main menu with submenus.
    label: "Offboarding",
    items: [
      { href: "/offboarding", label: "Cases", icon: "movements" },
      { href: "/offboarding/checklist", label: "Clearance Checklist", icon: "policies" },
    ],
  },
  {
    label: "Expense Claim",
    items: [
      { href: "/expense-claims", label: "Expense Claims", icon: "claims" },
      { href: "/expense-claims/review", label: "Review", icon: "requests" },
      { href: "#soon-expense-transaction-report", label: "Transaction Report", icon: "govreports", comingSoon: true },
      { href: "/settings/lists/EXPENSE_CATEGORY", label: "Category", icon: "components" },
      { href: "/settings/lists/EXPENSE_TYPE", label: "Type", icon: "components" },
    ],
  },
  {
    label: "Leave",
    items: [
      { href: "/leave", label: "Leave", icon: "leave" },
      { href: "/settings/leave-policies", label: "Leave Policies", icon: "policies" },
      { href: "#soon-leave-planner", label: "Planner", icon: "leave", comingSoon: true },
      { href: "#soon-leave-schedule", label: "Schedule", icon: "time", comingSoon: true },
      { href: "/leave/review", label: "Review", icon: "requests" },
      { href: "#soon-leave-transaction-report", label: "Transaction Report", icon: "govreports", comingSoon: true },
      { href: "#soon-leave-entitlement-report", label: "Entitlement Report", icon: "govreports", comingSoon: true },
      { href: "#soon-leave-earning-policy", label: "Earning Policy", icon: "policies", comingSoon: true },
    ],
  },
  {
    label: "Attendance",
    items: [
      { href: "/attendance", label: "Time & Attendance", icon: "time" },
      { href: "/shift-schedules", label: "Shift Schedules", icon: "time" },
      { href: "/ot-applications", label: "OT Applications", icon: "time" },
      { href: "/undertime-requests", label: "Undertime Requests", icon: "time" },
      { href: "/settings/premium-rates", label: "Premium Rates", icon: "premium" },
      { href: "/settings/holidays", label: "Holiday Calendar", icon: "holiday" },
      { href: "/settings/kiosk", label: "Kiosks", icon: "kiosks" },
      { href: "#soon-field-checkin", label: "Field Check-In", icon: "locations", comingSoon: true },
      { href: "#soon-time-clock-report", label: "Time Clock Report", icon: "govreports", comingSoon: true },
    ],
  },
  {
    label: "Document Workflow",
    items: [
      { href: "#soon-doc-management", label: "Management", icon: "claims", comingSoon: true },
      { href: "#soon-doc-review", label: "Review", icon: "requests", comingSoon: true },
    ],
  },
  {
    label: "Incident",
    items: [
      { href: "/incidents", label: "Incidents", icon: "incidents" },
      { href: "#soon-incident-causeless", label: "Causeless", icon: "incidents", comingSoon: true },
      { href: "/settings/lists/INCIDENT_CATEGORY", label: "Category", icon: "components" },
      { href: "/settings/lists/INCIDENT_TYPE", label: "Type", icon: "components" },
      { href: "/settings/lists/INCIDENT_DECISION", label: "Decision", icon: "policies" },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/announcements", label: "Announcements", icon: "announcements" },
      { href: "#soon-team-discussion", label: "Discussion", icon: "requests", comingSoon: true },
      { href: "#soon-team-doc-sharing", label: "Document & Form Sharing", icon: "claims", comingSoon: true },
    ],
  },
  {
    label: "Payroll",
    items: [
      { href: "/payroll", label: "Payroll Runs", icon: "payruns" },
      { href: "/pay-components", label: "Pay Components", icon: "components" },
      { href: "/loans", label: "Loans", icon: "loans" },
      { href: "/payroll/ytd-openings", label: "Year-to-date Openings", icon: "bankfiles" },
      { href: "/payroll/thirteenth-accrual", label: "13th Month Accrual", icon: "premium" },
      { href: "/payroll/corrections", label: "Corrections", icon: "components" },
      { href: "/payroll/statutory-contributions", label: "Statutory Contribution", icon: "premium" },
      { href: "/payroll/statutory-tables", label: "Statutory Table", icon: "payrules" },
      { href: "/reports", label: "Gov't Reports", icon: "govreports" },
      { href: "/settings/pay-rules", label: "Pay Rules", icon: "payrules" },
      { href: "#soon-salary-adjustment", label: "Salary Adjustment", icon: "components", comingSoon: true },
      { href: "#soon-annual-salary-statement", label: "Annual Salary Statement", icon: "govreports", comingSoon: true },
    ],
  },
  {
    label: "Employer",
    items: [
      { href: "/settings", label: "Company Info", icon: "policies" },
      { href: "/positions", label: "Positions", icon: "positions" },
      { href: "/departments", label: "Departments", icon: "departments" },
      { href: "/org-chart", label: "Org Chart", icon: "branches" },
      { href: "/branches", label: "Branches", icon: "branches" },
      { href: "/work-locations", label: "Locations", icon: "locations" },
      { href: "/assets", label: "Assets", icon: "assets" },
      { href: "/settings/employee-id", label: "Employee ID", icon: "roles" },
      { href: "/settings/ownership", label: "Ownership", icon: "roles" },
      { href: "/settings/storage", label: "File Storage", icon: "claims" },
      { href: "/levels", label: "Level", icon: "positions" },
      { href: "/approval-roles", label: "Approval Roles", icon: "roles" },
      { href: "/approval-workflows", label: "Approval Workflows", icon: "movements" },
      { href: "/job-types-statuses", label: "Job Type & Status", icon: "components" },
      { href: "/settings/lists/BANK", label: "Bank", icon: "bankfiles" },
      { href: "/settings/lists/COURSE", label: "Course", icon: "recruitment" },
      { href: "/settings/lists/TRAINER", label: "Trainer", icon: "employees" },
      { href: "/settings/lists/ETHNICITY", label: "Ethnicity", icon: "requests" },
      { href: "/settings/lists/RELIGION", label: "Religion", icon: "requests" },
      { href: "/settings/lists/DOCUMENT_CATEGORY", label: "Document Category", icon: "claims" },
    ],
  },
  {
    label: "Recruitment",
    items: [{ href: "/recruitment", label: "Recruitment", icon: "recruitment" }],
  },
  {
    label: "Insights & Tools",
    items: [
      { href: "/analytics", label: "Analytics", icon: "analytics", isNew: true },
      { href: "/ai", label: "AI Assistant", icon: "ai", isNew: true },
    ],
  },
];

type Props = {
  tenantName: string;
  tenantInitials: string;
  /** Endpoint/URL for the uploaded company logo, or null to show initials. */
  tenantLogoUrl?: string | null;
  userName: string;
  userRole: string;
  userInitials: string;
};

// Company tile avatar — renders the uploaded logo when available, and falls
// back to the tenant initials if there's no logo or the image fails to load
// (e.g. R2 not yet configured, so the logo endpoint returns 503/404).
function CompanyAvatar({
  logoUrl,
  initials,
  size,
}: {
  logoUrl?: string | null;
  initials: string;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  const showLogo = logoUrl && !failed;
  return (
    <div
      className={[
        "flex flex-none items-center justify-center overflow-hidden rounded-[6px] text-[10.5px] font-bold",
        showLogo ? "bg-white" : "bg-[var(--acc)] text-[var(--on-acc)]",
      ].join(" ")}
      style={{ height: size, width: size }}
    >
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initials
      )}
    </div>
  );
}

// Frappe UI style (Option B): light neutral sidebar, sentence-case group
// labels, 28px items, the active item a white card with the icon in orange.
export function SidebarNav({
  tenantName,
  tenantInitials,
  tenantLogoUrl,
}: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  function isActive(href: string): boolean {
    if (href === "/settings") return pathname === "/settings";
    const matches = (h: string) => pathname === h || pathname.startsWith(h + "/");
    if (!matches(href)) return false;
    // A more specific link wins over its parent: on /payroll/ytd-openings only
    // "Year-to-date Openings" is active, not "Payroll Runs" (/payroll).
    return !NAV_SECTIONS.some((s) =>
      s.items.some((i) => i.href !== href && i.href.startsWith(href + "/") && matches(i.href)),
    );
  }

  const activeSection = NAV_SECTIONS.find((s) =>
    s.items.some((i) => isActive(i.href))
  );

  useEffect(() => {
    const saved = localStorage.getItem("pa-side-collapsed");
    if (saved === "1") setCollapsed(true);

    // Initialize group open states
    const initial: Record<string, boolean> = {};
    NAV_SECTIONS.forEach((s) => {
      initial[s.label] = s.label === "Overview" || s.label === activeSection?.label;
    });
    setOpenGroups(initial);
    setMounted(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When route changes, ensure active group is open
  useEffect(() => {
    if (activeSection) {
      setOpenGroups((prev) =>
        prev[activeSection.label] ? prev : { ...prev, [activeSection.label]: true }
      );
    }
  }, [activeSection]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("pa-side-collapsed", next ? "1" : "0");
      return next;
    });
  }

  function toggleGroup(label: string) {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  const isCollapsed = mounted && collapsed;

  return (
    <aside
      className="hidden lg:flex flex-col shrink-0 sticky top-0 h-screen overflow-visible transition-[width] duration-200 ease-in-out relative z-30 border-r border-[var(--line)] bg-[#F8F8F8] px-2 py-2.5 text-[var(--ink)]"
      style={{ width: isCollapsed ? "56px" : "240px" }}
    >
      {/* Collapse/expand toggle */}
      <button
        onClick={toggle}
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-[11px] top-3.5 z-50 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-[var(--line)] bg-white text-[var(--muted-2)] shadow-[0_1px_2px_rgba(0,0,0,.08)] transition-colors hover:border-[#CFCFCF] hover:text-[var(--ink)] hover:shadow-[0_1px_3px_rgba(0,0,0,.12)]"
      >
        {isCollapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>

      {/* Brand block */}
      <div
        className={[
          "flex items-center gap-2 overflow-hidden pb-2.5 pt-1",
          isCollapsed ? "justify-center px-0" : "px-1.5",
        ].join(" ")}
      >
        <div className="flex h-7 w-7 flex-none items-center justify-center rounded-[7px] bg-[#1F1F1F]">
          <SentireMark size={18} />
        </div>
        {!isCollapsed && (
          <div className="overflow-hidden leading-tight">
            <div className="whitespace-nowrap text-[14px] font-semibold text-[var(--ink)]">
              Sentire Payroll
            </div>
            <div className="whitespace-nowrap text-[12px] text-[var(--muted-2)]">
              HRIS &amp; Payroll
            </div>
          </div>
        )}
      </div>

      {/* Company switcher */}
      {!isCollapsed ? (
        <div className="mb-2 flex cursor-pointer items-center gap-2 overflow-hidden rounded-[8px] border border-[var(--line)] bg-white px-[7px] py-1.5 shadow-[0_1px_2px_rgba(0,0,0,.04)] transition-colors hover:border-[#D4D4D4]">
          <CompanyAvatar logoUrl={tenantLogoUrl} initials={tenantInitials} size={24} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13.5px] font-medium text-[var(--ink)]">
              {tenantName}
            </div>
            <div className="text-[12px] text-[var(--muted-2)]">Growth plan</div>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 flex-none text-[var(--muted-2)]" />
        </div>
      ) : (
        <div className="mx-auto mb-2 cursor-pointer" title={tenantName}>
          <CompanyAvatar logoUrl={tenantLogoUrl} initials={tenantInitials} size={24} />
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-color:#D4D4D4_transparent] [scrollbar-width:thin]">
        {NAV_SECTIONS.map((section) => {
          const isOpen = isCollapsed || !!openGroups[section.label];
          const hasActive = section.items.some((i) => isActive(i.href));

          return (
            <div key={section.label} className={isOpen ? "mb-1" : undefined}>
              {!isCollapsed ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(section.label)}
                  className="group flex w-full items-center gap-1 px-2 pb-1 pt-2 text-left text-[12px] font-medium text-[var(--muted-2)] transition-colors hover:text-[var(--ink)]"
                >
                  <span className="flex-1">{toSentenceCase(section.label)}</span>
                  {hasActive && !isOpen && (
                    <span className="mr-1 h-1.5 w-1.5 rounded-full bg-[var(--acc)]" />
                  )}
                  <ChevronDown
                    className="h-3 w-3 transition-transform duration-[180ms]"
                    style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
                  />
                </button>
              ) : (
                <div className="mx-1.5 my-2 border-t border-[var(--line)]" />
              )}

              {isOpen && (
                <div className="space-y-px">
                  {section.items.map((item) => {
                    const active = isActive(item.href);
                    if (item.comingSoon) {
                      return (
                        <div
                          key={item.href}
                          title={isCollapsed ? `${item.label} — coming soon` : undefined}
                          aria-disabled="true"
                          className={[
                            "flex h-7 cursor-default select-none items-center rounded-[8px] px-2 text-[13.5px] text-[var(--muted-2)] opacity-70",
                            isCollapsed ? "justify-center px-0" : "gap-2",
                          ].join(" ")}
                        >
                          <NavIcon name={item.icon} size={16} />
                          {!isCollapsed && (
                            <>
                              <span className="flex-1 truncate">{item.label}</span>
                              <span className="ml-auto rounded-full bg-[var(--fill)] px-1.5 text-[10px] font-medium text-[var(--muted-2)]">
                                Soon
                              </span>
                            </>
                          )}
                        </div>
                      );
                    }
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={isCollapsed ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={[
                          "flex h-7 items-center rounded-[8px] px-2 text-[13.5px] transition-colors",
                          isCollapsed ? "justify-center px-0" : "gap-2",
                          active
                            ? "bg-white font-medium text-[var(--ink)] shadow-[0_1px_2px_rgba(0,0,0,.08),0_0_0_1px_rgba(0,0,0,.04)]"
                            : "text-[#383838] hover:bg-[#EFEFEF] hover:text-[var(--ink)]",
                        ].join(" ")}
                      >
                        <span className={active ? "flex text-[var(--acc-ink)]" : "flex text-[var(--muted-2)]"}>
                          <NavIcon name={item.icon} size={16} />
                        </span>
                        {!isCollapsed && (
                          <>
                            <span className="flex-1 truncate">{item.label}</span>
                            {item.isNew && (
                              <span className="ml-auto rounded-full bg-[var(--acc-soft)] px-1.5 text-[10px] font-medium text-[var(--acc-ink)]">
                                New
                              </span>
                            )}
                          </>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

// Group labels are stored upper case ("INSIGHTS & TOOLS"); the Frappe style
// shows them in sentence case ("Insights & tools").
function toSentenceCase(label: string): string {
  const lower = label.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
