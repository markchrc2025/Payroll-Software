"use client";

/**
 * Sentire Payroll ESS — app shell. Single full-bleed mobile-web shell with a
 * client-side push/pop stack, three top-bar variants, and a 5-tab bottom nav
 * (Home, Pay, Leave, Time, Profile). A shared `clockedIn` flag lives here so
 * the selfie clock flow updates Home. Ported from the design handoff ess-app.jsx.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EIcon, type EIconName } from "./icons";
import { ESSNav, type EssView } from "./primitives";
import { useEssData } from "./use-ess-data";
import { type ApiOne, type EssProfile } from "./api";
import {
  HomeScreen,
  PayScreen,
  PayslipDetail,
  LeaveScreen,
  LeaveRequest,
  TimeScreen,
  ProfileScreen,
  SettingsScreen,
  AnnouncementScreen,
  RequestScreen,
} from "./screens";
import { ClockScreen } from "./Clock";
import "./ess.css";

const TABS: { id: string; label: string; icon: EIconName }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "pay", label: "Pay", icon: "wallet" },
  { id: "leave", label: "Leave", icon: "leave" },
  { id: "time", label: "Time", icon: "clock" },
  { id: "profile", label: "Profile", icon: "user" },
];

type ScreenComp = React.ComponentType<{ param?: string | null }>;
interface ViewMeta {
  comp: ScreenComp;
  title: string;
  back?: boolean;
}

function viewFor(view: string, param?: string | null): ViewMeta {
  switch (view) {
    case "pay":
      return { comp: PayScreen, title: "Pay" };
    case "leave":
      return { comp: LeaveScreen, title: "Leave" };
    case "time":
      return { comp: TimeScreen, title: "Time" };
    case "profile":
      return { comp: ProfileScreen, title: "Profile" };
    case "payslip":
      return { comp: PayslipDetail, title: "Payslip", back: true };
    case "leaveRequest":
      return { comp: LeaveRequest, title: "Request leave", back: true };
    case "request": {
      const map: Record<string, string> = { ot: "Overtime", reimb: "Reimbursement", coe: "Certificate" };
      return { comp: RequestScreen, title: (param && map[param]) || "New request", back: true };
    }
    case "settings":
      return { comp: SettingsScreen, title: "Settings", back: true };
    case "announcement":
      return { comp: AnnouncementScreen, title: "Announcement", back: true };
    case "clock":
      return { comp: ClockScreen, title: param === "out" ? "Clock out" : "Clock in", back: true };
    default:
      return { comp: HomeScreen, title: "Home" };
  }
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

interface Frame {
  tab: string;
  view: string | null;
  param: string | null;
}

export default function EssApp() {
  const router = useRouter();
  const [stack, setStack] = useState<Frame[]>([{ tab: "home", view: null, param: null }]);
  const top = stack[stack.length - 1];
  const activeTab = top.tab;
  const [clockedIn, setClockedIn] = useState(false);

  const profile = useEssData<ApiOne<EssProfile>>("/api/ess/profile");
  const first = profile.data?.data.preferredName?.split(" ")[0] ?? profile.data?.data.firstName ?? "";
  const company = profile.data?.data.company ?? "";

  const nav = useMemo(
    () => ({
      go: (view: EssView, param: string | null = null) =>
        setStack((s) => [...s, { tab: s[s.length - 1].tab, view, param }]),
      back: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
      tab: (id: string) => setStack([{ tab: id, view: id === "home" ? null : id, param: null }]),
      logout: () => {
        if (typeof window !== "undefined") localStorage.removeItem("ess_token");
        router.replace("/ess/login");
      },
    }),
    [router],
  );

  const isHome = activeTab === "home" && !top.view;
  const isSub = !!top.view && !["pay", "leave", "time", "profile"].includes(top.view);
  const meta = top.view ? viewFor(top.view, top.param) : viewFor(activeTab, null);
  const Screen = meta.comp;

  let header;
  if (isHome) {
    header = (
      <header className="e-top e-top-home">
        <div className="e-greet">
          <i>{greeting()},</i>
          <b>{first ? `${first} 👋` : "Welcome 👋"}</b>
          <span>{company}</span>
        </div>
        <button className="e-bell" aria-label="Notifications">
          <EIcon name="bell" size={21} />
          <em />
        </button>
      </header>
    );
  } else if (isSub) {
    header = (
      <header className="e-top e-top-sub">
        <button className="e-back" onClick={() => nav.back()} aria-label="Back">
          <EIcon name="chevL" size={22} />
        </button>
        <h1>{meta.title}</h1>
        <span className="e-back-spacer" />
      </header>
    );
  } else {
    header = (
      <header className="e-top e-top-root">
        <h1>{meta.title}</h1>
      </header>
    );
  }

  return (
    <ESSNav.Provider value={{ ...nav, clockedIn, setClockedIn }}>
      <div className="e-app">
        {header}
        <div className="e-body">
          <div
            className="e-screen"
            key={activeTab + ":" + (top.view || "root") + ":" + (top.param || "")}
          >
            <Screen param={top.param} />
          </div>
        </div>
        <nav className="e-bottomnav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={"e-navitem" + (activeTab === t.id ? " is-on" : "")}
              onClick={() => nav.tab(t.id)}
            >
              <EIcon name={t.icon} size={23} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </ESSNav.Provider>
  );
}
