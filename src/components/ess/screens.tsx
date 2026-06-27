"use client";

/**
 * ESS tab + sub screens — Home, Pay, Payslip detail, Leave, Leave request,
 * Time, Profile, Settings, Announcement, Request. Visuals ported from the
 * design handoff (ess-screens-*.jsx); every value is wired to /api/ess/*.
 */

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EIcon, type EIconName } from "./icons";
import {
  ESSNav,
  ECard,
  ESection,
  EChip,
  EStatus,
  ERing,
  EAvatar,
  EBtn,
  useNow,
  fmtTime,
} from "./primitives";
import { useEssData } from "./use-ess-data";
import {
  essFetch,
  peso,
  centsToPeso0,
  centsNum,
  fmtDay,
  fmtDayYear,
  fmtPeriod,
  minutesToHrs,
  type ApiList,
  type ApiOne,
  type PayslipSummary,
  type PayslipDetailData,
  type LeaveBalanceRow,
  type LeaveTxn,
  type DtrPeriod,
  type ClockPunch,
  type EssProfile,
  type Announcement,
} from "./api";

// ---- shared helpers ----
const num = (s: string) => Number(s);
const LEAVE_COLOR: Record<string, string> = { VL: "#4F9373", SL: "#3E63A0", EL: "#C2552F" };
const LEAVE_FALLBACK = ["#4F9373", "#3E63A0", "#C2552F", "#9a6a12", "#6b6259"];

interface LeaveBal {
  id: string;
  leaveTypeId: string;
  code: string;
  type: string;
  unit: string;
  used: number;
  total: number;
  available: number;
  color: string;
}
function deriveBalances(rows: LeaveBalanceRow[]): LeaveBal[] {
  return rows.map((r, i) => {
    const total = num(r.openingBalance) + num(r.earned);
    const used = num(r.used);
    const available = total - used - num(r.forfeited) - num(r.convertedToCash);
    return {
      id: r.id,
      leaveTypeId: r.leaveTypeId,
      code: r.leaveType.code,
      type: r.leaveType.name,
      unit: r.leaveType.unit,
      used,
      total,
      available,
      color: LEAVE_COLOR[r.leaveType.code] ?? LEAVE_FALLBACK[i % LEAVE_FALLBACK.length],
    };
  });
}

function Loading() {
  return (
    <div className="e-stack">
      <div className="e-skel" style={{ height: 150 }} />
      <div className="e-skel" style={{ height: 64 }} />
      <div className="e-skel" style={{ height: 120 }} />
    </div>
  );
}

