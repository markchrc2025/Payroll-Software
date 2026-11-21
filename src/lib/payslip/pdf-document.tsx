/**
 * The payslip PDF (PAY-139), rendered on the server with @react-pdf/renderer.
 * One renderer for every copy of a payslip: the admin download, the
 * employee's ESS download and the file the payslip.publish job stores.
 *
 * Layout ruled by Mark: PMFTC-style two columns, A4, with a Net Pay box that
 * proves Gross to Net. Data and its guarantees live in pdf-data.ts.
 *
 * Font: Inter (OFL), static TTF instances with the peso sign and tabular
 * digits, built by scripts/fonts/build-payslip-pdf-fonts.py.
 */
import path from "node:path";
import React from "react";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { peso, type PayslipPdfData, type PdfLine } from "@/lib/payslip/pdf-data";

const FONT_DIR = path.join(process.cwd(), "src/lib/payslip/fonts");
let fontsRegistered = false;
export function registerFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(FONT_DIR, "Inter-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "Inter-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Names and labels must never be hyphenated.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const INK = "#111827";
const MUTED = "#6B7280";
const LINE = "#E5E7EB";
const SOFT = "#F9FAFB";
const ACCENT = "#E8693A";
const ACCENT_SOFT = "#FDF0EA";

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 8, color: INK, paddingTop: 30, paddingBottom: 46, paddingHorizontal: 32 },
  row: { flexDirection: "row" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  company: { fontSize: 15, fontWeight: 700 },
  muted: { color: MUTED },
  // PAY-169 (Mark, 17 Nov 2026): the title is centred on the page, just above the line.
  title: { fontSize: 14, fontWeight: 700, color: ACCENT, textAlign: "center", letterSpacing: 0.6, marginTop: 10 },
  metaRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 1.5 },
  metaLabel: { color: MUTED, width: 52, textAlign: "right", marginRight: 6 },
  metaValue: { minWidth: 96 },
  rule: { height: 2, backgroundColor: ACCENT, marginTop: 9, marginBottom: 9 },
  strip: { flexDirection: "row", backgroundColor: SOFT, borderRadius: 4, borderWidth: 0.6, borderColor: LINE, padding: 9, marginBottom: 11 },
  stripCol: { flex: 1, paddingRight: 8 },
  empName: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  kv: { flexDirection: "row", marginTop: 2 },
  kvLabel: { color: MUTED, width: 56 },
  kvValue: { flex: 1 },
  cols: { flexDirection: "row" },
  left: { width: "55%", paddingRight: 9 },
  right: { width: "45%", paddingLeft: 9 },
  section: { fontSize: 6.5, fontWeight: 700, color: MUTED, letterSpacing: 0.6, borderBottomWidth: 0.8, borderBottomColor: INK, paddingBottom: 3, marginBottom: 1, flexDirection: "row" },
  line: { flexDirection: "row", paddingVertical: 2.5, borderBottomWidth: 0.5, borderBottomColor: LINE },
  total: { flexDirection: "row", paddingVertical: 3.5, borderTopWidth: 0.8, borderTopColor: INK, marginBottom: 9 },
  totalLabel: { flex: 1, fontWeight: 700 },
  num: { textAlign: "right" },
  note: { color: MUTED, fontSize: 7, marginTop: -6, marginBottom: 10 },
  none: { color: MUTED, paddingVertical: 3, marginBottom: 8 },
  netBox: { flexDirection: "row", borderWidth: 1, borderColor: ACCENT, borderRadius: 4, backgroundColor: ACCENT_SOFT, padding: 10, marginTop: 2, marginBottom: 11 },
  netCalc: { flex: 1, paddingRight: 14, borderRightWidth: 0.6, borderRightColor: "#F3C4AE" },
  netRow: { flexDirection: "row", paddingVertical: 1.5 },
  netPay: { width: 190, paddingLeft: 14, justifyContent: "center" },
  netLabel: { fontSize: 8, fontWeight: 700, color: ACCENT, letterSpacing: 0.6 },
  netAmount: { fontSize: 20, fontWeight: 700, marginTop: 2 },
  boxes: { flexDirection: "row" },
  box: { flex: 1, borderWidth: 0.6, borderColor: LINE, borderRadius: 4, padding: 8 },
  boxGap: { width: 8 },
  boxRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 5, flexDirection: "row", justifyContent: "space-between", color: MUTED, fontSize: 6.5 },
});

const d = (x: Date) =>
  x.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Manila" });

