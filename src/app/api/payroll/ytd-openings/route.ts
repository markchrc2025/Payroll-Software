/**
 * /api/payroll/ytd-openings (PAY-144)
 *
 * Year-to-date openings: what an employee was paid earlier in the year before
 * the company used Sentire (PRIOR_PAYROLL), and a previous employer's 2316
 * figures for a transferee (PREVIOUS_EMPLOYER). 13th month, the 90,000
 * exemption, year-end annualization, final pay and the 2316 read them.
 *
 *   GET    ?year=YYYY  every employee employed at some point in the year, with
 *                      their openings and whether they are locked.
 *   PUT    one opening (body: see ytdOpeningInput; amounts in centavos as
 *                      strings). Creates or replaces.
 *   DELETE ?employeeId=&year=&source=  removes one opening.
 *
 * An employee's openings for a year are locked once they have a FINALIZED
 * YEAR_END or FINAL_PAY run in that year (it keeps a copy of what it used).
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { withTenant } from "@/lib/with-tenant";
import { err, ok, unauthorized } from "@/lib/api-response";
import { forbidUnless } from "@/lib/authz/route-permission";
import { getClientIp, writeAuditLog } from "@/lib/audit";
import {
  lockedEmployees,
  openingRow,
  YTD_OPENING_SOURCES,
  ytdOpeningInput,
} from "@/lib/payroll/ytd-openings";

const yearParam = z.coerce.number().int().min(2000).max(2099);

/** Centavo fields of an opening, as strings for JSON. */
const MONEY_FIELDS = [
  "basicPayEarnedCents",
  "thirteenthMonthPaidCents",
  "taxableCompensationCents",
  "withholdingTaxCents",
  "nontaxable13MonthAndBenefitsCents",
  "sssEeCents",
  "philhealthEeCents",
  "pagibigEeCents",
  "otherNontaxableCents",
] as const;

type OpeningRecord = { [K in (typeof MONEY_FIELDS)[number]]: bigint } & {
  source: string;
  previousEmployerName: string | null;
  previousEmployerTin: string | null;
  note: string | null;
  updatedAt: Date;
};

function serialize(o: OpeningRecord) {
  const money = Object.fromEntries(MONEY_FIELDS.map((f) => [f, o[f].toString()]));
  return {
    source: o.source,
    previousEmployerName: o.previousEmployerName,
    previousEmployerTin: o.previousEmployerTin,
    note: o.note,
    updatedAt: o.updatedAt.toISOString(),
    ...money,
  };
}

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "READ"]);
  if (denied) return denied;

  const year = yearParam.safeParse(new URL(req.url).searchParams.get("year"));
  if (!year.success) return err("year must be a year between 2000 and 2099", 400);
  const y = year.data;
  const yearStart = new Date(Date.UTC(y, 0, 1));
  const yearEnd = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));

  const data = await withTenant(auth.tenantId, async (tx) => {
    const employees = await tx.employee.findMany({
      where: {
        tenantId: auth.tenantId,
        deletedAt: null,
        hireDate: { lte: yearEnd },
        OR: [{ lastWorkingDate: null }, { lastWorkingDate: { gte: yearStart } }],
      },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        hireDate: true,
        lastWorkingDate: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    const openings = await tx.employeeYtdOpening.findMany({
      where: { tenantId: auth.tenantId, year: y },
    });
    const locked = await lockedEmployees(tx, auth.tenantId, y);
    return employees.map((e) => {
      const mine = openings.filter((o) => o.employeeId === e.id);
      return {
        employeeId: e.id,
        employeeNumber: e.employeeNumber,
        name: `${e.lastName}, ${e.firstName}`,
        hireDate: e.hireDate.toISOString().slice(0, 10),
        lastWorkingDate: e.lastWorkingDate?.toISOString().slice(0, 10) ?? null,
        locked: locked.has(e.id),
        priorPayroll: mine.find((o) => o.source === "PRIOR_PAYROLL") ? serialize(mine.find((o) => o.source === "PRIOR_PAYROLL")!) : null,
        previousEmployer: mine.find((o) => o.source === "PREVIOUS_EMPLOYER") ? serialize(mine.find((o) => o.source === "PREVIOUS_EMPLOYER")!) : null,
      };
    });
  });
  return ok({ year: y, employees: data });
}

export async function PUT(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "UPDATE"]);
  if (denied) return denied;

  const parsed = ytdOpeningInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "Invalid body", 422, parsed.error.flatten());
  }
  const input = parsed.data;
  const row = openingRow(input);

  const result = await withTenant(auth.tenantId, async (tx) => {
    const employee = await tx.employee.findFirst({
      where: { id: input.employeeId, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) return { error: "Employee not found", status: 404 } as const;
    const locked = await lockedEmployees(tx, auth.tenantId, input.year, [input.employeeId]);
    if (locked.size) {
      return {
        error: `Locked: this employee already has a finalized 13th month or final pay run for ${input.year}, which used these figures.`,
        status: 409,
      } as const;
    }
    const key = {
      tenantId_employeeId_year_source: {
        tenantId: auth.tenantId,
        employeeId: input.employeeId,
        year: input.year,
        source: input.source,
      },
    };
    const before = await tx.employeeYtdOpening.findUnique({ where: key });
    const saved = await tx.employeeYtdOpening.upsert({
      where: key,
      create: {
        tenantId: auth.tenantId,
        employeeId: input.employeeId,
        year: input.year,
        source: input.source,
        ...row,
      },
      update: row,
    });
    return { before, saved } as const;
  });
  if ("error" in result) return err(result.error!, result.status);

  await writeAuditLog({
    tenantId: auth.tenantId,
    actorUserId: auth.userId ?? null,
    action: result.before ? "UPDATE" : "CREATE",
    entity: "EmployeeYtdOpening",
    entityId: result.saved.id,
    changes: {
      employeeId: input.employeeId,
      year: input.year,
      source: input.source,
      before: result.before ? serialize(result.before) : null,
      after: serialize(result.saved),
    },
    ipAddress: getClientIp(req),
  });
  return ok(serialize(result.saved));
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["PAYROLL", "UPDATE"]);
  if (denied) return denied;

  const sp = new URL(req.url).searchParams;
  const q = z
    .object({
      employeeId: z.string().min(1),
      year: yearParam,
      source: z.enum(YTD_OPENING_SOURCES),
    })
    .safeParse({ employeeId: sp.get("employeeId"), year: sp.get("year"), source: sp.get("source") });
  if (!q.success) return err("employeeId, year and source are required", 400);
  const { employeeId, year, source } = q.data;

  const result = await withTenant(auth.tenantId, async (tx) => {
    const locked = await lockedEmployees(tx, auth.tenantId, year, [employeeId]);
    if (locked.size) {
      return { error: `Locked: this employee already has a finalized 13th month or final pay run for ${year}.`, status: 409 } as const;
    }
    const key = { tenantId_employeeId_year_source: { tenantId: auth.tenantId, employeeId, year, source } };
    const before = await tx.employeeYtdOpening.findUnique({ where: key });
    if (!before) return { error: "Opening not found", status: 404 } as const;
    await tx.employeeYtdOpening.delete({ where: key });
    return { before } as const;
  });
  if ("error" in result) return err(result.error!, result.status);

  await writeAuditLog({
    tenantId: auth.tenantId,
    actorUserId: auth.userId ?? null,
    action: "DELETE",
    entity: "EmployeeYtdOpening",
    entityId: result.before.id,
    changes: { employeeId, year, source, before: serialize(result.before) },
    ipAddress: getClientIp(req),
  });
  return ok({ deleted: true });
}
