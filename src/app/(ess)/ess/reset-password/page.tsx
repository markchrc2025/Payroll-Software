"use client";

/**
 * ESS Forgot PIN: employees land here from the reset email
 * (/ess/reset-password?token=...) and choose a new 6-digit PIN (unit 0.15
 * Amendment 3). This also unlocks an account locked by wrong attempts and
 * removes the optional password; every device is signed out.
 */

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PinSetForm } from "@/components/ess/PinSetForm";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [done, setDone] = useState(false);

  async function submit(pin: string): Promise<boolean> {
    const res = await fetch("/api/ess/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, pin }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) { toast.error(json?.error ?? "Reset failed."); return false; }
    setDone(true);
    toast.success("PIN updated. Sign in with your new PIN.");
    setTimeout(() => router.replace("/ess/login"), 1500);
    return true;
  }

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-[15px] font-semibold text-gray-800">Invalid reset link</p>
        <p className="mt-1 text-[13px] text-gray-500">This link is missing its token. Request a new one from the sign-in page.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center">
        <p className="text-[15px] font-semibold text-emerald-700">PIN updated</p>
        <p className="mt-1 text-[13px] text-gray-500">Redirecting you to sign in…</p>
      </div>
    );
  }

  return (
    <PinSetForm
      title="Choose a new PIN"
      subtitle="Set a new 6-digit PIN for Employee Self-Service. Your old PIN and any password stop working."
      submitLabel="Update PIN"
      busyLabel="Updating…"
      onSubmit={submit}
    />
  );
}

export default function EssResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
        <Suspense fallback={<p className="text-center text-[13px] text-gray-400">Loading…</p>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
