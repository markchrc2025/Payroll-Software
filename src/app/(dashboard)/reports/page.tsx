"use client";

/**
 * /reports — Statutory Compliance Reports
 *
 * 8 report cards grouped by agency:
 *   BIR : 1601-C (monthly WHT remittance), 2316 (annual certificate), Alphalist
 *   SSS : R-1A (monthly contributions), R-3 (monthly collection list)
 *   PhilHealth : RF-1 (remittance report), ER-2 (premium contribution return)
 *   Pag-IBIG : MCRF (monthly contribution remittance form)
 *
 * Each card has:
 *  - Year selector (always)
 *  - Month selector (for monthly reports)
 *  - "Generate" button → fetches the JSON report from the API
 *  - "Download JSON" always available after generation
 *  - "Download File" for reports that include a machine-readable text attachment
 *    (Alphalist → .dat, SSS R-3 → .ecs, PhilHealth ER-2 → .txt)
 */

import { useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - 3 + i);
const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename);
}

function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/plain" });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Report Card
// ---------------------------------------------------------------------------

type ReportDef = {
  id: string;
  title: string;
  description: string;
  agency: "BIR" | "SSS" | "PhilHealth" | "Pag-IBIG";
  monthly: boolean; // true = needs year + month; false = year only
  apiPath: string;
  /** field in report data that contains machine-readable download text */
  fileField?: string;
  fileExt?: string;
  fileLabel?: string;
};

const AGENCY_COLORS: Record<string, { bg: string; color: string }> = {
  BIR:       { bg: "#FCE9E7", color: "#E0463B" },
  SSS:       { bg: "#fdeee6", color: "#E8693A" },
  PhilHealth:{ bg: "#E5F6EE", color: "#0FA36B" },
  "Pag-IBIG":{ bg: "#FBF0DD", color: "#DB8A28" },
};

