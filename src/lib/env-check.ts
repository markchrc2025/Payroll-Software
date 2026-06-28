/**
 * Critical environment-variable preflight.
 *
 * Several features fail only at the moment they're first exercised if their
 * env var is missing — e.g. ENCRYPTION_KEY isn't needed until the first write
 * of an encrypted field (a bank account / statutory number), so a misconfigured
 * deploy looks healthy until an HR admin clicks "Save employee" and gets a 500.
 *
 * This module checks those vars up-front so the problem surfaces at boot (in the
 * server logs) and via /api/health, instead of as a mystery 500 in the UI.
 */

export interface EnvProblem {
  name: string;
  detail: string;
}

/** Validate critical env vars. Returns the list of problems (empty = healthy). */
export function checkCriticalEnv(): EnvProblem[] {
  const problems: EnvProblem[] = [];

  // DATABASE_URL — required for everything.
  if (!process.env.DATABASE_URL && !process.env.DIRECT_DATABASE_URL) {
    problems.push({
      name: "DATABASE_URL",
      detail: "No database connection string is set.",
    });
  }

  // ENCRYPTION_KEY — AES-256-GCM key for field-level encryption (bank account,
  // statutory numbers). Must decode to exactly 32 bytes of base64.
  const enc = process.env.ENCRYPTION_KEY;
  if (!enc) {
    problems.push({
      name: "ENCRYPTION_KEY",
      detail:
        "Required (32-byte base64). Without it, saving any record with a bank " +
        "account or statutory number fails. Generate: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    });
  } else {
    let len = -1;
    try {
      len = Buffer.from(enc, "base64").length;
    } catch {
      len = -1;
    }
    if (len !== 32) {
      problems.push({
        name: "ENCRYPTION_KEY",
        detail: `Must decode to 32 bytes of base64 (got ${len < 0 ? "invalid base64" : `${len} bytes`}).`,
      });
    }
  }

  // HMAC_KEY is optional — crypto.ts falls back to deriving it from
  // ENCRYPTION_KEY — so it is intentionally not required here.

  return problems;
}

/**
 * Non-blocking configuration warnings — features that degrade gracefully when
 * unset (the app still boots and serves). Reported by /api/health but do NOT
 * mark it unhealthy.
 */
export function checkEnvWarnings(): EnvProblem[] {
  const warnings: EnvProblem[] = [];

  // RESEND_API_KEY — needed to send transactional email (ESS invites, payslip
  // notifications, password resets). Optional: those features fail at send time.
  if (!process.env.RESEND_API_KEY) {
    warnings.push({
      name: "RESEND_API_KEY",
      detail:
        "Not set — outbound email (ESS invites, payslip/reset notifications) will fail.",
    });
  }

  // EMAIL_ASSET_BASE_URL — absolute base for transactional-email images (logo +
  // monoline icons). Mail clients drop relative paths, so the <img> src must be
  // absolute. The assets are bundled at public/email-assets/, so they're served
  // from NEXT_PUBLIC_APP_URL by default — this only warns when there's no
  // resolvable base at all (no explicit override, no R2, no app URL), which
  // would fall back to a hardcoded domain that may not host them.
  if (
    !process.env.EMAIL_ASSET_BASE_URL &&
    !process.env.R2_PUBLIC_URL &&
    !process.env.NEXT_PUBLIC_APP_URL
  ) {
    warnings.push({
      name: "EMAIL_ASSET_BASE_URL",
      detail:
        "No resolvable email-asset base (no EMAIL_ASSET_BASE_URL, R2_PUBLIC_URL, " +
        "or NEXT_PUBLIC_APP_URL) — transactional-email images fall back to a " +
        "hardcoded domain and may render broken. Set NEXT_PUBLIC_APP_URL (assets " +
        "are served from /email-assets) or EMAIL_ASSET_BASE_URL.",
    });
  }

  return warnings;
}

/** Log a clear banner to the server logs when critical env is missing/invalid. */
export function logEnvCheck(): EnvProblem[] {
  const problems = checkCriticalEnv();
  if (problems.length > 0) {
    console.error(
      "\n========================================================\n" +
        "  CONFIGURATION PROBLEM — critical env vars missing/invalid\n" +
        problems.map((p) => `  • ${p.name}: ${p.detail}`).join("\n") +
        "\n  Affected features will fail at runtime until fixed.\n" +
        "========================================================\n",
    );
  }
  const warnings = checkEnvWarnings();
  if (warnings.length > 0) {
    console.warn(
      "[env-check] Optional configuration missing:\n" +
        warnings.map((w) => `  • ${w.name}: ${w.detail}`).join("\n"),
    );
  }
  return problems;
}