// ============================ HOME ============================
export function HomeScreen() {
  const nav = useContext(ESSNav);
  const now = useNow();
  const tnow = now ? fmtTime(now) : null;
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const payslips = useEssData<ApiList<PayslipSummary>>("/api/ess/payslips?limit=3");
  const balances = useEssData<ApiList<LeaveBalanceRow>>("/api/ess/leave-balances");
  const punches = useEssData<ApiList<ClockPunch>>(`/api/ess/clock?date=${today}`);
  const announcements = useEssData<ApiList<Announcement>>("/api/ess/announcements");

  // Reflect today's last punch into the shared clocked-in state.
  const lastPunch = punches.data?.data?.[punches.data.data.length - 1];
  useEffect(() => {
    if (lastPunch) nav.setClockedIn(lastPunch.punchType === "IN");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastPunch?.id]);
  const clockedIn = nav.clockedIn;
  const inSince = punches.data?.data?.find((p) => p.punchType === "IN");

  const latest = payslips.data?.data?.[0];
  const bals = balances.data ? deriveBalances(balances.data.data).slice(0, 3) : [];
  const todayLabel = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="e-stack">
      {/* CLOCK IN/OUT — front widget */}
      <div className="e-clockhero">
        <div className="e-hero-tex" aria-hidden="true" />
        <div className="e-clockhero-top">
          <span>
            <EIcon name="cal" size={14} /> {todayLabel}
          </span>
          <span className="e-hero-pill">{clockedIn ? "Clocked in" : "Not clocked in"}</span>
        </div>
        <div className="e-clockhero-time">
          {tnow ? (
            <>
              {tnow.hm}
              <i>{tnow.ap}</i>
            </>
          ) : (
            "—"
          )}
        </div>
        <div className="e-clockhero-sub">
          {clockedIn && inSince ? (
            <>
              <EIcon name="checkCircle" size={14} /> In since{" "}
              {fmtTime(new Date(inSince.punchedAt)).full}
            </>
          ) : (
            <>
              <EIcon name="clock" size={14} /> Selfie verification required
            </>
          )}
        </div>
        <button
          className="e-clockhero-btn"
          onClick={() => nav.go("clock", clockedIn ? "out" : "in")}
        >
          <EIcon name="camera" size={19} />
          {clockedIn ? "Clock Out" : "Clock In"}
        </button>
        <span className="e-clockhero-hint">Selfie verification required</span>
      </div>

      {/* latest payslip — secondary */}
      {latest && (
        <ECard className="e-payday" onClick={() => nav.go("payslip", latest.bookId)}>
          <span className="e-payday-ic">
            <EIcon name="wallet" size={20} />
          </span>
          <div className="e-payday-meta">
            <i>Latest payslip · {fmtPeriod(latest.periodStart, latest.periodEnd)}</i>
            <b>
              {centsToPeso0(latest.netPayCents)} <em>net pay</em>
            </b>
          </div>
          <span className="e-payday-pill">View</span>
        </ECard>
      )}

      {/* quick actions */}
      <div className="e-qa-row">
        <QuickAction icon="leave" label="Request leave" tone="sage" onClick={() => nav.go("leaveRequest")} />
        <QuickAction icon="clock" label="File OT" tone="blue" onClick={() => nav.go("request", "ot")} />
        <QuickAction icon="wallet" label="Reimburse" tone="amber" onClick={() => nav.go("request", "reimb")} />
        <QuickAction icon="doc" label="COE" tone="slate" onClick={() => nav.go("request", "coe")} />
      </div>

      {/* leave balances */}
      {bals.length > 0 && (
        <>
          <ESection action="Manage" onAction={() => nav.tab("leave")}>
            Leave balance
          </ESection>
          <ECard className="e-balcard" onClick={() => nav.tab("leave")}>
            {bals.map((l) => (
              <div className="e-bal" key={l.code}>
                <div className="e-bal-ring">
                  <ERing value={l.used} total={l.total} color={l.color} size={50} />
                  <b>{l.available}</b>
                </div>
                <span>{l.code}</span>
                <i>{l.available} left</i>
              </div>
            ))}
          </ECard>
        </>
      )}

      {/* announcements */}
      {announcements.data && announcements.data.data.length > 0 && (
        <>
          <ESection>Announcements</ESection>
          {announcements.data.data.slice(0, 3).map((a) => (
            <ECard key={a.id} className="e-ann" onClick={() => nav.go("announcement", a.id)}>
              <span className="e-ann-ic">
                <EIcon name="megaphone" size={18} />
              </span>
              <div className="e-ann-body">
                <div className="e-ann-top">
                  {a.category && <EChip tone="sage">{a.category}</EChip>}
                  <span>{fmtDay(a.publishedAt)}</span>
                </div>
                <b>{a.title}</b>
              </div>
              <EIcon name="chevR" size={17} />
            </ECard>
          ))}
        </>
      )}

      {/* recent payslips */}
      {payslips.data && payslips.data.data.length > 0 && (
        <>
          <ESection action="See all" onAction={() => nav.tab("pay")}>
            Recent payslips
          </ESection>
          {payslips.data.data.slice(0, 2).map((p) => (
            <ECard key={p.bookId} className="e-psrow" onClick={() => nav.go("payslip", p.bookId)}>
              <div className="e-psrow-l">
                <span className="e-psrow-ic">
                  <EIcon name="wallet" size={19} />
                </span>
                <div>
                  <b>{fmtPeriod(p.periodStart, p.periodEnd)}</b>
                  <i>Paid {fmtDayYear(p.finalizedAt)}</i>
                </div>
              </div>
              <div className="e-psrow-r">
                <b>{centsToPeso0(p.netPayCents)}</b>
                <EIcon name="chevR" size={16} />
              </div>
            </ECard>
          ))}
        </>
      )}
    </div>
  );
}

function QuickAction({
  icon,
  label,
  tone,
  onClick,
}: {
  icon: EIconName;
  label: string;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button className="e-qa" onClick={onClick}>
      <span className="e-qa-ic" data-tone={tone}>
        <EIcon name={icon} size={21} />
      </span>
      <span className="e-qa-lb">{label}</span>
    </button>
  );
}

