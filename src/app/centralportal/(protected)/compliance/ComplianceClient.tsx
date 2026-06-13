"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Card, Badge } from "../components/cp";

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
    toast.error(j?.error ?? "Failed to publish — check the values and version (must be unique).");
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
    return "Could not parse file — ensure it is a valid .xlsx or .xls file.";
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
              Parsed {rows.length} rows — verify before publishing
            </span>
            <span style={{ fontSize: 11.5, color: "#1f7a4d", background: "#e7f4ec", borderRadius: 4, padding: "2px 7px" }}>Ready</span>
          </div>
          <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid var(--line)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, minWidth: 900 }}>
              <thead>
                <tr style={{ background: "var(--bg-2, #faf7f2)" }}>
                  {["Comp. From","Comp. To","MSC","Reg. SS ER","Reg. SS EE","Reg. SS Total","EC ER","MPF ER","MPF EE","MPF Total","Total ER","Total EE","Grand Total"].map((h) => (
                    <th key={h} style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: "var(--muted)", whiteSpace: "nowrap", borderBottom: "1px solid var(--line)" }}>
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

  return (
    <div style={{ display: "grid", gap: 12 }}>
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

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
        <NumField label="Monthly Fund Salary cap" suffix="₱" value={mfsCap} onChange={setMfsCap} />
      </div>
      <div>
        <span className="cp-muted" style={{ fontSize: 11.5, display: "block", marginBottom: 6 }}>Brackets (last row = open-ended; leave "Up to" blank)</span>
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

// ── Section wrapper ─────────────────────────────────────────────────────────────
function CurrentSummary({ rule }: { rule?: RuleRow }) {
  if (!rule) return <p className="cp-muted">No rates published yet — publish the first version below.</p>;
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
  if (!rule) return <p className="cp-muted" style={{ marginBottom: 12 }}>No contribution table published yet — upload the SSS schedule below.</p>;
  const rowCount = Array.isArray(rule.payload?.rows) ? (rule.payload.rows as unknown[]).length : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
      <Badge tone="Active">In effect</Badge>
      <span className="cp-mono">{rule.version}</span>
      <span className="cp-muted">from {fmtDate(rule.effectiveFrom)}</span>
      <span className="cp-muted">· {rule.legalBasis}</span>
      {rowCount != null && <span className="cp-muted">· {rowCount} compensation bands</span>}
    </div>
  );
}

export function ComplianceClient({ rules }: { rules: RuleRow[] }) {
  const router = useRouter();
  const onDone = () => router.refresh();
  const currentOf = (cat: string) => rules.find((r) => r.category === cat);
  const historyOf = (cat: string) => rules.filter((r) => r.category === cat);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Card title="SSS — Social Security System">
        <SssCurrentSummary rule={currentOf("SSS_SCHEDULE")} />
        <SssUploadForm onDone={onDone} />
        <History rows={historyOf("SSS_SCHEDULE")} />
      </Card>

      <Card title="PhilHealth">
        <CurrentSummary rule={currentOf("PHILHEALTH_SCHEDULE")} />
        <PhilHealthForm current={currentOf("PHILHEALTH_SCHEDULE")} onDone={onDone} />
        <History rows={historyOf("PHILHEALTH_SCHEDULE")} />
      </Card>

      <Card title="Pag-IBIG (HDMF)">
        <CurrentSummary rule={currentOf("PAGIBIG_SCHEDULE")} />
        <PagibigForm current={currentOf("PAGIBIG_SCHEDULE")} onDone={onDone} />
        <History rows={historyOf("PAGIBIG_SCHEDULE")} />
      </Card>
    </div>
  );
}

function History({ rows }: { rows: RuleRow[] }) {
  if (rows.length <= 1) return null;
  return (
    <div style={{ marginTop: 14, borderTop: "1px solid var(--line-2)", paddingTop: 10 }}>
      <span className="cp-muted" style={{ fontSize: 11.5 }}>Version history</span>
      <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "grid", gap: 4 }}>
        {rows.map((r) => (
          <li key={r.id} style={{ display: "flex", gap: 10, fontSize: 12.5, color: "var(--muted)" }}>
            <span className="cp-mono">{r.version}</span>
            <span>{fmtDate(r.effectiveFrom)}{r.effectiveTo ? ` – ${fmtDate(r.effectiveTo)}` : " – present"}</span>
            <span style={{ color: "var(--muted-2)" }}>{r.legalBasis}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
