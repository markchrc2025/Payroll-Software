/**
 * ESS passkeys (Face ID / fingerprint) are OFF for now: Mark's ruling of
 * 10 Nov 2026 (unit 0.15 Amendment 3). ESS sign-in is employee number + PIN,
 * with an optional password. The passkey code and the stored credentials stay,
 * so turning this back on is this one line plus a test.
 */
export const ESS_PASSKEYS_ENABLED = false;

export const PASSKEYS_OFF_MESSAGE = "Passkey sign-in is turned off. Sign in with your PIN or password.";
