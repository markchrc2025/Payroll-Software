/**
 * Wave G2 (PAY-217): the Annual Salary Statement, a one-page yearly record of
 * an employee's pay by month, from finalized payroll runs only. It is a plain
 * record for the employee and HR (a bank or visa application); the BIR form
 * is the 2316.
 *
 * A run belongs to the month its period ends in. Columns:
 *   Basic          base pay
 *   OT & premiums  overtime, night differential, holiday, rest day and hazard pay
 *   Allowances     taxable allowances
 *   13th & benefits the 13th month and other benefits within the exempt ceiling
 *   Other          the rest of gross (adjustments, non-taxable additions in gross)
 *   Gross          gross compensation (the 2316's total)
 *   SSS, PhilHealth, Pag-IBIG  the employee's shares
 *   Tax            tax withheld
 *   Net            net pay
 */
import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Prisma } from "@prisma/client";
import { registerFonts } from "@/lib/payslip/pdf-document";

type Tx = Prisma.TransactionClient;

import { STATEMENT_COLUMNS, type Statement, type StatementKey, type StatementRow } from "./annual-statement-view";
export { STATEMENT_COLUMNS, type Statement } from "./annual-statement-view";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export async function buildStatement(tx: Tx, tenantId: string, employeeId: string, year: number): Promise<Statement> {
  const e = await tx.employee.findFirst({
    where: { id: employeeId, tenantId },
    select: { id: true, firstName: true, middleName: true, lastName: true, suffix: true, employeeNumber: true, jobTitle: true, position: { select: { title: true } }, statutoryIds: { where: { type: "TIN" }, select: { number: true } } },
  });
  if (!e) throw new Error("Employee not found");
  const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, tradeName: true } });
  const sheets = await tx.payrollSheet.findMany({
    where: { tenantId, employeeId, payrollBook: { status: "FINALIZED", periodEnd: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } } },
    include: { payrollBook: { select: { periodEnd: true } } },
  });
  const sums = Array.from({ length: 12 }, () => Object.fromEntries(STATEMENT_COLUMNS.map(([k]) => [k, 0n])) as Record<StatementKey, bigint>);
  for (const s of sheets) {
    const m = sums[s.payrollBook.periodEnd.getUTCMonth()]!;
    const premiums = s.otPayCents + s.nsdPayCents + s.holidayPayCents + s.restDayPayCents + s.hazardPayCents;
    const known = s.basePayCents + premiums + s.taxableAllowancesCents + s.nontaxable13MonthAndBenefitsCents;
    m.basic += s.basePayCents; m.premiums += premiums; m.allowances += s.taxableAllowancesCents; m.thirteenth += s.nontaxable13MonthAndBenefitsCents;
    m.other += s.grossCompensationCents - known; m.gross += s.grossCompensationCents;
    m.sss += s.sssEeCents; m.philhealth += s.philhealthEeCents; m.pagibig += s.pagibigEeCents; m.tax += s.withholdingTaxCents; m.net += s.netPayCents;
  }
  const out = (label: string, v: Record<StatementKey, bigint>) => ({ month: label, ...Object.fromEntries(STATEMENT_COLUMNS.map(([k]) => [k, v[k].toString()])) }) as StatementRow;
  const total = Object.fromEntries(STATEMENT_COLUMNS.map(([k]) => [k, sums.reduce((a, m) => a + m[k], 0n)])) as Record<StatementKey, bigint>;
  const mi = e.middleName ? ` ${e.middleName.charAt(0).toUpperCase()}.` : "";
  return {
    year, company: t.tradeName?.trim() || t.name,
    employee: { id: e.id, name: `${e.firstName}${mi} ${e.lastName}${e.suffix ? ` ${e.suffix}` : ""}`, number: e.employeeNumber, position: e.position?.title ?? e.jobTitle ?? null, tin: e.statutoryIds[0]?.number ?? null },
    rows: sums.map((m, i) => out(MONTHS[i]!, m)), total: out("Total", total), runs: sheets.length,
  };
}

const peso = (c: string) => (Number(c) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 7.5, color: "#111827", padding: 32 },
  company: { fontSize: 12, fontWeight: 700 },
  title: { fontSize: 11, fontWeight: 700, marginTop: 4, marginBottom: 8 },
  meta: { fontSize: 8, color: "#374151", marginBottom: 10 },
  row: { flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: "#D1D5DB", paddingVertical: 2.5 },
  head: { flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: "#111827", paddingVertical: 3, fontWeight: 700 },
  month: { width: 58 },
  cell: { flex: 1, textAlign: "right" },
  note: { marginTop: 12, fontSize: 7, color: "#6B7280" },
});

export async function statementPdf(st: Statement): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(
    <Document title={`Annual Salary Statement ${st.year}: ${st.employee.number}`} author={st.company}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.company}>{st.company}</Text>
        <Text style={s.title}>ANNUAL SALARY STATEMENT {st.year}</Text>
        <Text style={s.meta}>{st.employee.name} · Employee {st.employee.number}{st.employee.position ? ` · ${st.employee.position}` : ""}{st.employee.tin ? ` · TIN ${st.employee.tin}` : ""}</Text>
        <View style={s.head}><Text style={s.month}>Month</Text>{STATEMENT_COLUMNS.map(([k, l]) => <Text key={k} style={s.cell}>{l}</Text>)}</View>
        {[...st.rows, st.total].map((r) => (
          <View key={r.month} style={r.month === "Total" ? s.head : s.row}>
            <Text style={s.month}>{r.month}</Text>
            {STATEMENT_COLUMNS.map(([k]) => <Text key={k} style={s.cell}>{peso(r[k])}</Text>)}
          </View>
        ))}
        <Text style={s.note}>Amounts in pesos from finalized payroll runs, each in the month its pay period ends. This statement is a record of pay; the BIR Certificate of Compensation Payment and Tax Withheld is Form 2316.</Text>
      </Page>
    </Document>,
  );
}
