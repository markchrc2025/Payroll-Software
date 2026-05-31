"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PunchType = "IN" | "OUT";
type ScreenState = "LOOKUP" | "PIN" | "SUCCESS" | "ERROR";

interface PunchResult {
  employee: { firstName: string; lastName: string };
  punchType: PunchType;
  timestamp: string;
  geofenceStatus?: "INSIDE" | "OUTSIDE" | "UNKNOWN";
}

export default function KioskPage() {
  const [screen, setScreen] = useState<ScreenState>("LOOKUP");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [punchType, setPunchType] = useState<PunchType>("IN");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PunchResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [deviceToken, setDeviceToken] = useState("");
  const [requiresSelfie, setRequiresSelfie] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Auto-reset timers
  const successTimer = useRef<NodeJS.Timeout | null>(null);
  const errorTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("kiosk_token") ?? "";
      const selfie = localStorage.getItem("kiosk_requires_selfie") === "true";
      setDeviceToken(token);
      setRequiresSelfie(selfie);
    }
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
      if (errorTimer.current) clearTimeout(errorTimer.current);
      stopCamera();
    };
  }, []);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      toast.error("Camera unavailable. Proceeding without selfie.");
    }
  }

  function captureFrame(): string | null {
    if (!videoRef.current || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d")?.drawImage(videoRef.current, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.7);
  }

  function resetToLookup() {
    setScreen("LOOKUP");
    setEmployeeNumber("");
    setPin("");
    setResult(null);
    setErrorMsg("");
    stopCamera();
  }

  function handleLookupSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeNumber.trim()) return;
    if (requiresSelfie) {
      startCamera();
    }
    setPin("");
    setScreen("PIN");
  }

  const handlePinKey = useCallback(
    (key: string) => {
      if (key === "DEL") {
        setPin((p) => p.slice(0, -1));
      } else if (key === "OK") {
        submitPunch();
      } else if (pin.length < 8) {
        setPin((p) => p + key);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pin],
  );

  async function submitPunch() {
    if (pin.length < 4) {
      toast.error("PIN must be at least 4 digits.");
      return;
    }
    setSubmitting(true);

    let selfieKey: string | undefined;

    // Capture & upload selfie to R2 if this kiosk requires it
    if (requiresSelfie) {
      const dataUrl = captureFrame();
      if (dataUrl) {
        try {
          // Convert data URL to Blob
          const byteString = atob(dataUrl.split(",")[1]);
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
          const blob = new Blob([ab], { type: "image/jpeg" });

          // Request presigned URL
          const presignRes = await fetch("/api/kiosk/presign", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Kiosk ${deviceToken}`,
            },
            body: JSON.stringify({
              employeeNumber: employeeNumber.trim(),
              fileName: "selfie.jpg",
              mimeType: "image/jpeg",
              fileSize: blob.size,
            }),
          });

          if (presignRes.ok) {
            const presignData = await presignRes.json();
            const { uploadUrl, storageKey } = presignData.data as {
              uploadUrl: string;
              storageKey: string;
            };

            // PUT the blob directly to R2
            const putRes = await fetch(uploadUrl, {
              method: "PUT",
              headers: { "Content-Type": "image/jpeg" },
              body: blob,
            });

            if (putRes.ok) {
              selfieKey = storageKey;
            }
            // If PUT fails, proceed without selfieKey — don't block the punch
          }
          // 503 = R2 not configured, proceed silently without selfieKey
        } catch {
          // Camera/network error — proceed without selfieKey
        }
      }
    }

    let latitude: number | undefined;
    let longitude: number | undefined;
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 }),
      );
      latitude = pos.coords.latitude;
      longitude = pos.coords.longitude;
    } catch {
      // Geolocation optional — proceed without it
    }

    try {
      const res = await fetch("/api/kiosk/punch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Kiosk ${deviceToken}`,
        },
        body: JSON.stringify({
          employeeNumber: employeeNumber.trim(),
          pin,
          punchType,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          selfieKey: selfieKey ?? null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg: string =
          res.status === 404
            ? "Employee not found."
            : res.status === 401
              ? "Invalid PIN."
              : data.error ?? "An error occurred. Please try again.";
        setErrorMsg(msg);
        setScreen("ERROR");
        stopCamera();
        errorTimer.current = setTimeout(resetToLookup, 3000);
        return;
      }

      setResult({
        employee: data.employee ?? { firstName: "Unknown", lastName: "" },
        punchType,
        timestamp: data.timestamp ?? new Date().toISOString(),
        geofenceStatus: data.geofenceStatus,
      });
      setScreen("SUCCESS");
      stopCamera();
      successTimer.current = setTimeout(resetToLookup, 5000);
    } catch {
      setErrorMsg("Network error. Please try again.");
      setScreen("ERROR");
      stopCamera();
      errorTimer.current = setTimeout(resetToLookup, 3000);
    } finally {
      setSubmitting(false);
    }
  }

  const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "DEL", "0", "OK"];

  return (
    <div className="w-full max-w-sm mx-auto px-4 select-none">
      {/* ── LOOKUP SCREEN ─────────────────────────────────── */}
      {screen === "LOOKUP" && (
        <form onSubmit={handleLookupSubmit} className="space-y-6 text-center">
          <h1 className="text-3xl font-bold text-sky-400">Time &amp; Attendance</h1>
          <p className="text-gray-400">Enter your employee number to proceed.</p>

          <Input
            className="bg-gray-900 border-gray-600 text-white text-center text-2xl h-14 tracking-widest"
            placeholder="Employee No."
            inputMode="numeric"
            value={employeeNumber}
            onChange={(e) => setEmployeeNumber(e.target.value)}
            autoFocus
            required
          />

          <div className="flex gap-3">
            <Button
              type="button"
              variant={punchType === "IN" ? "default" : "outline"}
              className={`flex-1 h-12 text-lg ${punchType === "IN" ? "bg-green-600 hover:bg-green-700 text-white" : "border-gray-600 text-gray-300"}`}
              onClick={() => setPunchType("IN")}
            >
              Punch In
            </Button>
            <Button
              type="button"
              variant={punchType === "OUT" ? "default" : "outline"}
              className={`flex-1 h-12 text-lg ${punchType === "OUT" ? "bg-orange-600 hover:bg-orange-700 text-white" : "border-gray-600 text-gray-300"}`}
              onClick={() => setPunchType("OUT")}
            >
              Punch Out
            </Button>
          </div>

          <Button type="submit" className="w-full h-14 text-xl bg-sky-500 hover:bg-sky-600">
            Continue
          </Button>
        </form>
      )}

      {/* ── PIN SCREEN ───────────────────────────────────── */}
      {screen === "PIN" && (
        <div className="space-y-6 text-center">
          <h2 className="text-2xl font-bold text-sky-400">Enter PIN</h2>
          <p className="text-gray-400">
            Employee:{" "}
            <span className="font-semibold text-white">{employeeNumber}</span>
            &nbsp;|&nbsp;
            <span className={punchType === "IN" ? "text-green-400" : "text-orange-400"}>
              {punchType === "IN" ? "Punch In" : "Punch Out"}
            </span>
          </p>

          {/* Masked PIN display */}
          <div className="flex justify-center gap-3 h-14 items-center">
            {Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className={`text-3xl ${i < pin.length ? "text-white" : "text-gray-700"}`}
              >
                {i < pin.length ? "●" : "○"}
              </span>
            ))}
          </div>

          {/* Optional selfie preview */}
          {requiresSelfie && (
            <div className="relative mx-auto w-40 h-30 rounded-lg overflow-hidden border border-gray-700">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />

          {/* Numeric keypad */}
          <div className="grid grid-cols-3 gap-3">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => handlePinKey(k)}
                disabled={submitting}
                className={`h-16 rounded-xl text-xl font-semibold transition-colors active:scale-95
                  ${k === "OK" ? "bg-sky-600 hover:bg-sky-500 text-white" : ""}
                  ${k === "DEL" ? "bg-red-900 hover:bg-red-800 text-white" : ""}
                  ${k !== "OK" && k !== "DEL" ? "bg-gray-800 hover:bg-gray-700 text-white" : ""}
                `}
              >
                {k}
              </button>
            ))}
          </div>

          <Button
            variant="ghost"
            className="text-gray-500 text-sm"
            onClick={resetToLookup}
          >
            ← Back
          </Button>
        </div>
      )}

      {/* ── SUCCESS SCREEN ──────────────────────────────── */}
      {screen === "SUCCESS" && result && (
        <div className="text-center space-y-4">
          <div className="text-7xl">✅</div>
          <h2 className="text-3xl font-bold text-green-400">
            {result.punchType === "IN" ? "Punched In!" : "Punched Out!"}
          </h2>
          <p className="text-2xl font-semibold text-white">
            {result.employee.firstName} {result.employee.lastName}
          </p>
          <p className="text-gray-400 text-lg">
            {new Date(result.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            &nbsp;·&nbsp;
            {new Date(result.timestamp).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
          </p>
          {result.geofenceStatus && (
            <Badge
              className={
                result.geofenceStatus === "INSIDE"
                  ? "bg-green-700 text-green-100"
                  : result.geofenceStatus === "OUTSIDE"
                    ? "bg-yellow-700 text-yellow-100"
                    : "bg-gray-700 text-gray-300"
              }
            >
              {result.geofenceStatus === "INSIDE"
                ? "Within geofence"
                : result.geofenceStatus === "OUTSIDE"
                  ? "Outside geofence"
                  : "Geofence unknown"}
            </Badge>
          )}
          <p className="text-gray-500 text-sm mt-4">Returning to home screen in 5 seconds…</p>
        </div>
      )}

      {/* ── ERROR SCREEN ─────────────────────────────────── */}
      {screen === "ERROR" && (
        <div className="text-center space-y-4">
          <div className="text-7xl">❌</div>
          <h2 className="text-2xl font-bold text-red-400">Error</h2>
          <p className="text-white text-lg">{errorMsg}</p>
          <p className="text-gray-500 text-sm mt-4">Returning to home screen in 3 seconds…</p>
        </div>
      )}
    </div>
  );
}
