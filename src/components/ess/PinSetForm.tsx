"use client";

/**
 * Choose-a-PIN form, shared by the invitation page (/ess/activate) and the
 * Forgot PIN page (/ess/reset-password). Unit 0.15 Amendment 3: the employee
 * picks their own 6-digit PIN; HR never sets or sees it. The PIN policy runs
 * here for quick feedback and again on the server, which also refuses the
 * employee's birth date and employee number.
 */
import { useState } from "react";
import { toast } from "sonner";
import { ESS_PIN_LENGTH, pinProblem } from "@/lib/ess-pin-policy";

const digitsOnly = (v: string) => v.replace(/\D/g, "").slice(0, ESS_PIN_LENGTH);

export function PinSetForm({
  title,
  subtitle,
  submitLabel,
  busyLabel,
  onSubmit,
}: {
  title: string;
  subtitle: string;
  submitLabel: string;
  busyLabel: string;
  /** Resolve true on success; on failure show the server's message and resolve false. */
  onSubmit: (pin: string) => Promise<boolean>;
}) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = pinProblem(pin);
    if (problem) { toast.error(problem); return; }
    if (pin !== confirm) { toast.error("The two PINs do not match."); return; }
    setSubmitting(true);
    try {
      const ok = await onSubmit(pin);
      if (!ok) { setPin(""); setConfirm(""); }
    } finally {
      setSubmitting(false);
    }
  }

  const input =
    "w-full rounded-lg border border-gray-200 px-3 py-2.5 text-center text-[20px] tracking-[0.5em] outline-none focus:border-[#1E3A5F]";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-[17px] font-semibold text-gray-800">{title}</p>
        <p className="mt-1 text-[13px] text-gray-500">{subtitle}</p>
      </div>
      <div className="space-y-1.5">
        <label className="block text-[12.5px] font-medium text-gray-700">New 6-digit PIN</label>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={ESS_PIN_LENGTH}
          value={pin}
          onChange={(e) => setPin(digitsOnly(e.target.value))}
          className={input}
          aria-label="New 6-digit PIN"
        />
      </div>
      <div className="space-y-1.5">
        <label className="block text-[12.5px] font-medium text-gray-700">Type it again</label>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={ESS_PIN_LENGTH}
          value={confirm}
          onChange={(e) => setConfirm(digitsOnly(e.target.value))}
          className={input}
          aria-label="Confirm PIN"
        />
      </div>
      <p className="text-[12px] text-gray-500">
        Avoid easy PINs like 123456 or 111111, your birth date, or your employee number. Never share your PIN, not even with HR.
      </p>
      <button
        type="submit"
        disabled={submitting || pin.length !== ESS_PIN_LENGTH || confirm.length !== ESS_PIN_LENGTH}
        className="w-full rounded-lg bg-[#1E3A5F] py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
      >
        {submitting ? busyLabel : submitLabel}
      </button>
    </form>
  );
}
