/**
 * ESS PIN policy (unit 0.15 Amendment 3, Mark's ruling of 10 Nov 2026).
 *
 * ESS sign-in is employee number + PIN. Employee numbers are not secret, so the
 * PIN is the whole secret: exactly 6 digits, chosen by the employee, and never
 * one of the PINs people guess first. Pure function, shared by the server
 * routes and the ESS screens so both refuse the same PINs with the same words.
 */

export const ESS_PIN_LENGTH = 6;

/** The PINs tried first in any guessing run, beyond the patterns below. */
const COMMON = new Set([
  "123123", "112233", "121212", "123321", "159753", "147258", "258369",
  "696969", "000001", "100000", "102030", "520520", "131313", "142536",
]);

const SEQ_UP = "01234567890";
const SEQ_DOWN = "09876543210";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** The 6-digit forms of a birth date people use as a PIN. */
function birthDateForms(d: Date): string[] {
  const yy = pad2(d.getUTCFullYear() % 100);
  const mm = pad2(d.getUTCMonth() + 1);
  const dd = pad2(d.getUTCDate());
  return [`${mm}${dd}${yy}`, `${dd}${mm}${yy}`, `${yy}${mm}${dd}`, `${d.getUTCFullYear()}${mm}`];
}

/**
 * Why this PIN is refused, in words for the employee, or null when it is fine.
 * `ctx` adds the employee's own birth date and employee number to the refused
 * set when the caller knows them (the server always does).
 */
export function pinProblem(
  pin: string,
  ctx: { birthDate?: Date | null; employeeNumber?: string | null } = {},
): string | null {
  if (!new RegExp(`^\\d{${ESS_PIN_LENGTH}}$`).test(pin)) return `Your PIN must be exactly ${ESS_PIN_LENGTH} digits.`;

  const easy = "That PIN is too easy to guess. Choose a less obvious one.";
  if (/^(\d)\1+$/.test(pin)) return easy; // 111111
  if (SEQ_UP.includes(pin) || SEQ_DOWN.includes(pin)) return easy; // 123456, 654321
  if (/^(\d\d)\1\1$/.test(pin) || /^(\d{3})\1$/.test(pin)) return easy; // 121212, 123123
  if (COMMON.has(pin)) return easy;

  if (ctx.birthDate && birthDateForms(ctx.birthDate).includes(pin)) {
    return "Don't use your birth date as your PIN.";
  }
  const digits = (ctx.employeeNumber ?? "").replace(/\D/g, "");
  if (digits.length >= 4 && (pin.includes(digits) || digits.includes(pin))) {
    return "Don't use your employee number as your PIN.";
  }
  return null;
}
