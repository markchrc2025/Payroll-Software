/**
 * Holiday scoping.
 *
 * A holiday applies to an employee based on its `scope`:
 *   - COMPANY_WIDE    → every employee.
 *   - BRANCH_SPECIFIC → only employees whose branch is listed in `branchIds`.
 *
 * Area-specific holidays (category = AREA_SPECIFIC) are scoped the same way:
 * the user selects the applicable branches, and region/provinceCity are kept
 * purely as descriptive metadata. This keeps enforcement deterministic without
 * needing a PH region → province → branch mapping table.
 */

export interface ScopableHoliday {
  scope?: string | null;
  /** JSON array of Branch IDs; meaningful only when scope = BRANCH_SPECIFIC. */
  branchIds?: unknown;
}

/**
 * Returns true when `holiday` applies to an employee at `branchId`.
 * A company-wide holiday always applies. A branch-specific holiday applies only
 * when the employee's branch is in its branchIds list.
 */
export function holidayAppliesToBranch(
  holiday: ScopableHoliday,
  branchId: string | null | undefined,
): boolean {
  if (!holiday.scope || holiday.scope === "COMPANY_WIDE") return true;
  if (!branchId) return false;
  const ids = Array.isArray(holiday.branchIds)
    ? holiday.branchIds.filter((x): x is string => typeof x === "string")
    : [];
  return ids.includes(branchId);
}
