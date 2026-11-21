"use client";

/** Wave F2 (PAY-216): Team Discussion in ESS. */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DiscussionBoard } from "@/components/team/DiscussionBoard";

export default function EssDiscussionPage() {
  return (
    <div className="p-4 lg:p-8 space-y-4 max-w-5xl mx-auto">
      <Link href="/ess" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Home</Link>
      <h1 className="text-xl lg:text-2xl font-bold">Discussion</h1>
      <DiscussionBoard mode="ess" />
    </div>
  );
}
