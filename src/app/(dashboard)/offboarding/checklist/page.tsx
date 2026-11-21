"use client";

/**
 * PAY-197, ruling 2: the company's clearance checklist. Each item has a
 * signatory; new offboarding cases copy the active items.
 */
import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type User = { id: string; firstName: string; lastName: string; email: string };
type Item = { id: string; name: string; description: string | null; sortOrder: number; isActive: boolean; signatory: User };

export default function ClearanceChecklistPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({ name: "", description: "", signatoryUserId: "", sortOrder: "0" });

  const load = useCallback(async () => {
    const [i, u] = await Promise.all([fetch("/api/offboarding/clearance-template").then((r) => r.json()), fetch("/api/users?limit=200").then((r) => r.json())]);
    setItems(i.data ?? []); setUsers(u.data ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    const res = await fetch("/api/offboarding/clearance-template", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, description: form.description || null, sortOrder: Number(form.sortOrder) || 0 }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(json.error ?? "Could not add"); return; }
    setForm({ name: "", description: "", signatoryUserId: "", sortOrder: "0" }); void load();
  }
  async function remove(id: string) {
    const res = await fetch(`/api/offboarding/clearance-template/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not remove"); return; }
    void load();
  }

  return (
    <div className="space-y-5 text-[13px]">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">Clearance Checklist</h1>
        <p className="text-[#6B6B6B] mt-0.5 max-w-[760px]">The items every leaving employee is cleared on, and who signs each off. Cases already open keep the list they started with.</p>
      </div>
      <div className="bg-white rounded-xl border border-[#E8E8E8] p-4 grid gap-2 md:grid-cols-[2fr_2fr_2fr_80px_auto] items-end">
        <label className="space-y-1"><span className="font-medium">Item</span><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Company laptop returned" /></label>
        <label className="space-y-1"><span className="font-medium">Details</span><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" /></label>
        <label className="space-y-1"><span className="font-medium">Signatory</span>
          <select className="h-9 w-full rounded-md border px-2" value={form.signatoryUserId} onChange={(e) => setForm({ ...form, signatoryUserId: e.target.value })}>
            <option value="">Pick a user</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>)}
          </select>
        </label>
        <label className="space-y-1"><span className="font-medium">Order</span><Input value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></label>
        <Button size="sm" className="h-9" onClick={add} disabled={!form.name.trim() || !form.signatoryUserId} data-testid="add-clearance-item">Add</Button>
      </div>
      <div className="bg-white rounded-xl border border-[#E8E8E8] divide-y">
        {items.length === 0 ? <p className="p-6 text-center text-[#6B6B6B]">No checklist items yet. Without any, a new case is cleared at once.</p> : items.map((i) => (
          <div key={i.id} className="p-3 flex items-center justify-between gap-2">
            <span><span className="font-medium">{i.sortOrder}. {i.name}</span>{i.description ? <span className="text-[#6B6B6B]"> {i.description}</span> : null}<span className="text-[#6B6B6B]"> · signed off by {i.signatory.firstName} {i.signatory.lastName}</span></span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(i.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
