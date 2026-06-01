"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LogOut, UserCircle, ClipboardList, Fingerprint } from "lucide-react";
import Link from "next/link";

interface EssProfile {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  email: string | null;
}

interface ConsentRecord {
  id: string;
  type: string;
  granted: boolean;
  policyVersion: string;
  grantedAt: string;
  revokedAt: string | null;
}

const CONSENT_LABELS: Record<string, { label: string; description: string }> = {
  GEOLOCATION: {
    label: "Location (Geofencing)",
    description: "Allow the app to capture your location when clocking in/out.",
  },
  BIOMETRIC_SELFIE: {
    label: "Biometric / Selfie",
    description: "Allow the app to use face recognition for clock-in verification.",
  },
  DATA_PROCESSING: {
    label: "Data Processing",
    description: "Allow processing of your personal data for payroll purposes.",
  },
};

const POLICY_VERSION = "v2026-01";
const REQUIRED_CONSENT_TYPES = Object.keys(CONSENT_LABELS);

function authHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("ess_token") : "";
  return { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" };
}

export default function EssProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<EssProfile | null>(null);
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Kiosk PIN dialog
  const [kioskPinOpen, setKioskPinOpen] = useState(false);
  const [kioskPin, setKioskPin] = useState("");
  const [kioskPinConfirm, setKioskPinConfirm] = useState("");
  const [savingKioskPin, setSavingKioskPin] = useState(false);

  const loadData = useCallback(async () => {
    const token = localStorage.getItem("ess_token");
    if (!token) { router.replace("/ess/login"); return; }

    setLoading(true);
    try {
      const [profileRes, consentRes] = await Promise.all([
        fetch("/api/ess/profile", { headers: authHeaders() }),
        fetch("/api/ess/consent", { headers: authHeaders() }),
      ]);

      if (profileRes.status === 401) {
        localStorage.removeItem("ess_token");
        router.replace("/ess/login");
        return;
      }

      const profileData = await profileRes.json();
      setProfile(profileData?.data ?? null);

      const consentData = await consentRes.json();
      const records: ConsentRecord[] = consentData?.data ?? [];

      // Build a map of type → currently granted (most recent non-revoked record)
      const map: Record<string, boolean> = {};
      for (const type of REQUIRED_CONSENT_TYPES) {
        const active = records.find((r) => r.type === type && r.granted && !r.revokedAt);
        map[type] = !!active;
      }
      setConsents(map);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleConsentToggle(type: string, granted: boolean) {
    setSaving(type);
    try {
      const res = await fetch("/api/ess/consent", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ type, granted, policyVersion: POLICY_VERSION }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to update consent");
        return;
      }
      setConsents((prev) => ({ ...prev, [type]: granted }));
      toast.success(granted ? "Consent granted" : "Consent revoked");
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(null);
    }
  }

  function handleLogout() {
    localStorage.removeItem("ess_token");
    router.replace("/ess/login");
  }

  async function handleSaveKioskPin(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(kioskPin)) { toast.error("PIN must be exactly 6 digits"); return; }
    if (kioskPin !== kioskPinConfirm) { toast.error("PINs do not match"); return; }
    setSavingKioskPin(true);
    try {
      const res = await fetch("/api/ess/kiosk-pin", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ pin: kioskPin }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.error ?? "Failed to set PIN"); return; }
      toast.success("Kiosk PIN set successfully");
      setKioskPinOpen(false);
      setKioskPin(""); setKioskPinConfirm("");
    } catch { toast.error("Network error"); }
    finally { setSavingKioskPin(false); }
  }

  return (
    <div className="p-4 lg:p-8 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl lg:text-2xl font-bold lg:text-left text-center py-3 lg:py-0">My Profile</h1>

      {/* Profile info */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <div className="p-2 rounded-full bg-sky-50 text-sky-500">
            <UserCircle className="h-6 w-6" />
          </div>
          <div>
            {loading ? (
              <Skeleton className="h-5 w-40" />
            ) : (
              <>
                <CardTitle className="text-base">
                  {profile?.firstName} {profile?.lastName}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{profile?.employeeNumber}</p>
              </>
            )}
          </div>
        </CardHeader>
        {!loading && profile?.email && (
          <CardContent>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
          </CardContent>
        )}
      </Card>

      {/* Consent toggles */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Privacy &amp; Consent</CardTitle>
          <p className="text-xs text-muted-foreground">
            Required for clocking in/out with geofencing. Policy {POLICY_VERSION}.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading
            ? REQUIRED_CONSENT_TYPES.map((t) => (
                <div key={t} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-6 w-10 rounded-full" />
                </div>
              ))
            : REQUIRED_CONSENT_TYPES.map((type) => {
                const meta = CONSENT_LABELS[type];
                return (
                  <div key={type} className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <Label htmlFor={`consent-${type}`} className="font-medium text-sm">
                        {meta.label}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                    </div>
                    <Checkbox
                      id={`consent-${type}`}
                      checked={consents[type] ?? false}
                      disabled={saving === type}
                      onCheckedChange={(checked) => handleConsentToggle(type, !!checked)}
                    />
                  </div>
                );
              })}
        </CardContent>
      </Card>

      {/* Update Requests link */}
      <Link href="/ess/profile/update-requests">
        <div className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
          <div className="p-2 rounded-full bg-sky-50 text-sky-500">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Request Info Change</p>
            <p className="text-xs text-muted-foreground">Update name, address, bank account, and more</p>
          </div>
        </div>
      </Link>

      {/* Kiosk PIN */}
      <div
        className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={() => setKioskPinOpen(true)}
      >
        <div className="p-2 rounded-full bg-indigo-50 text-indigo-500">
          <Fingerprint className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">Set Kiosk PIN</p>
          <p className="text-xs text-muted-foreground">4–8 digit PIN used at the time &amp; attendance kiosk terminal</p>
        </div>
      </div>

      {/* Kiosk PIN dialog */}
      <Dialog open={kioskPinOpen} onOpenChange={setKioskPinOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Kiosk PIN</DialogTitle>
            <DialogDescription>
              This PIN is used to clock in/out at the shared kiosk terminal. Keep it private.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveKioskPin} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>New PIN (6 digits)</Label>
              <Input
                type="password"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="Enter PIN"
                value={kioskPin}
                onChange={(e) => setKioskPin(e.target.value.replace(/\D/g, ""))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="Confirm PIN"
                value={kioskPinConfirm}
                onChange={(e) => setKioskPinConfirm(e.target.value.replace(/\D/g, ""))}
                required
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setKioskPinOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingKioskPin} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {savingKioskPin ? "Saving…" : "Save PIN"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Log out */}
      <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50" onClick={handleLogout}>
        <LogOut className="h-4 w-4 mr-2" />
        Sign Out
      </Button>
    </div>
  );
}
