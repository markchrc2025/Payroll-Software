"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function EssLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<"birthdate" | "pin">("birthdate");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [pin, setPin] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Resolve tenantId from ?tenant= query param or subdomain
    const fromQuery = searchParams.get("tenant");
    if (fromQuery) {
      setTenantId(fromQuery);
      return;
    }
    // Try subdomain: e.g. "acme.sentire.app" → tenantId = "acme"
    const hostname = window.location.hostname;
    const parts = hostname.split(".");
    if (parts.length >= 3) {
      setTenantId(parts[0]);
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) {
      toast.error("Tenant ID is required. Add ?tenant=<id> to the URL.");
      return;
    }
    setLoading(true);
    const body: Record<string, string> = { tenantId, employeeNumber };
    if (mode === "birthdate") body.birthDate = birthDate;
    else body.pin = pin;

    try {
      const res = await fetch("/api/ess/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.message ?? "Login failed. Check your credentials.");
        return;
      }
      const token = data?.data?.token;
      if (!token) {
        toast.error("Unexpected response from server.");
        return;
      }
      localStorage.setItem("ess_token", token);
      toast.success("Logged in successfully!");
      router.replace("/ess");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-sky-50 to-white p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-sky-600">Sentire ESS</CardTitle>
          <CardDescription>Employee Self-Service Portal</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!searchParams.get("tenant") && (
              <div className="space-y-1">
                <Label>Tenant ID</Label>
                <Input
                  placeholder="e.g. acme"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">Or add ?tenant=xxx to the URL</p>
              </div>
            )}
            <div className="space-y-1">
              <Label>Employee Number</Label>
              <Input
                placeholder="e.g. EMP-00001"
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(e.target.value)}
                required
                autoComplete="username"
              />
            </div>

            {mode === "birthdate" ? (
              <div className="space-y-1">
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  required
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>PIN</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="4–8 digit PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Logging in…" : "Log In"}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              className="text-sm text-sky-600 underline"
              onClick={() => setMode(mode === "birthdate" ? "pin" : "birthdate")}
            >
              {mode === "birthdate" ? "Use PIN instead" : "Use date of birth instead"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
