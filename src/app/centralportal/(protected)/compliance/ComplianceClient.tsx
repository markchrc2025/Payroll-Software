"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Card, Badge } from "../components/cp";
import {
  BIR_FREQUENCY_LABEL,
  BIR_TABLE_FREQUENCIES,
  birTablePayload,
  birTableFromRows,
  birTableProblems,
  birTableToRows,
  type BirBracketInput,
  type BirTableFrequency,
  type BirTableInput,
} from "@/lib/statutory/bir-table";
import { birRanges, versionInEffect, versionStatus, type TableStatus } from "@/lib/statutory/tables";

export type RuleRow = {
  id: string;
  category: string;
  version: string;
  legalBasis: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  payload: Record<string, unknown>;
};

// ── value helpers ────────────────────────────────────────────────────────────
function dig(o: unknown, path: string[]): number | null {
  let cur: unknown = o;
  for (const k of path) {
    if (cur && typeof cur === "object" && k in (cur as object)) cur = (cur as Record<string, unknown>)[k];
    else return null;
  }
  return typeof cur === "number" ? cur : null;
}
const toPeso = (centavos: number | null) => (centavos == null ? "" : (centavos / 100).toString());
const toPct = (ratio: number | null) => (ratio == null ? "" : (ratio * 100).toString());
const pesoToCentavos = (s: string) => Math.round(Number(s) * 100) || 0;
const pctToRatio = (s: string) => (Number(s) || 0) / 100;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
const fmtPeso = (centavos: number) => (centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const inputStyle: React.CSSProperties = {
  width: "100%", height: 36, padding: "0 10px", fontSize: 13, borderRadius: 8,
  border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", outline: "none", fontFamily: "var(--font)",
};
function NumField({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <label style={{ display: "block" }}>
      <span className="cp-muted" style={{ fontSize: 11.5, display: "block", marginBottom: 4 }}>{label}{suffix ? ` (${suffix})` : ""}</span>
      <input type="number" step="0.0001" min="0" style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function NumFieldText({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label style={{ display: "block" }}>
      <span className="cp-muted" style={{ fontSize: 11.5, display: "block", marginBottom: 4 }}>{label}</span>
      <input style={inputStyle} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

function useMeta() {
  const [version, setVersion] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [legalBasis, setLegalBasis] = useState("");
  return { version, setVersion, effectiveFrom, setEffectiveFrom, legalBasis, setLegalBasis };
}
function MetaFields({ m }: { m: ReturnType<typeof useMeta> }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 12, marginTop: 4 }}>
      <NumFieldText label="Version" value={m.version} onChange={m.setVersion} placeholder="e.g. SSS-2026-v1" />
      <label style={{ display: "block" }}>
        <span className="cp-muted" style={{ fontSize: 11.5, display: "block", marginBottom: 4 }}>Effective from</span>
        <input type="date" style={inputStyle} value={m.effectiveFrom} onChange={(e) => m.setEffectiveFrom(e.target.value)} />
      </label>
      <NumFieldText label="Legal basis" value={m.legalBasis} onChange={m.setLegalBasis} placeholder="e.g. SSS Circular 2025-006" />
    </div>
  );
}

async function publish(endpoint: string, m: ReturnType<typeof useMeta>, payload: Record<string, unknown>): Promise<boolean> {
  if (!m.version.trim()) { toast.error("Version is required"); return false; }
  if (!m.legalBasis.trim()) { toast.error("Legal basis is required"); return false; }
  const res = await fetch(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      version: m.version.trim(),
      effectiveFrom: new Date(m.effectiveFrom).toISOString(),
      legalBasis: m.legalBasis.trim(),
      payload,
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    toast.error(j?.error ?? "Failed to publish. Check the values and the version (it must be new).");
    return false;
  }
  toast.success("New rates published");
  return true;
}

const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 };

// ── SSS Excel upload ──────────────────────────────────────────────────────────

type SssRow = {
  compensationFrom: number;
  compensationTo: number;
  msc: number;
  regularSSEmployer: number;
  regularSSEmployee: number;
  regularSSTotal: number;
  ecEmployer: number;
  mpfEmployer: number;
  mpfEmployee: number;
  mpfTotal: number;
  totalEmployer: number;
  totalEmployee: number;
  totalTotal: number;
};

function excelVal(v: unknown): number {
  if (v === null || v === undefined || v === "" || v === "-") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
const tc = (peso: number) => Math.round(peso * 100);

function parseSSSXlsx(buffer: ArrayBuffer): SssRow[] | string {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array" });
  } catch {
    return "Could not read the file. Use a valid .xlsx or .xls file.";
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return "Workbook has no sheets.";
  const ws = wb.Sheets[sheetName];
  if (!ws) return "Could not read sheet.";

  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  // Find the first data row: look for a row where column 1 (compensationTo) is
  // a positive number. Skip header rows which are text or empty.
  let startRow = -1;
  for (let i = 0; i < raw.length; i++) {
    const val = excelVal(raw[i]?.[1]);
    if (val > 0) { startRow = i; break; }
  }
  if (startRow === -1) {
    return "No data rows found. Ensure the file uses the official SSS contribution schedule format (13 columns, data starts after header rows).";
  }

  const rows: SssRow[] = [];
  for (let i = startRow; i < raw.length; i++) {
    const r = raw[i] ?? [];
    const compensationTo = tc(excelVal(r[1]));
    if (compensationTo <= 0) continue; // blank or non-data row

    rows.push({
      compensationFrom: tc(excelVal(r[0])),
      compensationTo,
      msc: tc(excelVal(r[2])),
      regularSSEmployer: tc(excelVal(r[3])),
      regularSSEmployee: tc(excelVal(r[4])),
      regularSSTotal: tc(excelVal(r[5])),
      ecEmployer: tc(excelVal(r[6])),
      mpfEmployer: tc(excelVal(r[7])),
      mpfEmployee: tc(excelVal(r[8])),
      mpfTotal: tc(excelVal(r[9])),
      totalEmployer: tc(excelVal(r[10])),
      totalEmployee: tc(excelVal(r[11])),
      totalTotal: tc(excelVal(r[12])),
    });
  }

  if (rows.length === 0) return "No valid rows parsed. Verify the file matches the SSS contribution schedule format.";
  return rows;
}

// Shared renderer for the SSS contribution schedule, used both by the upload
// preview (before publishing) and the "View full table" modal (after publishing).
function SssRowsTable({ rows }: { rows: SssRow[] }) {
  return (
    <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid var(--line)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, minWidth: 900 }}>
        <thead>
          <tr style={{ background: "var(--bg-2, #faf7f2)" }}>
            {["Comp. From","Comp. To","MSC","Reg. SS ER","Reg. SS EE","Reg. SS Total","EC ER","MPF ER","MPF EE","MPF Total","Total ER","Total EE","Grand Total"].map((h) => (
              <th key={h} style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: "var(--muted)", whiteSpace: "nowrap", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--bg-2, #faf7f2)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--line-2, #f0ebe2)" }}>
              <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--muted)" }}>{r.compensationFrom === 0 ? "–" : fmtPeso(r.compensationFrom)}</td>
              <td style={{ padding: "5px 8px", textAlign: "right" }}>{fmtPeso(r.compensationTo)}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 500 }}>{fmtPeso(r.msc)}</td>
              <td style={{ padding: "5px 8px", textAlign: "right" }}>{fmtPeso(r.regularSSEmployer)}</td>
              <td style={{ padding: "5px 8px", textAlign: "right" }}>{fmtPeso(r.regularSSEmployee)}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--muted)" }}>{fmtPeso(r.regularSSTotal)}</td>
              <td style={{ padding: "5px 8px", textAlign: "right" }}>{fmtPeso(r.ecEmployer)}</td>
              <td style={{ padding: "5px 8px", textAlign: "right" }}>{r.mpfEmployer === 0 ? "–" : fmtPeso(r.mpfEmployer)}</td>
              <td style={{ padding: "5px 8px", textAlign: "right" }}>{r.mpfEmployee === 0 ? "–" : fmtPeso(r.mpfEmployee)}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--muted)" }}>{r.mpfTotal === 0 ? "–" : fmtPeso(r.mpfTotal)}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600 }}>{fmtPeso(r.totalEmployer)}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600 }}>{fmtPeso(r.totalEmployee)}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600 }}>{fmtPeso(r.totalTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Coerce a stored payload row (plain JSON) into the typed SssRow shape.
