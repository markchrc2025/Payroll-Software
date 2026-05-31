"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, LogIn, LogOut as LogOutIcon } from "lucide-react";

type PunchResult = {
  punchType: "IN" | "OUT";
  punchedAt: string;
  outsideGeofence?: boolean;
  distanceMeters?: number | null;
};

type AttendanceLog = {
  id: string;
  punchType: "IN" | "OUT";
  punchedAt: string;
  source: string;
  latitude: string | null;
  longitude: string | null;
  outsideGeofence: boolean;
  distanceMeters: number | null;
};

type CapturedLocation = {
  latitude: number;
  longitude: number;
};

export default function EssClockPage() {
  const router = useRouter();
  const [now, setNow] = useState(new Date());
  const [punching, setPunching] = useState(false);
  const [lastPunch, setLastPunch] = useState<PunchResult | null>(null);
  const [history, setHistory] = useState<AttendanceLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [capturedLocation, setCapturedLocation] = useState<CapturedLocation | null>(null);
  const clearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-clear success card after 8s
  useEffect(() => {
    if (lastPunch) {
      if (clearRef.current) clearTimeout(clearRef.current);
      clearRef.current = setTimeout(() => setLastPunch(null), 8000);
    }
    return () => { if (clearRef.current) clearTimeout(clearRef.current); };
  }, [lastPunch]);

  function authHeaders() {
    const token = localStorage.getItem("ess_token");
    return { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" };
  }

  const loadHistory = useCallback(async () => {
    const token = localStorage.getItem("ess_token");
    if (!token) return;
    setHistoryLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/ess/clock?date=${today}`, { headers: authHeaders() });
      if (res.status === 401) { localStorage.removeItem("ess_token"); router.replace("/ess/login"); return; }
      const data = await res.json();
      setHistory(data?.data ?? []);
    } finally {
      setHistoryLoading(false);
    }
  }, [router]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const doPunch = useCallback(async (punchType: "IN" | "OUT") => {
    const token = localStorage.getItem("ess_token");
    if (!token) { router.replace("/ess/login"); return; }

    setPunching(true);
    setCapturedLocation(null);

    // Try to get geolocation
    let latitude: number | null = null;
    let longitude: number | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }),
      );
      latitude = pos.coords.latitude;
      longitude = pos.coords.longitude;
      setCapturedLocation({ latitude, longitude });
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
        outsideGeofence: data?.data?.outsideGeofence ?? false,
        distanceMeters: data?.data?.distanceMeters ?? null,
      });
      toast.success(`Clocked ${punchType === "IN" ? "in" : "out"} successfully!`);
      loadHistory();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setPunching(false);
    }
  }, [router, loadHistory]);

  return (
    <div className="p-4 space-y-4 max-w-sm mx-auto">
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

      {/* Location preview — shown after a punch captures GPS */}
      {capturedLocation && (
        <Card className="border-sky-200 bg-sky-50">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-sky-500 mt-0.5 shrink-0" />
              <div className="text-xs text-sky-700 space-y-1 flex-1">
                <p className="font-medium">Location captured</p>
                <p>
                  {capturedLocation.latitude.toFixed(6)}, {capturedLocation.longitude.toFixed(6)}
                </p>
                <a
                  href={`https://maps.google.com/?q=${capturedLocation.latitude},${capturedLocation.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-sky-600"
                >
                  View on map ↗
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success card */}
      {lastPunch && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="pt-4 pb-3 space-y-2">
            <p className="text-sm font-medium text-green-700">
              Clocked {lastPunch.punchType === "IN" ? "in" : "out"} at{" "}
              {new Date(lastPunch.punchedAt).toLocaleTimeString("en-PH")}
            </p>
            {lastPunch.outsideGeofence && (
              <Badge variant="outline" className="text-orange-600 border-orange-300">
                Outside geofence
                {lastPunch.distanceMeters != null ? ` (${lastPunch.distanceMeters}m away)` : ""}
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Today's punch history */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold">Today&apos;s Punches</CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          {historyLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">No punches recorded today.</p>
          ) : (
            <div className="space-y-2">
              {history.map((log) => (
                <div key={log.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {log.punchType === "IN"
                      ? <LogIn className="h-4 w-4 text-green-500" />
                      : <LogOutIcon className="h-4 w-4 text-red-400" />
                    }
                    <span className={log.punchType === "IN" ? "text-green-700 font-medium" : "text-red-600 font-medium"}>
                      {log.punchType === "IN" ? "Clock In" : "Clock Out"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <span className="text-muted-foreground text-xs">
                      {new Date(log.punchedAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {log.latitude && log.longitude && (
                      <a
                        href={`https://maps.google.com/?q=${log.latitude},${log.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View location"
                      >
                        <MapPin className="h-3.5 w-3.5 text-sky-400 hover:text-sky-600" />
                      </a>
                    )}
                    {log.outsideGeofence && (
                      <Badge variant="outline" className="text-xs text-orange-500 border-orange-300 px-1 py-0">
                        Outside
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Location data is captured for geofencing. Ensure location permissions are enabled.
      </p>
    </div>
  );
}
