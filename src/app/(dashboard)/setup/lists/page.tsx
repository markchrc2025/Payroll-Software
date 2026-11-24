"use client";

/**
 * Settings hub, Lists (menu split, Mark 25 Nov 2026): one page with a tab per
 * company list. The tab is kept in the address (?list=BANK) so a link can
 * open a given list.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ListEditor } from "@/components/settings/ListEditor";
import { LIST_TAB_ORDER, SETTINGS_HUB_HREF, listTabLabel } from "@/lib/settings-hub";

function ListsTabs() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const asked = params.get("list") ?? "";
  const current = LIST_TAB_ORDER.includes(asked) ? asked : LIST_TAB_ORDER[0]!;
  return (
    <div className="space-y-4 text-[13px]" data-testid="settings-lists">
      <Link href={SETTINGS_HUB_HREF} className="text-[#6B6B6B] hover:text-[var(--ink)]">Settings</Link>
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-[#E8E8E8]">
        {LIST_TAB_ORDER.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={k === current}
            data-testid={`tab-${k}`}
            onClick={() => router.replace(`${pathname}?list=${k}`)}
            className={`px-3 py-2 -mb-px border-b-2 ${k === current ? "border-[var(--ink)] text-[var(--ink)] font-medium" : "border-transparent text-[#6B6B6B] hover:text-[var(--ink)]"}`}
          >
            {listTabLabel(k)}
          </button>
        ))}
      </div>
      <ListEditor key={current} list={current} />
    </div>
  );
}

export default function SettingsListsPage() {
  return (
    <Suspense fallback={<p className="text-[13px] text-[#6B6B6B]">Loading</p>}>
      <ListsTabs />
    </Suspense>
  );
}
