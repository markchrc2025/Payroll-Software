"use client";

import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogIn, LogOut, CheckCircle2, XCircle, MapPin } from "lucide-react";

type PunchType = "IN" | "OUT";
type ScreenState = "LOOKUP" | "PIN" | "SUCCESS" | "ERROR";

interface PunchResult {
  employee: { firstName: string; lastName: string };
  punchType: PunchType;
  timestamp: string;
  geofenceStatus?: "INSIDE" | "OUTSIDE" | "UNKNOWN";
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "DEL", "0", "OK"];

export default function RemoteKioskPage() {
  const [screen, setScreen] = useState<ScreenState>("LOOKUP");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [punchType, setPunchType] = useState<PunchType>("IN");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PunchResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  // State for JSX reactivity; ref kept in sync for use inside event handlers
  const [requiresSelfie, setRequiresSelfie] = useState(() => {
    // Read synchronously so it's correct before any async fetch resolves
    if (typeof window !== "undefined") {
      return localStorage.getItem("kiosk_requires_selfie") === "true";
    }
    return false;
  });

  // Refs for volatile values so PIN-screen handlers always see fresh data
  const deviceTokenRef = useRef("");
  const requiresSelfieRef = useRef(false);
  const employeeNumberRef = useRef("");
  const punchTypeRef = useRef<PunchType>("IN");
  const pinRef = useRef("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync with state
  useEffect(() => { employeeNumberRef.current = employeeNumber; }, [employeeNumber]);
  useEffect(() => { punchTypeRef.current = punchType; }, [punchType]);
  useEffect(() => { pinRef.current = pin; }, [pin]);
  useEffect(() => {
    requiresSelfieRef.current = requiresSelfie;
  }, [requiresSelfie]);

  // Also sync the ref immediately from the lazy initializer value (before effects run)
  requiresSelfieRef.current = requiresSelfie;

  // Start camera AFTER PIN screen is in the DOM
  useEffect(() => {
    if (screen === "PIN" && requiresSelfie) {
      startCamera();
    }
    if (screen !== "PIN") {
      stopCamera();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, requiresSelfie]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("kiosk_token") ?? "";
    deviceTokenRef.current = token;

    if (token) {
      // Always fetch latest config from server so requiresSelfie is authoritative
      fetch("/api/kiosk/info", {
        headers: { Authorization: `Kiosk ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.data) {
            const val = !!data.data.requiresSelfie;
            setRequiresSelfie(val);
            requiresSelfieRef.current = val;
            localStorage.setItem("kiosk_requires_selfie", String(val));
          }
        })
        .catch(() => {
          // Fall back to cached value if offline
          const cached = localStorage.getItem("kiosk_requires_selfie") === "true";
          setRequiresSelfie(cached);
          requiresSelfieRef.current = cached;
        });
    }

    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
      if (errorTimer.current) clearTimeout(errorTimer.current);
      stopCamera();
    };
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch { /* Camera unavailable — proceed without selfie */ }
  }

  function captureFrame(): Blob | null {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    const byteStr = atob(dataUrl.split(",")[1]);
    const ab = new ArrayBuffer(byteStr.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
    return new Blob([ab], { type: "image/jpeg" });
  }

  /** Wait up to `maxMs` for the camera to produce its first frame. */
  function waitForCameraFrame(maxMs = 3000): Promise<Blob | null> {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const blob = captureFrame();
        if (blob) { resolve(blob); return; }
        if (Date.now() - start >= maxMs) { resolve(null); return; }
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  function resetToLookup() {
    setScreen("LOOKUP");
    setEmployeeNumber("");
    setPin("");
    pinRef.current = "";
    setResult(null);
    setErrorMsg("");
    stopCamera();
  }

  function handleLookupSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeNumber.trim()) return;
    setPin("");
    pinRef.current = "";
    setScreen("PIN"); // camera starts via useEffect after DOM mounts
  }

  function handlePinKey(key: string) {
    if (submitting) return;
    if (key === "DEL") {
      const next = pinRef.current.slice(0, -1);
      pinRef.current = next;
      setPin(next);
    } else if (key === "OK") {
      submitPunch();
    } else if (pinRef.current.length < 8) {
      const next = pinRef.current + key;
      pinRef.current = next;
      setPin(next);
    }
  }

  async function submitPunch() {
    const currentPin = pinRef.current;
    if (currentPin.length < 4) return;
    if (submitting) return;
    setSubmitting(true);

    let selfieKey: string | undefined;
    let selfieData: string | undefined; // base64 fallback when R2 is not available
    if (requiresSelfieRef.current) {
      // Wait up to 3s for camera to produce a frame
      const blob = await waitForCameraFrame(3000);
      if (!blob) {
        // Camera not ready or permission denied — surface a clear error
        setSubmitting(false);
        setErrorMsg("Camera unavailable. Please allow camera access and try again.");
        setScreen("ERROR");
        errorTimer.current = setTimeout(resetToLookup, 4000);
        return;
      }

      // Try R2 upload first
      let r2Succeeded = false;
      try {
        const presignRes = await fetch("/api/kiosk/presign", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Kiosk ${deviceTokenRef.current}`,
          },
          body: JSON.stringify({
            employeeNumber: employeeNumberRef.current.trim(),
            fileName: "selfie.jpg",
            mimeType: "image/jpeg",
            fileSize: blob.size,
          }),
        });
        if (presignRes.ok) {
          const { data: pd } = await presignRes.json();
          const putRes = await fetch(pd.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "image/jpeg" },
            body: blob,
          });
          if (putRes.ok) { selfieKey = pd.storageKey; r2Succeeded = true; }
        }
      } catch { /* fall through to base64 */ }

      // R2 not available — encode as base64 for direct DB storage
      if (!r2Succeeded) {
        const ab = await blob.arrayBuffer();
        const bytes = new Uint8Array(ab);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        selfieData = btoa(binary);
      }
    }

    let latitude: number | null = null;
    let longitude: number | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 }),
      );
      latitude = pos.coords.latitude;
      longitude = pos.coords.longitude;
    } catch { /* optional */ }

    try {
      const res = await fetch("/api/kiosk/punch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Kiosk ${deviceTokenRef.current}`,
        },
        body: JSON.stringify({
          employeeNumber: employeeNumberRef.current.trim(),
          pin: currentPin,
          punchType: punchTypeRef.current,
          latitude,
          longitude,
          selfieKey: selfieKey ?? null,
          selfieData: selfieData ?? null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg =
          res.status === 404 ? "Employee not found." :
          res.status === 401 ? "Incorrect PIN. Please try again." :
          data.error ?? "Something went wrong. Please try again.";
        setErrorMsg(msg);
        setScreen("ERROR");
        stopCamera();
        errorTimer.current = setTimeout(resetToLookup, 4000);
        return;
      }

      setResult({
        employee: data.employee ?? { firstName: "Unknown", lastName: "" },
        punchType: punchTypeRef.current,
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
      errorTimer.current = setTimeout(resetToLookup, 4000);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">

        {/* ── LOOKUP SCREEN ─────────────────────────────── */}
        {screen === "LOOKUP" && (
          <form onSubmit={handleLookupSubmit} className="space-y-5">
            <div className="text-center space-y-1">
              <h1 className="text-3xl font-bold text-gray-900">Time &amp; Attendance</h1>
              <p className="text-sm text-gray-500">Enter your employee number to clock in or out.</p>
            </div>

            <Input
              className="text-center text-xl h-12 tracking-widest font-mono border-gray-300"
              placeholder="Employee No."
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              autoFocus
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPunchType("IN")}
                className={`flex items-center justify-center gap-2 h-12 rounded-lg border-2 font-semibold text-sm transition-colors
                  ${punchType === "IN"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 text-gray-400 hover:border-gray-300"}`}
              >
                <LogIn className="h-4 w-4" />
                Clock In
              </button>
              <button
                type="button"
                onClick={() => setPunchType("OUT")}
                className={`flex items-center justify-center gap-2 h-12 rounded-lg border-2 font-semibold text-sm transition-colors
                  ${punchType === "OUT"
                    ? "border-rose-500 bg-rose-50 text-rose-700"
                    : "border-gray-200 text-gray-400 hover:border-gray-300"}`}
              >
                <LogOut className="h-4 w-4" />
                Clock Out
              </button>
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Continue
            </Button>
          </form>
        )}

        {/* ── PIN SCREEN ────────────────────────────────── */}
        {screen === "PIN" && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-bold text-gray-900">Enter PIN</h2>
              <p className="text-sm text-gray-500">
                <span className="font-medium text-gray-700">{employeeNumber}</span>
                {" · "}
                <span className={punchType === "IN" ? "text-emerald-600 font-medium" : "text-rose-600 font-medium"}>
                  {punchType === "IN" ? "Clock In" : "Clock Out"}
                </span>
              </p>
            </div>

            {/* PIN dots */}
            <div className="flex justify-center gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <span
                  key={i}
                  className={`text-2xl leading-none transition-colors ${
                    i < pin.length ? "text-indigo-600" : "text-gray-200"
                  }`}
                >
                  ●
                </span>
              ))}
            </div>

            {/* Selfie preview */}
            {requiresSelfie && (
              <div className="mx-auto w-32 h-24 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2.5">
              {KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => handlePinKey(k)}
                  disabled={submitting}
                  className={`h-14 rounded-xl font-semibold text-lg select-none transition-all active:scale-95 disabled:opacity-50
                    ${k === "OK"
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                      : k === "DEL"
                        ? "bg-gray-100 hover:bg-gray-200 text-gray-500 text-base"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-800"
                    }`}
                >
                  {k === "DEL" ? "⌫" : k}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={resetToLookup}
              className="w-full text-sm text-gray-400 hover:text-gray-600 py-1"
            >
              ← Back
            </button>
          </div>
        )}

        {/* ── SUCCESS SCREEN ────────────────────────────── */}
        {screen === "SUCCESS" && result && (
          <div className="text-center space-y-4">
            <CheckCircle2
              className={`mx-auto h-20 w-20 ${result.punchType === "IN" ? "text-emerald-500" : "text-rose-500"}`}
            />
            <div>
              <h2 className={`text-3xl font-bold ${result.punchType === "IN" ? "text-emerald-600" : "text-rose-600"}`}>
                {result.punchType === "IN" ? "Clocked In!" : "Clocked Out!"}
              </h2>
              <p className="text-xl font-semibold text-gray-800 mt-1">
                {result.employee.firstName} {result.employee.lastName}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {new Date(result.timestamp).toLocaleTimeString("en-PH", {
                  hour: "2-digit", minute: "2-digit", second: "2-digit",
                })}
                {" · "}
                {new Date(result.timestamp).toLocaleDateString("en-PH", {
                  month: "short", day: "numeric", year: "numeric",
                })}
              </p>
            </div>
            {result.geofenceStatus && result.geofenceStatus !== "UNKNOWN" && (
              <Badge
                className={result.geofenceStatus === "INSIDE"
                  ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                  : "bg-amber-100 text-amber-700 border border-amber-200"}
              >
                <MapPin className="mr-1 h-3 w-3" />
                {result.geofenceStatus === "INSIDE" ? "Within geofence" : "Outside geofence"}
              </Badge>
            )}
            <p className="text-xs text-gray-400 pt-2">Returning to home screen in 5 seconds…</p>
          </div>
        )}

        {/* ── ERROR SCREEN ──────────────────────────────── */}
        {screen === "ERROR" && (
          <div className="text-center space-y-4">
            <XCircle className="mx-auto h-20 w-20 text-rose-500" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Unable to Punch</h2>
              <p className="text-gray-600 mt-1">{errorMsg}</p>
            </div>
            <p className="text-xs text-gray-400 pt-2">Returning to home screen in 4 seconds…</p>
          </div>
        )}

      </div>
    </div>
  );
}