function Section({ title, detail, amount }: { title: string; detail?: string; amount?: string }) {
  return (
    <View style={s.section}>
      <Text style={{ flex: 1 }}>{title}</Text>
      {amount !== undefined && (
        <>
          <Text style={{ width: 86, textAlign: "right" }}>{detail ?? ""}</Text>
          <Text style={{ width: 64, textAlign: "right" }}>{amount}</Text>
        </>
      )}
    </View>
  );
}

function Lines({ lines, withUnits }: { lines: PdfLine[]; withUnits?: boolean }) {
  return (
    <>
      {lines.map((l, i) => (
        <View key={i} style={s.line} wrap={false}>
          <Text style={{ flex: 1, paddingRight: 4 }}>{l.label}</Text>
          {withUnits && <Text style={[s.num, s.muted, { width: 44 }]}>{l.units ?? ""}</Text>}
          <Text style={[s.num, s.muted, { width: withUnits ? 70 : 86 }]}>{l.rate ?? ""}</Text>
          <Text style={[s.num, { width: 64 }]}>{peso(l.amount)}</Text>
        </View>
      ))}
    </>
  );
}

function Total({ label, amount }: { label: string; amount: bigint }) {
  return (
    <View style={s.total} wrap={false}>
      <Text style={s.totalLabel}>{label}</Text>
      <Text style={[s.num, { fontWeight: 700, width: 90 }]}>{peso(amount)}</Text>
    </View>
  );
}

function KV({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={s.kv}>
      <Text style={s.kvLabel}>{label}</Text>
      <Text style={s.kvValue}>{value ?? "-"}</Text>
    </View>
  );
}