function coerceSssRow(o: unknown): SssRow {
  const g = (k: string) => {
    const v = o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined;
    return typeof v === "number" ? v : 0;
  };
  return {
    compensationFrom: g("compensationFrom"),
    compensationTo: g("compensationTo"),
    msc: g("msc"),
    regularSSEmployer: g("regularSSEmployer"),
    regularSSEmployee: g("regularSSEmployee"),
    regularSSTotal: g("regularSSTotal"),
    ecEmployer: g("ecEmployer"),
    mpfEmployer: g("mpfEmployer"),
    mpfEmployee: g("mpfEmployee"),
    mpfTotal: g("mpfTotal"),
    totalEmployer: g("totalEmployer"),
    totalEmployee: g("totalEmployee"),
    totalTotal: g("totalTotal"),
  };
}

function SssUploadForm({ onDone }: { onDone: () => void }) {
  const m = useMeta();
  const [rows, setRows] = useState<SssRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setParseError(null);
    setRows(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = e.target?.result;
      if (!(buf instanceof ArrayBuffer)) return;
      const result = parseSSSXlsx(buf);
      if (typeof result === "string") {
        setParseError(result);
      } else {
        setRows(result);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function save() {
    if (!rows || rows.length === 0) { toast.error("Upload and verify a contribution table first."); return; }
    setSaving(true);
    const ok = await publish("/api/admin/statutory/sss", m, { rows });
    setSaving(false);
    if (ok) { setRows(null); setParseError(null); if (fileRef.current) fileRef.current.value = ""; onDone(); }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Upload zone */}
      <div
        onDrop={onDrop} onDragOver={(e) => e.preventDefault()}
        style={{
          border: "2px dashed var(--line)", borderRadius: 10, padding: "20px 18px",
          textAlign: "center", background: "var(--bg-2, #faf7f2)", cursor: "pointer",
        }}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <div style={{ fontSize: 13, color: "var(--ink)" }}>
          Drop the SSS contribution schedule Excel file here, or <span style={{ color: "var(--acc)", fontWeight: 600 }}>click to browse</span>
        </div>
        <div className="cp-muted" style={{ fontSize: 11.5, marginTop: 4 }}>
          Expected columns (A→M): Comp. From · Comp. To · MSC · Regular SS ER · EE · Total · EC ER · MPF ER · EE · Total · Total Contrib. ER · EE · Total
        </div>
      </div>

      {parseError && (
        <div style={{ background: "#fef2f1", border: "1px solid #f3c7c4", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b23b34" }}>
          {parseError}
        </div>
      )}

      {rows && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>
              Parsed {rows.length} rows: check them before publishing
            </span>
            <span style={{ fontSize: 11.5, color: "#1f7a4d", background: "#e7f4ec", borderRadius: 4, padding: "2px 7px" }}>Ready</span>
          </div>
          <SssRowsTable rows={rows} />
        </div>
      )}

      <MetaFields m={m} />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="cp-btn cp-btn-primary" disabled={saving || !rows} onClick={save}>
          {saving ? "Publishing…" : "Publish SSS contribution table"}
        </button>
      </div>
    </div>
  );
}

// ── Fill-from-Excel (PhilHealth / Pag-IBIG) ─────────────────────────────────────
//
// Unlike SSS (a 61-row lookup table that fully replaces the form), PhilHealth and
// Pag-IBIG are formula/bracket based. Here Excel upload is a convenience: it parses
// a file and *populates* the existing form, which stays the source of truth; the
// admin reviews the filled values before publishing.

/** Read the first worksheet of an uploaded file as a row-major array. */
function readSheetRows(buffer: ArrayBuffer): unknown[][] | null {
  try {
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0] ?? ""];
    if (!ws) return null;
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  } catch {
    return null;
  }
}

