"use client";

import { Suspense } from "react";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function KioskSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [deviceToken, setDeviceToken] = useState("");
  const [pairing, setPairing] = useState(false);

  async function autoPair(token: string) {
    setPairing(true);
    try {
      const res = await fetch("/api/kiosk/info", {
        headers: { Authorization: `Kiosk ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const data = json.data ?? json;
        localStorage.setItem("kiosk_token", token);
        localStorage.setItem("kiosk_requires_selfie", String(!!data.requiresSelfie));
        toast.success("Device paired successfully!");
        router.replace("/remotekiosk");
        return;
      }
      toast.error("Invalid device token in setup link. Please check and try again.");
    } catch {
      toast.error("Network error. Please check your connection.");
    } finally {
      setPairing(false);
    }
  }

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      setDeviceToken(token);
      autoPair(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pairDevice(e: React.FormEvent) {
    e.preventDefault();
    if (!deviceToken.trim()) return;
    setPairing(true);

    try {
      const res = await fetch("/api/kiosk/info", {
        headers: { Authorization: `Kiosk ${deviceToken.trim()}` },
      });

      if (res.status === 401) {
        toast.error("Invalid device token. Please check and try again.");
        return;
      }

      if (res.ok) {
        const json = await res.json();
        const data = json.data ?? json;
        localStorage.setItem("kiosk_token", deviceToken.trim());
        localStorage.setItem("kiosk_requires_selfie", String(!!data.requiresSelfie));
        toast.success("Device paired successfully!");
        router.replace("/remotekiosk");
        return;
      }

      toast.error(`Unexpected response (${res.status}). Please try again.`);
    } catch {
      toast.error("Network error. Please check your connection.");
    } finally {
      setPairing(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Kiosk Setup</h1>
          <p className="text-sm text-gray-500">
            Enter the device token provided by your administrator to pair this terminal.
          </p>
        </div>
        <form onSubmit={pairDevice} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-gray-700">Device Token</Label>
            <Input
              className="border-gray-300 font-mono"
              placeholder="Paste device token…"
              value={deviceToken}
              onChange={(e) => setDeviceToken(e.target.value)}
              required
            />
          </div>
          <Button
            type="submit"
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white"
            disabled={pairing}
          >
            {pairing ? "Pairing…" : "Pair Device"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function KioskSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center px-6">
          <div className="text-gray-500 text-sm">Loading…</div>
        </div>
      }
    >
      <KioskSetupContent />
    </Suspense>
  );
}
