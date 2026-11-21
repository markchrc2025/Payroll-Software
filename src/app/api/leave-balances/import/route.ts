/**
 * POST /api/leave-balances/import (PAY-145)
 *
 * Imports opening leave balances from a CSV (multipart field "file"); the
 * columns are in src/lib/leave/balance-import.ts. All or nothing, like the
 * year-to-date openings import: every row is checked first, and if any row is
 * wrong nothing is saved and every problem is listed with its row number.
 *
 * Who: a role with LEAVES:UPDATE, and never for one's own employee record
 * (the rule of PUT /api/employees/[id]/leave-balances, unit 0.22 Am 1 B6).
 *
 * GET returns the template: one row per active employee and active leave
 * type, with the opening balance already on file for the year (?year=YYYY).
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, ok, unauthorized } from "@/lib/api-response";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import { parseCsvString } from "@/lib/utils/csv";
import { callerEmployeeId } from "@/lib/approvals/second-party";
import { csvRowToLeaveBalance, leaveBalanceTemplate, type LeaveBalanceRowInput } from "@/lib/leave/balance-import";

const MAX_ROWS = 10000;
const thisYear = () => new Date().getUTCFullYear();

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["LEAVES", "UPDATE"]);
  if (denied) return denied;
  const y = Number(new URL(req.url).searchParams.get("year") ?? thisYear());
  if (!Number.isInteger(y) || y < 2020 || y > thisYear() + 1) return err("year is out of range", 400);

  const csv = await withTenant(auth.tenantId, async (tx) => {
    const [employees, types, balances] = await Promise.all([
      tx.employee.findMany({
        where: { tenantId: auth.tenantId, deletedAt: null, employmentStatus: { notIn: ["RESIGNED", "TERMINATED", "RETIRED"] } },
        select: { id: true, employeeNumber: true },
        orderBy: { employeeNumber: "asc" },
      }),
      tx.leaveType.findMany({
        where: { tenantId: auth.tenantId, deletedAt: null, isActive: true },
        select: { id: true, code: true },
        orderBy: { code: "asc" },
      }),
      tx.leaveBalance.findMany({ where: { tenantId: auth.tenantId, year: y }, select: { employeeId: true, leaveTypeId: true, openingBalance: true } }),
    ]);
    const have = new Map(balances.map((b) => [`${b.employeeId}|${b.leaveTypeId}`, b.openingBalance.toString()]));
    const rows = employees.flatMap((e) => types.map((t) => ({
      employeeNumber: e.employeeNumber, leaveTypeCode: t.code, openingBalance: have.get(`${e.id}|${t.id}`) ?? "0",
    })));
    return leaveBalanceTemplate(y, rows);
  });
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="leave_opening_balances_${y}.csv"` },
  });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["LEAVES", "UPDATE"]);
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return err("Upload a CSV file in the 'file' field.", 400);

  const { rows, parseErrors } = parseCsvString(await file.text());
  if (parseErrors.length) return err("The CSV could not be read.", 400, { problems: parseErrors });
  if (rows.length === 0) return err("The CSV has no data rows.", 400);
  if (rows.length > MAX_ROWS) return err(`At most ${MAX_ROWS} rows per file.`, 400);

  type Problem = { row: number; employeeNumber: string; errors: string[] };
  type Outcome = { kind: "problems"; problems: Problem[] } | { kind: "saved"; created: number; replaced: number; years: number[] };

  const outcome: Outcome = await withTenant(auth.tenantId, async (tx): Promise<Outcome> => {
    const numbers = [...new Set(rows.map((r) => (r.employee_number ?? "").trim()).filter(Boolean))];
    const [employees, types, self] = await Promise.all([
      tx.employee.findMany({ where: { tenantId: auth.tenantId, deletedAt: null, employeeNumber: { in: numbers } }, select: { id: true, employeeNumber: true } }),
      tx.leaveType.findMany({ where: { tenantId: auth.tenantId, deletedAt: null }, select: { id: true, code: true } }),
      callerEmployeeId(tx, auth),
    ]);
    const empByNumber = new Map(employees.map((e) => [e.employeeNumber, e.id]));
    const typeByCode = new Map(types.map((t) => [t.code.toUpperCase(), t.id]));

    const problems: Problem[] = [];
    const accepted: (LeaveBalanceRowInput & { employeeId: string; leaveTypeId: string })[] = [];
    const seen = new Map<string, number>();
    rows.forEach((r, i) => {
      const rowNo = i + 2;
      const num = (r.employee_number ?? "").trim();
      const res = csvRowToLeaveBalance(r, thisYear());
      if (!res.ok) { problems.push({ row: rowNo, employeeNumber: num, errors: res.errors }); return; }
      const errors: string[] = [];
      const employeeId = empByNumber.get(res.input.employeeNumber);
      const leaveTypeId = typeByCode.get(res.input.leaveTypeCode);
      if (!employeeId) errors.push(`No employee with number ${res.input.employeeNumber}`);
      if (!leaveTypeId) errors.push(`No leave type with code ${res.input.leaveTypeCode}`);
      if (employeeId && self && employeeId === self) errors.push("You cannot set your own leave balance");
      const key = `${employeeId}|${leaveTypeId}|${res.input.year}`;
      if (employeeId && leaveTypeId && seen.has(key)) {
        errors.push(`Duplicate: row ${seen.get(key)} already sets ${res.input.leaveTypeCode} for ${res.input.year}`);
      }
      if (errors.length) { problems.push({ row: rowNo, employeeNumber: num, errors }); return; }
      seen.set(key, rowNo);
      accepted.push({ ...res.input, employeeId: employeeId!, leaveTypeId: leaveTypeId! });
    });
    if (problems.length) return { kind: "problems", problems };

    let created = 0;
    let replaced = 0;
    for (const a of accepted) {
      const where = { employeeId_leaveTypeId_year: { employeeId: a.employeeId, leaveTypeId: a.leaveTypeId, year: a.year } };
      const exists = await tx.leaveBalance.findUnique({ where, select: { id: true } });
      await tx.leaveBalance.upsert({
        where,
        create: { tenantId: auth.tenantId, employeeId: a.employeeId, leaveTypeId: a.leaveTypeId, year: a.year, openingBalance: a.openingBalance },
        update: { openingBalance: a.openingBalance },
      });
      if (exists) replaced++; else created++;
    }
    return { kind: "saved", created, replaced, years: [...new Set(accepted.map((a) => a.year))] };
  });

  if (outcome.kind === "problems") {
    return err(`Nothing was imported: ${outcome.problems.length} row(s) need fixing.`, 422, { problems: outcome.problems });
  }
  await writeAuditLog({
    tenantId: auth.tenantId,
    actorUserId: auth.userId ?? null,
    action: "UPDATE",
    entity: "LeaveBalance",
    entityId: null,
    changes: { import: true, file: file.name, created: outcome.created, replaced: outcome.replaced, years: outcome.years },
    ipAddress: getClientIp(req),
  });
  return ok({ created: outcome.created, replaced: outcome.replaced });
}
