/**
 * Surface labels — the only thing that distinguishes the four audiences in the
 * shared header band. Each surface also fixes the support address shown in the
 * footer (and used as the Reply-To of the sent message).
 *
 * From the handoff:
 *   SELF-SERVICE / PAYROLL → support@sentire.com
 *   BILLING                → billing@sentire.solutions
 *   CENTRAL                → central-support@sentire.com
 */

export type Surface = "SELF_SERVICE" | "PAYROLL" | "BILLING" | "CENTRAL";

export const SURFACES: Record<Surface, { label: string; support: string }> = {
  // `label` is rendered through CSS text-transform:uppercase in the header.
  SELF_SERVICE: { label: "Self-Service", support: "support@sentire.com" },
  PAYROLL: { label: "Payroll", support: "support@sentire.com" },
  BILLING: { label: "Billing", support: "billing@sentire.solutions" },
  CENTRAL: { label: "Central", support: "central-support@sentire.com" },
};
