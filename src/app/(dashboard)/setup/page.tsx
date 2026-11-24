import Link from "next/link";
import { SETTINGS_GROUPS } from "@/lib/settings-hub";

/**
 * Settings hub (menu split, Mark 25 Nov 2026): every set-up page as a card,
 * grouped, instead of about 20 sidebar rows. Each card's page keeps its own
 * permission check.
 */
export default function SettingsHubPage() {
  return (
    <div className="space-y-6 text-[13px]" data-testid="settings-hub">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink)] leading-tight">Settings</h1>
        <p className="text-[#6B6B6B] mt-0.5">How the company is set up. Company details and the organization structure are in the Organization menu.</p>
      </div>
      {SETTINGS_GROUPS.map((g) => (
        <section key={g.title} className="space-y-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#6B6B6B]">{g.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="block bg-white rounded-xl border border-[#E8E8E8] p-4 hover:border-[var(--ink)] transition-colors"
              >
                <div className="font-medium text-[var(--ink)]">{l.label}</div>
                <div className="text-[#6B6B6B] mt-1">{l.description}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
