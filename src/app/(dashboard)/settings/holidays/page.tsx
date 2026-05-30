"use client";

/**
 * /settings/holidays — Holiday Calendar
 *
 * Shows the pre-loaded Philippine public holidays for 2026.
 * These are used automatically by the payroll engine for OT premiums,
 * regular-holiday pay, and special-day pay computations.
 */

const PH_HOLIDAYS_2026 = [
  { date: "2026-01-01", name: "New Year's Day",         type: "Regular" },
  { date: "2026-03-31", name: "Eid'l Fitr",             type: "Regular" },
  { date: "2026-04-02", name: "Maundy Thursday",         type: "Regular" },
  { date: "2026-04-03", name: "Good Friday",             type: "Regular" },
  { date: "2026-04-04", name: "Black Saturday",          type: "Special" },
  { date: "2026-04-09", name: "Araw ng Kagitingan",      type: "Regular" },
  { date: "2026-05-01", name: "Labor Day",               type: "Regular" },
  { date: "2026-06-07", name: "Eid'l Adha",             type: "Regular" },
  { date: "2026-06-12", name: "Independence Day",        type: "Regular" },
  { date: "2026-08-24", name: "Ninoy Aquino Day",        type: "Special" },
  { date: "2026-08-31", name: "National Heroes Day",     type: "Regular" },
  { date: "2026-11-01", name: "All Saints' Day",         type: "Special" },
  { date: "2026-11-02", name: "All Souls' Day",          type: "Special" },
  { date: "2026-11-30", name: "Bonifacio Day",           type: "Regular" },
  { date: "2026-12-08", name: "Immaculate Conception",   type: "Special" },
  { date: "2026-12-24", name: "Christmas Eve",           type: "Special" },
  { date: "2026-12-25", name: "Christmas Day",           type: "Regular" },
  { date: "2026-12-30", name: "Rizal Day",               type: "Regular" },
  { date: "2026-12-31", name: "New Year's Eve",          type: "Special" },
];

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function getDayName(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
}

// Group by month
const byMonth: Record<number, typeof PH_HOLIDAYS_2026> = {};
for (const h of PH_HOLIDAYS_2026) {
  const month = new Date(h.date + "T00:00:00").getMonth();
  if (!byMonth[month]) byMonth[month] = [];
  byMonth[month].push(h);
}

export default function HolidayCalendarPage() {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.4px] text-[#111827] leading-tight">
            Holiday Calendar
          </h1>
          <p className="text-[13px] text-[#6B7A8D] mt-0.5">
            Philippine public holidays for 2026, as proclaimed by the Office of the President.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-[#6B7A8D]">
            <span className="h-2 w-2 rounded-full bg-[#E0463B] inline-block" />
            Regular Holiday
          </span>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-[#6B7A8D]">
            <span className="h-2 w-2 rounded-full bg-[#DB8A28] inline-block" />
            Special Non-Working
          </span>
        </div>
      </div>

      {/* ── Info banner ── */}
      <div className="flex items-start gap-3 rounded-xl border border-[#EAF1FD] bg-[#F5F9FF] p-4 text-[13px] text-[#2D6BE4]">
        <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01" />
        </svg>
        <p>
          These holidays are automatically applied by the payroll engine when computing regular-holiday
          pay (200%), special-day pay (130%), and OT premiums. Muslim holidays (Eid'l Fitr, Eid'l
          Adha) are approximate — actual dates depend on the lunar calendar proclamation.
        </p>
      </div>

      {/* ── Holiday list by month ── */}
      <div className="space-y-4">
        {Object.entries(byMonth).map(([monthIdx, holidays]) => (
          <div key={monthIdx} className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm overflow-hidden">
            <div className="bg-[#F5F6FA] px-5 py-3 border-b border-[#E8EBF1]">
              <p className="text-[13px] font-semibold text-[#4A586B]">
                {MONTHS[Number(monthIdx)]} 2026
              </p>
            </div>
            <div className="divide-y divide-[#F0F2F7]">
              {holidays.map((h) => {
                const isPast = h.date < today;
                const isToday = h.date === today;
                return (
                  <div
                    key={h.date}
                    className="flex items-center justify-between px-5 py-3"
                    style={isPast ? { opacity: 0.5 } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-center w-10">
                        <p className="text-[11px] text-[#9AA5B4] uppercase">{getDayName(h.date)}</p>
                        <p className="text-[20px] font-bold leading-tight"
                           style={{ color: h.type === "Regular" ? "#E0463B" : "#DB8A28" }}>
                          {new Date(h.date + "T00:00:00").getDate()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[13.5px] font-medium text-[#111827]">
                          {h.name}
                          {isToday && (
                            <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#EAF1FD", color: "#2D6BE4" }}>
                              TODAY
                            </span>
                          )}
                        </p>
                        <p className="text-[12px] text-[#9AA5B4]">{formatDate(h.date)}</p>
                      </div>
                    </div>
                    <span
                      className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                      style={h.type === "Regular"
                        ? { background: "#FCE9E7", color: "#E0463B" }
                        : { background: "#FBF0DD", color: "#DB8A28" }}
                    >
                      {h.type === "Regular" ? "Regular" : "Special"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Summary ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Holidays",     value: PH_HOLIDAYS_2026.length,                              bg: "#EAF1FD", color: "#2D6BE4" },
          { label: "Regular Holidays",   value: PH_HOLIDAYS_2026.filter(h => h.type === "Regular").length,  bg: "#FCE9E7", color: "#E0463B" },
          { label: "Special Holidays",   value: PH_HOLIDAYS_2026.filter(h => h.type === "Special").length,  bg: "#FBF0DD", color: "#DB8A28" },
          { label: "Remaining",          value: PH_HOLIDAYS_2026.filter(h => h.date >= today).length,        bg: "#E5F6EE", color: "#0FA36B" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm p-4 flex flex-col gap-1">
            <p className="text-[12px] text-[#6B7A8D]">{stat.label}</p>
            <p className="font-display text-[28px] font-semibold leading-tight" style={{ color: stat.color }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
