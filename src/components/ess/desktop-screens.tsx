"use client";

/**
 * ESS desktop screens — Dashboard, Pay, Leave (+ request modal), Time, Profile,
 * and the DTR period-selection + review/submit flow. Visuals ported from the
 * desktop design handoff (ess-desktop-*.jsx); every value is wired to /api/ess/*.
 */

import { useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EIcon, type EIconName } from "./icons";
import { ECard, ESection, EChip, EStatus, ERing, EAvatar, EBtn, useNow, fmtTime } from "./primitives";
import { DNav, type DPage } from "./desktop-nav";
import { useEssData } from "./use-ess-data";
import {
  essFetch,
  peso,
  peso0,
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

// ─── shared helpers (mirrors mobile screens.tsx) ──────────────────────────────
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

// DTR period shape augmented with the submission status the API returns.
interface DtrPeriodFull extends DtrPeriod {
  submission: { id: string; status: string; submittedAt: string } | null;
}
// API submission.status → handoff chip label.
function dtrStatusLabel(sub: DtrPeriodFull["submission"]): "Open" | "Submitted" | "Approved" | "Locked" {
  if (!sub) return "Open";
  const s = sub.status.toUpperCase();
  if (s === "APPROVED") return "Approved";
  if (s === "LOCKED") return "Locked";
  if (s === "RETURNED") return "Open";
  return "Submitted";
}
const DTR_TONE: Record<string, "amber" | "sage" | "green" | "slate"> = {
  Open: "amber",
  Submitted: "sage",
  Approved: "green",
  Locked: "slate",
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
function todayLabel() {
  return new Date().toLocaleDateString("en-PH", { weekday: "long", month: "short", day: "numeric" });
}

function DLoading() {
  return (
    <div className="d-grid d-cols-main">
      <div className="d-col">
        <div className="e-skel" style={{ height: 140, borderRadius: 20 }} />
        <div className="e-skel" style={{ height: 64 }} />
        <div className="e-skel" style={{ height: 180 }} />
      </div>
      <div className="d-col">
        <div className="e-skel" style={{ height: 64 }} />
        <div className="e-skel" style={{ height: 120 }} />
      </div>
    </div>
  );
}

// ============================ DASHBOARD ============================
function DQuickAction({
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
    <button className="d-qa" onClick={onClick}>
      <span className="e-qa-ic" data-tone={tone}>
        <EIcon name={icon} size={20} />
      </span>
      <span>{label}</span>
    </button>
  );
}

export function DDashboard() {
  const nav = useContext(DNav);
  const now = useNow();
  const t = now ? fmtTime(now) : null;
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const profile = useEssData<ApiOne<EssProfile>>("/api/ess/profile");
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
  const first = profile.data?.data.preferredName?.split(" ")[0] ?? profile.data?.data.firstName ?? "";
  const company = profile.data?.data.company ?? "";
  const latest = payslips.data?.data?.[0];
  const bals = balances.data ? deriveBalances(balances.data.data).slice(0, 3) : [];

  return (
    <>
      <div className="d-pagehead">
        <div>
          <h1>
            {greeting()}, {first || "there"} 👋
          </h1>
          <p>
            {company ? `${company} · ` : ""}
            {todayLabel()}
          </p>
        </div>
      </div>

      <div className="d-grid d-cols-main">
        <div className="d-col">
          {/* clock hero */}
          <div className="d-clockhero">
            <div className="e-hero-tex" aria-hidden="true" />
            <div className="d-clockhero-l">
              <div className="d-clockhero-top">
                <span>
                  <EIcon name="cal" size={14} /> {todayLabel()}
                </span>
                <span className="e-hero-pill">{clockedIn ? "Clocked in" : "Not clocked in"}</span>
              </div>
              <div className="d-clockhero-time">
                {t ? t.hm : "—"}
                {t && <i>{t.ap}</i>}
              </div>
              <div className="d-clockhero-sub">
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
            </div>
            <div className="d-clockhero-r">
              <button
                className="e-clockhero-btn"
                onClick={() => nav.openModal(clockedIn ? "clock-out" : "clock-in")}
              >
                <EIcon name="camera" size={18} />
                {clockedIn ? "Clock Out" : "Clock In"}
              </button>
              <span className="d-clockhero-hint">Selfie verification required</span>
            </div>
          </div>

          {/* quick actions */}
          <div className="d-qa-row">
            <DQuickAction icon="leave" label="Request leave" tone="sage" onClick={() => nav.openModal("leave")} />
            <DQuickAction icon="clock" label="File overtime" tone="blue" onClick={() => nav.go("time")} />
            <DQuickAction icon="wallet" label="Reimbursement" tone="amber" onClick={() => nav.go("pay")} />
            <DQuickAction icon="doc" label="Request COE" tone="slate" onClick={() => nav.go("profile")} />
          </div>

          {/* recent payslips */}
          <ESection action="See all" onAction={() => nav.go("pay")}>
            Recent payslips
          </ESection>
          <ECard className="d-tablecard">
            <table className="d-table">
              <thead>
                <tr>
                  <th>Pay period</th>
                  <th>Paid</th>
                  <th>Status</th>
                  <th className="d-num-th">Net pay</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(payslips.data?.data ?? []).slice(0, 3).map((p) => (
                  <tr key={p.bookId} className="d-rowlink" onClick={() => nav.go("pay", p.bookId)}>
                    <td>
                      <b className="d-cellmain">
                        {p.runType === "YEAR_END" ? "13th Month / Year-End" : fmtPeriod(p.periodStart, p.periodEnd)}
                      </b>
                    </td>
                    <td className="d-cellmuted">{fmtDayYear(p.finalizedAt)}</td>
                    <td>
                      <EStatus>Paid</EStatus>
                    </td>
                    <td className="d-num">{centsToPeso0(p.netPayCents)}</td>
                    <td className="d-cellchev">
                      <EIcon name="chevR" size={15} />
                    </td>
                  </tr>
                ))}
                {payslips.data && payslips.data.data.length === 0 && (
                  <tr>
                    <td colSpan={5} className="d-cellmuted" style={{ textAlign: "center", padding: 22 }}>
                      No payslips yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ECard>
        </div>

        <div className="d-col">
          {/* latest payslip */}
          {latest && (
            <ECard className="e-payday" onClick={() => nav.go("pay", latest.bookId)}>
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

          {/* leave balances */}
          {bals.length > 0 && (
            <>
              <ESection action="Manage" onAction={() => nav.go("leave")}>
                Leave balance
              </ESection>
              <ECard className="e-balcard" onClick={() => nav.go("leave")}>
                {bals.map((l) => (
                  <div className="e-bal" key={l.code}>
                    <div className="e-bal-ring">
                      <ERing value={l.used} total={l.total} color={l.color} size={52} />
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
              {announcements.data.data.slice(0, 2).map((a) => (
                <ECard key={a.id} className="e-ann">
                  <span className="e-ann-ic">
                    <EIcon name="megaphone" size={18} />
                  </span>
                  <div className="e-ann-body">
                    <div className="e-ann-top">
                      {a.category && <EChip tone="sage">{a.category}</EChip>}
                      <span>{fmtDay(a.publishedAt)}</span>
                    </div>
                    <b>{a.title}</b>
                    <p className="d-ann-p">{a.body}</p>
                  </div>
                </ECard>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ============================ PAY ============================
export function DPay({ param }: { param?: string | null }) {
  const [tab, setTab] = useState<"Payslips" | "Tax forms">("Payslips");
  const list = useEssData<ApiList<PayslipSummary>>("/api/ess/payslips?limit=50");
  const slips = list.data?.data ?? [];

  const [sel, setSel] = useState<string | null>(param ?? null);
  const selId = sel ?? slips[0]?.bookId ?? null;
  const detail = useEssData<ApiOne<PayslipDetailData>>(selId ? `/api/ess/payslips/${selId}` : null);

  const thisYear = new Date().getFullYear();
  const ytdNet = slips
    .filter((p) => new Date(p.periodEnd).getFullYear() === thisYear && p.runType !== "YEAR_END")
    .reduce((a, b) => a + centsNum(b.netPayCents), 0);
  const ytdTax = slips
    .filter((p) => new Date(p.periodEnd).getFullYear() === thisYear)
    .reduce((a, b) => a + centsNum(b.withholdingTaxCents), 0);

  return (
    <>
      <div className="d-pagehead">
        <div>
          <h1>Pay</h1>
          <p>Payslips, year-to-date totals, and tax certificates</p>
        </div>
        <div className="e-segment d-segment">
          {(["Payslips", "Tax forms"] as const).map((x) => (
            <button key={x} className={"e-seg" + (tab === x ? " is-on" : "")} onClick={() => setTab(x)}>
              {x}
            </button>
          ))}
        </div>
      </div>

      {tab === "Tax forms" ? (
        <div className="d-col" style={{ maxWidth: 720 }}>
          <p className="e-hint">
            Your annual tax certificates (BIR Form 2316) appear here once your employer releases them
            for the year.
          </p>
          <ECard>
            <p className="e-empty" style={{ margin: 0 }}>
              No tax forms available yet.
            </p>
          </ECard>
        </div>
      ) : (
        <div className="d-grid d-paygrid">
          {/* list */}
          <div className="d-col">
            <div className="e-ytd">
              <div>
                <span>Net pay · YTD</span>
                <b>{peso0(ytdNet)}</b>
              </div>
              <div className="e-ytd-div" />
              <div>
                <span>Tax withheld · YTD</span>
                <b>{peso0(ytdTax)}</b>
              </div>
            </div>
            <div className="d-pslist">
              {slips.map((x) => {
                const special = x.runType === "YEAR_END";
                return (
                  <button
                    key={x.bookId}
                    className={"d-psitem" + (x.bookId === selId ? " is-on" : "")}
                    onClick={() => setSel(x.bookId)}
                  >
                    <span className="e-psrow-ic" data-special={special}>
                      <EIcon name={special ? "coffee" : "wallet"} size={19} />
                    </span>
                    <span className="d-psitem-meta">
                      <b>{special ? "13th Month / Year-End" : fmtPeriod(x.periodStart, x.periodEnd)}</b>
                      <i>Paid {fmtDayYear(x.finalizedAt)}</i>
                    </span>
                    <b className="d-psitem-amt">{centsToPeso0(x.netPayCents)}</b>
                  </button>
                );
              })}
              {list.data && slips.length === 0 && <p className="e-empty">No payslips yet.</p>}
            </div>
          </div>

          {/* detail */}
          {detail.data ? (
            <DPayslipDetail data={detail.data.data} />
          ) : (
            <ECard className="d-psdetail">
              <p className="e-empty" style={{ margin: 0 }}>
                {detail.loading ? "Loading payslip…" : "Select a payslip to view its breakdown."}
              </p>
            </ECard>
          )}
        </div>
      )}
    </>
  );
}

function DPayslipDetail({ data: p }: { data: PayslipDetailData }) {
  const earnings = [
    { label: "Basic pay", sub: "Period", amt: centsNum(p.earnings.basePay) },
    { label: "Overtime", sub: "", amt: centsNum(p.earnings.otPay) },
    { label: "Night differential", sub: "", amt: centsNum(p.earnings.nsdPay) },
    { label: "Holiday pay", sub: "", amt: centsNum(p.earnings.holidayPay) },
    { label: "Rest day pay", sub: "", amt: centsNum(p.earnings.restDayPay) },
    { label: "Hazard pay", sub: "", amt: centsNum(p.earnings.hazardPay) },
    { label: "Allowances", sub: "Taxable", amt: centsNum(p.earnings.taxableAllowances) },
    {
      label: "Non-taxable pay",
      sub: "13th mo. & benefits",
      amt: centsNum(p.nonTaxable.nontaxable13MonthAndBenefits) + centsNum(p.nonTaxable.nontaxableCompensation),
    },
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
    <ECard className="d-psdetail">
      <div className="d-psd-head">
        <div>
          <span className="d-psd-kicker">Net pay · {fmtPeriod(p.period.start, p.period.end)}</span>
          <div className="d-psd-net">{peso(net)}</div>
          <div className="d-psd-sub">
            {p.employee.name} · <EStatus>Paid</EStatus>
          </div>
        </div>
        <EBtn kind="ghost" icon="download" onClick={() => printPayslip(p)}>
          Download PDF
        </EBtn>
      </div>

      <div className="d-psd-cols">
        <div className="d-psd-col">
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
        </div>
        <div className="d-psd-col">
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
        </div>
      </div>

      <div className="e-ps-total">
        <span>Net pay</span>
        <b>{peso(net)}</b>
      </div>
      <p className="e-ps-note">
        <EIcon name="shield" size={14} /> {p.tenant.name} · {p.employee.employeeNumber}
      </p>
    </ECard>
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
export function DLeave() {
  const nav = useContext(DNav);
  const balances = useEssData<ApiList<LeaveBalanceRow>>("/api/ess/leave-balances");
  const history = useEssData<ApiList<LeaveTxn>>("/api/ess/leaves?limit=20&status=");

  const bals = balances.data ? deriveBalances(balances.data.data) : [];
  const usage = (history.data?.data ?? []).filter((t) => t.type === "USAGE");

  return (
    <>
      <div className="d-pagehead">
        <div>
          <h1>Leave</h1>
          <p>Balances and request history</p>
        </div>
        <EBtn kind="primary" icon="plus" onClick={() => nav.openModal("leave")}>
          Request leave
        </EBtn>
      </div>

      <div className="d-leavebals">
        {bals.map((l) => (
          <ECard key={l.code} className="e-lbal">
            <div className="e-lbal-ring">
              <ERing value={l.used} total={l.total} color={l.color} size={62} />
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
        {balances.data && bals.length === 0 && <p className="e-empty">No leave balances set up yet.</p>}
      </div>

      <ESection>Request history</ESection>
      <ECard className="d-tablecard">
        <table className="d-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Dates</th>
              <th>Days</th>
              <th>Reason</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {usage.map((r) => {
              const status = r.approvalStatus.charAt(0) + r.approvalStatus.slice(1).toLowerCase();
              const dates =
                (r.startDate ? fmtDay(r.startDate) : "") +
                (r.endDate && r.endDate !== r.startDate ? ` – ${fmtDay(r.endDate)}` : "");
              return (
                <tr key={r.id}>
                  <td>
                    <b className="d-cellmain">{r.leaveType.name}</b>
                  </td>
                  <td className="d-cellmuted">{dates}</td>
                  <td className="d-cellmuted">{r.amount}</td>
                  <td className="d-cellmuted">{r.reason ?? "—"}</td>
                  <td>
                    <EStatus>{status}</EStatus>
                  </td>
                </tr>
              );
            })}
            {usage.length === 0 && (
              <tr>
                <td colSpan={5} className="d-cellmuted" style={{ textAlign: "center", padding: 22 }}>
                  No leave requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ECard>
    </>
  );
}

export function DLeaveModal() {
  const nav = useContext(DNav);
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

  return (
    <div
      className="d-modal-ov"
      onClick={(e) => {
        if (e.target === e.currentTarget) nav.closeModal();
      }}
    >
      <div className="d-modal" role="dialog" aria-label="Request leave">
        {done ? (
          <div className="d-modal-success">
            <span className="e-success-ic">
              <EIcon name="checkCircle" size={46} />
            </span>
            <h3>Request submitted</h3>
            <p>
              Your {selected?.type.toLowerCase() ?? "leave"} request was sent for approval. You&apos;ll
              be notified once it&apos;s reviewed.
            </p>
            <EBtn kind="primary" full onClick={() => nav.closeModal()}>
              Done
            </EBtn>
          </div>
        ) : (
          <>
            <div className="d-modal-head">
              <b>Request leave</b>
              <button className="d-modal-x" onClick={() => nav.closeModal()} aria-label="Close">
                <EIcon name="x" size={17} />
              </button>
            </div>

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

            <div className="d-modal-actions">
              <EBtn kind="ghost" onClick={() => nav.closeModal()}>
                Cancel
              </EBtn>
              <EBtn kind="primary" onClick={submit} disabled={busy}>
                {busy ? "Submitting…" : "Submit request"}
              </EBtn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================ TIME ============================
function dtrTone(d: DtrPeriod["records"][number]): "red" | "amber" | "slate" | "green" {
  if (d.dayStatus === "ABSENT") return "red";
  if (d.lateMinutes > 0) return "amber";
  if (d.dayStatus === "REST_DAY") return "slate";
  return "green";
}
function dtrTag(d: DtrPeriod["records"][number]): string {
  if (d.dayStatus === "REST_DAY") return "Rest day";
  if (d.dayStatus === "ABSENT") return "Absent";
  if (d.lateMinutes > 0) return "Late";
  return "Present";
}

export function DTime() {
  const nav = useContext(DNav);
  const { data, loading } = useEssData<ApiList<DtrPeriod>>("/api/ess/dtr?limit=2");
  const now = useNow();
  const tn = now ? fmtTime(now) : null;
  const clockedIn = nav.clockedIn;

  const period = data?.data?.[0];
  const log = period
    ? [...period.records].sort((a, b) => +new Date(b.date) - +new Date(a.date))
    : [];

  return (
    <>
      <div className="d-pagehead">
        <div>
          <h1>Time &amp; attendance</h1>
          <p>{todayLabel()}</p>
        </div>
        <EBtn kind="primary" icon="doc" onClick={() => nav.go("dtr")}>
          Submit DTR
        </EBtn>
      </div>

      {loading ? (
        <DLoading />
      ) : (
        <div className="d-grid d-timegrid">
          <div className="d-col">
            <div className="e-clock">
              <div className="e-clock-time">
                {tn ? tn.hm : "—"}
                {tn && <span className="d-clock-ap">{tn.ap}</span>}
              </div>
              <div className="e-clock-day">{todayLabel()}</div>
              <div className="e-clock-sched">
                <EIcon name="clock" size={15} /> {clockedIn ? "Clocked in" : "Not clocked in"}
              </div>
              <button
                className={"e-clock-btn" + (clockedIn ? " is-out" : "")}
                onClick={() => nav.openModal(clockedIn ? "clock-out" : "clock-in")}
              >
                {clockedIn ? "Clock out" : "Clock in"}
              </button>
              <span className="e-clock-status">Selfie verification required</span>
            </div>

            {period && (
              <>
                <ESection>This period · {fmtPeriod(period.periodStart, period.periodEnd)}</ESection>
                <div className="d-timestats">
                  <ECard className="e-tstat">
                    <b>{period.presentDays}</b>
                    <span>Present</span>
                  </ECard>
                  <ECard className="e-tstat">
                    <b className="e-amber">{period.totalLateMinutes}</b>
                    <span>Late mins</span>
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
              </>
            )}
          </div>

          <div className="d-col">
            <ESection>Attendance log</ESection>
            <ECard className="d-tablecard">
              <table className="d-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time in</th>
                    <th>Time out</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((d) => {
                    const rest = d.dayStatus === "REST_DAY";
                    return (
                      <tr key={d.id}>
                        <td>
                          <b className="d-cellmain">{fmtDay(d.date)}</b>
                        </td>
                        <td className={!d.timeIn ? "d-cellmuted" : "d-num-cell"}>
                          {rest || !d.timeIn ? "—" : fmtTime(new Date(d.timeIn)).full}
                        </td>
                        <td className={!d.timeOut ? "d-cellmuted" : "d-num-cell"}>
                          {rest || !d.timeOut ? "—" : fmtTime(new Date(d.timeOut)).full}
                        </td>
                        <td>
                          <EChip tone={dtrTone(d)}>{dtrTag(d)}</EChip>
                        </td>
                      </tr>
                    );
                  })}
                  {period && log.length === 0 && (
                    <tr>
                      <td colSpan={4} className="d-cellmuted" style={{ textAlign: "center", padding: 22 }}>
                        No records this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </ECard>
          </div>
        </div>
      )}
    </>
  );
}

// ============================ DTR — period selection ============================
export function DDTRPeriods() {
  const nav = useContext(DNav);
  const { data, loading } = useEssData<ApiList<DtrPeriodFull>>("/api/ess/dtr?limit=12");
  const profile = useEssData<ApiOne<EssProfile>>("/api/ess/profile");
  const company = profile.data?.data.company ?? "your company";
  const manager = profile.data?.data.manager ?? "your manager";

  const periods = data?.data ?? [];
  const open = periods.find((p) => dtrStatusLabel(p.submission) === "Open");

  return (
    <>
      <div className="d-pagehead">
        <div>
          <h1>Submit DTR</h1>
          <p>Select a payroll period to review and submit your daily time record</p>
        </div>
        <EBtn kind="ghost" icon="chevL" onClick={() => nav.go("time")}>
          Back to Time
        </EBtn>
      </div>

      {open && (
        <div className="d-dtr-due">
          <EIcon name="clock" size={17} />
          <span>
            <b>{fmtPeriod(open.periodStart, open.periodEnd)}</b> is open for submission — review your
            record so payroll can run on time.
          </span>
          <EBtn kind="primary" onClick={() => nav.go("dtr-detail", open.periodStart)}>
            Review &amp; submit
          </EBtn>
        </div>
      )}

      {loading ? (
        <DLoading />
      ) : (
        <>
          <ESection>Payroll periods · {company}</ESection>
          <ECard className="d-tablecard">
            <table className="d-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Days</th>
                  <th>OT hrs</th>
                  <th>DTR status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {periods.map((p, i) => {
                  const label = dtrStatusLabel(p.submission);
                  return (
                    <tr
                      key={p.periodStart}
                      className="d-rowlink"
                      onClick={() => nav.go("dtr-detail", p.periodStart)}
                    >
                      <td>
                        <b className="d-cellmain">{fmtPeriod(p.periodStart, p.periodEnd)}</b>
                        {i === 0 && <span className="d-dtr-now">Current</span>}
                      </td>
                      <td className="d-cellmuted">{p.presentDays}</td>
                      <td className="d-cellmuted">{minutesToHrs(p.totalOTMinutes)}</td>
                      <td>
                        <EChip tone={DTR_TONE[label]}>{label}</EChip>
                      </td>
                      <td className="d-cellchev">
                        <EIcon name="chevR" size={15} />
                      </td>
                    </tr>
                  );
                })}
                {periods.length === 0 && (
                  <tr>
                    <td colSpan={5} className="d-cellmuted" style={{ textAlign: "center", padding: 22 }}>
                      No payroll periods yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ECard>
          <p className="e-ps-note">
            <EIcon name="shield" size={14} /> Submitted DTRs are routed to {manager} for approval before
            payroll processing.
          </p>
        </>
      )}
    </>
  );
}

// ============================ DTR — review & submit ============================
export function DDTRDetail({ param }: { param?: string | null }) {
  const nav = useContext(DNav);
  const { data, loading } = useEssData<ApiList<DtrPeriodFull>>("/api/ess/dtr?limit=12");
  const profile = useEssData<ApiOne<EssProfile>>("/api/ess/profile");
  const manager = profile.data?.data.manager ?? "your manager";

  const periods = data?.data ?? [];
  const p = periods.find((x) => x.periodStart === param) ?? periods[0];

  const initialStatus = p ? dtrStatusLabel(p.submission) : "Open";
  const [certified, setCertified] = useState(false);
  const [submittedStatus, setSubmittedStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const status = submittedStatus ?? initialStatus;
  const isSubmitted = status !== "Open";

  async function submit() {
    if (busy || !p) return;
    setBusy(true);
    try {
      await essFetch("/api/ess/dtr", {
        method: "POST",
        body: JSON.stringify({ periodStart: p.periodStart, periodEnd: p.periodEnd }),
      });
      setSubmittedStatus("Submitted");
      toast.success("DTR submitted for approval.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't submit your DTR.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <DLoading />;
  if (!p) return <p className="e-empty">No payroll periods to review.</p>;

  const log = [...p.records].sort((a, b) => +new Date(a.date) - +new Date(b.date));

  return (
    <>
      <div className="d-pagehead">
        <div>
          <h1>DTR · {fmtPeriod(p.periodStart, p.periodEnd)}</h1>
          <p>
            Pay period · <EChip tone={DTR_TONE[status]}>{status}</EChip>
          </p>
        </div>
        <EBtn kind="ghost" icon="chevL" onClick={() => nav.go("dtr")}>
          All periods
        </EBtn>
      </div>

      <div className="d-grid d-timegrid">
        <div className="d-col">
          <ESection>Period summary</ESection>
          <div className="d-timestats">
            <ECard className="e-tstat">
              <b>{p.presentDays}</b>
              <span>Days present</span>
            </ECard>
            <ECard className="e-tstat">
              <b className="e-amber">
                {p.totalLateMinutes}
                <i className="d-tstat-unit">min</i>
              </b>
              <span>Tardiness</span>
            </ECard>
            <ECard className="e-tstat">
              <b>{p.absentDays}</b>
              <span>Absent</span>
            </ECard>
            <ECard className="e-tstat">
              <b className="e-sage">
                {minutesToHrs(p.totalOTMinutes)}
                <i className="d-tstat-unit">hrs</i>
              </b>
              <span>Overtime</span>
            </ECard>
          </div>

          {isSubmitted ? (
            <div className="d-dtr-submitcard">
              <span className="e-success-ic">
                <EIcon name="checkCircle" size={40} />
              </span>
              <b>{status === "Approved" ? "DTR approved" : "DTR submitted"}</b>
              <p>
                {status === "Approved"
                  ? "This period was approved and processed in payroll."
                  : `Sent to ${manager} for approval. You'll be notified once it's reviewed.`}
              </p>
            </div>
          ) : (
            <div className="d-dtr-submitcard">
              <label className="d-dtr-cert">
                <input
                  type="checkbox"
                  checked={certified}
                  onChange={(e) => setCertified(e.target.checked)}
                />
                <span>
                  I certify that the entries here are a true and accurate record of my attendance for{" "}
                  {fmtPeriod(p.periodStart, p.periodEnd)}.
                </span>
              </label>
              <EBtn kind="primary" icon="check" full disabled={!certified || busy} onClick={submit}>
                {busy ? "Submitting…" : "Submit DTR"}
              </EBtn>
              <p className="d-dtr-note">Goes to {manager} for approval</p>
            </div>
          )}
        </div>

        <div className="d-col">
          <ESection>Daily time record</ESection>
          <ECard className="d-tablecard">
            <table className="d-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time in</th>
                  <th>Time out</th>
                  <th>OT hrs</th>
                  <th>Tardiness</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {log.map((d) => {
                  const rest = d.dayStatus === "REST_DAY";
                  return (
                    <tr key={d.id}>
                      <td>
                        <b className="d-cellmain">{fmtDay(d.date)}</b>
                      </td>
                      <td className={!d.timeIn ? "d-cellmuted" : "d-num-cell"}>
                        {rest || !d.timeIn ? "—" : fmtTime(new Date(d.timeIn)).full}
                      </td>
                      <td className={!d.timeOut ? "d-cellmuted" : "d-num-cell"}>
                        {rest || !d.timeOut ? "—" : fmtTime(new Date(d.timeOut)).full}
                      </td>
                      <td className={d.otMinutes ? "d-num-cell e-sage" : "d-cellmuted"}>
                        {d.otMinutes ? `${minutesToHrs(d.otMinutes)} h` : "—"}
                      </td>
                      <td className={d.lateMinutes ? "d-num-cell e-amber" : "d-cellmuted"}>
                        {d.lateMinutes ? `${d.lateMinutes} min` : "—"}
                      </td>
                      <td>
                        <EChip tone={dtrTone(d)}>{dtrTag(d)}</EChip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ECard>
          <p className="e-hint">
            Spot an error? File a time-correction request before submitting — corrections after
            submission go through your manager.
          </p>
        </div>
      </div>
    </>
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
  return (
    [y ? `${y} yr${y > 1 ? "s" : ""}` : "", m ? `${m} mo${m > 1 ? "s" : ""}` : ""]
      .filter(Boolean)
      .join(" ") || "New hire"
  );
}

export function DProfile() {
  const nav = useContext(DNav);
  const { data, loading } = useEssData<ApiOne<EssProfile>>("/api/ess/profile");

  if (loading) return <DLoading />;
  if (!data) return <p className="e-empty">Couldn&apos;t load your profile.</p>;
  const e = data.data;

  const name = [e.firstName, e.lastName].filter(Boolean).join(" ");
  const initials = (e.firstName[0] ?? "") + (e.lastName[0] ?? "");
  const address = [e.addressLine1, e.addressLine2, e.city, e.province, e.zipCode]
    .filter(Boolean)
    .join(", ");
  const employment = e.employmentStatus.charAt(0) + e.employmentStatus.slice(1).toLowerCase();
  const bankValue =
    e.bank.name || e.bank.accountMasked ? `${e.bank.name ?? ""} ${e.bank.accountMasked ?? ""}`.trim() : null;

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
    <>
      <div className="d-pagehead">
        <div>
          <h1>Profile</h1>
          <p>Personal records, employment, and government numbers</p>
        </div>
      </div>

      <div className="d-grid d-profilegrid">
        <div className="d-col">
          <ECard className="d-idcard">
            <EAvatar initials={initials} size={68} />
            <h3>{name}</h3>
            <p>
              {e.position?.title ?? "—"}
              {e.department?.name ? ` · ${e.department.name}` : ""}
            </p>
            <div className="e-phead-tags">
              <EChip tone="sage">{employment}</EChip>
              <EChip tone="slate">{e.employeeNumber}</EChip>
            </div>
          </ECard>

          <ECard className="e-pcard">
            {row("building", "Company", e.company)}
            {row("user", "Manager", e.manager)}
            {row("cal", "Date hired", `${fmtDayYear(e.hireDate)} · ${tenure(e.hireDate)}`)}
          </ECard>

          <button className="e-logout" onClick={nav.logout}>
            <EIcon name="logout" size={18} /> Log out
          </button>
          <p className="e-version">Sentire Payroll · ESS v1.0</p>
        </div>

        <div className="d-col">
          <ESection>Personal</ESection>
          <ECard className="e-pcard">
            {row("mail", "Email", e.personalEmail)}
            {row("phone", "Mobile", e.mobileNumber)}
            {row("pin", "Address", address || null)}
            {row("cal", "Birthdate", e.birthDate ? fmtDayYear(e.birthDate) : null)}
            {row("user", "Civil status", e.civilStatus)}
          </ECard>

          <ESection>Pay &amp; government</ESection>
          <ECard className="e-pcard">
            {row("card", "Bank account", bankValue)}
            {row("shield", "SSS", e.government.SSS)}
            {row("shield", "PhilHealth", e.government.PHILHEALTH)}
            {row("shield", "Pag-IBIG", e.government.PAGIBIG)}
            {row("shield", "TIN", e.government.TIN)}
          </ECard>
        </div>
      </div>
    </>
  );
}

export const D_PAGES: Record<DPage, React.ComponentType<{ param?: string | null }>> = {
  dashboard: DDashboard,
  pay: DPay,
  leave: DLeave,
  time: DTime,
  profile: DProfile,
  dtr: DDTRPeriods,
  "dtr-detail": DDTRDetail,
};