/** Tolerant numeric reader: strips ₱, %, commas and whitespace. */
function cellNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[,₱%\s]/g, ""));
  return isNaN(n) ? null : n;
}

function FillFromExcel({ hint, onParsed }: { hint: string; onParsed: (rows: unknown[][]) => string | null }) {
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  function handle(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = e.target?.result;
      if (!(buf instanceof ArrayBuffer)) return;
      const rows = readSheetRows(buf);
      if (!rows) { setMsg({ text: "Could not read that file. Use a valid .xlsx or .xls.", ok: false }); return; }
      const error = onParsed(rows);
      setMsg(error ? { text: error, ok: false } : { text: "Form filled from the file. Review the values, then publish.", ok: true });
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 10px", borderRadius: 8, background: "var(--bg-2, #faf7f2)", border: "1px solid var(--line)" }}>
      <input ref={ref} type="file" accept=".xlsx,.xls" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); if (ref.current) ref.current.value = ""; }} />
      <button type="button" className="cp-btn cp-btn-ghost" onClick={() => ref.current?.click()}>Fill from Excel</button>
      <span className="cp-muted" style={{ fontSize: 11.5, flex: 1, minWidth: 200 }}>{hint}</span>
      {msg && <span style={{ fontSize: 11.5, fontWeight: 600, color: msg.ok ? "#1f7a4d" : "#b23b34" }}>{msg.text}</span>}
    </div>
  );
}

