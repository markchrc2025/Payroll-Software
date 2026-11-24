/**
 * Mark, 24 Nov 2026: "I want the AI Assistant to be removed. Will add it at a
 * later development."
 *   T1  every AI API answers 404 before reading the request or calling a model
 *       (fails on main: they answered 401 or ran).
 *   T2  the sidebar has no AI Assistant item.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getAuthContext: vi.fn(async () => ({ tenantId: "t", userId: "u", systemRole: "SUPER_ADMIN", roleId: null })) }));
vi.mock("@/lib/ess-auth", () => ({ getEssContext: vi.fn(async () => ({ tenantId: "t", employeeId: "e" })) }));
import { POST as chat } from "@/app/api/ai/chat/route";
import { POST as compliance } from "@/app/api/ai/compliance/route";
import { POST as payslipQa } from "@/app/api/ai/payslip-qa/route";
import { POST as anomaly } from "@/app/api/ai/anomaly/route";
import { GET as usage } from "@/app/api/ai/usage/route";
import { POST as essChat } from "@/app/api/ess/ai/chat/route";

const post = () => new NextRequest("http://x/api/ai", { method: "POST", body: JSON.stringify({ message: "hi" }) });

describe("AI removed (24 Nov 2026)", () => {
  it("T1 every AI API answers 404", async () => {
    for (const r of [await chat(post()), await compliance(post()), await payslipQa(post()), await anomaly(post()), await usage(new NextRequest("http://x/api/ai/usage")), await essChat(post())]) {
      expect(r.status).toBe(404);
    }
  });
  it("T2 no AI Assistant in the sidebar", () => {
    const nav = readFileSync("src/components/sidebar-nav.tsx", "utf8");
    expect(nav).not.toContain('href: "/ai"');
    expect(nav).not.toContain("AI Assistant");
  });
});