function ReportCard({ report }: { report: ReportDef }) {
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setResult(null);
    const params = new URLSearchParams({ year });
    if (report.monthly) params.set("month", month);

    const res = await fetch(`${report.apiPath}?${params.toString()}`);
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      toast.error(json.error ?? `Failed to generate ${report.title}`);
      return;
    }
    setResult(json.data ?? json);
    toast.success(`${report.title} generated`);
  }

  function handleDownloadJson() {
    if (!result) return;
    const suffix = report.monthly ? `${year}-${month.padStart(2, "0")}` : year;
    downloadJson(result, `${report.id}_${suffix}.json`);
  }

  function handleDownloadFile() {
    if (!result || !report.fileField) return;
    const text = result[report.fileField] as string | undefined;
    if (!text) { toast.error("No file content in report"); return; }
    const suffix = report.monthly ? `${year}-${month.padStart(2, "0")}` : year;
    downloadText(text, `${report.id}_${suffix}.${report.fileExt ?? "txt"}`);
  }

  const agencyStyle = AGENCY_COLORS[report.agency] ?? { bg: "#F5F6FA", color: "#4A586B" };

  return (
    <div className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm p-5 flex flex-col gap-4">
      {/* Card header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: agencyStyle.bg, color: agencyStyle.color }}
            >
              {report.agency}
            </span>
          </div>
          <div className="font-display text-[15px] font-semibold text-[#111827] leading-snug">
            {report.title}
          </div>
          <div className="text-[12px] text-[#6B7A8D] mt-1 leading-relaxed">
            {report.description}
          </div>
        </div>
      </div>

      {/* Year / month selectors */}
      <div className="flex gap-2 flex-wrap">
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-[#4A586B] uppercase tracking-wide">Year</Label>
          <Select value={year} onValueChange={(v) => setYear(v ?? year)}>
            <SelectTrigger className="h-8 w-24 text-[13px] border-[#E8EBF1]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {report.monthly && (
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-[#4A586B] uppercase tracking-wide">Month</Label>
            <Select value={month} onValueChange={(v) => setMonth(v ?? month)}>
              <SelectTrigger className="h-8 w-32 text-[13px] border-[#E8EBF1]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Result status badge */}
      {result && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ background: "#E5F6EE", color: "#0FA36B" }}>
          <span>✓ Report ready</span>
          {typeof result === "object" && "employees" in result
            ? <span className="font-normal text-[#0FA36B]/80">— {(result.employees as unknown[]).length} employee(s)</span>
            : null}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap mt-auto">
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="flex-1 h-9 flex items-center justify-center gap-1.5 text-[13px] font-semibold rounded-lg transition-colors disabled:opacity-60"
          style={{ background: "#E8693A", color: "#fff" }}
        >
          {loading ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
          ) : (
            <><FileText className="h-3.5 w-3.5" /> Generate</>
          )}
        </button>

        {result && (
          <>
            <button
              onClick={handleDownloadJson}
              className="h-9 flex items-center gap-1.5 px-3 text-[13px] font-semibold rounded-lg border border-[#E8EBF1] text-[#E8693A] hover:bg-[#fdeee6] transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> JSON
            </button>
            {report.fileField && (
              <button
                onClick={handleDownloadFile}
                title={`Download ${report.fileLabel ?? report.fileExt?.toUpperCase()}`}
                className="h-9 flex items-center gap-1.5 px-3 text-[13px] font-semibold rounded-lg border border-[#E8EBF1] text-[#E8693A] hover:bg-[#fdeee6] transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> {report.fileLabel ?? report.fileExt?.toUpperCase()}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report definitions
// ---------------------------------------------------------------------------

const REPORTS: ReportDef[] = [
  // BIR
  {
    id: "bir_1601c",
    title: "BIR 1601-C — Monthly WHT Remittance",
    description: "Monthly Remittance Return of Creditable Income Taxes Withheld on Compensation. Summarises withheld tax by bracket for all finalized payroll runs in the selected month.",
    agency: "BIR",
    monthly: true,
    apiPath: "/api/payroll/reports/bir/1601c",
  },
  {
    id: "bir_2316",
    title: "BIR 2316 — Annual Tax Certificates",
    description: "Certificate of Compensation Payment/Tax Withheld for all employees for the selected year. One certificate per employee across all finalized payroll runs.",
    agency: "BIR",
    monthly: false,
    apiPath: "/api/payroll/reports/bir/2316",
  },
  {
    id: "bir_alphalist",
    title: "BIR Alphalist — Annual Employee List",
    description: "Annual Alphalist of Employees (Annex B-1 / B-2) for eBIRForms / SRS submission. Includes .DAT file for electronic filing.",
    agency: "BIR",
    monthly: false,
    apiPath: "/api/payroll/reports/bir/alphalist",
    fileField: "datFileContent",
    fileExt: "dat",
    fileLabel: ".DAT",
  },
  // SSS
  {
    id: "sss_r1a",
    title: "SSS R-1A — Monthly Contributions",
    description: "Monthly Report of Employee Contributions listing employee SSS numbers, MSC, and EE/ER share for all finalized runs in the selected month.",
    agency: "SSS",
    monthly: true,
    apiPath: "/api/payroll/reports/sss/r1a",
  },
  {
    id: "sss_r3",
    title: "SSS R-3 — Monthly Collection List",
    description: "Monthly Collection List for electronic submission via SSS Electronic Contribution System (ECS). Includes fixed-width ECS text file.",
    agency: "SSS",
    monthly: true,
    apiPath: "/api/payroll/reports/sss/r3",
    fileField: "ecsText",
    fileExt: "ecs",
    fileLabel: ".ECS",
  },
  // PhilHealth
  {
    id: "ph_rf1",
    title: "PhilHealth RF-1 — Remittance Report",
    description: "Employer's Remittance Report listing PhilHealth numbers, monthly basic salary, and EE/ER premium contributions for the selected month.",
    agency: "PhilHealth",
    monthly: true,
    apiPath: "/api/payroll/reports/philhealth/rf1",
  },
  {
    id: "ph_er2",
    title: "PhilHealth ER-2 — Premium Contribution Return",
    description: "Premium Contribution Payment Return. Includes electronic submission text file for PhilHealth web portal upload.",
    agency: "PhilHealth",
    monthly: true,
    apiPath: "/api/payroll/reports/philhealth/er2",
    fileField: "submissionText",
    fileExt: "txt",
    fileLabel: ".TXT",
  },
  // Pag-IBIG
  {
    id: "pagibig_mcrf",
    title: "Pag-IBIG MCRF — Monthly Contributions",
    description: "Monthly Contribution Remittance Form listing Pag-IBIG MID numbers, monthly compensation, and EE/ER fund contributions for the selected month.",
    agency: "Pag-IBIG",
    monthly: true,
    apiPath: "/api/payroll/reports/pagibig/mcrf",
  },
];

const AGENCIES = ["BIR", "SSS", "PhilHealth", "Pag-IBIG"] as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  return (
    <div className="space-y-8">
      {/* ── Page header ── */}
      <div>
        <h1 className="font-display text-[26px] font-semibold tracking-[-0.4px] text-[#111827] leading-tight">
          Gov&apos;t Reports
        </h1>
        <p className="text-[13px] text-[#6B7A8D] mt-0.5">
          Generate and download statutory compliance reports. Only finalized payroll runs are included.
        </p>
      </div>

      {/* ── Info banner ── */}
      <div className="flex items-start gap-3 rounded-xl border border-[#fdeee6] bg-[#fdeee6] p-4 text-[13px] text-[#E8693A]">
        <span className="shrink-0 text-[16px]">ℹ</span>
        <span>Reports are computed from <strong>finalized</strong> payroll runs only. Draft or cancelled runs are excluded.</span>
      </div>

      {AGENCIES.map((agency) => {
        const agencyReports = REPORTS.filter((r) => r.agency === agency);
        const agStyle = AGENCY_COLORS[agency] ?? { bg: "#F5F6FA", color: "#4A586B" };
        return (
          <section key={agency} className="space-y-3">
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] font-bold px-3 py-1 rounded-full"
                style={{ background: agStyle.bg, color: agStyle.color }}
              >
                {agency}
              </span>
              <span className="text-[12px] text-[#9AA5B4]">{agencyReports.length} report{agencyReports.length > 1 ? "s" : ""}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {agencyReports.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