// ── PhilHealth ─────────────────────────────────────────────────────────────────
function PhilHealthForm({ current, onDone }: { current?: RuleRow; onDone: () => void }) {
  const p = current?.payload;
  const m = useMeta();
  const [rate, setRate] = useState(toPct(dig(p, ["rate"])));
  const [ee, setEe] = useState(toPct(dig(p, ["split", "ee"])));
  const [er, setEr] = useState(toPct(dig(p, ["split", "er"])));
  const [floor, setFloor] = useState(toPeso(dig(p, ["msc", "floor"])));
  const [ceiling, setCeiling] = useState(toPeso(dig(p, ["msc", "ceiling"])));
  const [pmin, setPmin] = useState(toPeso(dig(p, ["premium", "min"])));
  const [pmax, setPmax] = useState(toPeso(dig(p, ["premium", "max"])));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const ok = await publish("/api/admin/statutory/philhealth", m, {
      rate: pctToRatio(rate),
      split: { ee: pctToRatio(ee), er: pctToRatio(er) },
      msc: { floor: pesoToCentavos(floor), ceiling: pesoToCentavos(ceiling) },
      premium: { min: pesoToCentavos(pmin), max: pesoToCentavos(pmax) },
    });
    setSaving(false);
    if (ok) onDone();
  }

  // Parse a 2-column [parameter, value] sheet; rates as %, amounts in ₱.
  function fillFromRows(rows: unknown[][]): string | null {
    let matched = 0;
    for (const r of rows) {
      const label = String(r?.[0] ?? "").toLowerCase().trim();
      const v = cellNum(r?.[1]);
      if (!label || v === null) continue;
      if (label.includes("employee") || label.includes("personal")) { setEe(String(v)); matched++; }
      else if (label.includes("employer")) { setEr(String(v)); matched++; }
      else if (label.includes("rate")) { setRate(String(v)); matched++; }
      else if (label.includes("floor")) { setFloor(String(v)); matched++; }
      else if (label.includes("ceiling")) { setCeiling(String(v)); matched++; }
      else if (label.includes("min")) { setPmin(String(v)); matched++; }
      else if (label.includes("max")) { setPmax(String(v)); matched++; }
    }
    if (matched === 0) return "No PhilHealth parameters recognized. Use a 2-column sheet: parameter name, value.";
    return null;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <FillFromExcel
        hint="Optional: upload a 2-column sheet (Parameter · Value): Premium Rate, MSC Floor, MSC Ceiling, Premium Min, Premium Max, Employee Share, Employer Share. Rates in %, amounts in ₱."
        onParsed={fillFromRows}
      />
      <div style={grid3}>
        <NumField label="Premium rate" suffix="%" value={rate} onChange={setRate} />
        <NumField label="Employee split" suffix="%" value={ee} onChange={setEe} />
        <NumField label="Employer split" suffix="%" value={er} onChange={setEr} />
        <NumField label="MSC floor" suffix="₱" value={floor} onChange={setFloor} />
        <NumField label="MSC ceiling" suffix="₱" value={ceiling} onChange={setCeiling} />
        <div />
        <NumField label="Premium min" suffix="₱" value={pmin} onChange={setPmin} />
        <NumField label="Premium max" suffix="₱" value={pmax} onChange={setPmax} />
      </div>
      <MetaFields m={m} />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="cp-btn cp-btn-primary" disabled={saving} onClick={save}>{saving ? "Publishing…" : "Publish new PhilHealth rates"}</button>
      </div>
    </div>
  );
}

