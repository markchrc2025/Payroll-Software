/**
 * PAY-188 (ESS sandbox test, 18 Nov 2026): "Download payslip (PDF)" in ESS
 * opened a hand-built print pop-up, not the payslip PDF. Nothing was
 * downloaded, a blocked pop-up gave nothing at all, and the pop-up left out
 * lines (Ana's ₱2,450.00 non-taxable pay was missing).
 *
 *   D1  (T1) both ESS payslip screens download the real PDF from
 *       /api/ess/payslips/<run>/pdf; the print pop-up is gone.
 *   D2  the download sends the employee's token and saves the file under the
 *       name the server gives.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadPayslipPdf } from "@/components/ess/api";

describe("PAY-188 ESS payslip download is the real PDF", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("D1 (T1) both screens use the PDF download, not a print pop-up", () => {
    for (const f of ["src/components/ess/screens.tsx", "src/components/ess/desktop-screens.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/printPayslip|window\.open\(/);
      expect(src, f).toMatch(/downloadPayslipPdf\(/);
    }
  });

  it("D2 sends the token and saves the server's file name", async () => {
    const clicked: { href: string; download: string }[] = [];
    const anchor = { href: "", download: "", click() { clicked.push({ href: this.href, download: this.download }); }, remove() {} };
    const fetchMock = vi.fn(async () => new Response(new Blob(["%PDF-1.7"]), {
      status: 200,
      headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="Payslip_EMP-0001_2026-11-01_2026-11-15.pdf"' },
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", { getItem: () => "tok123" });
    vi.stubGlobal("window", { location: { replace() {} } });
    vi.stubGlobal("document", { createElement: () => anchor, body: { appendChild() {} } });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL() {} }));
    await downloadPayslipPdf("book1");
    expect(fetchMock).toHaveBeenCalledWith("/api/ess/payslips/book1/pdf", { headers: { Authorization: "Bearer tok123" } });
    expect(clicked).toEqual([{ href: "blob:x", download: "Payslip_EMP-0001_2026-11-01_2026-11-15.pdf" }]);
  });
});
