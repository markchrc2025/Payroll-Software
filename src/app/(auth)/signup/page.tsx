"use client";

/**
 * PAY-74: self-serve sign-up (public). The company is created only when the
 * emailed link is opened (/signup/verify).
 */
import { useState } from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Field = "companyName" | "firstName" | "lastName" | "email" | "phone" | "password";
const CYCLES = [
  { id: "SEMI_MONTHLY", label: "Twice a month (15th and 30th)" },
  { id: "MONTHLY", label: "Once a month" },
  { id: "WEEKLY", label: "Weekly" },
];

export default function SignupPage() {
  const [form, setForm] = useState<Record<Field, string>>({ companyName: "", firstName: "", lastName: "", email: "", phone: "", password: "" });
  const [payrollCycle, setPayrollCycle] = useState("SEMI_MONTHLY");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field | "acceptTerms" | "form", string>>>({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors({});
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, phone: form.phone || null, payrollCycle, acceptTerms }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) { setSentTo(json.data?.email ?? form.email); return; }
      const fe = (json.details?.fieldErrors ?? {}) as Record<string, string[]>;
      setErrors({ ...Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v[0]])), form: Object.keys(fe).length ? undefined : json.error ?? "Something went wrong. Please try again." });
    } catch {
      setErrors({ form: "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const field = (k: Field, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} value={form[k]} onChange={set(k)} disabled={busy} aria-invalid={!!errors[k]} {...props} />
      {errors[k] && <p className="text-xs text-red-600">{errors[k]}</p>}
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="w-full max-w-md">
        <Card className="border-border/60 shadow-lg">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-2xl font-semibold tracking-tight">{sentTo ? "Check your email" : "Create your company"}</CardTitle>
            <CardDescription>
              {sentTo ? "One more step before your company is created." : "Sentire Payroll is free during the beta. Set up takes a few minutes."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sentTo ? (
              <div className="space-y-4 text-center" data-testid="signup-sent">
                <MailCheck className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  We sent a confirmation link to <span className="font-medium text-foreground">{sentTo}</span>. Open it within <strong>24 hours</strong> to create your company.
                </p>
                <p className="text-xs text-muted-foreground">Not there? Check your spam folder, or <button className="underline underline-offset-2 text-foreground" onClick={() => setSentTo(null)}>sign up again</button>.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4" data-testid="signup-form">
                {field("companyName", "Company name", { placeholder: "Registered business name", autoComplete: "organization", required: true })}
                <div className="grid grid-cols-2 gap-3">
                  {field("firstName", "First name", { autoComplete: "given-name", required: true })}
                  {field("lastName", "Last name", { autoComplete: "family-name", required: true })}
                </div>
                {field("email", "Work email", { type: "email", autoComplete: "email", placeholder: "you@company.com", required: true })}
                {field("phone", "Mobile number (optional)", { type: "tel", autoComplete: "tel", placeholder: "09XX XXX XXXX" })}
                {field("password", "Password", { type: "password", autoComplete: "new-password", minLength: 10, required: true })}
                <div className="space-y-1.5">
                  <Label htmlFor="payrollCycle">How often do you pay your employees?</Label>
                  <select id="payrollCycle" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={payrollCycle} onChange={(e) => setPayrollCycle(e.target.value)} disabled={busy}>
                    {CYCLES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-2" data-testid="privacy-notice">
                  <p>
                    We use your name, email and mobile number to create and run your company&apos;s account and to contact you about it. You will enter your employees&apos; data yourself; it is kept for your company only and used only to run your payroll.
                  </p>
                  <label className="flex items-start gap-2 text-foreground">
                    <input type="checkbox" className="mt-0.5" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} disabled={busy} data-testid="accept-terms" />
                    <span>I agree to the use of this information as described, and confirm I may sign up on behalf of this company.</span>
                  </label>
                  {errors.acceptTerms && <p className="text-red-600">{errors.acceptTerms}</p>}
                </div>
                {errors.form && <p className="text-sm text-red-600" data-testid="signup-error">{errors.form}</p>}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? (<><Loader2 className="h-4 w-4 animate-spin" /> Sending</>) : "Create my company"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Already have an account? <Link href="/login" className="underline underline-offset-2 text-foreground">Sign in</Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