// ── Pag-IBIG ───────────────────────────────────────────────────────────────────
type Bracket = { upTo: string; eeRate: string; erRate: string };
function PagibigForm({ current, onDone }: { current?: RuleRow; onDone: () => void }) {
  const p = current?.payload;
  const m = useMeta();
  const [mfsCap, setMfsCap] = useState(toPeso(dig(p, ["mfsCap"])));
  const initialBrackets: Bracket[] = Array.isArray(p?.brackets) && (p!.brackets as unknown[]).length
    ? (p!.brackets as Record<string, unknown>[]).map((b) => ({
        upTo: typeof b.upTo === "number" ? toPeso(b.upTo) : "",
        eeRate: toPct(typeof b.eeRate === "number" ? b.eeRate : null),
        erRate: toPct(typeof b.erRate === "number" ? b.erRate : null),
      }))
    : [{ upTo: "", eeRate: "", erRate: "" }];
  const [brackets, setBrackets] = useState<Bracket[]>(initialBrackets);
  const [saving, setSaving] = useState(false);

  function setB(i: number, k: keyof Bracket, v: string) {
    setBrackets((bs) => bs.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  }

  async function save() {
    setSaving(true);
    const ok = await publish("/api/admin/statutory/pagibig", m, {
      mfsCap: pesoToCentavos(mfsCap),
      brackets: brackets.map((b) => ({
        upTo: b.upTo.trim() === "" ? null : pesoToCentavos(b.upTo),
        eeRate: pctToRatio(b.eeRate),
        erRate: pctToRatio(b.erRate),
      })),
    });
    setSaving(false);
    if (ok) onDone();
  }

  // Parse a bracket table: columns Up To (₱) · EE % · ER %. A labelled
  // "MFS cap" / "Fund salary cap" row sets the cap; blank/"over" Up To = open-ended.
  function fillFromRows(rows: unknown[][]): string | null {
    const parsed: Bracket[] = [];
    for (const r of rows) {
      const c0 = String(r?.[0] ?? "").trim();
      const c0l = c0.toLowerCase();
      if (c0l.includes("cap") || c0l.includes("fund salary")) {
        const v = cellNum(r?.[1]);
        if (v !== null) setMfsCap(String(v));
        continue;
      }
      const ee = cellNum(r?.[1]);
      const er = cellNum(r?.[2]);
      if (ee === null || er === null) continue; // header / blank / non-bracket row
      const upToNum = cellNum(c0);
      const open = c0 === "" || /over|above|open|up\b/i.test(c0l);
      parsed.push({ upTo: open || upToNum === null ? "" : String(upToNum), eeRate: String(ee), erRate: String(er) });
    }
    if (parsed.length === 0) return "No Pag-IBIG bracket rows found. Use columns: Up To (₱), EE %, ER %.";
    setBrackets(parsed);
    return null;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <FillFromExcel
        hint="Optional: upload a bracket table with columns: Up To (₱) · EE % · ER %. Leave Up To blank (or 'over …') for the open-ended top bracket. A row labelled 'MFS cap' sets the cap."
        onParsed={fillFromRows}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
        <NumField label="Monthly Fund Salary cap" suffix="₱" value={mfsCap} onChange={setMfsCap} />
      </div>
      <div>
        <span className="cp-muted" style={{ fontSize: 11.5, display: "block", marginBottom: 6 }}>Brackets (last row = open-ended; leave &apos;Up to&apos; blank)</span>
        <div style={{ display: "grid", gap: 8 }}>
          {brackets.map((b, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "center" }}>
              <input type="number" step="0.01" min="0" placeholder="Up to (₱)" style={inputStyle} value={b.upTo} onChange={(e) => setB(i, "upTo", e.target.value)} />
              <input type="number" step="0.0001" min="0" placeholder="EE %" style={inputStyle} value={b.eeRate} onChange={(e) => setB(i, "eeRate", e.target.value)} />
              <input type="number" step="0.0001" min="0" placeholder="ER %" style={inputStyle} value={b.erRate} onChange={(e) => setB(i, "erRate", e.target.value)} />
              <button className="cp-btn cp-btn-ghost" disabled={brackets.length === 1} onClick={() => setBrackets((bs) => bs.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
        <button className="cp-link" style={{ marginTop: 8 }} onClick={() => setBrackets((bs) => [...bs, { upTo: "", eeRate: "", erRate: "" }])}>+ Add bracket</button>
      </div>
      <MetaFields m={m} />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="cp-btn cp-btn-primary" disabled={saving} onClick={save}>{saving ? "Publishing…" : "Publish new Pag-IBIG rates"}</button>
      </div>
    </div>
  );
}

// ── BIR withholding tax (PAY-161) ─────────────────────────────────────────────
// One table per pay frequency. A bracket covers pay from its "From" up to one
// centavo below the next bracket's, and the tax is fixed tax + rate on the
// excess over "From" (as lookupBIR applies it). birTableProblems is the same
// check the publish API runs.
type BirRowInput = { floor: string; fixedTax: string; rate: string };
type BirFormState = Record<BirTableFrequency, BirRowInput[]>;

const pctText = (ratio: number) => String(Number((ratio * 100).toFixed(4)));
const strictCentavos = (s: string) => (s.trim() === "" ? NaN : Math.round(Number(s) * 100));
const strictRatio = (s: string) => (s.trim() === "" ? NaN : Number((Number(s) / 100).toFixed(6)));

function birFrequenciesOf(payload?: Record<string, unknown>): Partial<Record<BirTableFrequency, BirBracketInput[]>> {
  const f = payload?.frequencies;
  return f && typeof f === "object" ? (f as Partial<Record<BirTableFrequency, BirBracketInput[]>>) : {};
}

function birStateFrom(frequencies: Partial<Record<BirTableFrequency, BirBracketInput[]>>): BirFormState {
  const out = {} as BirFormState;
  for (const f of BIR_TABLE_FREQUENCIES) {
    out[f] = (frequencies[f] ?? []).map((b) => ({ floor: toPeso(b.floor), fixedTax: toPeso(b.fixedTax), rate: pctText(b.plusRate) }));
  }
  return out;
}

function birInputFrom(state: BirFormState): BirTableInput {
  const frequencies: BirTableInput["frequencies"] = {};
  for (const f of BIR_TABLE_FREQUENCIES) {
    frequencies[f] = state[f].map((r) => ({ floor: strictCentavos(r.floor), fixedTax: strictCentavos(r.fixedTax), plusRate: strictRatio(r.rate) }));
  }
  return { frequencies };
}

/** "₱10,417.00 to ₱16,666.99" for each row, or "" while a row is unfinished. */
function birCovers(brackets: BirBracketInput[]): string[] {
  if (brackets.some((b) => !Number.isInteger(b.floor))) return brackets.map(() => "");
  return birRanges(brackets).map((r) => (r.to === null ? `₱${fmtPeso(r.from)} and over` : `₱${fmtPeso(r.from)} to ₱${fmtPeso(r.to)}`));
}

function BirRangesTable({ brackets }: { brackets: BirBracketInput[] }) {
  const th: React.CSSProperties = { textAlign: "right", padding: "6px 10px", fontSize: 11.5, color: "var(--muted)", fontWeight: 600, borderBottom: "1px solid var(--line)" };
  const td: React.CSSProperties = { textAlign: "right", padding: "6px 10px", fontSize: 12.5, borderBottom: "1px solid var(--line-2)", fontVariantNumeric: "tabular-nums" };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ ...th, textAlign: "left" }}>Taxable pay</th>
          <th style={th}>Fixed tax</th>
          <th style={th}>Plus</th>
          <th style={{ ...th, textAlign: "left" }}>Of the excess over</th>
        </tr>
      </thead>
      <tbody>
        {birRanges(brackets).map((r) => (
          <tr key={r.from}>
            <td style={{ ...td, textAlign: "left" }}>{r.to === null ? `₱${fmtPeso(r.from)} and over` : `₱${fmtPeso(r.from)} to ₱${fmtPeso(r.to)}`}</td>
            <td style={td}>₱{fmtPeso(r.fixedTax)}</td>
            <td style={td}>{pctText(r.plusRate)}%</td>
            <td style={{ ...td, textAlign: "left" }}>₱{fmtPeso(r.from)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BirFullTable({ payload }: { payload: Record<string, unknown> }) {
  const f = birFrequenciesOf(payload);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {BIR_TABLE_FREQUENCIES.filter((k) => (f[k] ?? []).length > 0).map((k) => (
        <div key={k}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{BIR_FREQUENCY_LABEL[k]}</div>
          <BirRangesTable brackets={f[k]!} />
        </div>
      ))}
    </div>
  );
}

function BirCurrentSummary({ rule }: { rule?: RuleRow }) {
  const [viewing, setViewing] = useState(false);
  if (!rule) return <p className="cp-muted" style={{ marginBottom: 12 }}>No BIR withholding table in effect. Publish one below.</p>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
      <Badge tone="Active">In effect</Badge>
      <span className="cp-mono">{rule.version}</span>
      <span className="cp-muted">from {fmtDate(rule.effectiveFrom)}</span>
      <span className="cp-muted">· {rule.legalBasis}</span>
      <button type="button" className="cp-link" onClick={() => setViewing(true)} style={{ marginLeft: "auto" }}>
        View full table
      </button>
      {viewing && (
        <Modal title={`BIR withholding tax table: ${rule.version}`} onClose={() => setViewing(false)}>
          <BirFullTable payload={rule.payload} />
        </Modal>
      )}
    </div>
  );
}

function BirForm({ current, onDone }: { current?: RuleRow; onDone: () => void }) {
  const m = useMeta();
  const [rows, setRows] = useState<BirFormState>(() => birStateFrom(birFrequenciesOf(current?.payload)));
  const [freq, setFreq] = useState<BirTableFrequency>("SEMI_MONTHLY");
  const [saving, setSaving] = useState(false);

  const input = birInputFrom(rows);
  const problems = birTableProblems(input);
  const covers = birCovers(input.frequencies[freq] ?? []);

  function setCell(i: number, k: keyof BirRowInput, v: string) {
    setRows((s) => ({ ...s, [freq]: s[freq].map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));
  }
  function addRow() {
    setRows((s) => ({ ...s, [freq]: [...s[freq], { floor: s[freq].length === 0 ? "0" : "", fixedTax: "", rate: "" }] }));
  }
  function removeRow(i: number) {
    setRows((s) => ({ ...s, [freq]: s[freq].filter((_, j) => j !== i) }));
  }

  function fillFromRows(sheet: unknown[][]): string | null {
    const r = birTableFromRows(sheet);
    if ("error" in r) return r.error;
    setRows(birStateFrom(r.table.frequencies));
    const missing = BIR_TABLE_FREQUENCIES.filter((f) => !(r.table.frequencies[f] ?? []).length).map((f) => BIR_FREQUENCY_LABEL[f]);
    return missing.length ? `Filled, but the sheet has no rows for: ${missing.join(", ")}.` : null;
  }

  function download() {
    const ws = XLSX.utils.aoa_to_sheet(birTableToRows(input));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BIR table");
    XLSX.writeFile(wb, `bir-withholding-${(current?.version ?? "new").replace(/[^A-Za-z0-9_-]/g, "")}.xlsx`);
  }

  async function save() {
    if (problems.length) { toast.error(problems[0]!); return; }
    setSaving(true);
    const ok = await publish("/api/admin/statutory/bir", m, birTablePayload(input) as unknown as Record<string, unknown>);
    setSaving(false);
    if (ok) onDone();
  }

  const cell: React.CSSProperties = { ...inputStyle, textAlign: "right" };
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <FillFromExcel
        hint="Optional: upload a sheet with one row per bracket: Frequency (Daily, Weekly, Semi-monthly, Monthly), From (₱), Fixed tax (₱), Rate (%). Download the current table to get the layout."
        onParsed={fillFromRows}
      />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }} role="tablist" aria-label="Pay frequency">
        {BIR_TABLE_FREQUENCIES.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={freq === f}
            className={freq === f ? "cp-btn cp-btn-primary" : "cp-btn cp-btn-ghost"}
            onClick={() => setFreq(f)}
          >
            {BIR_FREQUENCY_LABEL[f]} ({rows[f].length})
          </button>
        ))}
        <button type="button" className="cp-link" style={{ marginLeft: "auto" }} onClick={download}>Download as Excel</button>
      </div>
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1.6fr auto", gap: 8, fontSize: 11.5 }} className="cp-muted">
          <span>From (₱)</span><span>Fixed tax (₱)</span><span>Plus rate (%)</span><span>Covers taxable pay</span><span />
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
          {rows[freq].length === 0 && <p className="cp-muted" style={{ margin: 0 }}>No brackets for {BIR_FREQUENCY_LABEL[freq].toLowerCase()} pay yet.</p>}
          {rows[freq].map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1.6fr auto", gap: 8, alignItems: "center" }}>
              <input type="number" step="0.01" min="0" aria-label={`Bracket ${i + 1} from`} style={cell} value={r.floor} disabled={i === 0} onChange={(e) => setCell(i, "floor", e.target.value)} />
              <input type="number" step="0.01" min="0" aria-label={`Bracket ${i + 1} fixed tax`} style={cell} value={r.fixedTax} onChange={(e) => setCell(i, "fixedTax", e.target.value)} />
              <input type="number" step="0.0001" min="0" max="100" aria-label={`Bracket ${i + 1} rate`} style={cell} value={r.rate} onChange={(e) => setCell(i, "rate", e.target.value)} />
              <span className="cp-muted" style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{covers[i]}</span>
              <button type="button" className="cp-btn cp-btn-ghost" aria-label={`Remove bracket ${i + 1}`} disabled={i === 0 && rows[freq].length > 1} onClick={() => removeRow(i)}>✕</button>
            </div>
          ))}
        </div>
        <button type="button" className="cp-link" style={{ marginTop: 8 }} onClick={addRow}>+ Add bracket</button>
      </div>
      {problems.length > 0 && (
        <div role="alert" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #f0c8c4", background: "#fdf3f2", color: "#b23b34", fontSize: 12 }}>
          <strong>Fix before publishing:</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {problems.slice(0, 8).map((p) => <li key={p}>{p}</li>)}
            {problems.length > 8 && <li>and {problems.length - 8} more.</li>}
          </ul>
        </div>
      )}
      <MetaFields m={m} />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="cp-btn cp-btn-primary" disabled={saving || problems.length > 0} onClick={save}>{saving ? "Publishing…" : "Publish new BIR table"}</button>
      </div>
    </div>
  );
}