// ============================ PAY ============================
export function PayScreen() {
  const nav = useContext(ESSNav);
  const [tab, setTab] = useState<"Payslips" | "Tax forms">("Payslips");
  const { data, loading } = useEssData<ApiList<PayslipSummary>>("/api/ess/payslips?limit=50");

  if (loading) return <Loading />;
  const slips = data?.data ?? [];
  const thisYear = new Date().getFullYear();
  const ytdNet = slips
    .filter((p) => new Date(p.periodEnd).getFullYear() === thisYear && p.runType !== "YEAR_END")
    .reduce((a, b) => a + centsNum(b.netPayCents), 0);
  const ytdTax = slips
    .filter((p) => new Date(p.periodEnd).getFullYear() === thisYear)
    .reduce((a, b) => a + centsNum(b.withholdingTaxCents), 0);

  return (
    <div className="e-stack">
      <div className="e-segment">
        {(["Payslips", "Tax forms"] as const).map((t) => (
          <button key={t} className={"e-seg" + (tab === t ? " is-on" : "")} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Payslips" && (
        <>
          <div className="e-ytd">
            <div>
              <span>Net pay · YTD</span>
              <b>{peso(ytdNet)}</b>
            </div>
            <div className="e-ytd-div" />
            <div>
              <span>Tax withheld · YTD</span>
              <b>{peso(ytdTax)}</b>
            </div>
          </div>
          {slips.length === 0 && <p className="e-empty">No payslips yet.</p>}
          {slips.map((p) => {
            const special = p.runType === "YEAR_END";
            return (
              <ECard key={p.bookId} className="e-psrow" onClick={() => nav.go("payslip", p.bookId)}>
                <div className="e-psrow-l">
                  <span className="e-psrow-ic" data-special={special}>
                    <EIcon name={special ? "coffee" : "wallet"} size={19} />
                  </span>
                  <div>
                    <b>{special ? "13th Month / Year-End" : fmtPeriod(p.periodStart, p.periodEnd)}</b>
                    <i>Paid {fmtDayYear(p.finalizedAt)}</i>
                  </div>
                </div>
                <div className="e-psrow-r">
                  <b>{centsToPeso0(p.netPayCents)}</b>
                  <EIcon name="chevR" size={16} />
                </div>
              </ECard>
            );
          })}
        </>
      )}

      {tab === "Tax forms" && (
        <>
          <p className="e-hint">
            Your annual tax certificates (BIR Form 2316) appear here once your employer releases
            them for the year.
          </p>
          <p className="e-empty">No tax forms available yet.</p>
        </>
      )}
    </div>
  );
}

// ============================ PAYSLIP DETAIL ============================
export function PayslipDetail({ param }: { param?: string | null }) {
  const { data, loading, error } = useEssData<ApiOne<PayslipDetailData>>(
    param ? `/api/ess/payslips/${param}` : null,
  );

  if (loading) return <Loading />;
  if (error || !data) return <p className="e-empty">{error || "Payslip not found."}</p>;
  const p = data.data;

  const earnings = [
    { label: "Basic pay", sub: "Period", amt: centsNum(p.earnings.basePay) },
    { label: "Overtime", sub: "", amt: centsNum(p.earnings.otPay) },
    { label: "Night differential", sub: "", amt: centsNum(p.earnings.nsdPay) },
    { label: "Holiday pay", sub: "", amt: centsNum(p.earnings.holidayPay) },
    { label: "Rest day pay", sub: "", amt: centsNum(p.earnings.restDayPay) },
    { label: "Hazard pay", sub: "", amt: centsNum(p.earnings.hazardPay) },
    { label: "Allowances", sub: "Taxable", amt: centsNum(p.earnings.taxableAllowances) },
    { label: "Non-taxable pay", sub: "13th mo. & benefits", amt: centsNum(p.nonTaxable.nontaxable13MonthAndBenefits) + centsNum(p.nonTaxable.nontaxableCompensation) },
  ].filter((e) => e.amt > 0);

  const deductions = [
    { label: "SSS contribution", sub: "", amt: centsNum(p.statutory.sssEe) },
    { label: "PhilHealth", sub: "", amt: centsNum(p.statutory.philhealthEe) },
    { label: "Pag-IBIG", sub: "", amt: centsNum(p.statutory.pagibigEe) },
    { label: "Withholding tax", sub: "", amt: centsNum(p.tax.withholdingTax) },
    {
      label: "Loans",
      sub: Number(p.loans.loanDeferred) > 0 ? `₱${centsNum(p.loans.loanDeferred).toLocaleString("en-PH", { minimumFractionDigits: 2 })} deferred to next period` : "",
      amt: centsNum(p.loans.loanDeductions),
    },
    {
      label: "Tardiness / undertime",
      sub: p.tardinessMinutes ? `${p.tardinessMinutes} mins` : "",
      amt: centsNum(p.earnings.lateUndertimeDeduction),
    },
  ].filter((d) => d.amt > 0);

  const gross = centsNum(p.earnings.grossCompensation);
  const net = centsNum(p.net.netPay);
  const totalDed = deductions.reduce((a, b) => a + b.amt, 0);

  return (
    <div className="e-stack">
      <div className="e-ps-hero">
        <span>Net pay</span>
        <div className="e-ps-net">{peso(net)}</div>
        <div className="e-ps-sub">
          {fmtPeriod(p.period.start, p.period.end)} · {p.employee.name}
        </div>
        <EStatus>Paid</EStatus>
      </div>

      <ECard className="e-breakdown">
        <div className="e-bd-head">
          <span>Earnings</span>
          <b>{peso(gross)}</b>
        </div>
        {earnings.map((e, i) => (
          <div className="e-bd-row" key={i}>
            <div>
              <span>{e.label}</span>
              {e.sub && <i>{e.sub}</i>}
            </div>
            <b>{peso(e.amt)}</b>
          </div>
        ))}
      </ECard>

      <ECard className="e-breakdown">
        <div className="e-bd-head">
          <span>Deductions</span>
          <b className="e-neg">−{peso(totalDed)}</b>
        </div>
        {deductions.map((d, i) => (
          <div className="e-bd-row" key={i}>
            <div>
              <span>{d.label}</span>
              {d.sub && <i>{d.sub}</i>}
            </div>
            <b>−{peso(d.amt)}</b>
          </div>
        ))}
      </ECard>

      <div className="e-ps-total">
        <span>Net pay</span>
        <b>{peso(net)}</b>
      </div>
      <p className="e-ps-note">
        <EIcon name="shield" size={14} /> {p.tenant.name} · {p.employee.employeeNumber}
      </p>

      <EBtn kind="primary" icon="download" full onClick={() => printPayslip(p)}>
        Download payslip (PDF)
      </EBtn>
    </div>
  );
}

/** Open a clean, print-ready payslip in a new window (Save as PDF). */
function printPayslip(p: PayslipDetailData) {
  const w = window.open("", "_blank", "width=480,height=720");
  if (!w) {
    toast.error("Pop-up blocked. Allow pop-ups to download your payslip.");
    return;
  }
  const row = (l: string, v: string) =>
    `<tr><td style="padding:6px 0;color:#555">${l}</td><td style="padding:6px 0;text-align:right;font-weight:600">${v}</td></tr>`;
  const P = (c: string) => "P" + (Number(c) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 });
  w.document.write(`<!doctype html><html><head><title>Payslip ${p.period.start}</title>
    <style>body{font-family:system-ui,sans-serif;color:#2A2420;padding:28px;max-width:520px;margin:auto}
    h1{font-size:18px}h2{font-size:13px;text-transform:uppercase;color:#888;margin:18px 0 4px}
    table{width:100%;border-collapse:collapse;font-size:13px}.net{font-size:24px;font-weight:700;margin:4px 0}</style></head>
    <body onload="window.print()">
    <h1>${p.tenant.name}</h1>
    <div>${p.employee.name} · ${p.employee.employeeNumber}</div>
    <div style="color:#888;font-size:13px">${p.period.start.slice(0, 10)} – ${p.period.end.slice(0, 10)}</div>
    <h2>Net pay</h2><div class="net">${P(p.net.netPay)}</div>
    <h2>Earnings</h2><table>
      ${row("Basic pay", P(p.earnings.basePay))}
      ${Number(p.earnings.otPay) ? row("Overtime", P(p.earnings.otPay)) : ""}
      ${Number(p.earnings.taxableAllowances) ? row("Allowances", P(p.earnings.taxableAllowances)) : ""}
      ${row("Gross", P(p.earnings.grossCompensation))}
    </table>
    <h2>Deductions</h2><table>
      ${row("SSS", P(p.statutory.sssEe))}
      ${row("PhilHealth", P(p.statutory.philhealthEe))}
      ${row("Pag-IBIG", P(p.statutory.pagibigEe))}
      ${row("Withholding tax", P(p.tax.withholdingTax))}
      ${Number(p.loans.loanDeductions) ? row("Loans", P(p.loans.loanDeductions)) : ""}
      ${Number(p.loans.loanDeferred) ? row("Loan deferred (carried forward)", P(p.loans.loanDeferred)) : ""}
    </table></body></html>`);
  w.document.close();
}

