"use client";

/**
 * Wave B (PAY-212): one company-wide background table (Education,
 * Experience, Training, Legal Documents), with a status filter where the
 * rows have one and a CSV of what is shown. Data: GET /api/background/[kind].
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { backgroundCsv, type BackgroundKind, type BackgroundTable } from "@/lib/background/report-view";

const BLURB: Record<BackgroundKind, string> = {
  education: "Every current employee's schooling, from their records. Employees add theirs in ESS; HR approves it in Profile Requests.",
  experience: "Every current employee's previous work, from their records.",
  training: "Every current employee's trainings and certificates, with the ones that have expired or expire soon.",
  "legal-documents": "Every current employee's 201-file documents with their expiry, and the required documents still missing.",
};

const TONE: Record<string, string> = {
  Expired: "bg-[#FDECEC] text-[#B42318]", Missing: "bg-[#FDECEC] text-[#B42318]",
  Expiring: "bg-[#FFF4E5] text-[#B54708]", Valid: "bg-[#ECFDF3] text-[#027A48]",
};

export function BackgroundReport({ kind }: { kind: BackgroundKind }) {
  const [data, setData] = useState<BackgroundTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [withinDays, setWithinDays] = useState("60");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/background/${kind}?withinDays=${withinDays}`);
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { toast.error(json.error ?? "Could not load the page"); return; }
    setData(json.data);
  }, [kind, withinDays]);
  useEffect(() => { void load(); }, [load]);

  const hasStatus = !!data?.columns.some((c) => c.key === "status");
  const shown = useMemo(() => {
    if (!data) return [];
    const s = search.trim().toLowerCase();
    return data.rows.filter((r) =>
      (status === "ALL" || r.status === status) &&
      (!s || Object.values(r).some((v) => v?.toLowerCase().includes(s))));
  }, [data, status, search]);

  function download() {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([backgroundCsv({ ...data, rows: shown })], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${kind}_${data.asOf}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const head = "text-[12px] font-semibold text-[#6B6B6B]";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">{data?.title ?? ""}</h1>
          <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[760px]">{BLURB[kind]}{data ? ` As of ${data.asOf}.` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="h-9 w-[180px] text-[13px]" />
          {hasStatus && (
            <Select value={status} onValueChange={(v) => v && setStatus(v)}>
              <SelectTrigger className="h-9 w-[150px] text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {Object.keys(data?.counts ?? {}).sort().map((k) => <SelectItem key={k} value={k}>{k} ({data!.counts[k]})</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {hasStatus && (
            <Select value={withinDays} onValueChange={(v) => v && setWithinDays(v)}>
              <SelectTrigger className="h-9 w-[170px] text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>{["30", "60", "90"].map((d) => <SelectItem key={d} value={d}>Expiring within {d} days</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button variant="outline" size="sm" onClick={download} disabled={!data} className="h-9 text-[13px]"><Download className="h-3.5 w-3.5 mr-1.5" /> CSV</Button>
        </div>
      </div>
      <div className="rounded-lg border bg-white">
        {loading && !data ? (
          <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>{data?.columns.map((c) => <TableHead key={c.key} className={head}>{c.label}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 && (
                <TableRow><TableCell colSpan={data?.columns.length ?? 1} className="py-8 text-center text-[13px] text-[#6B6B6B]">Nothing to show.</TableCell></TableRow>
              )}
              {shown.map((r) => (
                <TableRow key={r.id}>
                  {data!.columns.map((c) => (
                    <TableCell key={c.key} className="text-[13px]">
                      {c.key === "employeeName" && r.employeeId ? (
                        <Link href={`/employees/${r.employeeId}`} className="font-medium hover:underline">{r[c.key]}</Link>
                      ) : c.key === "status" && r.status ? (
                        <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${TONE[r.status] ?? "bg-[#F2F2F2] text-[#525252]"}`}>{r.status}</span>
                      ) : (r[c.key] ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
