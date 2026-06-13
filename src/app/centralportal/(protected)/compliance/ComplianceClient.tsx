"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
/** Safely dig a number out of an unknown JSON payload. */
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

const today = () => new Date().toISOString().slice(0, 10);

// Common publish metadata (version + effectivity + legal basis), shared by all forms.
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
function NumFieldText({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label style={{ display: "block" }}>
      <span className="cp-muted" style={{ fontSize: 11.5, display: "block", marginBottom: 4 }}>{label}</span>
      <input style={inputStyle} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
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

// ── SSS ───────────────────────────────────────────────────────────────────────
function SssForm({ current, onDone }: { current?: RuleRow; onDone: () => void }) {
  const p = current?.payload;
  const m = useMeta();
  const [ee, setEe] = useState(toPct(dig(p, ["monthlyRate", "ee"])));
  const [er, setEr] = useState(toPct(dig(p, ["monthlyRate", "er"])));
  const [floor, setFloor] = useState(toPeso(dig(p, ["msc", "floor"])));
  const [ceiling, setCeiling] = useState(toPeso(dig(p, ["msc", "ceiling"])));
  const [step, setStep] = useState(toPeso(dig(p, ["msc", "step"])));
  const [mpf, setMpf] = useState(toPeso(dig(p, ["mpfThresholdMsc"])));
  const [ecT, setEcT] = useState(toPeso(dig(p, ["ec", "thresholdMsc"])));
  const [ecLow, setEcLow] = useState(toPeso(dig(p, ["ec", "lowAmount"])));
  const [ecHigh, setEcHigh] = useState(toPeso(dig(p, ["ec", "highAmount"])));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const ok = await publish("/api/admin/statutory/sss", m, {
      monthlyRate: { ee: pctToRatio(ee), er: pctToRatio(er) },
      msc: { floor: pesoToCentavos(floor), ceiling: pesoToCentavos(ceiling), step: pesoToCentavos(step) },
      mpfThresholdMsc: pesoToCentavos(mpf),
      ec: { thresholdMsc: pesoToCentavos(ecT), lowAmount: pesoToCentavos(ecLow), highAmount: pesoToCentavos(ecHigh) },
    });
    setSaving(false);
    if (ok) onDone();
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={grid3}>
        <NumField label="Employee share" suffix="%" value={ee} onChange={setEe} />
        <NumField label="Employer share" suffix="%" value={er} onChange={setEr} />
        <NumField label="MPF threshold MSC" suffix="₱" value={mpf} onChange={setMpf} />
        <NumField label="MSC floor" suffix="₱" value={floor} onChange={setFloor} />
        <NumField label="MSC ceiling" suffix="₱" value={ceiling} onChange={setCeiling} />
        <NumField label="MSC step" suffix="₱" value={step} onChange={setStep} />
        <NumField label="EC threshold MSC" suffix="₱" value={ecT} onChange={setEcT} />
        <NumField label="EC low amount" suffix="₱" value={ecLow} onChange={setEcLow} />
        <NumField label="EC high amount" suffix="₱" value={ecHigh} onChange={setEcHigh} />
      </div>
      <MetaFields m={m} />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="cp-btn cp-btn-primary" disabled={saving} onClick={save}>{saving ? "Publishing…" : "Publish new SSS rates"}</button>
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
        <span className="cp-muted" style={{ fontSize: 11.5, display: "block", marginBottom: 6 }}>Brackets (last row = open-ended; leave “Up to” blank)</span>
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

export function ComplianceClient({ rules }: { rules: RuleRow[] }) {
  const router = useRouter();
  const onDone = () => router.refresh();
  const currentOf = (cat: string) => rules.find((r) => r.category === cat);
  const historyOf = (cat: string) => rules.filter((r) => r.category === cat);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Card title="SSS — Social Security System">
        <CurrentSummary rule={currentOf("SSS_SCHEDULE")} />
        <SssForm current={currentOf("SSS_SCHEDULE")} onDone={onDone} />
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
