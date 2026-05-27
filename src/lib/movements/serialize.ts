/**
 * Map BigInt fields on EmployeeMovement to JSON-safe strings.
 */
import type { EmployeeMovement } from "@prisma/client";
import { centavosToJson } from "@/lib/money";

export function serializeMovement<T extends EmployeeMovement>(m: T) {
  return {
    ...m,
    fromBasicSalaryCents: centavosToJson(m.fromBasicSalaryCents),
    toBasicSalaryCents: centavosToJson(m.toBasicSalaryCents),
  };
}
