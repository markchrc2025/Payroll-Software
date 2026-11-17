/**
 * PAY-170: import punches from a biometric device export (or any file mapped
 * to the standard columns), so past attendance can come into Sentire the same
 * way a live punch does: an AttendanceLog per punch (source IMPORT), then the
 * DTR for each affected day recomputed by the same code as a live punch
 * (recomputeDayDtr in punch.ts).
 *
 * Rules:
 *  - All or nothing. Every row is checked first; if any row is wrong, nothing
 *    is written and every problem is returned with its row number.
 *  - A punch already in Sentire (same employee, same minute, same type) is
 *    skipped, so the same file can be imported twice safely.
 *  - A day whose DTR is locked (its payroll is finalized) or already approved
 *    is refused: approved attendance is never changed underneath the approver.
 *  - Times without a UTC offset are read in the employee's timekeeping zone
 *    (company or employee, as Pay Rules says).
 */
import { withTenant, type TenantTx } from "@/lib/with-tenant";
import { recomputeDayDtr } from "@/lib/attendance/punch";
import { resolveTimezone, localDay, atLocalWallClock } from "@/lib/time/zone";

export const MAX_IMPORT_ROWS = 5000;

export interface PunchImportRow {
  employeeNumber: string;
  /** "YYYY-MM-DD HH:mm[:ss]" in local time, or ISO 8601 with Z or an offset. */
  punchedAt: string;
  punchType: string;
}

export interface PunchImportProblem {
  row: number; // 1-based, as in the file (header excluded)
  message: string;
}

export type PunchImportResult =
  | { ok: true; imported: number; duplicates: number; daysRecomputed: number; employees: number }
  | { ok: false; problems: PunchImportProblem[] };

const TYPE_WORDS: Record<string, "IN" | "OUT"> = {
  in: "IN", "c/in": "IN", "check in": "IN", "check-in": "IN", "checkin": "IN", "time in": "IN", "0": "IN",
  out: "OUT", "c/out": "OUT", "check out": "OUT", "check-out": "OUT", "checkout": "OUT", "time out": "OUT", "1": "OUT",
};

/** IN or OUT from the words devices use (ZKTeco: C/In, C/Out, Check In, 0/1). */
export function punchTypeOf(raw: string): "IN" | "OUT" | null {
  return TYPE_WORDS[raw.trim().toLowerCase()] ?? null;
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})$/;

/** The instant of a punch; local times are read in `tz`. Null when unreadable. */
export function punchInstant(raw: string, tz: string): Date | null {
  const s = raw.trim();
  if (OFFSET_RE.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = LOCAL_RE.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, sec] = m;
  const hour = Number(h);
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31 || hour > 23 || Number(mi) > 59) return null;
  const day = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (day.getUTCDate() !== Number(d)) return null; // 31 Feb and the like
  const at = atLocalWallClock(day, `${String(hour).padStart(2, "0")}:${mi}`, tz);
  return new Date(at.getTime() + Number(sec ?? 0) * 1000);
}

const HEADER_ALIASES: Record<string, keyof PunchImportRow> = {
  employee_number: "employeeNumber", "employee number": "employeeNumber", "employee no": "employeeNumber",
  "employee no.": "employeeNumber", employeeno: "employeeNumber", emp_no: "employeeNumber", "ac-no.": "employeeNumber",
  "ac-no": "employeeNumber", "user id": "employeeNumber", userid: "employeeNumber",
  date_time: "punchedAt", datetime: "punchedAt", "date time": "punchedAt", "date/time": "punchedAt", timestamp: "punchedAt",
  type: "punchType", punch: "punchType", punch_type: "punchType", state: "punchType", status: "punchType",
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === "\t") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

/**
 * Rows from CSV text with a header line naming the employee number, the date
 * and time, and the punch type (see HEADER_ALIASES for the names accepted).
 */
