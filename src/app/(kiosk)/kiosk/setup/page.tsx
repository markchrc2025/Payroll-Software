"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function KioskSetupPage() {
  const router = useRouter();
  const [deviceToken, setDeviceToken] = useState("");
  const [pairing, setPairing] = useState(false);

  async function pairDevice(e: React.FormEvent) {
    e.preventDefault();
    if (!deviceToken.trim()) return;
    setPairing(true);

    try {
      // Send an intentionally malformed body — a 422 (not 401) means the token is valid
      const res = await fetch("/api/kiosk/punch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Kiosk ${deviceToken.trim()}`,
        },
        body: JSON.stringify({}), // intentionally invalid — we expect 422
      });

      if (res.status === 401) {
        toast.error("Invalid device token. Please check and try again.");
        return;
      }

      if (res.status === 422 || res.ok) {
        // 422 = token valid, body invalid (expected)
        localStorage.setItem("kiosk_token", deviceToken.trim());
        toast.success("Device paired successfully!");
        router.replace("/kiosk");
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
    <div className="w-full max-w-sm p-4">
      <Card className="bg-gray-900 border-gray-700 text-white">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-sky-400">Kiosk Setup</CardTitle>
          <CardDescription className="text-gray-400">
            Enter the device token provided by your administrator to pair this terminal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={pairDevice} className="space-y-4">
            <div className="space-y-1">
              <Label className="text-gray-300">Device Token</Label>
              <Input
                className="bg-gray-800 border-gray-600 text-white placeholder-gray-500 focus:border-sky-500"
                placeholder="Enter device token..."
                value={deviceToken}
                onChange={(e) => setDeviceToken(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full bg-sky-500 hover:bg-sky-600" disabled={pairing}>
              {pairing ? "Pairing…" : "Pair Device"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
