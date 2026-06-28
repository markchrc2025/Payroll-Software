"use client";

/**
 * ESS reset password — employees land here from the forgot-password email link
 * (/ess/reset-password?token=...). They set a new password; on success they're
 * sent to the ESS sign-in page.
 */

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { toast.error("Password must be at least 8 characters."); return; }
    if (password !== confirm) { toast.error("Passwords do not match."); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/ess/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { toast.error(json?.error ?? "Reset failed."); return; }
      setDone(true);
      toast.success("Password updated! You can now sign in.");
      setTimeout(() => router.replace("/ess/login"), 1500);
    } finally {
      setSubmitting(false);
    }
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
        <p className="text-[15px] font-semibold text-emerald-700">Password updated</p>
        <p className="mt-1 text-[13px] text-gray-500">Redirecting you to sign in…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-[17px] font-semibold text-gray-800">Choose a new password</p>
        <p className="mt-1 text-[13px] text-gray-500">Set a new password for your Employee Self-Service account.</p>
      </div>
      <div className="space-y-1.5">
        <label className="block text-[12.5px] font-medium text-gray-700">New password</label>
        <input type="password" autoComplete="new-password" placeholder="At least 8 characters"
          value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] outline-none focus:border-[#1E3A5F]" />
      </div>
      <div className="space-y-1.5">
        <label className="block text-[12.5px] font-medium text-gray-700">Confirm password</label>
        <input type="password" autoComplete="new-password" placeholder="Re-enter password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] outline-none focus:border-[#1E3A5F]" />
      </div>
      <button type="submit" disabled={submitting || !password || !confirm}
        className="w-full rounded-lg bg-[#1E3A5F] py-2.5 text-[14px] font-semibold text-white disabled:opacity-50">
        {submitting ? "Updating…" : "Update password"}
      </button>
    </form>
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