// ============================ LEAVE ============================
export function LeaveScreen() {
  const nav = useContext(ESSNav);
  const balances = useEssData<ApiList<LeaveBalanceRow>>("/api/ess/leave-balances");
  const history = useEssData<ApiList<LeaveTxn>>("/api/ess/leaves?limit=20&status=");

  const bals = balances.data ? deriveBalances(balances.data.data) : [];
  const usage = (history.data?.data ?? []).filter((t) => t.type === "USAGE");

  if (balances.loading) return <Loading />;

  return (
    <div className="e-stack">
      <div className="e-leavebals">
        {bals.map((l) => (
          <ECard key={l.code} className="e-lbal">
            <div className="e-lbal-ring">
              <ERing value={l.used} total={l.total} color={l.color} size={64} />
              <b>{l.available}</b>
            </div>
            <div className="e-lbal-meta">
              <b>{l.type}</b>
              <i>
                {l.used} used · {l.total} total
              </i>
            </div>
          </ECard>
        ))}
        {bals.length === 0 && <p className="e-empty">No leave balances set up yet.</p>}
      </div>

      <EBtn kind="primary" icon="plus" full onClick={() => nav.go("leaveRequest")}>
        Request leave
      </EBtn>

      <ESection>Request history</ESection>
      {usage.length === 0 && <p className="e-empty">No leave requests yet.</p>}
      {usage.map((r) => {
        const status =
          r.approvalStatus.charAt(0) + r.approvalStatus.slice(1).toLowerCase();
        return (
          <ECard key={r.id} className="e-lhist">
            <div className="e-lhist-top">
              <b>{r.leaveType.name}</b>
              <EStatus>{status}</EStatus>
            </div>
            <div className="e-lhist-meta">
              <span>
                <EIcon name="cal" size={14} />{" "}
                {r.startDate ? fmtDay(r.startDate) : ""}
                {r.endDate && r.endDate !== r.startDate ? ` – ${fmtDay(r.endDate)}` : ""}
              </span>
              <span>
                {r.amount} {r.amount > 1 ? "days" : "day"}
              </span>
            </div>
            {r.reason && <p className="e-lhist-reason">{r.reason}</p>}
          </ECard>
        );
      })}
    </div>
  );
}

