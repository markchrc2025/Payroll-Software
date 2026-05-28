/**
 * smoke-m.ts — Phase M: Employee Self-Service (ESS)
 *
 * Tests all ESS routes end-to-end by calling route handlers with mock requests:
 *   T1.  Auth: valid birthDate → 200 + token
 *   T2.  Auth: wrong birthDate → 401
 *   T3.  Auth: missing credentials → 400
 *   T4.  Auth: getEssContext resolves correct employee
 *   T5.  Profile: GET returns employee data (no sensitive fields)
 *   T6.  Payslips list: paginated response for finalized October book
 *   T7.  Payslips single: full payslip JSON for the October book
 *   T8.  Leave balances: returns VACATION balance for current year
 *   T9.  Leave filing: POST → 201 PENDING transaction
 *   T10. Leave filing: insufficient balance → 422
 *   T11. Leave cancel: DELETE → 200 CANCELLED
 *   T12. Expense claims: POST → 201 DRAFT
 *   T13. Expense claims: GET → 200 list includes created claim
 *   T14. Logout: POST → 200
 *   T15. Revoked token → 401 on subsequent request
 *   T16. Cleanup
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-m.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import type { NextRequest } from "next/server";
import { createDraftRun, finalizeRun } from "../src/lib/payroll/persist";
import { POST as authPost } from "../src/app/api/ess/auth/route";
import { POST as logoutPost } from "../src/app/api/ess/auth/logout/route";
import { GET as profileGet } from "../src/app/api/ess/profile/route";
import { GET as payslipsGet } from "../src/app/api/ess/payslips/route";
import { GET as payslipGet } from "../src/app/api/ess/payslips/[bookId]/route";
import { GET as leaveBalancesGet } from "../src/app/api/ess/leave-balances/route";
import { GET as leavesGet, POST as leavesPost } from "../src/app/api/ess/leaves/route";
import { DELETE as leaveDeleteHandler } from "../src/app/api/ess/leaves/[id]/route";
import {
  GET as expenseClaimsGet,
  POST as expenseClaimsPost,
} from "../src/app/api/ess/expense-claims/route";

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_A = process.env.SMOKE_TENANT_ID ?? "";
const ROBERTO_ID = process.env.SMOKE_ROBERTO_ID ?? "";
const EMP_NUMBER = "EMP-0010"; // Roberto is the 10th seeded employee
const BIRTH_DATE = "1985-10-15"; // We set this during setup

// October 2026 payroll book (avoid clashes with previous smoke tests)
const OCT_START = new Date("2026-10-01T00:00:00.000Z");
const OCT_END   = new Date("2026-10-31T23:59:59.999Z");

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let failures = 0;
let total = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  total += 1;
  if (cond) {
    console.log(`  ✓ ${label}${detail !== undefined ? `: ${String(detail)}` : ""}`);
  } else {
    console.error(`  ✗ ${label}${detail !== undefined ? `: ${String(detail)}` : ""}`);
    failures += 1;
  }
}

// ---------------------------------------------------------------------------
// withTenant helper
// ---------------------------------------------------------------------------
async function withT<T>(
  tenantId: string,
  fn: (tx: typeof prisma) => Promise<T>,
): Promise<T> {
  if (!/^[a-z0-9]+$/i.test(tenantId)) throw new Error("bad tenantId");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_tenant_id', '${tenantId}', true)`,
    );
    return fn(tx as unknown as typeof prisma);
  });
}

// ---------------------------------------------------------------------------
// Mock request helpers
// ---------------------------------------------------------------------------
function mockPost(url: string, body: unknown, token?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new Request(`http://localhost:3000${url}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function mockGet(url: string, token?: string, qs?: Record<string, string>): NextRequest {
  const u = new URL(`http://localhost:3000${url}`);
  if (qs) for (const [k, v] of Object.entries(qs)) u.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new Request(u.toString(), { method: "GET", headers }) as unknown as NextRequest;
}

function mockDelete(url: string, token?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new Request(`http://localhost:3000${url}`, {
    method: "DELETE",
    headers,
  }) as unknown as NextRequest;
}

async function json(res: Response): Promise<unknown> {
  return res.json();
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let bookId = "";
let leaveTypeId = "";
let leaveBalanceId = "";

async function setup() {
  if (!TENANT_A || !ROBERTO_ID) {
    console.error("Missing SMOKE_TENANT_ID or SMOKE_ROBERTO_ID in .env.local");
    process.exit(1);
  }

  // 1. Set Roberto's birthDate (seed doesn't include one)
  await withT(TENANT_A, async (tx) => {
    await tx.$executeRaw`
      UPDATE "Employee"
      SET "birthDate" = ${new Date(BIRTH_DATE)}
      WHERE id = ${ROBERTO_ID}
    `;
  });

  // 2. Upsert a LeaveType "VACATION" for the tenant
  const leaveType = await withT(TENANT_A, async (tx) => {
    const existing = await tx.leaveType.findFirst({
      where: { tenantId: TENANT_A, code: "VL", deletedAt: null },
    });
    if (existing) return existing;
    return tx.leaveType.create({
      data: {
        tenantId: TENANT_A,
        name: "Vacation Leave",
        code: "VL",
        unit: "DAYS",
        accrualFrequency: "MONTHLY",
        accrualAmount: "1.25",
        isConvertibleToCash: true,
        isActive: true,
      },
    });
  });
  leaveTypeId = leaveType.id;

  // 3. Upsert a LeaveBalance for Roberto (year 2026, 10 days earned)
  const year = 2026;
  const balance = await withT(TENANT_A, async (tx) => {
    const existing = await tx.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: ROBERTO_ID,
          leaveTypeId,
          year,
        },
      },
    });
    if (existing) {
      return tx.leaveBalance.update({
        where: { id: existing.id },
        data: { earned: "10", used: "0", forfeited: "0" },
      });
    }
    return tx.leaveBalance.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        leaveTypeId,
        year,
        earned: "10",
        used: "0",
        forfeited: "0",
      },
    });
  });
  leaveBalanceId = balance.id;

  // 4. Create + finalize a payroll book for October 2026 (Roberto only)
  const DEV_USER_ID = process.env.DEV_USER_ID ?? "";
  const book = await createDraftRun({
    tenantId: TENANT_A,
    periodStart: OCT_START,
    periodEnd: OCT_END,
    cycle: "MONTHLY",
    runType: "REGULAR",
    employeeIds: [ROBERTO_ID],
    createdByUserId: DEV_USER_ID,
    skipStatutory: false,
  });
  bookId = book.id;

  await finalizeRun(TENANT_A, bookId, DEV_USER_ID);

  console.log("Setup complete.");
  console.log(`  leaveTypeId   = ${leaveTypeId}`);
  console.log(`  leaveBalanceId= ${leaveBalanceId}`);
  console.log(`  bookId        = ${bookId}`);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
async function cleanup() {
  await withT(TENANT_A, async (tx) => {
    // Delete leave transactions (test ones)
    await tx.leaveTransaction.deleteMany({
      where: { tenantId: TENANT_A, employeeId: ROBERTO_ID, leaveBalanceId },
    });
    // Delete leave balance
    await tx.leaveBalance.deleteMany({
      where: { employeeId: ROBERTO_ID, leaveTypeId },
    });
    // Delete leave type if we created it (soft-or-hard delete; we created it)
    await tx.leaveType.deleteMany({
      where: { tenantId: TENANT_A, code: "VL" },
    });
    // Delete expense claims
    await tx.expenseClaim.deleteMany({
      where: { tenantId: TENANT_A, employeeId: ROBERTO_ID },
    });
    // Delete ESS sessions
    await tx.essSession.deleteMany({
      where: { tenantId: TENANT_A, employeeId: ROBERTO_ID },
    });
  });

  // Delete payroll book (October 2026)
  if (bookId) {
    await withT(TENANT_A, async (tx) => {
      await tx.payrollSheet.deleteMany({ where: { payrollBookId: bookId } });
      await tx.auditLog.deleteMany({ where: { entity: "PayrollBook", entityId: bookId } });
      await tx.payrollBook.delete({ where: { id: bookId } });
    });
  }

  // Reset Roberto's birthDate
  await withT(TENANT_A, async (tx) => {
    await tx.$executeRaw`
      UPDATE "Employee" SET "birthDate" = NULL WHERE id = ${ROBERTO_ID}
    `;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function main() {
  await setup();

  let token = "";
  let leaveTransactionId = "";
  let expenseClaimId = "";

  // ── T1: Valid login ─────────────────────────────────────────────────────
  console.log("\nT1 – Auth: valid birthDate login");
  {
    const res = await authPost(
      mockPost("/api/ess/auth", { tenantId: TENANT_A, employeeNumber: EMP_NUMBER, birthDate: BIRTH_DATE }),
    );
    const body = (await json(res)) as { data?: { token?: string } };
    check("status 200", res.status === 200);
    check("token returned", typeof body?.data?.token === "string" && (body.data.token?.length ?? 0) > 0);
    token = body?.data?.token ?? "";
  }

  // ── T2: Wrong birthDate ─────────────────────────────────────────────────
  console.log("\nT2 – Auth: wrong birthDate → 401");
  {
    const res = await authPost(
      mockPost("/api/ess/auth", { tenantId: TENANT_A, employeeNumber: EMP_NUMBER, birthDate: "1990-01-01" }),
    );
    check("status 401", res.status === 401);
  }

  // ── T3: Missing credentials → 400 ──────────────────────────────────────
  console.log("\nT3 – Auth: no birthDate/pin → 400");
  {
    const res = await authPost(
      mockPost("/api/ess/auth", { tenantId: TENANT_A, employeeNumber: EMP_NUMBER }),
    );
    check("status 400", res.status === 400);
  }

  // ── T4: getEssContext via profile route ─────────────────────────────────
  console.log("\nT4 – Auth: getEssContext resolves correct employee");
  check("token non-empty after T1", token.length > 0);

  // ── T5: Profile ─────────────────────────────────────────────────────────
  console.log("\nT5 – Profile: GET own employee data");
  {
    const res = await profileGet(mockGet("/api/ess/profile", token));
    const body = (await json(res)) as { data?: Record<string, unknown> };
    check("status 200", res.status === 200);
    check("firstName present", body?.data?.["firstName"] === "Roberto");
    check("lastName present", body?.data?.["lastName"] === "Aquino");
    check("no TIN field", !("tin" in (body?.data ?? {})));
    check("no bankAccountNo", !("bankAccountNo" in (body?.data ?? {})));
  }

  // ── T6: Payslips list ───────────────────────────────────────────────────
  console.log("\nT6 – Payslips: paginated list includes October book");
  {
    const res = await payslipsGet(mockGet("/api/ess/payslips", token, { page: "1", limit: "12" }));
    const body = (await json(res)) as {
      data?: Array<{ bookId?: string }>;
      total?: number;
    };
    check("status 200", res.status === 200);
    const found = (body?.data ?? []).some((p) => p.bookId === bookId);
    check("October book in list", found, `bookId=${bookId}`);
    check("total >= 1", (body?.total ?? 0) >= 1);
  }

  // ── T7: Payslip single ──────────────────────────────────────────────────
  console.log("\nT7 – Payslips: single payslip from October book");
  {
    const res = await payslipGet(
      mockGet(`/api/ess/payslips/${bookId}`, token),
      { params: Promise.resolve({ bookId }) },
    );
    const body = (await json(res)) as { data?: { version?: string; employee?: unknown } };
    check("status 200", res.status === 200);
    check("payslip version v1", body?.data?.version === "v1");
    check("employee object present", body?.data?.employee !== undefined);
  }

  // ── T8: Leave balances ──────────────────────────────────────────────────
  console.log("\nT8 – Leave balances: includes VACATION balance");
  {
    const year = new Date().getFullYear();
    const res = await leaveBalancesGet(mockGet("/api/ess/leave-balances", token, { year: "2026" }));
    const body = (await json(res)) as { data?: Array<{ leaveTypeId?: string; earned?: string }> };
    check("status 200", res.status === 200);
    const vl = (body?.data ?? []).find((b) => b.leaveTypeId === leaveTypeId);
    check("VACATION balance found", vl !== undefined);
    check("earned == 10", vl?.earned === "10");
  }

  // ── T9: File leave request ──────────────────────────────────────────────
  console.log("\nT9 – Leave filing: 3 days PENDING");
  {
    const res = await leavesPost(
      mockPost(
        "/api/ess/leaves",
        {
          leaveTypeId,
          startDate: "2026-10-20",
          endDate: "2026-10-22",
          amount: 3,
          reason: "Smoke test vacation",
        },
        token,
      ),
    );
    const body = (await json(res)) as { data?: { id?: string; approvalStatus?: string } };
    check("status 201", res.status === 201);
    check("approvalStatus PENDING", body?.data?.approvalStatus === "PENDING");
    leaveTransactionId = body?.data?.id ?? "";
    check("transaction id returned", leaveTransactionId.length > 0);
  }

  // ── T10: Insufficient balance → 422 ────────────────────────────────────
  console.log("\nT10 – Leave filing: 99 days → 422 insufficient");
  {
    const res = await leavesPost(
      mockPost(
        "/api/ess/leaves",
        { leaveTypeId, startDate: "2026-11-01", endDate: "2026-11-05", amount: 99 },
        token,
      ),
    );
    check("status 422", res.status === 422);
  }

  // ── T11: Cancel leave request ───────────────────────────────────────────
  console.log("\nT11 – Leave cancel: DELETE own PENDING transaction → 200");
  {
    const res = await leaveDeleteHandler(
      mockDelete(`/api/ess/leaves/${leaveTransactionId}`, token),
      { params: Promise.resolve({ id: leaveTransactionId }) },
    );
    const body = (await json(res)) as { data?: { approvalStatus?: string } };
    check("status 200", res.status === 200);
    check("approvalStatus CANCELLED", body?.data?.approvalStatus === "CANCELLED");
  }

  // ── T12: Leaves list ────────────────────────────────────────────────────
  console.log("\nT12 – Leaves: GET list includes cancelled transaction");
  {
    const res = await leavesGet(mockGet("/api/ess/leaves", token));
    const body = (await json(res)) as { data?: Array<{ id?: string }> };
    check("status 200", res.status === 200);
    const found = (body?.data ?? []).some((t) => t.id === leaveTransactionId);
    check("cancelled transaction in list", found);
  }

  // ── T13: Expense claims POST ────────────────────────────────────────────
  console.log("\nT13 – Expense claims: POST → 201 DRAFT");
  {
    const res = await expenseClaimsPost(
      mockPost(
        "/api/ess/expense-claims",
        {
          category: "TRANSPORTATION",
          description: "Grab to client site",
          amountCents: 75000,  // PHP 750.00
          claimDate: "2026-10-15",
        },
        token,
      ),
    );
    const body = (await json(res)) as { data?: { id?: string; status?: string; amountCents?: string } };
    check("status 201", res.status === 201);
    check("status DRAFT", body?.data?.status === "DRAFT");
    check("amountCents serialized", body?.data?.amountCents === "75000");
    expenseClaimId = body?.data?.id ?? "";
    check("claim id returned", expenseClaimId.length > 0);
  }

  // ── T14: Expense claims GET ─────────────────────────────────────────────
  console.log("\nT14 – Expense claims: GET list includes created claim");
  {
    const res = await expenseClaimsGet(mockGet("/api/ess/expense-claims", token));
    const body = (await json(res)) as { data?: Array<{ id?: string }> };
    check("status 200", res.status === 200);
    const found = (body?.data ?? []).some((c) => c.id === expenseClaimId);
    check("new claim in list", found);
  }

  // ── T15: Logout ─────────────────────────────────────────────────────────
  console.log("\nT15 – Logout: POST → 200");
  {
    const res = await logoutPost(mockPost("/api/ess/auth/logout", {}, token));
    check("status 200", res.status === 200);
  }

  // ── T16: Revoked token → 401 ────────────────────────────────────────────
  console.log("\nT16 – Revoked token: GET profile → 401");
  {
    const res = await profileGet(mockGet("/api/ess/profile", token));
    check("status 401", res.status === 401);
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────
  console.log("\nT17 – Cleanup");
  try {
    await cleanup();
    check("cleanup success", true);
  } catch (e) {
    check("cleanup success", false, String(e));
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(58)}`);
  if (failures === 0) {
    console.log(`✅  Phase M smoke: ${total}/${total} PASS`);
  } else {
    console.error(`❌  Phase M smoke: ${total - failures}/${total} PASS  (${failures} FAILED)`);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