export function parsePunchCsv(text: string): { rows: PunchImportRow[]; problems: PunchImportProblem[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { rows: [], problems: [{ row: 0, message: "The file is empty." }] };
  const header = splitCsvLine(lines[0]).map((h) => HEADER_ALIASES[h.toLowerCase()] ?? null);
  const need: (keyof PunchImportRow)[] = ["employeeNumber", "punchedAt", "punchType"];
  const missing = need.filter((k) => !header.includes(k));
  if (missing.length > 0) {
    return {
      rows: [],
      problems: [{ row: 0, message: "The header must name the employee number, the date and time, and the punch type (for example: employee_number,date_time,type)." }],
    };
  }
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const r: PunchImportRow = { employeeNumber: "", punchedAt: "", punchType: "" };
    header.forEach((k, i) => { if (k) r[k] = cells[i] ?? ""; });
    return r;
  });
  return { rows, problems: [] };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function importPunches(
  tenantId: string,
  rows: PunchImportRow[],
  now: Date = new Date(),
): Promise<PunchImportResult> {
  if (rows.length === 0) return { ok: false, problems: [{ row: 0, message: "There are no punches to import." }] };
  if (rows.length > MAX_IMPORT_ROWS) {
    return { ok: false, problems: [{ row: 0, message: `At most ${MAX_IMPORT_ROWS} punches per import.` }] };
  }

  return withTenant(tenantId, async (tx: TenantTx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: {
        timezone: true, timekeepingTimezoneMode: true,
        nsdWindowStart: true, nsdWindowEnd: true, breakDeductAfterMinutes: true,
      },
    });
    const numbers = [...new Set(rows.map((r) => r.employeeNumber.trim()).filter(Boolean))];
    const employees = await tx.employee.findMany({
      where: { tenantId, deletedAt: null, employeeNumber: { in: numbers } },
      select: { id: true, employeeNumber: true, shiftScheduleId: true, timezone: true },
    });
    const byNumber = new Map(employees.map((e) => [e.employeeNumber, e]));

    const problems: PunchImportProblem[] = [];
    type Good = { employeeId: string; punchType: "IN" | "OUT"; at: Date; day: Date; tz: string; shiftScheduleId: string | null };
    const good: Good[] = [];
    rows.forEach((r, i) => {
      const row = i + 1;
      const emp = byNumber.get(r.employeeNumber.trim());
      if (!emp) { problems.push({ row, message: `No employee numbered "${r.employeeNumber}".` }); return; }
      const type = punchTypeOf(r.punchType);
      if (!type) { problems.push({ row, message: `"${r.punchType}" is not IN or OUT.` }); return; }
      const tz = resolveTimezone(
        { timezone: tenant?.timezone ?? "Asia/Manila", timekeepingTimezoneMode: tenant?.timekeepingTimezoneMode ?? "COMPANY" },
        { timezone: emp.timezone },
      );
      const at = punchInstant(r.punchedAt, tz);
      if (!at) { problems.push({ row, message: `"${r.punchedAt}" is not a date and time (use YYYY-MM-DD HH:mm).` }); return; }
      if (at.getTime() > now.getTime()) { problems.push({ row, message: `${r.punchedAt} is in the future.` }); return; }
      good.push({ employeeId: emp.id, punchType: type, at, day: localDay(at, tz), tz, shiftScheduleId: emp.shiftScheduleId });
    });
    if (problems.length > 0) return { ok: false as const, problems };

    // Approved or locked days are never changed by an import.
    const dayKeys = new Map<string, Good>();
    for (const g of good) dayKeys.set(`${g.employeeId}|${ymd(g.day)}`, g);
    const dtrs = await tx.dTRRecord.findMany({
      where: {
        tenantId,
        OR: [...dayKeys.values()].map((g) => ({ employeeId: g.employeeId, date: g.day })),
      },
      select: { employeeId: true, date: true, isLocked: true, approvalStatus: true },
    });
    const numberOf = new Map(employees.map((e) => [e.id, e.employeeNumber]));
    for (const d of dtrs) {
      if (d.isLocked || d.approvalStatus === "APPROVED") {
        problems.push({
          row: 0,
          message: `${numberOf.get(d.employeeId)} on ${ymd(d.date)}: the DTR is ${d.isLocked ? "locked (its payroll is finalized)" : "already approved"}, so its punches cannot be changed.`,
        });
      }
    }
    if (problems.length > 0) return { ok: false as const, problems };

    // Skip punches already in Sentire (same employee, minute and type).
    const minuteKey = (employeeId: string, at: Date, type: string) =>
      `${employeeId}|${Math.floor(at.getTime() / 60_000)}|${type}`;
    const times = good.map((g) => g.at.getTime());
    const existing = await tx.attendanceLog.findMany({
      where: {
        tenantId,
        employeeId: { in: [...new Set(good.map((g) => g.employeeId))] },
        punchedAt: { gte: new Date(Math.min(...times) - 60_000), lte: new Date(Math.max(...times) + 60_000) },
      },
      select: { employeeId: true, punchedAt: true, punchType: true },
    });
    const seen = new Set(existing.map((e) => minuteKey(e.employeeId, e.punchedAt, e.punchType)));
    const fresh: Good[] = [];
    let duplicates = 0;
    for (const g of good) {
      const k = minuteKey(g.employeeId, g.at, g.punchType);
      if (seen.has(k)) { duplicates++; continue; }
      seen.add(k);
      fresh.push(g);
    }

    if (fresh.length > 0) {
      await tx.attendanceLog.createMany({
        data: fresh.map((g) => ({
          tenantId, employeeId: g.employeeId, punchType: g.punchType, source: "IMPORT" as const, punchedAt: g.at,
        })),
      });
    }

    // Recompute each affected day exactly as a live punch does.
    const days = new Map<string, Good>();
    for (const g of fresh) days.set(`${g.employeeId}|${ymd(g.day)}`, g);
    for (const g of days.values()) {
      const r = await recomputeDayDtr(tx, {
        tenantId, employeeId: g.employeeId, employeeShiftScheduleId: g.shiftScheduleId,
        punchDate: g.day, tz: g.tz, tenant, now, shiftAsOf: g.day,
      });
      if (!r.ok) throw new Error(`DTR locked during import (${g.employeeId} ${ymd(g.day)})`);
    }

    return {
      ok: true as const,
      imported: fresh.length,
      duplicates,
      daysRecomputed: days.size,
      employees: new Set(fresh.map((g) => g.employeeId)).size,
    };
  });
}