// ── Section wrapper ─────────────────────────────────────────────────────────────
function CurrentSummary({ rule }: { rule?: RuleRow }) {
  if (!rule) return <p className="cp-muted">No rates published yet. Publish the first version below.</p>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
      <Badge tone="Active">In effect</Badge>
      <span className="cp-mono">{rule.version}</span>
      <span className="cp-muted">from {fmtDate(rule.effectiveFrom)}</span>
      <span className="cp-muted">· {rule.legalBasis}</span>
    </div>
  );
}

function SssCurrentSummary({ rule }: { rule?: RuleRow }) {
  const [viewing, setViewing] = useState(false);
  if (!rule) return <p className="cp-muted" style={{ marginBottom: 12 }}>No contribution table published yet. Upload the SSS schedule below.</p>;
  const rawRows = Array.isArray(rule.payload?.rows) ? (rule.payload.rows as unknown[]) : [];
  const rowCount = rawRows.length;
  const tableRows = rawRows.map(coerceSssRow);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
      <Badge tone="Active">In effect</Badge>
      <span className="cp-mono">{rule.version}</span>
      <span className="cp-muted">from {fmtDate(rule.effectiveFrom)}</span>
      <span className="cp-muted">· {rule.legalBasis}</span>
      {rowCount > 0 && <span className="cp-muted">· {rowCount} compensation bands</span>}
      {rowCount > 0 && (
        <button type="button" className="cp-link" onClick={() => setViewing(true)} style={{ marginLeft: "auto" }}>
          View full table
        </button>
      )}
      {viewing && (
        <Modal title={`SSS contribution schedule: ${rule.version}`} onClose={() => setViewing(false)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <Badge tone="Active">In effect</Badge>
            <span className="cp-muted">from {fmtDate(rule.effectiveFrom)}</span>
            <span className="cp-muted">· {rule.legalBasis}</span>
            <span className="cp-muted">· {rowCount} compensation bands</span>
          </div>
          <SssRowsTable rows={tableRows} />
        </Modal>
      )}
    </div>
  );
}

