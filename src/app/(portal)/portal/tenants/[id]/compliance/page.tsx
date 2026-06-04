"use client";

// Compliance tab — read-only statutory reference tables + TRAIN law summary.
// No API calls needed — this is regulatory reference data.

export default function CompliancePage() {
  const sssTable = [
    { range: "Below ₱4,250",          employee: "₱180",     employer: "₱380",     total: "₱560"     },
    { range: "₱4,250 – ₱4,749.99",    employee: "₱202.50",  employer: "₱402.50",  total: "₱605"     },
    { range: "₱4,750 – ₱5,249.99",    employee: "₱225",     employer: "₱425",     total: "₱650"     },
    { range: "₱24,750 & above",        employee: "₱1,125",   employer: "₱2,225",   total: "₱3,350"   },
  ];

  const deMinimisCaps: { benefit: string; monthly: string; annual: string }[] = [
    { benefit: "13th month pay & Christmas bonus",   monthly: "—",       annual: "₱90,000"  },
    { benefit: "Rice subsidy",                       monthly: "₱2,000",  annual: "₱24,000"  },
    { benefit: "Uniform / clothing allowance",       monthly: "—",       annual: "₱6,000"   },
    { benefit: "Laundry allowance",                  monthly: "₱300",    annual: "₱3,600"   },
    { benefit: "Medical cash allowance",             monthly: "₱1,500",  annual: "₱18,000"  },
    { benefit: "Employee achievement award (cash)",  monthly: "—",       annual: "₱10,000"  },
    { benefit: "Daily meal allowance (OT)",          monthly: "25% MWR", annual: "—"        },
  ];

  const thStyles = "text-left px-3 py-2 text-[10px] font-medium uppercase tracking-[0.04em]";
  const tdStyles = "px-3 py-2.5 text-[11px]";

  return (
    <div style={{ fontFamily: "var(--font-plus-jakarta-sans, sans-serif)" }}>
      {/* Header */}
      <div className="rounded-[10px] p-4 mb-4" style={{ background: "#EFF6FF", border: "0.5px solid #BFDBFE" }}>
        <p className="text-[12px] font-medium mb-1" style={{ color: "#1E40AF" }}>Statutory compliance reference</p>
        <p className="text-[11px]" style={{ color: "#3B82F6" }}>
          These tables reflect Philippine statutory rates and de minimis ceilings under TRAIN Law (RA 10963) and RR 29-2025.
          Sentire automatically applies these rates during payroll computation.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* SSS */}
        <div className="rounded-[10px] overflow-hidden" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
          <div className="px-4 py-3" style={{ borderBottom: "0.5px solid #F3F4F6" }}>
            <p className="text-[12px] font-medium" style={{ color: "#111827" }}>SSS contribution table (2026)</p>
            <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>Circular No. 2023-006 — 14% total rate</p>
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ background: "#F9FAFB", borderBottom: "0.5px solid #E5E7EB" }}>
                <th className={thStyles} style={{ color: "#6B7280" }}>MSC range</th>
                <th className={thStyles} style={{ color: "#6B7280" }}>Employee</th>
                <th className={thStyles} style={{ color: "#6B7280" }}>Employer</th>
              </tr>
            </thead>
            <tbody>
              {sssTable.map((r, i) => (
                <tr key={i} style={{ borderBottom: i < sssTable.length - 1 ? "0.5px solid #F3F4F6" : "none" }}>
                  <td className={tdStyles} style={{ color: "#374151" }}>{r.range}</td>
                  <td className={tdStyles} style={{ color: "#374151" }}>{r.employee}</td>
                  <td className={tdStyles} style={{ color: "#374151" }}>{r.employer}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="px-3 py-2 text-[10px]" style={{ color: "#9CA3AF", borderTop: "0.5px solid #F3F4F6" }}>
                  Full schedule shown in payroll engine computation logs.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* PhilHealth + Pag-IBIG */}
        <div className="flex flex-col gap-4">
          <div className="rounded-[10px] p-4" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
            <p className="text-[12px] font-medium mb-2" style={{ color: "#111827" }}>PhilHealth (2026)</p>
            <div className="flex justify-between py-1.5" style={{ borderBottom: "0.5px solid #F3F4F6" }}>
              <span className="text-[11px]" style={{ color: "#6B7280" }}>Premium rate</span>
              <span className="text-[11px] font-medium" style={{ color: "#374151" }}>5.0% of basic salary</span>
            </div>
            <div className="flex justify-between py-1.5" style={{ borderBottom: "0.5px solid #F3F4F6" }}>
              <span className="text-[11px]" style={{ color: "#6B7280" }}>Employee share</span>
              <span className="text-[11px] font-medium" style={{ color: "#374151" }}>2.5% (50/50 split)</span>
            </div>
            <div className="flex justify-between py-1.5" style={{ borderBottom: "0.5px solid #F3F4F6" }}>
              <span className="text-[11px]" style={{ color: "#6B7280" }}>Monthly cap</span>
              <span className="text-[11px] font-medium" style={{ color: "#374151" }}>₱5,000 total / ₱2,500 EE</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-[11px]" style={{ color: "#6B7280" }}>Floor (MSC ₱10,000)</span>
              <span className="text-[11px] font-medium" style={{ color: "#374151" }}>₱500 total / ₱250 EE</span>
            </div>
          </div>

          <div className="rounded-[10px] p-4" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
            <p className="text-[12px] font-medium mb-2" style={{ color: "#111827" }}>Pag-IBIG (HDMF)</p>
            <div className="flex justify-between py-1.5" style={{ borderBottom: "0.5px solid #F3F4F6" }}>
              <span className="text-[11px]" style={{ color: "#6B7280" }}>EE rate (≤ ₱1,500 / mo)</span>
              <span className="text-[11px] font-medium" style={{ color: "#374151" }}>1%</span>
            </div>
            <div className="flex justify-between py-1.5" style={{ borderBottom: "0.5px solid #F3F4F6" }}>
              <span className="text-[11px]" style={{ color: "#6B7280" }}>EE rate (&gt; ₱1,500 / mo)</span>
              <span className="text-[11px] font-medium" style={{ color: "#374151" }}>2%</span>
            </div>
            <div className="flex justify-between py-1.5" style={{ borderBottom: "0.5px solid #F3F4F6" }}>
              <span className="text-[11px]" style={{ color: "#6B7280" }}>Employer match</span>
              <span className="text-[11px] font-medium" style={{ color: "#374151" }}>2%</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-[11px]" style={{ color: "#6B7280" }}>Monthly EE cap</span>
              <span className="text-[11px] font-medium" style={{ color: "#374151" }}>₱100</span>
            </div>
          </div>
        </div>
      </div>

      {/* De minimis */}
      <div className="rounded-[10px] overflow-hidden mb-4" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
        <div className="px-4 py-3" style={{ borderBottom: "0.5px solid #F3F4F6" }}>
          <p className="text-[12px] font-medium" style={{ color: "#111827" }}>De minimis benefit ceilings (RR 29-2025)</p>
          <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>Amounts within ceiling are excluded from fringe benefit tax and income tax</p>
        </div>
        <table className="w-full">
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "0.5px solid #E5E7EB" }}>
              <th className={thStyles} style={{ color: "#6B7280" }}>Benefit</th>
              <th className={thStyles} style={{ color: "#6B7280" }}>Monthly ceiling</th>
              <th className={thStyles} style={{ color: "#6B7280" }}>Annual ceiling</th>
            </tr>
          </thead>
          <tbody>
            {deMinimisCaps.map((r, i) => (
              <tr key={i} style={{ borderBottom: i < deMinimisCaps.length - 1 ? "0.5px solid #F3F4F6" : "none" }}>
                <td className={tdStyles} style={{ color: "#374151" }}>{r.benefit}</td>
                <td className={tdStyles} style={{ color: "#374151" }}>{r.monthly}</td>
                <td className={tdStyles} style={{ color: "#374151" }}>{r.annual}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* BIR TRAIN notice */}
      <div className="rounded-[10px] p-4" style={{ background: "white", border: "0.5px solid #E5E7EB" }}>
        <p className="text-[12px] font-medium mb-2" style={{ color: "#111827" }}>BIR TRAIN Law — Withholding tax</p>
        <p className="text-[11px]" style={{ color: "#6B7280" }}>
          Sentire applies the graduated tax rates under RA 10963 (TRAIN Law). Employees with annual gross income of ₱250,000 and below are exempt from income tax.
          Annual tax reconciliation (alphalist / BIR Form 1604-C / 2316) is generated at year-end per tenant.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            ["≤ ₱250,000", "0%"],
            ["₱250K – ₱400K", "15% of excess over ₱250K"],
            ["₱400K – ₱800K", "₱22,500 + 20% over ₱400K"],
            ["₱800K – ₱2M", "₱102,500 + 25% over ₱800K"],
            ["₱2M – ₱8M", "₱402,500 + 30% over ₱2M"],
            ["Over ₱8M", "₱2,202,500 + 35% over ₱8M"],
          ].map(([range, rate]) => (
            <div key={range} className="rounded-[6px] p-2.5" style={{ background: "#F9FAFB", border: "0.5px solid #F3F4F6" }}>
              <p className="text-[10px] font-medium" style={{ color: "#374151" }}>{range}</p>
              <p className="text-[10px] mt-0.5" style={{ color: "#6B7280" }}>{rate}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
