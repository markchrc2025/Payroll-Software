import { Suspense } from "react";
import SentireLoginScreen from "@/components/sentire-login/SentireLoginScreen";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <SentireLoginScreen mode="tenant" />
    </Suspense>
  );
}
