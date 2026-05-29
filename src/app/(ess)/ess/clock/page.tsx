"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type PunchResult = {
  punchType: "IN" | "OUT";
  punchedAt: string;
  geofenceStatus?: string | null;
};

export default function EssClockPage() {
  const router = useRouter();
  const [now, setNow] = useState(new Date());
  const [punching, setPunching] = useState(false);
  const [lastPunch, setLastPunch] = useState<PunchResult | null>(null);
  const clearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-clear success card after 5s
  useEffect(() => {
    if (lastPunch) {
      if (clearRef.current) clearTimeout(clearRef.current);
      clearRef.current = setTimeout(() => setLastPunch(null), 5000);
    }
    return () => { if (clearRef.current) clearTimeout(clearRef.current); };
  }, [lastPunch]);

  function authHeaders() {
    const token = localStorage.getItem("ess_token");
    return { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" };
  }

  const doPunch = useCallback(async (punchType: "IN" | "OUT") => {
    const token = localStorage.getItem("ess_token");
    if (!token) { router.replace("/ess/login"); return; }

    setPunching(true);

    // Try to get geolocation
    let latitude: number | null = null;
    let longitude: number | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }),
      );
      latitude = pos.coords.latitude;
      longitude = pos.coords.longitude;
    } catch {
      // Proceed without location
    }

    try {
      const res = await fetch("/api/ess/clock", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ punchType, latitude, longitude }),
      });
      const data = await res.json();

      if (res.status === 401) {
        localStorage.removeItem("ess_token");
        router.replace("/ess/login");
        return;
      }
      if (res.status === 403) {
        toast.error("Please accept biometric / location consent in your profile.");
        return;
      }
      if (!res.ok) {
        toast.error(data?.message ?? "Clock failed. Try again.");
        return;
      }

      setLastPunch({
        punchType,
        punchedAt: data?.data?.punchedAt ?? new Date().toISOString(),
        geofenceStatus: data?.data?.geofenceStatus ?? null,
      });
      toast.success(`Clocked ${punchType.toLowerCase()} successfully!`);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setPunching(false);
    }
  }, [router]);

  return (
    <div className="p-4 space-y-6 max-w-sm mx-auto">
      <h1 className="text-xl font-bold text-center">Time Clock</h1>

      {/* Live clock */}
      <Card>
        <CardContent className="pt-6 pb-4 text-center">
          <p className="text-4xl font-mono font-bold tracking-tight text-sky-600">
            {now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {now.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </CardContent>
      </Card>

      {/* Punch buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          size="lg"
          className="h-16 text-lg bg-green-500 hover:bg-green-600"
          disabled={punching}
          onClick={() => doPunch("IN")}
        >
          {punching ? "…" : "Clock In"}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-16 text-lg border-2 border-red-400 text-red-500 hover:bg-red-50"
          disabled={punching}
          onClick={() => doPunch("OUT")}
        >
          {punching ? "…" : "Clock Out"}
        </Button>
      </div>

      {/* Success card */}
      {lastPunch && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="pt-4 pb-3 space-y-2">
            <p className="text-sm font-medium text-green-700">
              Clocked {lastPunch.punchType === "IN" ? "in" : "out"} at{" "}
              {new Date(lastPunch.punchedAt).toLocaleTimeString("en-PH")}
            </p>
            {lastPunch.geofenceStatus && (
              <Badge variant={lastPunch.geofenceStatus === "WITHIN" ? "default" : "outline"}>
                Geofence: {lastPunch.geofenceStatus}
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Location note */}
      <p className="text-xs text-muted-foreground text-center">
        Location data is captured for geofencing. Ensure location permissions are enabled.
      </p>
    </div>
  );
}
