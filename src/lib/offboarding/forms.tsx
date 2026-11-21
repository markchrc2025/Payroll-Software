/**
 * PAY-197 part 3: the final pay forms, as PDFs from the case's records.
 *
 *   Certificate of Employment: who, position, from hire to the last working
 *   day. HR issues it; once issued the offboarding portal offers it.
 *   Quitclaim and Release: the final pay received (net of the finalized final
 *   pay run, with its control number) and the release, for the employee to
 *   sign. Only once the final pay run is finalized.
 *
 * Reading taken without a ruling: the wording is a plain template and is not
 * legal advice; the company's counsel should review it before use.
 */
import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Prisma } from "@prisma/client";
import { registerFonts } from "@/lib/payslip/pdf-document";
import { peso } from "@/lib/payslip/pdf-data";

type Tx = Prisma.TransactionClient;

export interface FormFacts {
  company: { name: string; address: string | null };
  employee: { name: string; number: string; position: string | null };
  hireDate: Date;
  lastWorkingDay: Date;
  finalPay: { netCents: bigint; controlNumber: string | null; finalizedAt: Date | null } | null;
  issuedAt: Date;
}

export class FormNotReadyError extends Error {}

const LONG = new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
export const longDate = (d: Date) => LONG.format(d);

export async function loadFormFacts(tx: Tx, tenantId: string, caseId: string, now = new Date()): Promise<FormFacts> {
  const c = await tx.offboardingCase.findFirst({
    where: { id: caseId, tenantId },
    include: { employee: { select: { id: true, firstName: true, middleName: true, lastName: true, suffix: true, employeeNumber: true, hireDate: true, position: { select: { title: true } } } } },
  });
  if (!c) throw new FormNotReadyError("Offboarding case not found");
  const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, tradeName: true, address: true, city: true, province: true, zipCode: true } });
  const sheet = await tx.payrollSheet.findFirst({
    where: { tenantId, employeeId: c.employeeId, payrollBook: { runType: "FINAL_PAY", status: "FINALIZED" } },
    select: { netPayCents: true, controlNumber: true, payrollBook: { select: { finalizedAt: true } } },
    orderBy: { payrollBook: { finalizedAt: "desc" } },
  });
  const e = c.employee;
  const mi = e.middleName ? ` ${e.middleName.charAt(0).toUpperCase()}.` : "";
  return {
    company: { name: t.tradeName?.trim() || t.name, address: [t.address, t.city, t.province, t.zipCode].filter(Boolean).join(", ") || null },
    employee: { name: `${e.firstName}${mi} ${e.lastName}${e.suffix ? ` ${e.suffix}` : ""}`, number: e.employeeNumber, position: e.position?.title ?? null },
    hireDate: e.hireDate,
    lastWorkingDay: c.lastWorkingDay,
    finalPay: sheet ? { netCents: sheet.netPayCents, controlNumber: sheet.controlNumber, finalizedAt: sheet.payrollBook.finalizedAt } : null,
    issuedAt: now,
  };
}

export function coeText(f: FormFacts): string[] {
  return [
    `This is to certify that ${f.employee.name} was employed by ${f.company.name}${f.employee.position ? ` as ${f.employee.position}` : ""} from ${longDate(f.hireDate)} to ${longDate(f.lastWorkingDay)}.`,
    "This certification is issued upon the request of the employee for whatever legal purpose it may serve.",
    `Issued on ${longDate(f.issuedAt)}.`,
  ];
}

export function quitclaimText(f: FormFacts): string[] {
  if (!f.finalPay) throw new FormNotReadyError("The quitclaim is drawn up once the final pay run is finalized.");
  return [
    `I, ${f.employee.name}, of legal age, formerly employed by ${f.company.name}${f.employee.position ? ` as ${f.employee.position}` : ""} from ${longDate(f.hireDate)} to ${longDate(f.lastWorkingDay)}, acknowledge that I have received the amount of ${peso(f.finalPay.netCents)} as my final pay${f.finalPay.controlNumber ? ` (payslip ${f.finalPay.controlNumber})` : ""}, covering my last salary, the proportionate 13th month pay, the cash value of my unused leave credits, and every other benefit due to me under law, company policy and my contract.`,
    `In consideration of that amount, I release and discharge ${f.company.name}, its officers and employees from any and all claims arising from my employment and its end, and I declare that I have no further claim against them.`,
    "I sign this release voluntarily, with full understanding of its contents and their effect, and without force, threat or intimidation.",
  ];
}

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 10.5, color: "#111827", paddingTop: 54, paddingBottom: 54, paddingHorizontal: 64, lineHeight: 1.5 },
  company: { fontSize: 14, fontWeight: 700, textAlign: "center" },
  address: { fontSize: 9, color: "#6B7280", textAlign: "center", marginBottom: 28 },
  title: { fontSize: 13, fontWeight: 700, textAlign: "center", letterSpacing: 1, marginBottom: 24 },
  para: { marginBottom: 12, textAlign: "justify" },
  sign: { marginTop: 48, flexDirection: "row", justifyContent: "space-between" },
  line: { borderTopWidth: 0.8, borderTopColor: "#111827", paddingTop: 3, width: 200, fontSize: 9, textAlign: "center" },
});

function FormPdf({ f, title, paragraphs, signers }: { f: FormFacts; title: string; paragraphs: string[]; signers: string[] }) {
  return (
    <Document title={`${title}: ${f.employee.name}`} author={f.company.name}>
      <Page size="A4" style={s.page}>
        <Text style={s.company}>{f.company.name}</Text>
        {f.company.address ? <Text style={s.address}>{f.company.address}</Text> : <View style={{ marginBottom: 28 }} />}
        <Text style={s.title}>{title.toUpperCase()}</Text>
        {paragraphs.map((p) => <Text key={p} style={s.para}>{p}</Text>)}
        <View style={s.sign}>{signers.map((n) => <Text key={n} style={s.line}>{n}</Text>)}</View>
      </Page>
    </Document>
  );
}

export async function renderCoePdf(f: FormFacts): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<FormPdf f={f} title="Certificate of Employment" paragraphs={coeText(f)} signers={["Authorized signatory, Human Resources"]} />);
}

export async function renderQuitclaimPdf(f: FormFacts): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<FormPdf f={f} title="Quitclaim and Release" paragraphs={quitclaimText(f)} signers={[`${f.employee.name}, signature over printed name and date`, "Witness"]} />);
}

export const formFileName = (kind: "COE" | "Quitclaim", f: FormFacts) => `${kind}_${f.employee.number}.pdf`.replace(/[^A-Za-z0-9_.-]/g, "_");
