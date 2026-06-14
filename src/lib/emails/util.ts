/**
 * Escaping helpers. Every MERGE VARIABLE that originates from user/tenant data
 * (names, company, email, device string, amounts, invoice numbers) must be run
 * through escapeHtml before interpolation; static template copy is written
 * directly. URLs placed in href="" go through escapeAttr.
 */

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** For values interpolated into a double-quoted HTML attribute (e.g. href). */
export function escapeAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
