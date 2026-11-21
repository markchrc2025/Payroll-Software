/**
 * Wave D (PAY-214): four read-only reports, each one table with summary
 * sections, the same on screen and in the Excel download
 * (src/lib/reports/hr-reports-view.ts).
 *
 *   expense-transactions  claims by expense date, with totals by category and
 *                         by type, and a check per payroll run that the
 *                         claims paid in it equal the reimbursements on its
 *                         register (the sheets' applied claims).
 *   leave-transactions    every leave transaction of a year with a running
 *                         balance per employee and leave type, and a check
 *                         that the closing balance equals the balance on file.
 *   leave-entitlement     per employee and leave type as of a date: the
 *                         entitlement, earned, used, pending, available and
 *                         the next accrual; employees past a year of service
 *                         with no entitlement are flagged (Service Incentive
 *                         Leave, Labor Code Art. 95).
 *   time-clock            raw punches per employee per day: times, sources,
 *                         location and selfie, missing in or out, punches
 *                         outside the geofence, and manual DTR edits with who
 *                         made them. The DTR is the computed result; this is
 *                         what was captured.
 */
import type { Prisma } from "@prisma/client";
import { periodContaining } from "@/lib/leave/accrual-math";
import type { HrReport, HrReportKind, Row } from "./hr-reports-view";

type Tx = Prisma.TransactionClient;

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const peso = (c: bigint) => (Number(c) / 100).toFixed(2);
const num = (v: Prisma.Decimal | number | string | null | undefined) => Number(v ?? 0);
const days = (n: number) => (Math.round(n * 10000) / 10000).toFixed(2);
const empName = (e: { firstName: string; lastName: string }) => `${e.lastName}, ${e.firstName}`;
const LUMP_KEY = "LUMP";
const MANILA = "Asia/Manila";
const timeFmt = new Intl.DateTimeFormat("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: MANILA });
const manilaDay = (d: Date) => new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);

export type HrReportParams = { from: Date; to: Date; asOf: Date; year: number; employeeId?: string | null };

