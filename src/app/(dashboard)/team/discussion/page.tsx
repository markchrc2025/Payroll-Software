"use client";

/** Wave F2 (PAY-216): Team Discussion for HR: every thread; hide a post (audited). */
import { useEffect, useState } from "react";
import { DiscussionBoard } from "@/components/team/DiscussionBoard";

export default function TeamDiscussionPage() {
  const [depts, setDepts] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { fetch("/api/departments").then((r) => r.json()).then((j) => setDepts(j?.data ?? [])).catch(() => setDepts([])); }, []);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">Discussion</h1>
        <p className="text-[13px] text-[#6B6B6B] mt-0.5 max-w-[760px]">Threads for a department or for everyone. Employees take part in ESS. You see every thread, and can hide a post with a reason; the hide is audited.</p>
      </div>
      <DiscussionBoard mode="hr" departments={depts} />
    </div>
  );
}