// Lightweight modal for the Central Portal: overlay + centered panel, closes on
// backdrop click or Escape. Built inline (no shared primitive exists yet).
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100, background: "rgba(40,30,22,0.42)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--paper, #fff)", borderRadius: 14, width: "100%", maxWidth: 1000,
          maxHeight: "88vh", display: "flex", flexDirection: "column",
          boxShadow: "0 24px 70px -20px rgba(40,30,22,0.45)", overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{title}</h3>
          <button type="button" className="cp-btn cp-btn-ghost" onClick={onClose} aria-label="Close" style={{ padding: "5px 10px" }}>✕</button>
        </div>
        <div style={{ padding: 20, overflow: "auto" }}>{children}</div>
      </div>
    </div>
  );
}

export function ComplianceClient({ rules }: { rules: RuleRow[] }) {
  const router = useRouter();
  const onDone = () => router.refresh();
  const now = new Date();
  const historyOf = (cat: string) => rules.filter((r) => r.category === cat);
  // In effect = started and not ended, as the payroll resolves it; a version
  // with a later start date is upcoming, not in effect.
  const currentOf = (cat: string) => versionInEffect(historyOf(cat), now);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Card title="SSS: Social Security System">
        <SssCurrentSummary rule={currentOf("SSS_SCHEDULE")} />
        <SssUploadForm onDone={onDone} />
        <History rows={historyOf("SSS_SCHEDULE")} now={now} />
      </Card>

      <Card title="PhilHealth">
        <CurrentSummary rule={currentOf("PHILHEALTH_SCHEDULE")} />
        <PhilHealthForm current={currentOf("PHILHEALTH_SCHEDULE")} onDone={onDone} />
        <History rows={historyOf("PHILHEALTH_SCHEDULE")} now={now} />
      </Card>

      <Card title="Pag-IBIG (HDMF)">
        <CurrentSummary rule={currentOf("PAGIBIG_SCHEDULE")} />
        <PagibigForm current={currentOf("PAGIBIG_SCHEDULE")} onDone={onDone} />
        <History rows={historyOf("PAGIBIG_SCHEDULE")} now={now} />
      </Card>

      <Card title="BIR withholding tax">
        <BirCurrentSummary rule={currentOf("BIR_WITHHOLDING_TABLE")} />
        <BirForm current={currentOf("BIR_WITHHOLDING_TABLE")} onDone={onDone} />
        <History rows={historyOf("BIR_WITHHOLDING_TABLE")} now={now} />
      </Card>
    </div>
  );
}

