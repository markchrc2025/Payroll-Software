"use client";

/**
 * PAY-74: the emailed confirmation link. Creates the company (or shows the one
 * already created) and sends the owner to sign in.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Done = { companyName: string; companyCode: string; email: string };

function Verify() {
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    void (async () => {
      const res = await fetch("/api/signup/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setDone(json.data);
      else setError(json.error ?? "This link is not valid.");
    })();
  }, [token]);

  return (
    <Card className="border-border/60 shadow-lg">
      <CardHeader className="space-y-2 text-center">
        <CardTitle className="text-2xl font-semibold tracking-tight">
          {done ? `${done.companyName} is ready` : error ? "We could not create your company" : "Creating your company"}
        </CardTitle>
        <CardDescription>{done ? "Sign in to finish setting up." : error ? error : "This takes a few seconds."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        {!done && !error && <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />}
        {done && (
          <div data-testid="signup-ready" className="space-y-4">
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
            <p className="text-sm text-muted-foreground">
              Your company code is <span className="font-semibold text-foreground" data-testid="company-code">{done.companyCode}</span>. Your employees use it to sign in to Self-Service. We also emailed it to {done.email}.
            </p>
            <Link href={`/login?email=${encodeURIComponent(done.email)}`}><Button className="w-full">Sign in</Button></Link>
          </div>
        )}
        {error && (
          <div className="space-y-4" data-testid="signup-failed">
            <XCircle className="mx-auto h-10 w-10 text-red-600" />
            <Link href="/signup"><Button variant="outline" className="w-full">Sign up again</Button></Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SignupVerifyPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="w-full max-w-sm">
        <Suspense fallback={null}><Verify /></Suspense>
      </div>
    </div>
  );
}
