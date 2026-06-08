"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Loader2, Shield, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function CentralPortalLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!res || res.error) {
        toast.error("Invalid credentials.");
        return;
      }

      toast.success("Signed in. Redirecting…");
      // Full browser navigation ensures the session cookie is in the
      // very first request to the portal (server components read cookies
      // from the HTTP request; a client-side navigate can race against
      // the Set-Cookie header being committed).
      window.location.href = "/centralportal/dashboard";
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ background: "#0F2340" }}
    >
      <div className="w-full max-w-sm space-y-8 px-6">
        {/* Logo / wordmark */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/10 mb-2">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1
            className="text-2xl font-semibold text-white tracking-tight"
            style={{ fontFamily: "var(--font-fraunces, serif)" }}
          >
            Sentire Central
          </h1>
          <p className="text-sm text-white/50">Administrator access only</p>
        </div>

        {/* Form card */}
        <div
          className="rounded-2xl p-6 space-y-5"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
        >
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-white/70 text-xs uppercase tracking-widest">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="admin@sentire.ph"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-blue-500/50"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-white/70 text-xs uppercase tracking-widest">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-blue-500/50 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full mt-2"
              style={{ background: "#2D6BE4" }}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in to Portal"
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-white/20">
          Sentire Payroll · Central Portal
        </p>
      </div>
    </div>
  );
}
