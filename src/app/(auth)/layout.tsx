import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-background">
      {/* Left panel — brand */}
      <div className="hidden lg:flex flex-col justify-between w-[44%] xl:w-[40%] bg-sidebar text-sidebar-foreground p-12 relative overflow-hidden">
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gradient-to-br from-sky-400 to-sky-600 shadow-md ring-1 ring-white/20">
            <span className="text-base font-bold text-white">S</span>
          </div>
          <div className="leading-tight">
            <div className="text-lg font-semibold tracking-tight">Sentire</div>
            <div className="text-[11px] uppercase tracking-widest text-sidebar-foreground/60">
              Payroll
            </div>
          </div>
        </div>

        <div className="relative z-10 space-y-4 max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            HRIS &amp; Payroll, built for the Philippines.
          </h2>
          <p className="text-sm text-sidebar-foreground/70 leading-relaxed">
            Manage your workforce, automate BIR / SSS / PhilHealth / Pag-IBIG
            compliance, and run payroll with confidence — all from one
            enterprise-grade platform.
          </p>
        </div>

        <div className="relative z-10 text-xs text-sidebar-foreground/50">
          © {new Date().getFullYear()} Sentire Payroll. All rights reserved.
        </div>

        {/* Decorative gradient blobs */}
        <div
          aria-hidden
          className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-sky-500/20 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl"
        />
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