export function PayslipPdf({ data }: { data: PayslipPdfData }) {
  const m = data.meta;
  return (
    <Document title={`Payslip ${data.employee.number} ${d(m.periodStart)} to ${d(m.periodEnd)}`} author={data.company.name} creator="Sentire Payroll">
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={s.company}>{data.company.name}</Text>
            {data.company.address && <Text style={[s.muted, { marginTop: 3, maxWidth: 260 }]}>{data.company.address}</Text>}
          </View>
          <View>
            <View style={s.metaRow}><Text style={s.metaLabel}>Period</Text><Text style={s.metaValue}>{d(m.periodStart)} to {d(m.periodEnd)}</Text></View>
            <View style={s.metaRow}><Text style={s.metaLabel}>Pay run</Text><Text style={s.metaValue}>{m.cycle} · {m.runType}</Text></View>
            <View style={s.metaRow}><Text style={s.metaLabel}>Issued</Text><Text style={s.metaValue}>{m.issuedAt ? d(m.issuedAt) : "-"}</Text></View>
            <View style={s.metaRow}><Text style={s.metaLabel}>Reference</Text><Text style={s.metaValue}>{m.reference}</Text></View>
          </View>
        </View>
        <Text style={s.title}>{data.finalPay ? "FINAL PAY PAYSLIP" : "PAYSLIP"}</Text>
        <View style={[s.rule, { marginTop: 4 }]} />

        {/* Employee strip */}
        <View style={s.strip}>
          <View style={s.stripCol}>
            <Text style={s.empName}>{data.employee.name}</Text>
            <KV label="Employee no." value={data.employee.number} />
            <KV label="Position" value={data.employee.position} />
          </View>
          <View style={s.stripCol}>
            <KV label="Department" value={data.employee.department} />
            <KV label="Branch" value={data.employee.branch} />
            <KV label="Tax status" value={data.employee.taxStatus} />
            <KV label="Pay basis" value={data.employee.payBasis} />
          </View>
          <View style={[s.stripCol, { paddingRight: 0, flex: 0.8 }]}>
            {data.employee.ids.map((x) => <KV key={x.label} label={x.label} value={x.value} />)}
          </View>
        </View>

        {/* PAY-157: the final pay summary */}
        {data.finalPay && (
          <View style={[s.box, { marginTop: 8, marginBottom: 8, flexGrow: 0, flexShrink: 0, flexBasis: "auto" }]} wrap={false}>
            <Section title="FINAL PAY" />
            <View style={{ flexDirection: "row" }}>
              {[data.finalPay.rows.slice(0, 4), data.finalPay.rows.slice(4)].map((col, i) => (
                <View key={i} style={{ flex: 1, paddingRight: i === 0 ? 12 : 0, paddingLeft: i === 1 ? 12 : 0 }}>
                  {col.map((r) => (
                    <View key={r.label} style={s.boxRow}><Text style={s.muted}>{r.label}</Text><Text>{r.value}</Text></View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Two columns */}
        <View style={s.cols}>
          <View style={s.left}>
            <View style={s.section}>
              <Text style={{ flex: 1 }}>EARNINGS</Text>
              <Text style={{ width: 44, textAlign: "right" }}>UNITS</Text>
              <Text style={{ width: 70, textAlign: "right" }}>RATE</Text>
              <Text style={{ width: 64, textAlign: "right" }}>AMOUNT</Text>
            </View>
            <Lines lines={data.earnings} withUnits />
            <Total label="Gross pay" amount={data.gross} />

            <Section title="EMPLOYER SHARE (FOR INFORMATION, NOT DEDUCTED)" />
            {data.employerTotal > 0n ? (
              <>
                <Lines lines={data.employer.filter((l) => l.amount !== 0n)} withUnits />
                <Total label="Total employer share" amount={data.employerTotal} />
              </>
            ) : (
              <Text style={s.none}>None this period</Text>
            )}
          </View>

          <View style={s.right}>
            <Section title="STATUTORY DEDUCTIONS" />
            <Lines lines={data.statutory} />
            <Total label="Total statutory" amount={data.statutoryTotal} />
            {data.statutoryNote && <Text style={s.note}>{data.statutoryNote}</Text>}

            <Section title="OTHER DEDUCTIONS" />
            {data.other.length > 0 ? (
              <>
                <Lines lines={data.other} />
                <Total label="Total other" amount={data.otherTotal} />
              </>
            ) : (
              <Text style={s.none}>None this period</Text>
            )}

            {data.additions.length > 0 && (
              <>
                <Section title="ADDITIONS AFTER TAX (NON-TAXABLE)" />
                <Lines lines={data.additions} />
                <Total label="Total additions" amount={data.additionsTotal} />
              </>
            )}

          </View>
        </View>

        {/* Net Pay box: proves Gross to Net */}
        <View style={s.netBox} wrap={false}>
          <View style={s.netCalc}>
            {data.net.rows.map((r, i) => (
              <View key={i} style={s.netRow}>
                <Text style={{ width: 12, color: MUTED }}>{r.sign === "-" ? "−" : r.sign}</Text>
                <Text style={{ flex: 1 }}>{r.label}</Text>
                <Text style={[s.num, { width: 90 }]}>{peso(r.amount)}</Text>
              </View>
            ))}
            <View style={[s.netRow, { borderTopWidth: 0.8, borderTopColor: INK, marginTop: 2, paddingTop: 3 }]}>
              <Text style={{ width: 12 }}>=</Text>
              <Text style={{ flex: 1, fontWeight: 700 }}>Net pay</Text>
              <Text style={[s.num, { width: 90, fontWeight: 700 }]}>{peso(data.net.netPay)}</Text>
            </View>
          </View>
          <View style={s.netPay}>
            <Text style={s.netLabel}>NET PAY</Text>
            <Text style={s.netAmount}>{peso(data.net.netPay)}</Text>
            {data.bank && <Text style={[s.muted, { marginTop: 3 }]}>Paid to {data.bank}</Text>}
          </View>
        </View>

        {/* YTD · attendance · leave */}
        <View style={s.boxes} wrap={false}>
          <View style={s.box}>
            <Section title="YEAR TO DATE" />
            {data.ytd.map((r) => (
              <View key={r.label} style={s.boxRow}><Text style={s.muted}>{r.label}</Text><Text>{peso(r.amount)}</Text></View>
            ))}
          </View>
          <View style={s.boxGap} />
          <View style={s.box}>
            <Section title="ATTENDANCE THIS PERIOD" />
            {data.attendance.map((r) => (
              <View key={r.label} style={s.boxRow}><Text style={s.muted}>{r.label}</Text><Text>{r.value}</Text></View>
            ))}
          </View>
          <View style={s.boxGap} />
          <View style={s.box}>
            <Section title="LEAVE BALANCES" />
            {data.leave.length > 0 ? (
              data.leave.map((r) => (
                <View key={r.label} style={s.boxRow}><Text style={s.muted}>{r.label}</Text><Text>{r.value}</Text></View>
              ))
            ) : (
              <Text style={s.muted}>No leave balances on file</Text>
            )}
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>System-generated payslip. No signature needed. Confidential: for the named employee only.</Text>
          <Text render={({ pageNumber, totalPages }) => `Sentire Payroll · Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderPayslipPdf(data: PayslipPdfData): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<PayslipPdf data={data} />);
}

/** "Payslip_EMP-0001_2026-11-16_2026-11-30.pdf" ("FinalPay_..." for a final pay). */
export function payslipFileName(data: PayslipPdfData): string {
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return `${data.finalPay ? "FinalPay" : "Payslip"}_${data.employee.number}_${iso(data.meta.periodStart)}_${iso(data.meta.periodEnd)}.pdf`.replace(/[^A-Za-z0-9_.-]/g, "_");
}
