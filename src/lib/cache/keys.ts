/**
 * Cache key builders and TTL constants.
 */

export const TTL = {
  /** Statutory tables change once a year at most. */
  STATUTORY: 60 * 60 * 24, // 24 h (seconds)
  /** Geofence config is rarely edited. */
  GEOFENCE: 60 * 60, // 1 h
  /** Employee profile snapshot for payroll compute. */
  EMPLOYEE: 60 * 5, // 5 min
  /** Holiday calendar for a given month. */
  HOLIDAYS: 60 * 60 * 6, // 6 h
  /** ESS leave-balance list — short TTL to reflect same-day activity. */
  LEAVE_BALANCE: 60 * 5, // 5 min
  /** Finalized payroll sheet — write-once, never evicted (0 = no expiry). */
  FINALIZED_SHEET: 0,
} as const;

export const CacheKeys = {
  statutory: (tenantId: string, asOf: string) =>
    `statutory:${tenantId}:${asOf}`,

  geofence: (tenantId: string, branchId: string) =>
    `geofence:${tenantId}:${branchId}`,

  employee: (tenantId: string, employeeId: string) =>
    `employee:${tenantId}:${employeeId}`,

  holidays: (tenantId: string, yearMonth: string) =>
    `holidays:${tenantId}:${yearMonth}`,

  leaveBalance: (tenantId: string, employeeId: string, year: number) =>
    `leavebalance:${tenantId}:${employeeId}:${year}`,

  payrollSheet: (tenantId: string, bookId: string, employeeId: string) =>
    `sheet:${tenantId}:${bookId}:${employeeId}`,
} as const;
