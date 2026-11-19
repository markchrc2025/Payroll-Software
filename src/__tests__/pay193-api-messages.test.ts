/**
 * PAY-193 (found 19 Nov 2026 in the staging ESS test): API messages read
 * wrong to the employee and HR.
 *
 *   M1  (T1) notFound("X") already says "X not found", so no route passes a
 *       text that ends in "not found" (the answer read "OT application not
 *       found not found").
 *   M2  cancelling an approved filing says so in plain words, not
 *       "Cannot cancel a APPROVED application".
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? routeFiles(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("PAY-193 API messages", () => {
  const files = routeFiles("src/app/api");

  it("M1 (T1) no notFound() text repeats 'not found'", () => {
    const bad = files.filter((f) => /notFound\("[^"]*not found"\)/i.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });

  it("M2 cancel refusals name the status in plain words", () => {
    const bad = files.filter((f) => /Cannot cancel a \$\{/.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
    for (const f of ["src/app/api/ess/ot-applications/[id]/cancel/route.ts", "src/app/api/ess/undertime/[id]/cancel/route.ts"])
      expect(readFileSync(f, "utf8")).toMatch(/can no longer be cancelled/);
  });
});
