"use client";

/**
 * PAY-71: a BIR form shown the way the form itself is laid out (its parts,
 * item numbers and labels, in order), with Sentire's remarks as footnotes
 * only. One viewer for 1601-C, 2316 and 1604-C. Download as Excel or print.
 */
import { useState } from "react";
import * as XLSX from "xlsx";
import { Download, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  formViewToRows,
  formatCentavos,
  type BirFormView,
  type BirValueKind,
} from "@/lib/payroll/reports/bir-form";

export interface BirFormEntry {
  /** What to call this form in the picker, for example an employee's name. */
  label: string;
  view: BirFormView;
}

const shown = (kind: BirValueKind, v: string | null) =>
  v === null ? "" : kind === "money" ? formatCentavos(v) : v;

/** Excel sheet names: 31 characters at most, none of \ / ? * [ ] :, no repeats. */
function sheetNames(entries: BirFormEntry[]): string[] {
  const used = new Set<string>();
  return entries.map((e, i) => {
    const base = (e.label.replace(/[\\/?*[\]:]/g, " ").trim() || `Form ${i + 1}`).slice(0, 27);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
}

export function downloadFormsAsExcel(entries: BirFormEntry[], fileName: string) {
  const wb = XLSX.utils.book_new();
  const names = sheetNames(entries);
  entries.forEach((e, i) => {
    const ws = XLSX.utils.aoa_to_sheet(formViewToRows(e.view));
    ws["!cols"] = [{ wch: 8 }, { wch: 70 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws, names[i]);
  });
  XLSX.writeFile(wb, fileName);
}

export function BirFormSheet({ view }: { view: BirFormView }) {
  return (
    <div className="bir-form text-[13px] text-[var(--ink)]">
      <div className="mb-4 border-b border-[var(--line)] pb-3">
        <div className="text-[12px] text-[#6B6B6B]">
          BIR Form No. {view.formNo} · {view.version}
        </div>
        <div className="text-[16px] font-semibold leading-snug">{view.title}</div>
        <div className="text-[13px] text-[#525252]">{view.period}</div>
      </div>

      {view.sections.map((s) => (
        <section key={s.heading} className="mb-5">
          <h3 className="mb-1.5 text-[12.5px] font-semibold uppercase tracking-[0.02em] text-[#525252]">{s.heading}</h3>
          <table className="w-full border-collapse">
            <tbody>
              {s.lines.map((l) => (
                <tr key={l.no} className="border-b border-[#F0F0F0] align-top">
                  <td className="w-[52px] py-1.5 pr-2 font-semibold tabular-nums text-[#525252]">{l.no}</td>
                  <td className="py-1.5 pr-3">{l.label}</td>
                  <td
                    className={`py-1.5 whitespace-nowrap ${l.kind === "money" ? "text-right tabular-nums" : "text-right"}`}
                    data-item={l.no}
                  >
                    {l.value === null ? <span className="text-[#A3A3A3]">to fill in</span> : shown(l.kind, l.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {view.schedules.map((sch) => {
        const grouped = sch.columns.some((c) => c.group);
        return (
          <section key={sch.title} className="mb-5">
            <h3 className="mb-1.5 text-[12.5px] font-semibold uppercase tracking-[0.02em] text-[#525252]">{sch.title}</h3>
            <div className="overflow-x-auto rounded-[8px] border border-[var(--line)]">
              <table className="border-collapse text-[12px]">
                <thead className="bg-[var(--hover)]">
                  {grouped && (
                    <tr>
                      {sch.columns.map((c, i) => (
                        <th key={i} className="border-b border-r border-[var(--line)] px-2 py-1 text-left font-semibold">{c.group ?? ""}</th>
                      ))}
                    </tr>
                  )}
                  <tr>
                    {sch.columns.map((c, i) => (
                      <th key={i} className="min-w-[110px] border-b border-r border-[var(--line)] px-2 py-1 text-left align-bottom font-medium">{c.label}</th>
                    ))}
                  </tr>
                  <tr>
                    {sch.columns.map((c, i) => (
                      <th key={i} className="border-b border-r border-[var(--line)] px-2 py-1 text-left font-semibold tabular-nums">{c.no}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sch.rows.length === 0 && (
                    <tr><td colSpan={sch.columns.length} className="px-2 py-3 text-[#6B6B6B]">No entries.</td></tr>
                  )}
                  {sch.rows.map((r, ri) => (
                    <tr key={ri} className="border-b border-[#F0F0F0]">
                      {r.map((v, i) => (
                        <td key={i} className={`border-r border-[#F0F0F0] px-2 py-1 whitespace-nowrap ${sch.columns[i]?.kind === "money" ? "text-right tabular-nums" : ""}`}>
                          {shown(sch.columns[i]?.kind ?? "text", v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {sch.totals && (
                    <tr className="bg-[var(--hover)] font-semibold">
                      {sch.totals.map((v, i) => (
                        <td key={i} className={`border-r border-[var(--line)] px-2 py-1 whitespace-nowrap ${sch.columns[i]?.kind === "money" ? "text-right tabular-nums" : ""}`}>
                          {i === 0 && v === null ? "TOTALS" : shown(sch.columns[i]?.kind ?? "text", v)}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {view.footnotes.length > 0 && (
        <section className="border-t border-[var(--line)] pt-3">
          <h3 className="mb-1 text-[12.5px] font-semibold uppercase tracking-[0.02em] text-[#525252]">Notes</h3>
          <ol className="list-decimal space-y-1 pl-5 text-[12px] text-[#525252]">
            {view.footnotes.map((f, i) => <li key={i}>{f}</li>)}
          </ol>
        </section>
      )}
    </div>
  );
}

export function BirFormViewer({
  open,
  onClose,
  entries,
  fileName,
}: {
  open: boolean;
  onClose: () => void;
  entries: BirFormEntry[];
  /** File name for the Excel download, without the extension. */
  fileName: string;
}) {
  const [index, setIndex] = useState(0);
  const current = entries[Math.min(index, entries.length - 1)];

  function handlePrint() {
    const node = document.getElementById("bir-form-print");
    if (!node) return;
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) return;
    win.document.write(
      `<html><head><title>${fileName}</title><style>
        body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;margin:24px}
        table{border-collapse:collapse;width:100%} td,th{padding:3px 6px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
        td[data-item]{text-align:right;white-space:nowrap} h3{font-size:11px;margin:14px 0 4px;text-transform:uppercase}
        ol{padding-left:18px}
      </style></head><body>${node.innerHTML}</body></html>`,
    );
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{current ? `BIR Form No. ${current.view.formNo}` : "BIR form"}</DialogTitle>
        </DialogHeader>

        {entries.length === 0 || !current ? (
          <p className="text-[13px] text-[#6B6B6B]">Nothing to show for this period: there are no finalized payroll runs in it.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {entries.length > 1 && (
                <select
                  aria-label="Employee"
                  value={Math.min(index, entries.length - 1)}
                  onChange={(e) => setIndex(Number(e.target.value))}
                  className="h-8 max-w-[320px] rounded-[8px] border border-[var(--line)] bg-white px-2 text-[13px]"
                >
                  {entries.map((e, i) => <option key={i} value={i}>{e.label}</option>)}
                </select>
              )}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => downloadFormsAsExcel(entries, `${fileName}.xlsx`)}
                  className="flex h-8 items-center gap-1.5 rounded-[8px] bg-[var(--fill)] px-2.5 text-[13px] font-medium hover:bg-[var(--fill-2)]"
                >
                  <Download className="h-3.5 w-3.5" /> Excel{entries.length > 1 ? ` (all ${entries.length})` : ""}
                </button>
                <button
                  onClick={handlePrint}
                  className="flex h-8 items-center gap-1.5 rounded-[8px] bg-[var(--fill)] px-2.5 text-[13px] font-medium hover:bg-[var(--fill-2)]"
                >
                  <Printer className="h-3.5 w-3.5" /> Print
                </button>
              </div>
            </div>
            <div id="bir-form-print">
              <BirFormSheet view={current.view} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
