"use client";

/**
 * Wave F2 (PAY-216): the Team Discussion board, shared by HR (dashboard,
 * mode "hr": every thread, hide a post) and employees (ESS, mode "ess").
 * Mention someone in the audience with @First Last or @employee-number.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Summary = { id: string; title: string; authorName: string; lastActivityAt: string; comments: number; hidden: boolean; mentionsMe: boolean };
type Post = { id: string; body: string; authorName: string; createdAt: string; hidden: boolean; hiddenReason: string | null; mentionsMe?: boolean };
type Thread = Post & { title: string; comments: Post[] };

const when = (s: string) => new Date(s).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

export function DiscussionBoard({ mode, departments = [] }: { mode: "hr" | "ess"; departments?: { id: string; name: string }[] }) {
  const base = mode === "hr" ? "/api/team/threads" : "/api/ess/team/threads";
  const headers = useCallback((): Record<string, string> => (mode === "ess" ? { Authorization: `Bearer ${localStorage.getItem("ess_token") ?? ""}` } : {}), [mode]);
  const [list, setList] = useState<Summary[]>([]);
  const [open, setOpen] = useState<Thread | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dept, setDept] = useState<string[]>([]);
  const [reply, setReply] = useState("");

  const load = useCallback(async () => setList((await fetch(base, { headers: headers() }).then((r) => r.json()).catch(() => null))?.data ?? []), [base, headers]);
  useEffect(() => { void load(); }, [load]);
  const openThread = async (id: string) => setOpen((await fetch(`${base}/${id}`, { headers: headers() }).then((r) => r.json()).catch(() => null))?.data ?? null);
  const send = async (url: string, payload: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await res.json().catch(() => null);
    if (!res.ok) { toast.error(j?.error ?? "Could not post"); return false; }
    return true;
  };

  async function post() {
    if (await send(base, { title, body, audience: { departmentIds: dept, branchIds: [] } })) { setTitle(""); setBody(""); setDept([]); void load(); }
  }
  async function comment() {
    if (open && (await send(`${base}/${open.id}/comments`, { body: reply }))) { setReply(""); void openThread(open.id); void load(); }
  }
  async function hide(kind: "THREAD" | "COMMENT", id: string) {
    const reason = prompt("Why hide it? Employees will no longer see it.");
    if (!reason) return;
    if (await send("/api/team/hide", { kind, id, reason })) { toast.success("Hidden"); if (open) void openThread(open.id); void load(); }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="space-y-3">
        <div className="rounded-lg border bg-white p-3 space-y-2">
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea rows={3} placeholder="Write a post. Mention someone with @First Last." value={body} onChange={(e) => setBody(e.target.value)} />
          {mode === "hr" && departments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-[12px]"><span className="text-[#6B6B6B]">For:</span>{departments.map((d) => {
              const on = dept.includes(d.id);
              return <button key={d.id} type="button" onClick={() => setDept(on ? dept.filter((x) => x !== d.id) : [...dept, d.id])} className={`rounded-full border px-2 ${on ? "border-[#E8693A] bg-[#FDF1EC]" : ""}`}>{d.name}</button>;
            })}<span className="text-[#6B6B6B]">{dept.length ? "" : "(everyone)"}</span></div>
          )}
          {mode === "ess" && <p className="text-[12px] text-[#6B6B6B]">Your post is for your department.</p>}
          <Button size="sm" onClick={post} disabled={!title.trim() || !body.trim()}>Post</Button>
        </div>
        {list.length === 0 && <p className="text-[13px] text-[#6B6B6B]">No discussions yet.</p>}
        {list.map((t) => (
          <button key={t.id} type="button" onClick={() => openThread(t.id)} className={`block w-full rounded-lg border bg-white p-3 text-left hover:bg-[#FAFAFA] ${open?.id === t.id ? "border-[#E8693A]" : ""}`}>
            <div className="font-medium text-[13.5px]">{t.title}{t.hidden && <span className="ml-2 text-[11.5px] text-[#B42318]">Hidden</span>}{t.mentionsMe && <span className="ml-2 text-[11.5px] text-[#E8693A]">Mentions you</span>}</div>
            <div className="text-[12px] text-[#6B6B6B]">{t.authorName} · {t.comments} comment{t.comments === 1 ? "" : "s"} · {when(t.lastActivityAt)}</div>
          </button>
        ))}
      </div>
      <div>
        {open ? (
          <div className="rounded-lg border bg-white p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div><h2 className="text-[16px] font-semibold">{open.title}</h2><div className="text-[12px] text-[#6B6B6B]">{open.authorName} · {when(open.createdAt)}</div></div>
              {mode === "hr" && !open.hidden && <Button variant="outline" size="sm" onClick={() => hide("THREAD", open.id)}>Hide</Button>}
            </div>
            {open.hidden && <p className="text-[12px] text-[#B42318]">Hidden from employees: {open.hiddenReason}</p>}
            <p className="whitespace-pre-line text-[13.5px]">{open.body}</p>
            <div className="space-y-2 border-t pt-3">
              {open.comments.map((c) => (
                <div key={c.id} className={`rounded-md p-2 ${c.mentionsMe ? "bg-[#FDF1EC]" : "bg-[#F7F7F7]"}`}>
                  <div className="flex items-center justify-between text-[12px] text-[#6B6B6B]"><span>{c.authorName} · {when(c.createdAt)}</span>
                    {mode === "hr" && !c.hidden && <button type="button" className="hover:underline" onClick={() => hide("COMMENT", c.id)}>Hide</button>}</div>
                  {c.hidden && <p className="text-[12px] text-[#B42318]">Hidden from employees: {c.hiddenReason}</p>}
                  <p className="whitespace-pre-line text-[13px]">{c.body}</p>
                </div>
              ))}
              <Textarea rows={2} placeholder="Reply" value={reply} onChange={(e) => setReply(e.target.value)} />
              <Button size="sm" onClick={comment} disabled={!reply.trim()}>Reply</Button>
            </div>
          </div>
        ) : <p className="text-[13px] text-[#6B6B6B]">Choose a discussion.</p>}
      </div>
    </div>
  );
}
