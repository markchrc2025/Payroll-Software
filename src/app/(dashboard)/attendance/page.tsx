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
      <div>
        <h1 className="text-2xl font-bold">Time &amp; Attendance</h1>
        <p className="text-sm text-muted-foreground">Daily Time Record management</p>
      </div>

      {/* Tab Nav */}
      <div className="border-b">
        <nav className="flex gap-1 -mb-px">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Panels */}
      {activeTab === "dtr" && <DtrRecordsTab />}
      {activeTab === "ot" && <OtApplicationsTab />}
      {activeTab === "shifts" && <ShiftSchedulesTab />}
      {activeTab === "logs" && <AttendanceLogsTab />}
    </div>
  );
}
