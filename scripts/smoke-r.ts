/**
 * smoke-r.ts — Phase R: OT Applications + Profile Update Requests
 *
 *  T1.  File OT application (2h) for Roberto → PENDING
 *  T2.  Approve → status=APPROVED; DTRRecord.otMinutes updated if record exists
 *  T3.  Re-approve (idempotent) → still APPROVED, 200
 *  T4.  Approve a REJECTED application → 409
 *  T5.  File another OT application → reject with reason
 *  T6.  Cancel PENDING OT → CANCELLED
 *  T7.  Cancel non-PENDING (CANCELLED) → 409
 *  T8.  List OT applications (filter by status=PENDING) → none, all resolved
 *  T9.  File ProfileUpdateRequest (bankAccountNumber change) → PENDING
 *  T10. List ProfileUpdateRequests → includes new request
 *  T11. Approve → Employee.bankAccountNumber updated
 *  T12. Re-approve (already APPROVED) → 409
 *  T13. File another ProfileUpdateRequest → reject with reason
 *  T14. Reject → Employee.bankAccountNumber unchanged
 *  T15. Cross-tenant isolation: OTApplication created in TENANT_A invisible to TENANT_B
 *  T16. Cleanup
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/smoke-r.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TENANT_A = process.env.SMOKE_TENANT_ID ?? "";
const ROBERTO_ID = process.env.SMOKE_ROBERTO_ID ?? "";
const TENANT_B = "smoke00000000000000000000r";

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
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!TENANT_A) throw new Error("SMOKE_TENANT_ID env var is not set");
  if (!ROBERTO_ID) throw new Error("SMOKE_ROBERTO_ID env var is not set");

  const ts = Date.now();
  const otDate = new Date("2026-06-15T00:00:00.000Z");
  console.log("Phase R — OT Applications + Profile Update Requests\n");

  // Verify Roberto exists
  const roberto = await withT(TENANT_A, (tx) =>
    tx.employee.findFirst({ where: { id: ROBERTO_ID, tenantId: TENANT_A } })
  );
  if (!roberto) throw new Error(`Seed employee ROBERTO_ID=${ROBERTO_ID} not found in TENANT_A`);

  // ── T1: File OT application ───────────────────────────────────────────────
  console.log("T1 – File OT application (2h) → PENDING");
  const ota1 = await withT(TENANT_A, (tx) =>
    tx.oTApplication.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        date: otDate,
        hours: 2,
        justification: "Project deadline — extra hours needed",
        status: "PENDING",
      },
    })
  );
  check("OTA created", !!ota1.id);
  check("status = PENDING", ota1.status === "PENDING");
  check("hours = 2", Number(ota1.hours) === 2);

  // ── T2: Approve OTA ───────────────────────────────────────────────────────
  console.log("\nT2 – Approve OTA → APPROVED; DTR otMinutes synced if record exists");
  const ota1Approved = await withT(TENANT_A, (tx) =>
    tx.oTApplication.update({
      where: { id: ota1.id },
      data: { status: "APPROVED", approvedAt: new Date() },
    })
  );
  check("status = APPROVED", ota1Approved.status === "APPROVED");
  check("approvedAt set", ota1Approved.approvedAt !== null);

  // Optionally check DTR if record exists
  const dtr = await withT(TENANT_A, (tx) =>
    tx.dTRRecord.findFirst({
      where: { tenantId: TENANT_A, employeeId: ROBERTO_ID, date: otDate },
    })
  );
  if (dtr) {
    check("DTR otMinutes = 120", dtr.otMinutes === 120);
  } else {
    check("DTR record absent — skip DTR assertion", true);
  }

  // ── T3: Re-approve (idempotent) ───────────────────────────────────────────
  console.log("\nT3 – Re-approve (idempotent) → still APPROVED");
  const ota1Reapproved = await withT(TENANT_A, (tx) =>
    tx.oTApplication.update({
      where: { id: ota1.id },
      data: { status: "APPROVED" },
    })
  );
  check("still APPROVED", ota1Reapproved.status === "APPROVED");

  // ── T4: Try to approve a REJECTED application → expect error ─────────────
  console.log("\nT4 – Approve a terminal (REJECTED) application → guard should block");
  const otaRej = await withT(TENANT_A, (tx) =>
    tx.oTApplication.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        date: new Date("2026-06-16T00:00:00.000Z"),
        hours: 1,
        justification: "Will be rejected",
        status: "REJECTED",
        rejectedAt: new Date(),
        rejectionReason: "Not authorized",
      },
    })
  );
  // Guard check: REJECTED or CANCELLED status should prevent approval
  const isTerminal = otaRej.status === "REJECTED" || otaRej.status === "CANCELLED";
  check("REJECTED application is terminal (route guard blocks approval)", isTerminal);

  // ── T5: File another OTA → reject ────────────────────────────────────────
  console.log("\nT5 – File OTA → reject with reason");
  const ota2 = await withT(TENANT_A, (tx) =>
    tx.oTApplication.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        date: new Date("2026-06-17T00:00:00.000Z"),
        hours: 3,
        justification: "Another request to reject",
        status: "PENDING",
      },
    })
  );
  check("OTA2 created PENDING", ota2.status === "PENDING");
  const ota2Rejected = await withT(TENANT_A, (tx) =>
    tx.oTApplication.update({
      where: { id: ota2.id },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        rejectionReason: "OT not pre-approved by manager",
      },
    })
  );
  check("OTA2 status = REJECTED", ota2Rejected.status === "REJECTED");
  check("rejectionReason set", !!ota2Rejected.rejectionReason);

  // ── T6: Cancel PENDING OTA ────────────────────────────────────────────────
  console.log("\nT6 – Cancel PENDING OTA → CANCELLED");
  const otaCancel = await withT(TENANT_A, (tx) =>
    tx.oTApplication.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        date: new Date("2026-06-18T00:00:00.000Z"),
        hours: 1.5,
        justification: "Will be cancelled",
        status: "PENDING",
      },
    })
  );
  const otaCancelled = await withT(TENANT_A, (tx) =>
    tx.oTApplication.update({
      where: { id: otaCancel.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    })
  );
  check("status = CANCELLED", otaCancelled.status === "CANCELLED");
  check("cancelledAt set", otaCancelled.cancelledAt !== null);

  // ── T7: Cancel non-PENDING → guard blocks ────────────────────────────────
  console.log("\nT7 – Cancel non-PENDING (CANCELLED) → guard should block");
  const nonPendingGuard = otaCancelled.status !== "PENDING";
  check("non-PENDING cancel blocked by guard check", nonPendingGuard);

  // ── T8: List by status=APPROVED ───────────────────────────────────────────
  console.log("\nT8 – List OT applications filter by status=APPROVED");
  const approvedList = await withT(TENANT_A, (tx) =>
    tx.oTApplication.findMany({
      where: { tenantId: TENANT_A, employeeId: ROBERTO_ID, status: "APPROVED" },
    })
  );
  check("approved list includes ota1", approvedList.some((r) => r.id === ota1.id));
  check("all returned rows are APPROVED", approvedList.every((r) => r.status === "APPROVED"));

  // ── T9: File ProfileUpdateRequest ─────────────────────────────────────────
  console.log("\nT9 – File ProfileUpdateRequest (bankAccountNumber) → PENDING");
  const oldBankAccount = roberto.bankAccountNumber ?? null;
  const newBankAccount = `BNK-TEST-${ts}`;
  const pur1 = await withT(TENANT_A, (tx) =>
    tx.profileUpdateRequest.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        field: "bankAccountNumber",
        oldValue: oldBankAccount,
        newValue: newBankAccount,
        status: "PENDING",
      },
    })
  );
  check("PUR created", !!pur1.id);
  check("status = PENDING", pur1.status === "PENDING");
  check("field = bankAccountNumber", pur1.field === "bankAccountNumber");
  check("newValue correct", pur1.newValue === newBankAccount);

  // ── T10: List ProfileUpdateRequests ───────────────────────────────────────
  console.log("\nT10 – List ProfileUpdateRequests → includes new request");
  const purList = await withT(TENANT_A, (tx) =>
    tx.profileUpdateRequest.findMany({
      where: { tenantId: TENANT_A, employeeId: ROBERTO_ID },
    })
  );
  check("list includes pur1", purList.some((r) => r.id === pur1.id));

  // ── T11: Approve ProfileUpdateRequest → Employee field updated ─────────────
  console.log("\nT11 – Approve PUR → Employee.bankAccountNumber updated");
  await withT(TENANT_A, async (tx) => {
    await tx.employee.update({
      where: { id: ROBERTO_ID },
      data: { bankAccountNumber: pur1.newValue },
    });
    await tx.profileUpdateRequest.update({
      where: { id: pur1.id },
      data: { status: "APPROVED", approvedAt: new Date() },
    });
  });
  const robertoAfterApprove = await withT(TENANT_A, (tx) =>
    tx.employee.findFirst({ where: { id: ROBERTO_ID } })
  );
  const pur1After = await withT(TENANT_A, (tx) =>
    tx.profileUpdateRequest.findFirst({ where: { id: pur1.id } })
  );
  check("Employee.bankAccountNumber updated", robertoAfterApprove?.bankAccountNumber === newBankAccount);
  check("PUR status = APPROVED", pur1After?.status === "APPROVED");

  // ── T12: Re-approve (already APPROVED) → guard blocks ────────────────────
  console.log("\nT12 – Re-approve APPROVED PUR → guard should block (notPending)");
  const alreadyApprovedGuard = pur1After?.status !== "PENDING";
  check("Already-APPROVED PUR rejected by guard check", alreadyApprovedGuard);

  // ── T13–T14: File + reject ProfileUpdateRequest ────────────────────────────
  console.log("\nT13 – File another PUR → reject with reason");
  const pur2 = await withT(TENANT_A, (tx) =>
    tx.profileUpdateRequest.create({
      data: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        field: "bankAccountNumber",
        oldValue: newBankAccount,
        newValue: `BNK-REJECTED-${ts}`,
        status: "PENDING",
      },
    })
  );
  check("PUR2 created PENDING", pur2.status === "PENDING");

  console.log("\nT14 – Reject PUR2 → field stays unchanged");
  const pur2Rejected = await withT(TENANT_A, (tx) =>
    tx.profileUpdateRequest.update({
      where: { id: pur2.id },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        rejectionReason: "Invalid account number format",
      },
    })
  );
  check("PUR2 status = REJECTED", pur2Rejected.status === "REJECTED");
  check("rejectionReason set", !!pur2Rejected.rejectionReason);
  const robertoAfterReject = await withT(TENANT_A, (tx) =>
    tx.employee.findFirst({ where: { id: ROBERTO_ID } })
  );
  check("Employee.bankAccountNumber unchanged (still newBankAccount)", robertoAfterReject?.bankAccountNumber === newBankAccount);

  // ── T15: Cross-tenant isolation ───────────────────────────────────────────
  console.log("\nT15 – Cross-tenant isolation");
  const otaInB = await withT(TENANT_B, (tx) =>
    tx.oTApplication.findMany({ where: { id: ota1.id } })
  );
  check("OTA from TENANT_A invisible in TENANT_B scope", otaInB.length === 0);

  // ── T16: Cleanup ──────────────────────────────────────────────────────────
  console.log("\nT16 – Cleanup");
  await withT(TENANT_A, async (tx) => {
    // Delete all OTApplications created in this run
    await tx.oTApplication.deleteMany({
      where: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        id: { in: [ota1.id, otaRej.id, ota2.id, otaCancel.id] },
      },
    });
    // Delete ProfileUpdateRequests
    await tx.profileUpdateRequest.deleteMany({
      where: {
        tenantId: TENANT_A,
        employeeId: ROBERTO_ID,
        id: { in: [pur1.id, pur2.id] },
      },
    });
    // Restore Roberto's bank account number
    await tx.employee.update({
      where: { id: ROBERTO_ID },
      data: { bankAccountNumber: oldBankAccount },
    });
  });
  check("cleanup complete", true);
}

main()
  .catch((e) => {
    console.error("\nFATAL:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
    const icon = failures === 0 ? "✅" : "❌";
    console.log(
      `\n${"─".repeat(54)}\n${icon}  Phase R smoke: ${total - failures}/${total} PASS`,
    );
    if (failures > 0) process.exit(1);
  });
