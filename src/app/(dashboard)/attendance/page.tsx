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
        <h1 className="font-display text-[26px] font-semibold tracking-[-0.4px] text-[#111827] leading-tight">
          Time &amp; Attendance
        </h1>
        <p className="text-[13px] text-[#6B7A8D] mt-0.5">Daily Time Record management</p>
      </div>

      {/* ── Tab Nav ── */}
      <div className="flex gap-1 p-1 bg-white rounded-xl border border-[#E8EBF1] shadow-sm w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 text-[13px] font-semibold rounded-lg transition-all ${
              activeTab === tab.key
                ? "bg-[#E8693A] text-white shadow-sm"
                : "text-[#6B7A8D] hover:text-[#111827] hover:bg-[#F5F6FA]"
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