export function LeaveRequest() {
  const nav = useContext(ESSNav);
  const { data } = useEssData<ApiList<LeaveBalanceRow>>("/api/ess/leave-balances");
  const bals = useMemo(() => (data ? deriveBalances(data.data) : []), [data]);

  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!leaveTypeId && bals.length) setLeaveTypeId(bals[0].leaveTypeId);
  }, [bals, leaveTypeId]);

  const selected = bals.find((b) => b.leaveTypeId === leaveTypeId);
  const days = useMemo(() => {
    if (!from || !to) return from ? 1 : 0;
    const d = (new Date(to).getTime() - new Date(from).getTime()) / 86400000;
    return d >= 0 ? d + 1 : 0;
  }, [from, to]);

  async function submit() {
    if (busy) return;
    if (!leaveTypeId || !from) {
      toast.error("Pick a leave type and start date.");
      return;
    }
    setBusy(true);
    try {
      await essFetch("/api/ess/leaves", {
        method: "POST",
        body: JSON.stringify({
          leaveTypeId,
          startDate: from,
          endDate: to || from,
          amount: days || 1,
          reason: reason || undefined,
        }),
      });
      setDone(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't submit your request.");
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="e-success">
        <span className="e-success-ic">
          <EIcon name="checkCircle" size={48} />
        </span>
        <h3>Request submitted</h3>
        <p>
          Your {selected?.type.toLowerCase() ?? "leave"} request was sent for approval. You&apos;ll
          be notified once it&apos;s reviewed.
        </p>
        <EBtn kind="primary" full onClick={() => nav.back()}>
          Back to Leave
        </EBtn>
      </div>
    );

  return (
    <div className="e-stack e-form">
      <label className="e-flabel">Leave type</label>
      <div className="e-chiprow">
        {bals.map((l) => (
          <button
            key={l.leaveTypeId}
            className={"e-typechip" + (leaveTypeId === l.leaveTypeId ? " is-on" : "")}
            onClick={() => setLeaveTypeId(l.leaveTypeId)}
          >
            {l.type}
          </button>
        ))}
      </div>

      <div className="e-frow">
        <div>
          <label className="e-flabel">From</label>
          <div className="e-finput">
            <EIcon name="cal" size={17} />
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="e-flabel">To</label>
          <div className="e-finput">
            <EIcon name="cal" size={17} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      <label className="e-flabel">Reason</label>
      <textarea
        className="e-ftext"
        rows={3}
        placeholder="Add a short note for your manager…"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      {selected && (
        <div className="e-balnote">
          <EIcon name="leave" size={16} />
          <span>
            {selected.available} {selected.unit === "HOURS" ? "hours" : "days"} remaining for{" "}
            {selected.type}
            {days ? ` · requesting ${days}` : ""}
          </span>
        </div>
      )}

      <EBtn kind="primary" full onClick={submit} disabled={busy}>
        {busy ? "Submitting…" : "Submit request"}
      </EBtn>
    </div>
  );
}

// ============================ TIME ============================
export function TimeScreen() {
  const nav = useContext(ESSNav);
  const { data, loading } = useEssData<ApiList<DtrPeriod>>("/api/ess/dtr?limit=2");
  const now = useNow();
  const t = now ? fmtTime(now) : null;

  if (loading) return <Loading />;
  const period = data?.data?.[0];
  const todayLabel = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="e-stack">
      <div className="e-clock">
        <div className="e-clock-time">{t ? t.hm : "—"}</div>
        <div className="e-clock-day">{todayLabel}</div>
        <div className="e-clock-sched">
          <EIcon name="clock" size={15} />{" "}
          {nav.clockedIn ? "Clocked in" : "Not clocked in"}
        </div>
        <button
          className={"e-clock-btn" + (nav.clockedIn ? " is-out" : "")}
          onClick={() => nav.go("clock", nav.clockedIn ? "out" : "in")}
        >
          {nav.clockedIn ? "Clock out" : "Clock in"}
        </button>
        <span className="e-clock-status">Selfie verification required</span>
      </div>

      {period && (
        <>
          <ESection>This period · {fmtPeriod(period.periodStart, period.periodEnd)}</ESection>
          <div className="e-timestats">
            <ECard className="e-tstat">
              <b>{period.presentDays}</b>
              <span>Present</span>
            </ECard>
            <ECard className="e-tstat">
              <b className="e-amber">{Math.round(period.totalLateMinutes / 60) || (period.totalLateMinutes ? 1 : 0)}</b>
              <span>Late hrs</span>
            </ECard>
            <ECard className="e-tstat">
              <b>{period.absentDays}</b>
              <span>Absent</span>
            </ECard>
            <ECard className="e-tstat">
              <b className="e-sage">{minutesToHrs(period.totalOTMinutes)}</b>
              <span>OT hrs</span>
            </ECard>
          </div>

          <ESection>Attendance log</ESection>
          <ECard className="e-logcard">
            {period.records.length === 0 && <p className="e-empty">No records this period.</p>}
            {[...period.records]
              .sort((a, b) => +new Date(b.date) - +new Date(a.date))
              .map((d) => {
                const day = new Date(d.date);
                const rest = d.dayStatus === "REST_DAY";
                const tone =
                  d.dayStatus === "ABSENT"
                    ? "red"
                    : d.lateMinutes > 0
                      ? "amber"
                      : rest
                        ? "slate"
                        : "green";
                const tag = rest
                  ? "Rest day"
                  : d.dayStatus === "ABSENT"
                    ? "Absent"
                    : d.lateMinutes > 0
                      ? "Late"
                      : "Present";
                return (
                  <div className="e-logrow" key={d.id}>
                    <div className="e-logday">
                      <b>{day.getDate()}</b>
                      <i>{day.toLocaleDateString("en-PH", { weekday: "short" })}</i>
                    </div>
                    <div className="e-logtime">
                      {rest || !d.timeIn ? (
                        <span className="e-logrest">{rest ? "Rest day" : "—"}</span>
                      ) : (
                        <>
                          <b>{fmtTime(new Date(d.timeIn)).full}</b>
                          <span>→</span>
                          <b>{d.timeOut ? fmtTime(new Date(d.timeOut)).full : "—"}</b>
                        </>
                      )}
                    </div>
                    <EChip tone={tone}>{tag}</EChip>
                  </div>
                );
              })}
          </ECard>
        </>
      )}
    </div>
  );
}

