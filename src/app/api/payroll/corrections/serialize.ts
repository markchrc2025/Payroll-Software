/** PAY-68: a correction for the API (bigints as strings). */
export function serializeCorrection(c: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(c, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}
