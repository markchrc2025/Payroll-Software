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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

const AGENCY_COLORS: Record<string, string> = {
  BIR: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  SSS: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PhilHealth: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "Pag-IBIG": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
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

  const agencyColor = AGENCY_COLORS[report.agency] ?? "";

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{report.title}</CardTitle>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${agencyColor}`}>
            {report.agency}
          </span>
        </div>
        <CardDescription className="text-xs">{report.description}</CardDescription>
      </CardHeader>

      <CardContent className="flex-1 space-y-3">
        <div className="flex gap-2 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Year</Label>
            <Select value={year} onValueChange={(v) => setYear(v ?? year)}>
              <SelectTrigger className="h-8 w-24 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {report.monthly && (
            <div className="space-y-1">
              <Label className="text-xs">Month</Label>
              <Select value={month} onValueChange={(v) => setMonth(v ?? month)}>
                <SelectTrigger className="h-8 w-32 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {result && (
          <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Report ready</span>
            {" — "}
            {typeof result === "object" && "employees" in result
              ? `${(result.employees as unknown[]).length} employee(s)`
              : "data loaded"}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2 flex-wrap pt-0">
        <Button size="sm" onClick={handleGenerate} disabled={loading} className="flex-1">
          {loading ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generating…</>
          ) : (
            <><FileText className="h-3.5 w-3.5 mr-1.5" /> Generate</>
          )}
        </Button>

        {result && (
          <>
            <Button variant="outline" size="sm" onClick={handleDownloadJson} title="Download JSON">
              <Download className="h-3.5 w-3.5 mr-1.5" /> JSON
            </Button>
            {report.fileField && (
              <Button variant="outline" size="sm" onClick={handleDownloadFile} title={`Download ${report.fileLabel ?? report.fileExt?.toUpperCase()}`}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> {report.fileLabel ?? report.fileExt?.toUpperCase()}
              </Button>
            )}
          </>
        )}
      </CardFooter>
    </Card>
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
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Generate and download statutory compliance reports. Only finalized payroll runs are included.
        </p>
      </div>

      {AGENCIES.map((agency) => {
        const agencyReports = REPORTS.filter((r) => r.agency === agency);
        return (
          <section key={agency} className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {agency}
              </h2>
              <Badge variant="secondary" className="text-xs">{agencyReports.length}</Badge>
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