// ============================ PROFILE ============================
function tenure(hireIso: string): string {
  const h = new Date(hireIso);
  const now = new Date();
  let months = (now.getFullYear() - h.getFullYear()) * 12 + (now.getMonth() - h.getMonth());
  if (now.getDate() < h.getDate()) months -= 1;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} yr${y > 1 ? "s" : ""}` : "", m ? `${m} mo${m > 1 ? "s" : ""}` : ""].filter(Boolean).join(" ") || "New hire";
}

export function ProfileScreen() {
  const nav = useContext(ESSNav);
  const { data, loading } = useEssData<ApiOne<EssProfile>>("/api/ess/profile");

  if (loading) return <Loading />;
  if (!data) return <p className="e-empty">Couldn&apos;t load your profile.</p>;
  const e = data.data;

  const name = [e.firstName, e.lastName].filter(Boolean).join(" ");
  const initials = (e.firstName[0] ?? "") + (e.lastName[0] ?? "");
  const address = [e.addressLine1, e.addressLine2, e.city, e.province, e.zipCode]
    .filter(Boolean)
    .join(", ");
  const employment = e.employmentStatus.charAt(0) + e.employmentStatus.slice(1).toLowerCase();

  const row = (icon: EIconName, label: string, value: string | null) =>
    value ? (
      <div className="e-prow">
        <span className="e-prow-ic">
          <EIcon name={icon} size={17} />
        </span>
        <span className="e-prow-l">{label}</span>
        <b className="e-prow-v">{value}</b>
      </div>
    ) : null;

  return (
    <div className="e-stack">
      <div className="e-phead">
        <EAvatar initials={initials} size={72} />
        <h3>{name}</h3>
        <p>{e.position?.title ?? "—"}</p>
        <div className="e-phead-tags">
          <EChip tone="sage">{employment}</EChip>
          <EChip tone="slate">{e.employeeNumber}</EChip>
        </div>
      </div>

      <ESection>Personal</ESection>
      <ECard className="e-pcard">
        {row("mail", "Email", e.personalEmail)}
        {row("phone", "Mobile", e.mobileNumber)}
        {row("pin", "Address", address || null)}
        {row("cal", "Birthdate", e.birthDate ? fmtDayYear(e.birthDate) : null)}
      </ECard>

      <ESection>Employment</ESection>
      <ECard className="e-pcard">
        {row("building", "Company", e.company)}
        {row("briefcase", "Position", e.position?.title ?? null)}
        {row("user", "Department", e.department?.name ?? null)}
        {row("user", "Manager", e.manager)}
        {row("cal", "Date hired", `${fmtDayYear(e.hireDate)} · ${tenure(e.hireDate)}`)}
      </ECard>

      <ESection>Pay &amp; government</ESection>
      <ECard className="e-pcard">
        {row(
          "card",
          "Bank account",
          e.bank.name || e.bank.accountMasked
            ? `${e.bank.name ?? ""} ${e.bank.accountMasked ?? ""}`.trim()
            : null,
        )}
        {row("shield", "SSS", e.government.SSS)}
        {row("shield", "PhilHealth", e.government.PHILHEALTH)}
        {row("shield", "Pag-IBIG", e.government.PAGIBIG)}
        {row("shield", "TIN", e.government.TIN)}
      </ECard>

      <ECard className="e-pcard">
        <button className="e-prow e-prow-tap" onClick={() => nav.go("settings")}>
          <span className="e-prow-ic">
            <EIcon name="gear" size={17} />
          </span>
          <span className="e-prow-l">Settings</span>
          <EIcon name="chevR" size={16} />
        </button>
        <button className="e-prow e-prow-tap" onClick={() => nav.go("request", "coe")}>
          <span className="e-prow-ic">
            <EIcon name="doc" size={17} />
          </span>
          <span className="e-prow-l">Request certificate (COE)</span>
          <EIcon name="chevR" size={16} />
        </button>
      </ECard>

      <button className="e-logout" onClick={nav.logout}>
        <EIcon name="logout" size={18} /> Log out
      </button>
      <p className="e-version">Sentire Payroll · ESS v1.0</p>
    </div>
  );
}

// ============================ BIOMETRIC SECTION ============================

type WebAuthnCred = {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

function BiometricSection() {
  const [creds, setCreds] = useState<WebAuthnCred[]>([]);
  const [supported, setSupported] = useState(false);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        !!window.PublicKeyCredential,
    );
  }, []);

  const loadCreds = useCallback(async () => {
    try {
      const { essFetch: ef } = await import("./api");
      type CredResp = { data: WebAuthnCred[] };
      const r = await ef<CredResp>("/api/ess/webauthn/credentials");
      setCreds(r.data ?? []);
    } catch {
      /* silently ignore */
    }
  }, []);

  useEffect(() => { loadCreds(); }, [loadCreds]);

  async function registerNew() {
    if (registering) return;
    setRegistering(true);
    try {
      const { startRegistration } = await import("@simplewebauthn/browser");
      const { essFetch: ef } = await import("./api");

      type StartResp = { data: { options: unknown; challengeToken: string } };
      const start = await ef<StartResp>("/api/ess/webauthn/register", { method: "POST" });
      const { options, challengeToken } = start.data;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const credential = await startRegistration(options as any);

      await ef("/api/ess/webauthn/register/finish", {
        method: "POST",
        body: JSON.stringify({
          challengeToken,
          response: credential,
          label: "This device",
        }),
      });

      toast.success("Biometric key added! You can now use Face ID / fingerprint to sign in.");
      await loadCreds();
    } catch (e) {
      if (e instanceof Error && e.name === "NotAllowedError") return;
      toast.error(e instanceof Error ? e.message : "Registration failed. Please try again.");
    } finally {
      setRegistering(false);
    }
  }

  async function removeCred(id: string) {
    try {
      const { essFetch: ef } = await import("./api");
      await ef(`/api/ess/webauthn/credentials/${id}`, { method: "DELETE" });
      setCreds((prev) => prev.filter((c) => c.id !== id));
      toast.success("Biometric key removed.");
    } catch {
      toast.error("Couldn't remove credential. Try again.");
    }
  }

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`;
  };

  return (
    <div className="e-srow e-srow-col">
      <div className="e-srow-head">
        <span className="e-prow-ic">
          <EIcon name="fingerprint" size={17} />
        </span>
        <div className="e-srow-t">
          <b>Biometric unlock</b>
          {!supported && <i>Not supported on this browser</i>}
          {supported && creds.length === 0 && <i>No biometric keys registered</i>}
          {supported && creds.length > 0 && <i>{creds.length} key{creds.length > 1 ? "s" : ""} registered</i>}
        </div>
        {supported && (
          <button
            className="e-btn e-btn-sm e-btn-outline"
            onClick={registerNew}
            disabled={registering}
          >
            {registering ? "…" : "+ Add key"}
          </button>
        )}
      </div>
      {creds.map((c) => (
        <div key={c.id} className="e-credrow">
          <EIcon name="faceid" size={15} />
          <span className="e-credrow-label">{c.label ?? "Device key"}</span>
          <span className="e-credrow-date">Added {fmtDate(c.createdAt)}</span>
          <button
            className="e-credrow-del"
            onClick={() => removeCred(c.id)}
            aria-label="Remove biometric key"
          >
            <EIcon name="x" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    if (pw.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await essFetch("/api/ess/password", {
        method: "POST",
        body: JSON.stringify({ newPassword: pw }),
      });
      toast.success("Password updated. Use it next time you sign in.");
      setPw("");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update your password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="e-srow">
        <span className="e-prow-ic">
          <EIcon name="shield" size={17} />
        </span>
        <div className="e-srow-t">
          <b>Change password</b>
          <i>Set a password to sign in without your PIN</i>
        </div>
        <button className="e-seclink" onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "Set"}
        </button>
      </div>
      {open && (
        <div style={{ padding: "0 0 12px" }}>
          <div className="e-finput">
            <EIcon name="lock" size={17} />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="New password (min 8 characters)"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </div>
          <div style={{ height: 8 }} />
          <EBtn kind="primary" full onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save password"}
          </EBtn>
        </div>
      )}
    </>
  );
}

export function SettingsScreen() {
  const Toggle = ({ on }: { on: boolean }) => {
    const [v, setV] = useState(on);
    return (
      <button
        className={"e-toggle" + (v ? " is-on" : "")}
        onClick={() => setV(!v)}
        aria-pressed={v}
        aria-label="Toggle setting"
      >
        <span />
      </button>
    );
  };
  const trow = (icon: EIconName, label: string, sub: string | null, node: React.ReactNode) => (
    <div className="e-srow">
      <span className="e-prow-ic">
        <EIcon name={icon} size={17} />
      </span>
      <div className="e-srow-t">
        <b>{label}</b>
        {sub && <i>{sub}</i>}
      </div>
      {node}
    </div>
  );
  return (
    <div className="e-stack">
      <ESection>Notifications</ESection>
      <ECard className="e-pcard">
        {trow("wallet", "Payslip ready", "When a new payslip is released", <Toggle on={true} />)}
        {trow("leave", "Leave updates", "Approvals and rejections", <Toggle on={true} />)}
        {trow("megaphone", "Announcements", "Company-wide notices", <Toggle on={false} />)}
      </ECard>
      <ESection>Security</ESection>
      <ECard className="e-pcard">
        <BiometricSection />
        <ChangePassword />
      </ECard>
      <ESection>Appearance</ESection>
      <ECard className="e-pcard">{trow("moon", "Dark mode", "Match system setting", <Toggle on={false} />)}</ECard>
    </div>
  );
}

// ============================ ANNOUNCEMENT ============================
export function AnnouncementScreen({ param }: { param?: string | null }) {
  const { data, loading } = useEssData<ApiOne<Announcement>>(
    param ? `/api/ess/announcements/${param}` : null,
  );
  const profile = useEssData<ApiOne<EssProfile>>("/api/ess/profile");

  if (loading) return <Loading />;
  if (!data) return <p className="e-empty">This announcement is no longer available.</p>;
  const a = data.data;
  const company = profile.data?.data.company ?? "";

  return (
    <div className="e-stack">
      <div className="e-anndetail">
        <div className="e-ann-top">
          {a.category && <EChip tone="sage">{a.category}</EChip>}
          <span>{fmtDayYear(a.publishedAt)}</span>
        </div>
        <h2>{a.title}</h2>
        {a.body.split(/\n{2,}/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
        <div className="e-annfrom">
          <EAvatar initials="HR" size={36} color="#6b6259" />
          <div>
            <b>People &amp; Culture</b>
            <i>{company}</i>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================ REQUEST (OT / reimb / COE) ============================
export function RequestScreen({ param }: { param?: string | null }) {
  const nav = useContext(ESSNav);
  const kind = (param as "ot" | "reimb" | "coe") || "ot";
  const [value, setValue] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const copy: Record<string, { title: string; field: string; ph: string; note: string; icon: EIconName }> = {
    ot: { title: "Overtime", field: "Hours worked", ph: "e.g. 2.5", note: "OT must be pre-approved by your supervisor.", icon: "clock" },
    reimb: { title: "Reimbursement", field: "Amount (₱)", ph: "e.g. 850", note: "Available soon — reimbursements move to this form shortly.", icon: "wallet" },
    coe: { title: "Certificate of Employment", field: "Purpose", ph: "e.g. Bank loan", note: "Available soon — COE requests move to this form shortly.", icon: "doc" },
  };
  const c = copy[kind];
  const supported = kind === "ot";

  async function submit() {
    if (busy) return;
    if (!supported) {
      toast.info(`${c.title} requests aren't available in the app yet.`);
      return;
    }
    if (!value || !date) {
      toast.error("Fill in the hours and date.");
      return;
    }
    setBusy(true);
    try {
      await essFetch("/api/ess/ot-applications", {
        method: "POST",
        body: JSON.stringify({
          date,
          hours: Number(value),
          justification: notes || "Overtime request",
        }),
      });
      setDone(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't submit your request.");
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="e-success">
        <span className="e-success-ic">
          <EIcon name="checkCircle" size={48} />
        </span>
        <h3>{c.title} request sent</h3>
        <p>Your supervisor has been notified. Track the status under your requests.</p>
        <EBtn kind="primary" full onClick={() => nav.back()}>
          Done
        </EBtn>
      </div>
    );

  return (
    <div className="e-stack e-form">
      <div className="e-reqhead">
        <span className="e-qa-ic" data-tone="sage">
          <EIcon name={c.icon} size={22} />
        </span>
        <div>
          <b>File a {c.title.toLowerCase()} request</b>
          <i>Sent to your supervisor for approval</i>
        </div>
      </div>
      <label className="e-flabel">{c.field}</label>
      <div className="e-finput">
        <input
          type={kind === "coe" ? "text" : "number"}
          inputMode={kind === "coe" ? "text" : "decimal"}
          placeholder={c.ph}
          value={value}
          onChange={(ev) => setValue(ev.target.value)}
        />
      </div>
      <label className="e-flabel">Date</label>
      <div className="e-finput">
        <EIcon name="cal" size={17} />
        <input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
      </div>
      <label className="e-flabel">Notes</label>
      <textarea
        className="e-ftext"
        rows={3}
        placeholder="Add details…"
        value={notes}
        onChange={(ev) => setNotes(ev.target.value)}
      />
      {c.note && (
        <div className="e-balnote">
          <EIcon name="shield" size={16} />
          <span>{c.note}</span>
        </div>
      )}
      <EBtn kind="primary" full onClick={submit} disabled={busy || !supported}>
        {busy ? "Submitting…" : supported ? "Submit request" : "Available soon"}
      </EBtn>
    </div>
  );
}
