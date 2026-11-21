"use client";

/**
 * Wave A: one screen for every list the company keeps (banks, courses,
 * trainers, document categories, expense categories and types, incident
 * categories, types and decisions, ethnicity, religion). The fields come from
 * the list's definition (src/lib/lookups/registry.ts).
 */
import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Field = { key: string; label: string; kind: "text" | "number" | "money" | "boolean" | "select"; options?: string[]; help?: string };
type Def = { key: string; label: string; noun: string; description: string; fields: Field[]; sensitive?: boolean };
type Item = { id: string; code: string; name: string; sortOrder: number; isActive: boolean; isSystem: boolean; attributes: Record<string, unknown> };

const toCents = (v: string) => { const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(v.replace(/,/g, "").trim()); return m ? `${BigInt(m[1]!) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0")}` : null; };
const fromCents = (v: unknown) => { if (v == null || v === "") return ""; const n = BigInt(String(v)); return `${n / 100n}.${(n % 100n).toString().padStart(2, "0")}`; };

export default function ListPage({ params }: { params: Promise<{ list: string }> }) {
  const { list } = use(params);
  const [def, setDef] = useState<Def | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({ code: "", name: "", sortOrder: "0" });
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/lookups/${list}?includeInactive=1`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.error ?? "Could not load the list"); return; }
    setDef(json.data.definition); setItems(json.data.items);
  }, [list]);
  useEffect(() => { void load(); }, [load]);

  function attributesFrom(d: Record<string, string | boolean>) {
    const a: Record<string, unknown> = {};
    for (const f of def?.fields ?? []) {
      const v = d[`a_${f.key}`];
      if (f.kind === "boolean") a[f.key] = !!v;
      else if (v === undefined || v === "") a[f.key] = null;
      else if (f.kind === "number") a[f.key] = Number(v);
      else if (f.kind === "money") a[f.key] = toCents(String(v)) ?? "bad";
      else a[f.key] = String(v);
    }
    return a;
  }
  async function save() {
    const body = { code: String(draft.code), name: String(draft.name), sortOrder: Number(draft.sortOrder) || 0, attributes: attributesFrom(draft) };
    const res = await fetch(editing ? `/api/lookups/${list}/${editing}` : `/api/lookups/${list}`, { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.error ?? "Could not save"); return; }
    setDraft({ code: "", name: "", sortOrder: "0" }); setEditing(null); void load();
  }
  function edit(i: Item) {
    const d: Record<string, string | boolean> = { code: i.code, name: i.name, sortOrder: String(i.sortOrder) };
    for (const f of def?.fields ?? []) {
      const v = i.attributes[f.key];
      d[`a_${f.key}`] = f.kind === "boolean" ? !!v : f.kind === "money" ? fromCents(v) : v == null ? "" : String(v);
    }
    setDraft(d); setEditing(i.id);
  }
  async function toggle(i: Item) {
    await fetch(`/api/lookups/${list}/${i.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isActive: !i.isActive }) });
    void load();
  }
  async function remove(i: Item) {
    const res = await fetch(`/api/lookups/${list}/${i.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.error ?? "Could not delete"); return; }
    void load();
  }

  if (!def) return <p className="text-[13px] text-[#6B6B6B]">Loading</p>;
  const shown = (i: Item, f: Field) => { const v = i.attributes[f.key]; return f.kind === "boolean" ? (v ? "Yes" : "") : f.kind === "money" ? fromCents(v) : v == null ? "" : String(v); };
  return (
    <div className="space-y-5 text-[13px]" data-testid={`list-${def.key}`}>
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">{def.label}</h1>
        <p className="text-[#6B6B6B] mt-0.5 max-w-[760px]">{def.description}</p>
      </div>
      <div className="bg-white rounded-xl border border-[#E8E8E8] p-4 flex flex-wrap gap-2 items-end">
        <label className="space-y-1 w-36"><span className="font-medium">Code</span><Input value={String(draft.code)} onChange={(e) => setDraft({ ...draft, code: e.target.value })} /></label>
        <label className="space-y-1 flex-1 min-w-48"><span className="font-medium">Name</span><Input value={String(draft.name)} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        {def.fields.map((f) => (
          <label key={f.key} className="space-y-1 w-44" title={f.help}><span className="font-medium">{f.label}</span>
            {f.kind === "boolean" ? <div className="h-9 flex items-center"><input type="checkbox" checked={!!draft[`a_${f.key}`]} onChange={(e) => setDraft({ ...draft, [`a_${f.key}`]: e.target.checked })} /></div>
              : f.kind === "select" ? <select className="h-9 w-full rounded-md border px-2" value={String(draft[`a_${f.key}`] ?? "")} onChange={(e) => setDraft({ ...draft, [`a_${f.key}`]: e.target.value })}><option value="" />{f.options!.map((o) => <option key={o} value={o}>{o}</option>)}</select>
              : <Input value={String(draft[`a_${f.key}`] ?? "")} onChange={(e) => setDraft({ ...draft, [`a_${f.key}`]: e.target.value })} />}
          </label>
        ))}
        <label className="space-y-1 w-20"><span className="font-medium">Order</span><Input value={String(draft.sortOrder)} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} /></label>
        <Button size="sm" className="h-9" onClick={save} disabled={!String(draft.code).trim() || !String(draft.name).trim()} data-testid="save-list-item">{editing ? "Save" : `Add ${def.noun}`}</Button>
        {editing && <Button size="sm" variant="outline" className="h-9" onClick={() => { setEditing(null); setDraft({ code: "", name: "", sortOrder: "0" }); }}>Cancel</Button>}
      </div>
      <div className="bg-white rounded-xl border border-[#E8E8E8] overflow-x-auto">
        <table className="w-full">
          <thead><tr className="bg-[#F7F7F7] text-left text-[12px] text-[#6B6B6B]"><th className="p-2">Code</th><th className="p-2">Name</th>{def.fields.map((f) => <th key={f.key} className="p-2">{f.label}</th>)}<th className="p-2" /></tr></thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan={3 + def.fields.length} className="p-6 text-center text-[#6B6B6B]">Nothing in this list yet.</td></tr> : items.map((i) => (
              <tr key={i.id} className={`border-t ${i.isActive ? "" : "text-[#9A9A9A]"}`}>
                <td className="p-2 font-mono">{i.code}</td><td className="p-2">{i.name}{i.isSystem ? " (built in)" : ""}</td>
                {def.fields.map((f) => <td key={f.key} className="p-2">{shown(i, f)}</td>)}
                <td className="p-2 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => edit(i)}>Edit</Button>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => toggle(i)}>{i.isActive ? "Switch off" : "Switch on"}</Button>
                  {!i.isSystem && <Button size="sm" variant="ghost" className="h-7" onClick={() => remove(i)}>Delete</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
