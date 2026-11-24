/**
 * The Settings hub (menu split, Mark 25 Nov 2026 00:15). Set-up pages that
 * used to crowd the sidebar are grouped here as cards; the sidebar keeps one
 * "Settings" entry that is active on any of these pages.
 */
import { LISTS, LIST_KEYS } from "@/lib/lookups/registry";

export type SettingsLink = { href: string; label: string; description: string };
export type SettingsGroup = { title: string; links: SettingsLink[] };

export const SETTINGS_HUB_HREF = "/setup";
export const SETTINGS_LISTS_HREF = "/setup/lists";

/** The order the tabs appear on the Lists page; any list added later follows. */
const PREFERRED_TABS = [
  "BANK", "COURSE", "TRAINER", "ETHNICITY", "RELIGION", "DOCUMENT_CATEGORY",
  "EXPENSE_CATEGORY", "EXPENSE_TYPE", "INCIDENT_CATEGORY", "INCIDENT_TYPE", "INCIDENT_DECISION",
];
export const LIST_TAB_ORDER: string[] = [
  ...PREFERRED_TABS.filter((k) => LIST_KEYS.includes(k)),
  ...LIST_KEYS.filter((k) => !PREFERRED_TABS.includes(k)),
];

export const listTabLabel = (key: string) => LISTS[key]?.label ?? key;

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: "Company",
    links: [
      { href: "/settings/ownership", label: "Ownership", description: "Who owns the company account and can hand it over." },
      { href: "/settings/employee-id", label: "Employee ID", description: "How new employee numbers are made." },
      { href: "/settings/storage", label: "File Storage", description: "Where uploaded files and documents are kept." },
      { href: "/settings/roles", label: "Custom Role", description: "Roles and the permissions each one has." },
    ],
  },
  {
    title: "Approvals",
    links: [
      { href: "/approval-roles", label: "Approval Roles", description: "Who approves which requests." },
      { href: "/approval-workflows", label: "Approval Workflows", description: "The steps a request goes through before it is approved." },
    ],
  },
  {
    title: "Payroll setup",
    links: [
      { href: "/settings/pay-rules", label: "Pay Rules", description: "Cut-offs, pay days, deductions and the final pay tax method." },
      { href: "/settings/premium-rates", label: "Premium Rates", description: "Overtime, night differential, rest day and holiday rates." },
      { href: "/settings/holidays", label: "Holiday Calendar", description: "Regular and special holidays, national and local." },
      { href: "/settings/bir-signatory", label: "BIR 2316 Signatory", description: "The HR officer who signs the BIR 2316, with the e-signature." },
    ],
  },
  {
    title: "Attendance",
    links: [
      { href: "/settings/kiosk", label: "Kiosks", description: "Time clock kiosks and their pairing codes." },
    ],
  },
  {
    title: "Lists",
    links: [
      { href: SETTINGS_LISTS_HREF, label: "Lists", description: "Banks, courses, trainers, ethnicity, religion, document, expense and incident lists, one tab each." },
    ],
  },
];

/** Paths that light up the sidebar's "Settings" entry. */
export const SETTINGS_PATHS: string[] = [
  SETTINGS_HUB_HREF,
  ...SETTINGS_GROUPS.flatMap((g) => g.links.map((l) => l.href)),
  "/settings/lists",
];
