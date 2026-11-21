import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const createSchema = z.object({
  name: z.string().trim().min(3).max(120),
  rule: z.enum(["PERCENT", "FIXED", "MIN_WAGE"]),
  /** PERCENT: "5" or "5.25". */
  percent: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/).optional(),
  /** FIXED: pesos, "500" or "500.50". */
  fixedAmount: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/).optional(),
  effectiveDate: date,
  reason: z.string().trim().min(5).max(2000),
  employeeIds: z.array(z.string().min(1)).min(1).max(2000),
}).superRefine((v, ctx) => {
  if (v.rule === "PERCENT" && !v.percent) ctx.addIssue({ code: "custom", path: ["percent"], message: "Enter the percentage" });
  if (v.rule === "FIXED" && !v.fixedAmount) ctx.addIssue({ code: "custom", path: ["fixedAmount"], message: "Enter the amount" });
});
export type CreateBody = z.infer<typeof createSchema>;

const toHundredths = (s: string) => { const [w, f = ""] = s.split("."); return BigInt(w!) * 100n + BigInt((f + "00").slice(0, 2)); };

export function ruleFromBody(v: CreateBody) {
  return {
    rule: v.rule,
    percentBasisPoints: v.rule === "PERCENT" ? Number(toHundredths(v.percent!)) : null,
    fixedCents: v.rule === "FIXED" ? toHundredths(v.fixedAmount!) : null,
  };
}
