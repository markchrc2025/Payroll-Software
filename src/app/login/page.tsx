import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SentireLoginScreen from "@/components/sentire-login/SentireLoginScreen";

/** True when a NextAuth callbackUrl points back into the Central Portal. */
function isCentralCallback(cb?: string): boolean {
  if (!cb) return false;
  try {
    // callbackUrl can be relative ("/centralportal/…") or absolute
    // ("https://host/centralportal/…"); read the path either way.
    const path = cb.startsWith("/") ? cb : new URL(cb).pathname;
    return path.startsWith("/centralportal");
  } catch {
    return false;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;

  // Central Portal SSO is a separate sign-in surface from the tenant workspace.
  // NextAuth's signIn page is global (/login), so a failed admin OAuth attempt
  // lands here. Two ways we recognise it as a Central flow and forward it back
  // to /centralportal/login (preserving ?error) so the portals stay distinct:
  //   1. callbackUrl=/centralportal/… (present on some bounces), or
  //   2. the `central_sso_flow` marker cookie set when the admin SSO button is
  //      clicked (covers OAuthCallbackError bounces, which drop the callbackUrl).
  // The cookie path is gated on ?error so a deliberate visit to the tenant
  // /login (no error) is never hijacked while the short-lived cookie lingers.
  // A concurrent tenant SSO attempt (tenant_sso_company present) must not be
  // forwarded to the Central Portal even if a stale central marker lingers —
  // an explicit central callbackUrl still wins.
  const store = await cookies();
  const tenantSsoInFlight = !!store.get("tenant_sso_company")?.value;
  const fromCentralCookie =
    !!error && !tenantSsoInFlight && store.get("central_sso_flow")?.value === "1";
  if (isCentralCallback(callbackUrl) || fromCentralCookie) {
    redirect(`/centralportal/login${error ? `?error=${encodeURIComponent(error)}` : ""}`);
  }

  return (
    <Suspense fallback={null}>
      <SentireLoginScreen mode="tenant" />
    </Suspense>
  );
}
