/**
 * Employee reference resolution.
 *
 * The human-facing Employee ID (`employeeNumber`, e.g. "EMP-0001") is the
 * canonical identifier surfaced in URLs and across the app. Internally the
 * CUID `Employee.id` remains the primary key that every related table points
 * at. These helpers let an entry point that receives a URL/path segment accept
 * EITHER the Employee ID or the internal CUID — tenant-scoped — so pages can be
 * addressed by Employee ID while old CUID links keep working.
 *
 * IMPORTANT: once an employee is resolved, downstream operations (FK writes,
 * `update({ where: { id } })`, child-record queries) MUST use the resolved
 * `employee.id` (the CUID), never the raw reference.
 */

/** OR-fragment matching an employee by either its Employee ID or its CUID. */
export function employeeRefOR(ref: string) {
  return [{ employeeNumber: ref }, { id: ref }];
}

/**
 * Full tenant-scoped where-clause resolving `ref` as Employee ID or CUID.
 * Pass `includeDeleted: true` to skip the `deletedAt: null` filter.
 */
export function employeeRefWhere(
  tenantId: string,
  ref: string,
  opts: { includeDeleted?: boolean } = {},
) {
  return {
    tenantId,
    ...(opts.includeDeleted ? {} : { deletedAt: null }),
    OR: employeeRefOR(ref),
  };
}
