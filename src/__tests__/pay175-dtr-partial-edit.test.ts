/**
 * PAY-175 (found in the staging chain test, 17 Nov 2026): editing one field
 * of a DTR reset the others. Sending only { otMinutes: 120 } turned Ana's
 * 22 Oct worked minutes from 632 into 0, because the edit schema kept the
 * create schema's defaults.
 *
 *   E1  (T1) an edit that sends one field parses to exactly that field.
 *   E2  a field sent is still checked (negative minutes, unknown status).
 *   E3  the create schema keeps its defaults (a new DTR starts PRESENT, 0).
 */
import { describe, expect, it } from "vitest";
import { createDtrRecordSchema, updateDtrRecordSchema } from "@/lib/validations/dtr";

describe("PAY-175 a DTR edit changes only the fields it sends", () => {
  it("E1 (T1) one field in, one field out", () => {
    expect(updateDtrRecordSchema.parse({ otMinutes: 120 })).toEqual({ otMinutes: 120 });
    expect(updateDtrRecordSchema.parse({ notes: "approved OT" })).toEqual({ notes: "approved OT" });
    expect(updateDtrRecordSchema.parse({})).toEqual({});
  });

  it("E2 what is sent is still checked", () => {
    expect(updateDtrRecordSchema.safeParse({ lateMinutes: -5 }).success).toBe(false);
    expect(updateDtrRecordSchema.safeParse({ dayStatus: "SICK" }).success).toBe(false);
    expect(updateDtrRecordSchema.parse({ dayStatus: "ABSENT" })).toEqual({ dayStatus: "ABSENT" });
  });

  it("E3 a new DTR still starts PRESENT with zero minutes", () => {
    const r = createDtrRecordSchema.parse({ employeeId: "e", date: "2026-10-22" });
    expect(r).toMatchObject({ dayStatus: "PRESENT", workedMinutes: 0, lateMinutes: 0, otMinutes: 0 });
  });
});
