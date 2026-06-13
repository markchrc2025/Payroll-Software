"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import "@/app/centralportal/central.css";
import { NexusMark, CpIcon, type CpIconName } from "./cp";

type NavItem = { label: string; href: string; icon: CpIconName; isNew?: boolean };

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/centralportal/dashboard", icon: "dashboard" },
  { label: "Tenants",   href: "/centralportal/tenants",   icon: "tenants" },
  { label: "Billing",   href: "/centralportal/billing",   icon: "billing" },
  { label: "Support",   href: "/centralportal/support",   icon: "support" },
  { label: "Analytics", href: "/centralportal/analytics", icon: "analytics", isNew: true },
  { label: "Audit log", href: "/centralportal/audit",     icon: "audit",     isNew: true },
  { label: "Settings",  href: "/centralportal/settings",  icon: "settings" },
];

type Props = {
  children: React.ReactNode;
  user: { name?: string | null; email?: string | null };
  /** Nav hrefs the current admin's role permits. Others are hidden. */
  allowedHrefs?: string[];
  /** Display name of the admin's central role (e.g. "Super Admin"). */
  roleName?: string | null;
};

export default function CentralPortalShell({ children, user, allowedHrefs, roleName }: Props) {
  const path = usePathname();
  const visibleNav = allowedHrefs ? NAV.filter((n) => allowedHrefs.includes(n.href)) : NAV;
  const initial = (user.name ?? user.email ?? "A").charAt(0).toUpperCase();

  return (
    <div className="cp-app">
      <aside className="cp-side">
        {/* Brand */}
        <div className="cp-brand">
          <span className="cp-brand-tile"><NexusMark size={24} /></span>
          <span className="cp-brand-txt">
            <b>Sentire Central</b>
            <i>Super Admin Portal</i>
          </span>
        </div>

        {/* Nav */}
        <nav className="cp-nav">
          {visibleNav.map((n) => {
            const active = path === n.href || path.startsWith(n.href + "/");
            return (
              <Link key={n.href} href={n.href} className={"cp-navitem" + (active ? " is-active" : "")}>
                <CpIcon name={n.icon} size={19} />
                <span>{n.label}</span>
                {n.isNew && <em className="cp-new">New</em>}
                {active && <span className="cp-nav-caret"><CpIcon name="chevR" size={15} /></span>}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="cp-side-foot">
          <span className="cp-avatar">{initial}</span>
          <span className="cp-user">
            <b>{user.name ?? "Admin"}</b>
            <i>{user.email}</i>
            {roleName && <em>{roleName}</em>}
          </span>
          <button
            className="cp-signout"
            aria-label="Sign out"
            onClick={() => signOut({ callbackUrl: "/centralportal/login" })}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      <div className="cp-main">
        {/* Top bar */}
        <div className="cp-top">
          <label className="cp-topsearch">
            <CpIcon name="search" size={17} />
            <input placeholder="Search tenants, invoices, tickets…" />
            <kbd>⌘K</kbd>
          </label>
          <div className="cp-top-right">
            <span className="cp-env"><i />Production</span>
            <button className="cp-iconbtn" aria-label="Notifications">
              <CpIcon name="bell" size={19} /><em className="cp-dot" />
            </button>
          </div>
        </div>

        <div className="cp-scroll">{children}</div>
      </div>
    </div>
  );
}
