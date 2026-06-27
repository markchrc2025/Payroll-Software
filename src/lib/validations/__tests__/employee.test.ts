/**
 * createEmployeeSchema — regression coverage for the "Save employee does
 * nothing" bug.
 *
 * Root cause: optional date fields were `z.coerce.date().optional().nullable()`,
 * which coerces an empty string ("" — what an untouched/cleared <input
 * type="date"> submits) into an Invalid Date and FAILS. Because the wizard
 * calls react-hook-form's handleSubmit with no onInvalid handler, that failure
 * silently no-ops the whole submit. These tests pin the fix: optional dates
 * accept "" / null / undefined as "no date".
 */
import { describe, expect, it } from "vitest";
import { createEmployeeSchema } from "@/lib/validations/employee";

// Minimal payload with only the genuinely-required fields populated.
function base() {
  return {
    firstName: "Maria",
    lastName: "Santos",
    branchId: "branch-1",
    hireDate: "2026-01-01",
    basicSalary: 30000,
  };
}

describe("createEmployeeSchema — optional date handling", () => {
  it("accepts a payload whose optional dates are empty strings", () => {
    const r = createEmployeeSchema.safeParse({
      ...base(),
      birthDate: "",
      regularizationDate: "",
      resignationDate: "",
      lastWorkingDate: "",
      endOfContractDate: "",
      placementEffectiveDate: "",
      termEffectiveDate: "",
      contractStartDate: "",
      contractEndDate: "",
      salaryEffectiveDate: "",
      spouseBirthDate: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      // "" is normalised to null, not an Invalid Date.
      expect(r.data.birthDate).toBeNull();
      expect(r.data.contractEndDate).toBeNull();
    }
  });

  it("accepts omitted optional dates (undefined)", () => {
    const r = createEmployeeSchema.safeParse(base());
    expect(r.success).toBe(true);
  });

  it("coerces a provided date string to a Date", () => {
    const r = createEmployeeSchema.safeParse({ ...base(), birthDate: "1995-06-15" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.birthDate).toBeInstanceOf(Date);
  });

  it("still rejects a genuinely invalid date string", () => {
    const r = createEmployeeSchema.safeParse({ ...base(), birthDate: "not-a-date" });
    expect(r.success).toBe(false);
  });

  it("still requires the mandatory fields", () => {
    const { basicSalary: _omit, ...noSalary } = base();
    void _omit;
    expect(createEmployeeSchema.safeParse(noSalary).success).toBe(false);
    expect(createEmployeeSchema.safeParse({ ...base(), branchId: "" }).success).toBe(false);
  });
});

describe("createEmployeeSchema — foreign-key id handling", () => {
  it("accepts non-cuid-v1 ids (cuid2 / arbitrary db ids) for FK fields", () => {
    // Real Prisma rows may use cuid2-style ids that a strict .cuid() rejected.
    const r = createEmployeeSchema.safeParse({
      ...base(),
      jobTypeId: "tz4a98xxat96iws9zmbrgj3a",
      jobStatusId: "clx0probation0status0001",
      departmentId: "dept-engineering",
    });
    expect(r.success).toBe(true);
  });

  it("treats empty-string FK ids as not set (null)", () => {
    const r = createEmployeeSchema.safeParse({
      ...base(),
      jobTypeId: "",
      jobStatusId: "",
      positionId: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.jobTypeId).toBeNull();
      expect(r.data.jobStatusId).toBeNull();
    }
  });
});
