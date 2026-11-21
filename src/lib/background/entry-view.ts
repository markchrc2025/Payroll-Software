/**
 * Wave B (PAY-212, decision 7, Mark 21 Nov 2026): an employee adds their own
 * education, experience or training in ESS as a Profile Request; HR approves
 * it before it becomes a record. The request's field is "background.<kind>"
 * and its new value the record as JSON. Shared by the ESS and HR screens.
 */
export const BACKGROUND_FIELDS = {
  "background.education": "Add education",
  "background.experience": "Add work experience",
  "background.training": "Add training",
} as const;
export type BackgroundField = keyof typeof BACKGROUND_FIELDS;
export const isBackgroundField = (f: string): f is BackgroundField => Object.prototype.hasOwnProperty.call(BACKGROUND_FIELDS, f);

/** One line describing a background request, for the request lists. */
export function describeBackground(field: string, newValue: string): string {
  let v: Record<string, unknown> = {};
  try { v = JSON.parse(newValue) as Record<string, unknown>; } catch { return newValue; }
  const s = (k: string) => (typeof v[k] === "string" && v[k] ? String(v[k]) : null);
  const n = (k: string) => (v[k] == null || v[k] === "" ? null : String(v[k]));
  const parts =
    field === "background.education" ? [s("school"), s("degree"), s("fieldOfStudy"), n("startYear") || n("endYear") ? `${n("startYear") ?? "?"} to ${n("endYear") ?? "present"}` : null]
    : field === "background.experience" ? [s("position"), s("companyName") && `at ${s("companyName")}`, s("startDate") ? `${s("startDate")!.slice(0, 10)} to ${s("endDate")?.slice(0, 10) ?? "present"}` : null]
    : [s("title"), s("provider"), s("trainingDate")?.slice(0, 10) ?? null, n("hours") && `${n("hours")} hr`];
  return parts.filter(Boolean).join(", ") || newValue;
}
