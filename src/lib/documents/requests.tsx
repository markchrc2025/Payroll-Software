/**
 * Wave C3 (PAY-213): an employee's document request, from filing to the
 * issued PDF (see src/lib/documents/templates.ts).
 *
 * Filing snapshots the company's DOCUMENT approval chain, like leave. A
 * request is decided by the employee assigned to its due step, or by the
 * owner or a role with DOCUMENTS:APPROVE (who may also act over a chain);
 * never by the employee it is for. Approving a template that shows pay also
 * needs PAYROLL:READ. Rejecting needs a reason. The final approval fills the
 * letter from the template and the employee's record and keeps the text; a
 * rejected request issues nothing.
 */
import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { AuthContext } from "@/lib/auth";
import type { TenantTx } from "@/lib/with-tenant";
import { registerFonts } from "@/lib/payslip/pdf-document";
import { snapshotApprovalChain } from "@/lib/approvals/snapshot";
import { callerEmployeeId, holdsApprovePermission, holdsPermission } from "@/lib/approvals/second-party";
import { renderRequest } from "./templates";

export class DocumentRequestRefusal extends Error {
  constructor(message: string, public status: 403 | 404 | 409 | 422 = 422) { super(message); }
}

export async function fileDocumentRequest(tx: TenantTx, p: { tenantId: string; employeeId: string; templateId: string; purpose: string | null }) {
  const t = await tx.documentTemplate.findFirst({ where: { id: p.templateId, tenantId: p.tenantId, deletedAt: null, isActive: true, availableInEss: true } });
  if (!t) throw new DocumentRequestRefusal("That document cannot be requested.", 404);
  const open = await tx.documentRequest.count({ where: { tenantId: p.tenantId, employeeId: p.employeeId, templateId: t.id, status: "PENDING" } });
  if (open) throw new DocumentRequestRefusal(`You already have a pending request for ${t.name}.`, 409);
  const r = await tx.documentRequest.create({ data: { tenantId: p.tenantId, employeeId: p.employeeId, templateId: t.id, purpose: p.purpose?.trim() || null } });
  const chain = await snapshotApprovalChain(tx, { module: "DOCUMENT", entityId: r.id, requesterId: p.employeeId, tenantId: p.tenantId });
  if (chain.activeSteps) return tx.documentRequest.update({ where: { id: r.id }, data: { currentStepIndex: chain.firstStepIndex } });
  return r;
}

export async function decideDocumentRequest(
  tx: TenantTx, auth: AuthContext, id: string,
  decision: "APPROVE" | "REJECT", reason: string | null, now = new Date(),
) {
  const r = await tx.documentRequest.findFirst({ where: { id, tenantId: auth.tenantId }, include: { template: { select: { showsSalary: true, name: true } } } });
  if (!r) throw new DocumentRequestRefusal("Document request not found", 404);
  if (r.status !== "PENDING") throw new DocumentRequestRefusal(`This request is already ${r.status.toLowerCase()}.`, 409);
  const me = await callerEmployeeId(tx, auth);
  if (me === r.employeeId) throw new DocumentRequestRefusal("You cannot decide your own document request.", 403);

  const steps = await tx.approvalStep.findMany({ where: { tenantId: auth.tenantId, module: "DOCUMENT", entityId: id }, orderBy: { stepIndex: "asc" } });
  const due = steps.find((s) => s.status === "PENDING") ?? null;
  const assigned = !!due && !!me && due.approverEmployeeId === me;
  if (!assigned && !(await holdsApprovePermission(tx, auth, "DOCUMENT"))) {
    throw new DocumentRequestRefusal("You do not have permission to decide document requests.", 403);
  }
  if (decision === "REJECT") {
    if (!reason?.trim()) throw new DocumentRequestRefusal("Give the reason for rejecting.");
    if (due) await tx.approvalStep.update({ where: { id: due.id }, data: { status: "REJECTED", actedByUserId: auth.userId, actedAt: now, note: reason.trim() } });
    return tx.documentRequest.update({ where: { id }, data: { status: "REJECTED", decidedByUserId: auth.userId, decidedAt: now, rejectionReason: reason.trim() } });
  }
  if (r.template.showsSalary && !(await holdsPermission(tx, auth, ["PAYROLL", "READ"]))) {
    throw new DocumentRequestRefusal(`${r.template.name} shows pay: only a role that may see pay can approve it.`, 403);
  }
  if (due) {
    await tx.approvalStep.update({ where: { id: due.id }, data: { status: "APPROVED", actedByUserId: auth.userId, actedAt: now, note: reason?.trim() || null } });
    const next = steps.find((s) => s.stepIndex > due.stepIndex && s.status === "PENDING");
    if (next) return tx.documentRequest.update({ where: { id }, data: { currentStepIndex: next.stepIndex } });
  }
  const letter = await renderRequest(tx, auth.tenantId, id);
  return tx.documentRequest.update({
    where: { id },
    data: { status: "APPROVED", decidedByUserId: auth.userId, decidedAt: now, renderedTitle: letter.title, renderedBody: letter.body },
  });
}

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 10.5, color: "#111827", paddingTop: 54, paddingBottom: 54, paddingHorizontal: 64, lineHeight: 1.5 },
  company: { fontSize: 14, fontWeight: 700, textAlign: "center" },
  address: { fontSize: 9, color: "#6B7280", textAlign: "center", marginBottom: 28 },
  title: { fontSize: 13, fontWeight: 700, textAlign: "center", letterSpacing: 1, marginBottom: 24 },
  para: { marginBottom: 12, textAlign: "justify" },
});

/** The issued letter as a PDF. */
export async function documentRequestPdf(tx: TenantTx, tenantId: string, id: string): Promise<{ fileName: string; pdf: Buffer }> {
  const r = await tx.documentRequest.findFirst({ where: { id, tenantId }, include: { employee: { select: { employeeNumber: true } } } });
  if (!r) throw new DocumentRequestRefusal("Document request not found", 404);
  if (r.status !== "APPROVED" || !r.renderedBody) throw new DocumentRequestRefusal("The document is issued once the request is approved.", 409);
  const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, tradeName: true, address: true, city: true, province: true, zipCode: true } });
  const company = t.tradeName?.trim() || t.name;
  const address = [t.address, t.city, t.province, t.zipCode].filter(Boolean).join(", ");
  const paras = r.renderedBody.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  registerFonts();
  const pdf = await renderToBuffer(
    <Document title={`${r.renderedTitle ?? "Document"}: ${r.employee.employeeNumber}`} author={company}>
      <Page size="A4" style={s.page}>
        <Text style={s.company}>{company}</Text>
        {address ? <Text style={s.address}>{address}</Text> : <View style={{ marginBottom: 28 }} />}
        {r.renderedTitle ? <Text style={s.title}>{r.renderedTitle.toUpperCase()}</Text> : null}
        {paras.map((p, i) => <Text key={i} style={s.para}>{p}</Text>)}
      </Page>
    </Document>,
  );
  const fileName = `${(r.renderedTitle ?? "Document").replace(/[^A-Za-z0-9]+/g, "_")}_${r.employee.employeeNumber}.pdf`.replace(/[^A-Za-z0-9_.-]/g, "_");
  return { fileName, pdf };
}