export async function loadHrReport(tx: Tx, tenantId: string, kind: HrReportKind, p: HrReportParams): Promise<HrReport> {
  const emp = p.employeeId ? { employeeId: p.employeeId } : {};

  if (kind === "expense-transactions") {
    const claims = await tx.expenseClaim.findMany({
      where: { tenantId, ...emp, claimDate: { gte: p.from, lte: p.to }, status: { not: "DRAFT" } },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
        categoryItem: { select: { name: true } }, typeItem: { select: { name: true } },
        paidInBook: { select: { id: true, periodStart: true, periodEnd: true, controlNumber: true } },
      },
      orderBy: [{ claimDate: "asc" }, { createdAt: "asc" }],
    });
    const rows: Row[] = claims.map((c) => ({
      id: c.id, date: ymd(c.claimDate), employeeNumber: c.employee.employeeNumber, employeeName: empName(c.employee),
      category: c.categoryItem?.name ?? c.category, type: c.typeItem?.name ?? null, description: c.description,
      amount: peso(c.amountCents), status: c.status, taxTreatment: c.taxTreatment,
      paidIn: c.paidInBook ? `${c.paidInBook.controlNumber ?? "run"} (${ymd(c.paidInBook.periodStart)} to ${ymd(c.paidInBook.periodEnd)})` : null,
    }));
    const sum = (key: (c: (typeof claims)[number]) => string) => {
      const m = new Map<string, { n: number; cents: bigint }>();
      for (const c of claims) { const k = key(c); const v = m.get(k) ?? { n: 0, cents: 0n }; v.n++; v.cents += c.amountCents; m.set(k, v); }
      return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ id: k, label: k, count: String(v.n), amount: peso(v.cents) }));
    };
    // The tie: claims paid in a run against the register's applied claims.
    const books = [...new Map(claims.filter((c) => c.paidInBook).map((c) => [c.paidInBook!.id, c.paidInBook!])).values()];
    const checks: Row[] = [];
    for (const b of books) {
      const sheets = await tx.payrollSheet.findMany({ where: { tenantId, payrollBookId: b.id }, select: { expenseClaimsApplied: true } });
      let register = 0n;
      for (const s of sheets) for (const a of (Array.isArray(s.expenseClaimsApplied) ? s.expenseClaimsApplied : []) as { amountCents?: string }[]) register += BigInt(a.amountCents ?? "0");
      // Every claim paid in that run, not only those in the date range.
      const paid = await tx.expenseClaim.aggregate({ where: { tenantId, paidInBookId: b.id }, _sum: { amountCents: true } });
      const claimed = paid._sum.amountCents ?? 0n;
      checks.push({ id: b.id, label: `${b.controlNumber ?? "Run"} (${ymd(b.periodStart)} to ${ymd(b.periodEnd)})`, claims: peso(claimed), register: peso(register), result: claimed === register ? "Ties" : `Differs by ${peso(claimed - register)}` });
    }
    return {
      kind, title: "Expense Transaction Report", subtitle: `Claims with an expense date from ${ymd(p.from)} to ${ymd(p.to)}, drafts left out.`,
      columns: [
        { key: "date", label: "Date" }, { key: "employeeNumber", label: "Employee #" }, { key: "employeeName", label: "Employee" },
        { key: "category", label: "Category" }, { key: "type", label: "Type" }, { key: "description", label: "Description" },
        { key: "amount", label: "Amount", numeric: true }, { key: "status", label: "Status" }, { key: "taxTreatment", label: "Tax treatment" }, { key: "paidIn", label: "Paid in" },
      ],
      rows,
      sections: [
        { title: "Totals by category", columns: [{ key: "label", label: "Category" }, { key: "count", label: "Claims", numeric: true }, { key: "amount", label: "Amount", numeric: true }], rows: sum((c) => c.categoryItem?.name ?? c.category) },
        { title: "Totals by type", columns: [{ key: "label", label: "Type" }, { key: "count", label: "Claims", numeric: true }, { key: "amount", label: "Amount", numeric: true }], rows: sum((c) => c.typeItem?.name ?? "No type") },
        { title: "Tie to the payroll register", columns: [{ key: "label", label: "Payroll run" }, { key: "claims", label: "Claims paid", numeric: true }, { key: "register", label: "Register", numeric: true }, { key: "result", label: "Check" }], rows: checks },
      ],
    };
  }

  if (kind === "leave-transactions") {
    const balances = await tx.leaveBalance.findMany({
      where: { tenantId, ...emp, year: p.year },
      include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } }, leaveType: { select: { name: true, code: true } } },
    });
    const txns = await tx.leaveTransaction.findMany({
      where: { tenantId, leaveBalanceId: { in: balances.map((b) => b.id) } },
      orderBy: [{ createdAt: "asc" }],
    });
    const byBal = new Map<string, typeof txns>();
    for (const t of txns) byBal.set(t.leaveBalanceId, [...(byBal.get(t.leaveBalanceId) ?? []), t]);
    balances.sort((a, b) => empName(a.employee).localeCompare(empName(b.employee)) || a.leaveType.name.localeCompare(b.leaveType.name));
    const rows: Row[] = [];
    const checks: Row[] = [];
    for (const b of balances) {
      const list = byBal.get(b.id) ?? [];
      const base = { employeeNumber: b.employee.employeeNumber, employeeName: empName(b.employee), leaveType: b.leaveType.name };
      // The opening balance less what the lump-sum accruals put there is what was entered by hand.
      const lump = list.filter((t) => t.type === "ACCRUAL" && t.periodKey === LUMP_KEY).reduce((s, t) => s + num(t.amount), 0);
      let running = num(b.openingBalance) - lump;
      rows.push({ ...base, id: `${b.id}:open`, date: null, type: "Opening (entered)", status: null, change: days(running), balance: days(running), note: null });
      for (const t of list) {
        let change = 0;
        let counts = true;
        if (t.type === "USAGE") { counts = t.approvalStatus === "APPROVED"; change = -num(t.paidUnits); }
        else if (t.type === "FORFEITURE" || t.type === "CONVERSION") change = -Math.abs(num(t.amount));
        else change = num(t.amount);
        if (counts) running += change;
        rows.push({
          ...base, id: t.id, date: ymd(t.startDate ?? t.createdAt), type: t.type === "ACCRUAL" && t.periodKey ? `ACCRUAL ${t.periodKey}` : t.type,
          status: t.approvalStatus, change: counts ? days(change) : "0.00", balance: days(running),
          note: t.type === "USAGE" ? [`${num(t.amount)} filed`, num(t.unpaidUnits) ? `${num(t.unpaidUnits)} unpaid` : null, counts ? null : "not counted (not approved)"].filter(Boolean).join(", ") : null,
        });
      }
      const onFile = num(b.openingBalance) + num(b.earned) - num(b.used) - num(b.forfeited) - num(b.convertedToCash);
      const diff = Math.round((running - onFile) * 10000) / 10000;
      checks.push({ id: b.id, ...base, closing: days(running), onFile: days(onFile), result: diff === 0 ? "Matches" : `Differs by ${days(diff)}` });
    }
    return {
      kind, title: "Leave Transaction Report", subtitle: `Every leave transaction of ${p.year}, with the running balance per employee and leave type. Only approved leave is counted.`,
      columns: [
        { key: "employeeNumber", label: "Employee #" }, { key: "employeeName", label: "Employee" }, { key: "leaveType", label: "Leave type" },
        { key: "date", label: "Date" }, { key: "type", label: "Transaction" }, { key: "status", label: "Status" },
        { key: "change", label: "Change", numeric: true }, { key: "balance", label: "Balance", numeric: true }, { key: "note", label: "Note" },
      ],
      rows,
      sections: [{ title: "Check: closing balance against the balance on file", columns: [{ key: "employeeName", label: "Employee" }, { key: "leaveType", label: "Leave type" }, { key: "closing", label: "Closing", numeric: true }, { key: "onFile", label: "On file", numeric: true }, { key: "result", label: "Check" }], rows: checks }],
    };
  }

  if (kind === "leave-entitlement") {
    const year = p.asOf.getUTCFullYear();
    const employees = await tx.employee.findMany({
      where: { tenantId, deletedAt: null, ...(p.employeeId ? { id: p.employeeId } : {}), employmentStatus: { notIn: ["RESIGNED", "TERMINATED"] } },
      select: { id: true, firstName: true, lastName: true, employeeNumber: true, hireDate: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    const ids = employees.map((e) => e.id);
    const [ents, bals] = await Promise.all([
      tx.leaveEntitlement.findMany({
        where: { tenantId, employeeId: { in: ids }, deletedAt: null, startDate: { lte: p.asOf }, OR: [{ endDate: null }, { endDate: { gte: p.asOf } }] },
        include: { leaveType: { select: { name: true } } },
      }),
      tx.leaveBalance.findMany({ where: { tenantId, employeeId: { in: ids }, year }, include: { leaveType: { select: { name: true } } } }),
    ]);
    const pend = await tx.leaveTransaction.groupBy({
      by: ["employeeId", "leaveTypeId"],
      where: { tenantId, type: "USAGE", approvalStatus: "PENDING", leaveBalanceId: { in: bals.map((b) => b.id) } },
      _sum: { paidUnits: true },
    });
    const pending = new Map(pend.map((g) => [`${g.employeeId}|${g.leaveTypeId}`, num(g._sum?.paidUnits)]));
    const rows: Row[] = [];
    const flags: Row[] = [];
    for (const e of employees) {
      const mine = ents.filter((x) => x.employeeId === e.id);
      const types = new Map<string, string>();
      for (const x of mine) types.set(x.leaveTypeId, x.leaveType.name);
      for (const b of bals.filter((x) => x.employeeId === e.id)) types.set(b.leaveTypeId, b.leaveType.name);
      for (const [lt, name] of [...types.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
        const ent = mine.find((x) => x.leaveTypeId === lt);
        const b = bals.find((x) => x.employeeId === e.id && x.leaveTypeId === lt);
        const earned = b ? num(b.openingBalance) + num(b.earned) : 0;
        const used = b ? num(b.used) + num(b.forfeited) + num(b.convertedToCash) : 0;
        const pen = pending.get(`${e.id}|${lt}`) ?? 0;
        let next: string | null = null;
        if (ent && ["MONTHLY", "QUARTERLY", "ANNUALLY"].includes(ent.accrualFrequency)) {
          const end = periodContaining(ent.accrualFrequency as "MONTHLY" | "QUARTERLY" | "ANNUALLY", p.asOf).end;
          next = !ent.endDate || end <= ent.endDate ? ymd(end) : null;
        }
        rows.push({
          id: `${e.id}|${lt}`, employeeNumber: e.employeeNumber, employeeName: empName(e), leaveType: name,
          entitlement: ent ? `${num(ent.accrualAmount)} ${ent.accrualFrequency.toLowerCase().replace(/_/g, " ")}` : "None in force",
          earned: days(earned), used: days(used), pending: days(pen), available: days(earned - used - pen), nextAccrual: next,
        });
      }
      const oneYear = new Date(Date.UTC(e.hireDate.getUTCFullYear() + 1, e.hireDate.getUTCMonth(), e.hireDate.getUTCDate()));
      if (mine.length === 0 && oneYear <= p.asOf) {
        flags.push({ id: e.id, employeeNumber: e.employeeNumber, employeeName: empName(e), hireDate: ymd(e.hireDate), note: "Past a year of service with no leave entitlement in force: Service Incentive Leave of 5 days a year is due (Labor Code Art. 95)" });
      }
    }
    return {
      kind, title: "Leave Entitlement Report", subtitle: `Each current employee's leave as of ${ymd(p.asOf)}. Available = earned less used and pending requests.`,
      columns: [
        { key: "employeeNumber", label: "Employee #" }, { key: "employeeName", label: "Employee" }, { key: "leaveType", label: "Leave type" },
        { key: "entitlement", label: "Entitlement" }, { key: "earned", label: "Earned", numeric: true }, { key: "used", label: "Used", numeric: true },
        { key: "pending", label: "Pending", numeric: true }, { key: "available", label: "Available", numeric: true }, { key: "nextAccrual", label: "Next accrual" },
      ],
      rows,
      sections: [{ title: "No entitlement after a year of service", columns: [{ key: "employeeName", label: "Employee" }, { key: "hireDate", label: "Hired" }, { key: "note", label: "Note" }], rows: flags }],
    };
  }

  // time-clock
  const toEnd = new Date(p.to.getTime() + 86_400_000);
  // Punches are stored UTC; the day is the Manila day.
  const logs = await tx.attendanceLog.findMany({
    where: { tenantId, ...emp, punchedAt: { gte: new Date(p.from.getTime() - 8 * 3_600_000), lt: new Date(toEnd.getTime() - 8 * 3_600_000) } },
    include: { employee: { select: { firstName: true, lastName: true, employeeNumber: true } } },
    orderBy: { punchedAt: "asc" },
  });
  const edits = await tx.dTRAuditLog.findMany({
    where: { tenantId, dtrRecord: { ...(p.employeeId ? { employeeId: p.employeeId } : {}), date: { gte: p.from, lte: p.to } } },
    include: { dtrRecord: { select: { employeeId: true, date: true, employee: { select: { firstName: true, lastName: true, employeeNumber: true } } } } },
  });
  const actors = await tx.employee.findMany({ where: { tenantId, id: { in: [...new Set(edits.map((x) => x.actorId))] } }, select: { id: true, firstName: true, lastName: true } });
  const actorName = new Map(actors.map((a) => [a.id, `${a.firstName} ${a.lastName}`]));
  type Day = { employeeId: string; date: string; emp: { firstName: string; lastName: string; employeeNumber: string }; logs: typeof logs; edits: typeof edits };
  const daysMap = new Map<string, Day>();
  const dayOf = (employeeId: string, date: string, e: Day["emp"]) => {
    const k = `${employeeId}|${date}`;
    let d = daysMap.get(k);
    if (!d) { d = { employeeId, date, emp: e, logs: [], edits: [] }; daysMap.set(k, d); }
    return d;
  };
  for (const l of logs) dayOf(l.employeeId, manilaDay(l.punchedAt), l.employee).logs.push(l);
  for (const x of edits) dayOf(x.dtrRecord.employeeId, ymd(x.dtrRecord.date)!, x.dtrRecord.employee).edits.push(x);
  const rows: Row[] = [...daysMap.values()]
    .sort((a, b) => empName(a.emp).localeCompare(empName(b.emp)) || a.date.localeCompare(b.date))
    .map((d) => {
      const ins = d.logs.filter((l) => l.punchType === "IN"), outs = d.logs.filter((l) => l.punchType === "OUT");
      const flagged = d.logs.filter((l) => l.outsideGeofence).length;
      const located = d.logs.find((l) => l.latitude != null && l.longitude != null);
      const issues = [d.logs.length && !ins.length ? "No time in" : null, d.logs.length && !outs.length ? "No time out" : null, flagged ? `${flagged} outside the geofence` : null].filter(Boolean);
      return {
        id: `${d.employeeId}|${d.date}`, date: d.date, employeeNumber: d.emp.employeeNumber, employeeName: empName(d.emp),
        punches: d.logs.map((l) => `${l.punchType} ${timeFmt.format(l.punchedAt)} ${l.source.toLowerCase()}`).join("; ") || "No punches",
        firstIn: ins[0] ? timeFmt.format(ins[0].punchedAt) : null, lastOut: outs.length ? timeFmt.format(outs[outs.length - 1]!.punchedAt) : null,
        location: located ? `${Number(located.latitude).toFixed(5)}, ${Number(located.longitude).toFixed(5)}` : null,
        selfies: String(d.logs.filter((l) => l.selfieKey || l.selfieData).length),
        issues: issues.join(", ") || null,
        manualEdits: d.edits.length ? d.edits.map((x) => `${x.fieldChanged.replace(/_/g, " ")} by ${actorName.get(x.actorId) ?? x.actorRole.toLowerCase()} (${x.reasonCode})`).join("; ") : null,
      };
    });
  return {
    kind, title: "Time Clock Report", subtitle: `Punches as captured from ${ymd(p.from)} to ${ymd(p.to)} (Manila time), with the manual DTR edits. The DTR is the computed result.`,
    columns: [
      { key: "date", label: "Date" }, { key: "employeeNumber", label: "Employee #" }, { key: "employeeName", label: "Employee" },
      { key: "firstIn", label: "First in" }, { key: "lastOut", label: "Last out" }, { key: "punches", label: "Punches" },
      { key: "location", label: "Location" }, { key: "selfies", label: "Selfies", numeric: true }, { key: "issues", label: "Issues" }, { key: "manualEdits", label: "Manual edits" },
    ],
    rows,
    sections: [],
  };
}
