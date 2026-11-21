/**
 * PAY-199 (ruling 5, Mark 20 Nov 2026; blank supplied 21 Nov) against real
 * Postgres: the BIR 2316 on the official layout, with the employee's
 * e-signature.
 *
 *   D1  HR downloads the certificate as a PDF: the official blank (one page,
 *       612 x 936) with the year and the gross written on it (Item 19,
 *       32,600.00) and the name; without an employee the PDF is refused
 *       (fails on main).
 *   D2  ESS: a PNG signature is saved; a file that is not a PNG or JPEG is
 *       refused; the employee's own 2316 carries one image more than HR's
 *       copy without a signature: the signature.
 *   D3  the embedded blank is the file Mark supplied (SHA-256).
 */
import { createHash, randomBytes } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import pg from "pg";

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const sfx = randomBytes(4).toString("hex");
const T = `p199${sfx}`;
const id = (k: string) => `p199${k}${sfx}`;

const auth = vi.hoisted(() => ({ tenantId: "", userId: "", systemRole: "SUPER_ADMIN", roleId: null as string | null }));
const ess = vi.hoisted(() => ({ tenantId: "", employeeId: "" }));
vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => auth) }));
vi.mock("@/lib/ess-auth", () => ({ getEssContext: vi.fn(async () => ess) }));

import { GET as hr } from "@/app/api/payroll/reports/bir/2316/route";
import { GET as mine } from "@/app/api/ess/bir-2316/route";
import { PUT as putSig } from "@/app/api/ess/signature/route";
import { readFileSync } from "node:fs";
import { BIR_2316_BLANK_PATH, BIR_2316_BLANK_SHA256 } from "@/lib/payroll/reports/bir-2316-blank";

/** A small valid PNG (white, one dark stroke). */
function png(w = 60, h = 20) {
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 255);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const hex = (s: string) => Buffer.from(s).toString("hex").toUpperCase();
/** Every stream of the PDF, inflated where it is compressed, as one text. */
function streams(pdf: Buffer): string {
  const out: string[] = [pdf.toString("latin1")];
  let at = 0;
  for (;;) {
    const s = pdf.indexOf("stream", at);
    if (s < 0) break;
    let start = s + 6;
    if (pdf[start] === 0x0d) start++;
    if (pdf[start] === 0x0a) start++;
    const e = pdf.indexOf("endstream", start);
    if (e < 0) break;
    try { out.push(inflateSync(pdf.subarray(start, e)).toString("latin1")); } catch { /* not compressed */ }
    at = e + 9;
  }
  return out.join("\n");
}

describeDb("PAY-199 BIR 2316 PDF (real Postgres)", () => {
  let admin: pg.Client;
  const q = (sql: string, args: unknown[] = []) => admin.query(sql, args);
  /** The blank has its own images (the BIR seal, the barcode); the signature adds one. */
  const images = (t: string) => (t.match(/\/Subtype\s*\/Image/g) ?? []).length;
  let imagesWithout = 0;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: DB });
    await admin.connect();
    auth.tenantId = T; ess.tenantId = T; ess.employeeId = id("ana");
    await q(`INSERT INTO "Tenant" (id, name, "companyCode", "updatedAt") VALUES ($1, 'Tala Foods', $2, now())`, [T, `P199${sfx}`.toUpperCase()]);
    await q(`INSERT INTO "Employee" (id, "tenantId", "employeeNumber", "firstName", "lastName", "hireDate", "updatedAt") VALUES ($1, $2, 'A-1', 'Ana', 'Cruz', '2024-01-08', now())`, [id("ana"), T]);
    await q(`INSERT INTO "PayrollBook" (id, "tenantId", "periodStart", "periodEnd", cycle, "runType", status, "updatedAt") VALUES ($1, $2, '2026-01-01', '2026-01-15', 'SEMI_MONTHLY', 'REGULAR', 'FINALIZED', now())`, [id("b"), T]);
    await q(`INSERT INTO "PayrollSheet" (id, "tenantId", "payrollBookId", "employeeId", "taxClassificationSnapshot", "payFrequencySnapshot",
         "salaryTypeSnapshot", "basicSalaryCentsSnapshot", "workingDaysDenominatorSnapshot", "statutoryDeductedSnapshot",
         "basePayCents", "grossCompensationCents", "nontaxableCompensationCents", "grossTaxableIncomeCents", "withholdingTaxCents",
         "sssEeCents", "philhealthEeCents", "pagibigEeCents", "netPayCents", "payComponentsApplied", "loanPaymentsApplied", "periodInputSnapshot", "statutoryBreakdown", "updatedAt")
       VALUES ($1, $2, $3, $4, 'REGULAR', 'SEMI_MONTHLY', 'MONTHLY', 6520000, 261, true, 3260000, 3260000, 0, 3260000, 150000, 0, 0, 0, 3110000, '[]', '[]', '{}', '{}', now())`,
      [id("s"), T, id("b"), id("ana")]);
  });

  afterAll(async () => {
    if (!admin) return;
    await new Promise((r) => setTimeout(r, 500));
    await q(`ALTER TABLE "PayrollSheet" DISABLE TRIGGER USER`);
    await q(`ALTER TABLE "PayrollBook" DISABLE TRIGGER USER`);
    await q(`DELETE FROM "PayrollSheet" WHERE "tenantId" = $1`, [T]);
    await q(`DELETE FROM "PayrollBook" WHERE "tenantId" = $1`, [T]);
    await q(`ALTER TABLE "PayrollSheet" ENABLE TRIGGER USER`);
    await q(`ALTER TABLE "PayrollBook" ENABLE TRIGGER USER`);
    for (const t of ["EmployeeSignature", "AuditLog", "Employee"]) await q(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]).catch(() => undefined);
    await q(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
    await admin.end();
  });

  it("D1 HR gets the official PDF", async () => {
    const res = await hr(new NextRequest(`http://x/api/payroll/reports/bir/2316?year=2026&employeeId=${id("ana")}&format=pdf`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const bytes = Buffer.from(await res.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 936 });
    const text = streams(bytes);
    expect(text).toContain(hex("32,600.00"));
    expect(text).toContain(hex("Cruz, Ana"));
    imagesWithout = images(text);
    expect((await hr(new NextRequest("http://x/api/payroll/reports/bir/2316?year=2026&format=pdf"))).status).toBe(400);
  });

  it("D2 the employee's signature on their own 2316", async () => {
    const bad = new FormData(); bad.set("file", new File([Buffer.from("not an image")], "sig.png", { type: "image/png" }));
    expect((await putSig(new NextRequest("http://x", { method: "PUT", body: bad }))).status).toBe(422);
    const good = new FormData(); good.set("file", new File([png()], "sig.png", { type: "image/png" }));
    expect((await putSig(new NextRequest("http://x", { method: "PUT", body: good }))).status).toBe(200);
    const res = await mine(new NextRequest("http://x/api/ess/bir-2316?year=2026"));
    expect(res.status).toBe(200);
    expect(images(streams(Buffer.from(await res.arrayBuffer())))).toBe(imagesWithout + 1);
    expect((await mine(new NextRequest("http://x/api/ess/bir-2316?year=2025"))).status).toBe(404);
  });

  it("D3 the blank is the file Mark supplied", () => {
    expect(createHash("sha256").update(readFileSync(BIR_2316_BLANK_PATH)).digest("hex")).toBe(BIR_2316_BLANK_SHA256);
    expect(BIR_2316_BLANK_SHA256).toBe("8e927e65b096d7a786ba7d36c55c28ee3de3546278880d9de8c11a91d1b48d60");
  });
});