const STATUS_TEXT: Record<TableStatus, string> = {
  IN_FORCE: "In effect",
  UPCOMING: "Upcoming",
  EARLIER: "Ended",
  REPLACED: "Not used",
};

function History({ rows, now }: { rows: RuleRow[]; now: Date }) {
  const [viewing, setViewing] = useState<RuleRow | null>(null);
  if (rows.length <= 1) return null;
  const inEffectId = versionInEffect(rows, now)?.id ?? null;
  const viewable = (r: RuleRow) => r.category === "BIR_WITHHOLDING_TABLE" || r.category === "SSS_SCHEDULE";
  return (
    <div style={{ marginTop: 14, borderTop: "1px solid var(--line-2)", paddingTop: 10 }}>
      <span className="cp-muted" style={{ fontSize: 11.5 }}>Version history</span>
      <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "grid", gap: 4 }}>
        {rows.map((r) => {
          const status = versionStatus(
            {
              id: r.id,
              tenantId: null,
              effectiveFrom: new Date(r.effectiveFrom),
              effectiveTo: r.effectiveTo ? new Date(r.effectiveTo) : null,
              legalBasis: r.legalBasis,
              version: r.version,
            },
            inEffectId,
            now,
          );
          return (
            <li key={r.id} style={{ display: "flex", gap: 10, fontSize: 12.5, color: "var(--muted)", alignItems: "baseline", flexWrap: "wrap" }}>
              <span className="cp-mono">{r.version}</span>
              <span>{fmtDate(r.effectiveFrom)}{r.effectiveTo ? ` to ${fmtDate(r.effectiveTo)}` : " onward"}</span>
              <span style={{ fontWeight: 600, color: status === "IN_FORCE" ? "#1f7a4d" : status === "REPLACED" ? "#b26a00" : "var(--muted)" }}>{STATUS_TEXT[status]}</span>
              <span style={{ color: "var(--muted-2)" }}>{r.legalBasis}</span>
              {viewable(r) && (
                <button type="button" className="cp-link" style={{ fontSize: 12 }} onClick={() => setViewing(r)}>View</button>
              )}
            </li>
          );
        })}
      </ul>
      {viewing && (
        <Modal title={`${viewing.version}: from ${fmtDate(viewing.effectiveFrom)}`} onClose={() => setViewing(null)}>
          {viewing.category === "BIR_WITHHOLDING_TABLE" ? (
            <BirFullTable payload={viewing.payload} />
          ) : (
            <SssRowsTable rows={(Array.isArray(viewing.payload?.rows) ? (viewing.payload.rows as unknown[]) : []).map(coerceSssRow)} />
          )}
        </Modal>
      )}
    </div>
  );
}
