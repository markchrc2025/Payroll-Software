/**
 * PAY-187: the ESS login pre-fills the company code from a tenant's own
 * sub-host of the app (acme.payroll.sentire.solutions -> ACME). It used to take
 * the first label of any host, so the app's own address filled in "PAYROLL"
 * (payroll.sentire.solutions), "PAYROLLSTAGING" on staging and "127" on an IP.
 */
export function companyCodeFromHost(hostname: string, appUrl: string | undefined): string | null {
  const host = hostname.toLowerCase();
  if (!host || host === "localhost" || /^[\d.]+$/.test(host) || host.includes(":")) return null;
  let appHost: string | null = null;
  try {
    appHost = appUrl ? new URL(appUrl).hostname.toLowerCase() : null;
  } catch {
    appHost = null;
  }
  if (!appHost || !host.endsWith(`.${appHost}`)) return null;
  const label = host.slice(0, -(appHost.length + 1));
  if (label.includes(".")) return null;
  const code = label.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code || null;
}
