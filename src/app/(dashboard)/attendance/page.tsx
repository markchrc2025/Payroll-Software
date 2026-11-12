"use client";

import { useState } from "react";
import { ShiftSchedulesTab } from "@/components/attendance/ShiftSchedulesTab";
import { DtrRecordsTab } from "@/components/attendance/DtrRecordsTab";
import { OtApplicationsTab } from "@/components/attendance/OtApplicationsTab";
import { AttendanceLogsTab } from "@/components/attendance/AttendanceLogsTab";

const TABS = [
  { key: "dtr", label: "DTR Records" },
  { key: "ot", label: "OT Applications" },
  { key: "shifts", label: "Shift Schedules" },
  { key: "logs", label: "Attendance Logs" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default function AttendancePage() {
  const [activeTab, setActiveTab] = useState<Tab>("dtr");

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">
          Time &amp; Attendance
        </h1>
        <p className="text-[13px] text-[#6B6B6B] mt-0.5">Daily Time Record management</p>
      </div>

      {/* ── Tab Nav ── */}
      <div className="flex gap-0.5 p-0.5 bg-[var(--fill)] rounded-[8px] w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`h-[26px] px-3 text-[13.5px] font-medium rounded-[6px] transition-all ${
              activeTab === tab.key
                ? "bg-white text-[var(--ink)] shadow-[0_1px_2px_rgba(0,0,0,.1)]"
                : "text-[var(--muted-2)] hover:text-[var(--ink)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      {activeTab === "dtr" && <DtrRecordsTab />}
      {activeTab === "ot" && <OtApplicationsTab />}
      {activeTab === "shifts" && <ShiftSchedulesTab />}
      {activeTab === "logs" && <AttendanceLogsTab />}
    </div>
  );
}
