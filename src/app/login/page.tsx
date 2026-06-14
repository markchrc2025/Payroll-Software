import { Suspense } from "react";
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
  // NextAuth's signIn page is global (/login), so a rejected admin OAuth attempt
  // lands here with callbackUrl=/centralportal/…. Forward it back to the Central
  // Portal login (preserving ?error) so the two portals stay distinct.
  if (isCentralCallback(callbackUrl)) {
    redirect(`/centralportal/login${error ? `?error=${encodeURIComponent(error)}` : ""}`);
  }

  return (
    <Suspense fallback={null}>
      <SentireLoginScreen mode="tenant" />
    </Suspense>
  );
}
