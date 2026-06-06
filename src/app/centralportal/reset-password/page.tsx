import { Suspense } from "react";
import SetPasswordForm from "../_shared/SetPasswordForm";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordForm mode="reset" />
    </Suspense>
  );
}
