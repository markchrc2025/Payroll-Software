import { Suspense } from "react";
import SetPasswordForm from "../_shared/SetPasswordForm";

export const dynamic = "force-dynamic";

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordForm mode="invite" />
    </Suspense>
  );
}
