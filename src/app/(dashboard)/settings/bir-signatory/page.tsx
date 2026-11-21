"use client";

/**
 * BIR 2316 signatory (Mark, 22 Nov 2026): the HR manager who signs the
 * employees' 2316 as the employer (Items 53 and 55), and their e-signature.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type User = { id: string; firstName: string; lastName: string; email: string };
type Signatory = { userId: string; name: string; position: string; hasSignature: boolean } | null;

export default function BirSignatoryPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [current, setCurrent] = useState<Signatory>(null);
  const [userId, setUserId] = useState("");
  const [position, setPosition] = useState("HR Manager");
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const j = await fetch("/api/settings/bir-signatory").then((r) => r.json()).catch(() => null);
    const s: Signatory = j?.data ?? null;
    setCurrent(s);
    if (s) { setUserId(s.userId); setPosition(s.position); }
    const res = await fetch("/api/settings/bir-signatory/signature");
    setImg(res.ok ? URL.createObjectURL(await res.blob()) : null);
  }, []);
  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then((j) => setUsers(j?.data ?? [])).catch(() => setUsers([]));
    void load();
  }, [load]);

  async function save() {
    if (!userId) { toast.error("Choose the signatory"); return; }
    const fd = new FormData(); fd.set("userId", userId); fd.set("position", position); if (file) fd.set("file", file);
    const res = await fetch("/api/settings/bir-signatory", { method: "PUT", body: fd });
    const j = await res.json().catch(() => null);
    if (!res.ok) { toast.error(j?.error ?? "It was not saved"); return; }
    toast.success("Saved"); setFile(null); void load();
  }
  async function clear() {
    if (!window.confirm("Remove the 2316 signatory? Items 53 and 55 will be left blank.")) return;
    await fetch("/api/settings/bir-signatory", { method: "DELETE" });
    setUserId(""); void load();
  }

  return (
    <div className="space-y-6 max-w-[720px]">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">BIR 2316 Signatory</h1>
        <p className="text-[13px] text-[#6B6B6B] mt-0.5">The HR manager who signs the employees&apos; BIR Form 2316 for the company: Item 53, and Item 55 when an employee qualifies for substituted filing. Their name, position and e-signature are printed there. With no signatory, those items are left blank to sign by hand.</p>
      </div>
      <section className="rounded-lg border p-4 space-y-3">
        <div className="space-y-1"><Label className="text-[12px]">Signatory</Label>
          <select className="h-9 w-full rounded-md border px-2 text-[13px]" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Choose a user…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>)}
          </select>
        </div>
        <div className="space-y-1"><Label className="text-[12px]">Position</Label><Input value={position} onChange={(e) => setPosition(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-[12px]">E-signature (PNG or JPEG, up to 1 MB; a PNG with a clear background looks best)</Label>
          <Input type="file" accept="image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {current && current.userId !== userId && <p className="text-[12px] text-[#6B6B6B]">A new signatory does not keep the previous person&apos;s signature: upload theirs.</p>}
        </div>
        {img && current?.userId === userId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="Signatory's signature" className="h-14 max-w-[240px] rounded border bg-white object-contain p-1" />
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={save}>Save</Button>
          {current && <Button size="sm" variant="outline" onClick={clear}>Remove signatory</Button>}
        </div>
      </section>
    </div>
  );
}
