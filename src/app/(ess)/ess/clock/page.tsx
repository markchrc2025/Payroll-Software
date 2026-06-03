"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { MapPin, LogIn, LogOut as LogOutIcon, Camera, RefreshCw, CheckCircle2 } from "lucide-react";

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

// ── Selfie capture state ──────────────────────────────────────────────────

type SelfieStep = "idle" | "opening" | "preview" | "captured";

export default function EssClockPage() {
  const router = useRouter();
  const [now, setNow] = useState(new Date());
  const [punching, setPunching] = useState(false);
  const [lastPunch, setLastPunch] = useState<PunchResult | null>(null);
  const [history, setHistory] = useState<AttendanceLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [capturedLocation, setCapturedLocation] = useState<CapturedLocation | null>(null);

  // Selfie modal state
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [selfieStep, setSelfieStep] = useState<SelfieStep>("idle");
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [pendingPunchType, setPendingPunchType] = useState<"IN" | "OUT" | null>(null);

  const clearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(id); stopCamera(); };
  }, []);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

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

  // ── Step 1: user clicks Clock In / Out — open selfie modal ────────────────
  const handlePunchClick = useCallback(async (punchType: "IN" | "OUT") => {
    const token = localStorage.getItem("ess_token");
    if (!token) { router.replace("/ess/login"); return; }

    setPendingPunchType(punchType);
    setCapturedDataUrl(null);
    setSelfieStep("opening");
    setSelfieOpen(true);

    // Try to open camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setSelfieStep("preview");
    } catch {
      // Camera denied or unavailable — proceed without selfie
      setSelfieStep("idle");
      setSelfieOpen(false);
      submitPunch(punchType, null);
    }
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 2: user clicks "Take Selfie" ─────────────────────────────────────
  function captureSelfie() {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || video.videoWidth === 0) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setCapturedDataUrl(canvas.toDataURL("image/jpeg", 0.8));
    stopCamera();
    setSelfieStep("captured");
  }

  function retakeSelfie() {
    setCapturedDataUrl(null);
    setSelfieStep("opening");
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setSelfieStep("preview");
      })
      .catch(() => setSelfieStep("captured")); // keep captured frame on error
  }

  // ── Step 3: user confirms → submit punch ──────────────────────────────────
  const confirmAndPunch = useCallback(async () => {
    if (!pendingPunchType) return;
    setSelfieOpen(false);
    stopCamera();
    await submitPunch(pendingPunchType, capturedDataUrl);
  }, [pendingPunchType, capturedDataUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  function cancelSelfie() {
    stopCamera();
    setSelfieOpen(false);
    setSelfieStep("idle");
    setCapturedDataUrl(null);
    setPendingPunchType(null);
  }

  // ── Core punch submission ─────────────────────────────────────────────────
  const submitPunch = useCallback(async (punchType: "IN" | "OUT", dataUrl: string | null) => {
    const token = localStorage.getItem("ess_token");
    if (!token) { router.replace("/ess/login"); return; }

    setPunching(true);
    setCapturedLocation(null);

    // Upload selfie if we have one
    let selfieKey: string | null = null;
    if (dataUrl) {
      try {
        const byteStr = atob(dataUrl.split(",")[1]);
        const ab = new ArrayBuffer(byteStr.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
        const blob = new Blob([ab], { type: "image/jpeg" });

        const presignRes = await fetch("/api/ess/clock/presign", {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: "selfie.jpg", mimeType: "image/jpeg", fileSize: blob.size }),
        });
        if (presignRes.ok) {
          const { data } = await presignRes.json();
          const putRes = await fetch(data.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "image/jpeg" },
            body: blob,
          });
          if (putRes.ok) selfieKey = data.storageKey;
        }
      } catch {
        // Upload failed — proceed without selfie key
      }
    }

    // Geolocation
    let latitude: number | null = null;
    let longitude: number | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }),
      );
      latitude = pos.coords.latitude;
      longitude = pos.coords.longitude;
      setCapturedLocation({ latitude, longitude });
    } catch { /* proceed without */ }

    try {
      const res = await fetch("/api/ess/clock", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ punchType, latitude, longitude, selfieKey }),
      });
      const data = await res.json();
      if (res.status === 401) { localStorage.removeItem("ess_token"); router.replace("/ess/login"); return; }
      if (res.status === 403) { toast.error("Please accept biometric / location consent in your profile."); return; }
      if (!res.ok) { toast.error(data?.message ?? "Clock failed. Try again."); return; }

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
      setSelfieStep("idle");
      setCapturedDataUrl(null);
      setPendingPunchType(null);
    }
  }, [router, loadHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-4 lg:p-8 space-y-4 max-w-xl mx-auto">
      <h1 className="text-xl lg:text-2xl font-bold text-center lg:text-left">Time Clock</h1>

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ── Selfie capture modal ─────────────────────────────────────────── */}
      <Dialog open={selfieOpen} onOpenChange={(open) => { if (!open) cancelSelfie(); }}>
        <DialogContent className="max-w-sm w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-sky-600" />
              {pendingPunchType === "IN" ? "Clock In" : "Clock Out"} — Take a Selfie
            </DialogTitle>
            <DialogDescription>
              Position your face in the frame, then tap &quot;Capture&quot;.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Camera / preview area */}
            <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] flex items-center justify-center">
              {selfieStep === "opening" && (
                <div className="text-white text-sm flex flex-col items-center gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                  <span>Starting camera…</span>
                </div>
              )}

              {/* Live feed */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${selfieStep === "preview" ? "block" : "hidden"}`}
                style={{ transform: "scaleX(-1)" }}
              />

              {/* Captured still */}
              {selfieStep === "captured" && capturedDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={capturedDataUrl}
                  alt="Selfie preview"
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
              )}

              {/* Overlay checkmark */}
              {selfieStep === "captured" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <CheckCircle2 className="h-16 w-16 text-green-400" />
                </div>
              )}
            </div>

            {/* Buttons */}
            {selfieStep === "preview" && (
              <Button className="w-full" onClick={captureSelfie}>
                <Camera className="h-4 w-4 mr-2" />
                Capture Selfie
              </Button>
            )}

            {selfieStep === "captured" && (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={retakeSelfie}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retake
                </Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={confirmAndPunch}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {pendingPunchType === "IN" ? "Confirm Clock In" : "Confirm Clock Out"}
                </Button>
              </div>
            )}

            <Button variant="ghost" className="w-full text-muted-foreground" onClick={cancelSelfie}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
          onClick={() => handlePunchClick("IN")}
        >
          {punching && pendingPunchType === "IN" ? "…" : <><LogIn className="h-5 w-5 mr-2" />Clock In</>}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-16 text-lg border-2 border-red-400 text-red-500 hover:bg-red-50"
          disabled={punching}
          onClick={() => handlePunchClick("OUT")}
        >
          {punching && pendingPunchType === "OUT" ? "…" : <><LogOutIcon className="h-5 w-5 mr-2" />Clock Out</>}
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
                <p>{capturedLocation.latitude.toFixed(6)}, {capturedLocation.longitude.toFixed(6)}</p>
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
