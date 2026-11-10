"use client";

/**
 * ESS account activation: employees land here from the email invitation
 * (/ess/activate?token=...) and choose their own 6-digit PIN (unit 0.15
 * Amendment 3). On success the account is activated and they go to sign-in.
 */

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PinSetForm } from "@/components/ess/PinSetForm";

function ActivateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [done, setDone] = useState(false);

  async function submit(pin: string): Promise<boolean> {
    const res = await fetch("/api/ess/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, pin }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) { toast.error(json?.error ?? "Activation failed."); return false; }
    setDone(true);
    toast.success("Account activated. Sign in with your employee number and PIN.");
    setTimeout(() => router.replace("/ess/login"), 1500);
    return true;
  }

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-[15px] font-semibold text-gray-800">Invalid activation link</p>
        <p className="mt-1 text-[13px] text-gray-500">This link is missing its token. Ask HR to resend your invite.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center">
        <p className="text-[15px] font-semibold text-emerald-700">Account activated</p>
        <p className="mt-1 text-[13px] text-gray-500">Redirecting you to sign in…</p>
      </div>
    );
  }

  return (
    <PinSetForm
      title="Activate your account"
      subtitle="Choose your own 6-digit PIN. You will use it with your employee number to sign in."
      submitLabel="Activate account"
      busyLabel="Activating…"
      onSubmit={submit}
    />
  );
}

export default function EssActivatePage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
        <Suspense fallback={<p className="text-center text-[13px] text-gray-400">Loading…</p>}>
          <ActivateForm />
        </Suspense>
      </div>
    </div>
  );
}
