"use client";

/**
 * ESS forgot password — employees enter their company code + employee ID to
 * request a reset link, which is emailed to the work email on file. The
 * response is always generic (no account enumeration).
 */

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

export default function EssForgotPasswordPage() {
  const [companyCode, setCompanyCode] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyCode.trim() || !employeeNumber.trim()) {
      toast.error("Enter your company code and employee ID.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/ess/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyCode: companyCode.trim(), employeeNumber: employeeNumber.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { toast.error(json?.error ?? "Request failed."); return; }
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
        {sent ? (
          <div className="text-center">
            <p className="text-[15px] font-semibold text-gray-800">Check your email</p>
            <p className="mt-1 text-[13px] text-gray-500">
              If that account exists and has an email on file, we&apos;ve sent a reset link. It expires in 1 hour.
            </p>
            <Link href="/ess/login" className="mt-4 inline-block text-[13px] font-medium text-[#1E3A5F]">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <p className="text-[17px] font-semibold text-gray-800">Reset your password</p>
              <p className="mt-1 text-[13px] text-gray-500">
                Enter your company code and employee ID. We&apos;ll email a reset link to the address on file.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12.5px] font-medium text-gray-700">Company code</label>
              <input value={companyCode} onChange={(e) => setCompanyCode(e.target.value)} placeholder="e.g. DEMOCORP"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] uppercase outline-none focus:border-[#1E3A5F]" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12.5px] font-medium text-gray-700">Employee ID</label>
              <input value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} placeholder="e.g. EMP-0001"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[14px] outline-none focus:border-[#1E3A5F]" />
            </div>
            <button type="submit" disabled={submitting}
              className="w-full rounded-lg bg-[#1E3A5F] py-2.5 text-[14px] font-semibold text-white disabled:opacity-50">
              {submitting ? "Sending…" : "Send reset link"}
            </button>
            <Link href="/ess/login" className="block text-center text-[13px] text-gray-500 hover:text-[#1E3A5F]">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
