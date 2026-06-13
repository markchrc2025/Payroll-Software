"use client";

/**
 * Shared selfie clock-in/out engine — real front-camera capture (WebRTC) +
 * geolocation + timestamp, uploaded to R2 via the presign flow and attached to
 * the punch (/api/ess/clock). Consumed by both the mobile full-screen ClockScreen
 * and the desktop clock modal so the capture/upload behaviour stays identical.
 */

import { useEffect, useRef, useState } from "react";
import { essFetch, type ApiOne } from "./api";
import { fmtTime } from "./primitives";

export type SelfieStep = "camera" | "review" | "done";

interface PresignResp {
  uploadUrl: string;
  storageKey: string;
  method: string;
  headers: Record<string, string>;
}
interface ClockResp {
  logId: string;
  outsideGeofence: boolean;
  distanceMeters: number | null;
  dtrId: string;
}

export interface Shot {
  url: string;
  blob: Blob;
  at: string;
}

export interface SelfieClock {
  step: SelfieStep;
  shot: Shot | null;
  coords: { lat: number; lng: number } | null;
  geoLabel: string;
  busy: boolean;
  err: string;
  camReady: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  capture: () => void;
  retake: () => void;
  confirm: () => Promise<void>;
}

/**
 * Drives a clock punch. `out` selects clock-out vs clock-in; `onClocked` is
 * called with the new clocked-in boolean once the punch is recorded.
 */
export function useSelfieClock(out: boolean, onClocked: (next: boolean) => void): SelfieClock {
  const [step, setStep] = useState<SelfieStep>("camera");
  const [shot, setShot] = useState<Shot | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoLabel, setGeoLabel] = useState("Locating…");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [camReady, setCamReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // geolocation (best effort)
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGeoLabel("Location unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoLabel(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
      },
      () => setGeoLabel("Location off"),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  // front camera while on the camera step
  useEffect(() => {
    if (step !== "camera") return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCamReady(true);
      } catch {
        setCamReady(false);
        setErr("Camera unavailable. You can still record without a selfie.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
  }, [step]);

  function capture() {
    const video = videoRef.current;
    const at = fmtTime(new Date()).full;
    if (!video || !camReady) {
      // No camera — proceed to review with no image (selfie optional).
      setShot(null);
      setStep("review");
      return;
    }
    const size = Math.min(video.videoWidth, video.videoHeight) || 480;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const sx = (video.videoWidth - size) / 2;
      const sy = (video.videoHeight - size) / 2;
      ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
    }
    canvas.toBlob(
      (blob) => {
        if (blob) setShot({ url: URL.createObjectURL(blob), blob, at });
        setStep("review");
      },
      "image/jpeg",
      0.85,
    );
  }

  function retake() {
    setStep("camera");
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      let selfieKey: string | null = null;

      if (shot) {
        // 1) presign — tolerate "storage not configured" by punching w/o selfie
        try {
          const pres = await essFetch<ApiOne<PresignResp>>("/api/ess/clock/presign", {
            method: "POST",
            body: JSON.stringify({
              fileName: "selfie.jpg",
              mimeType: "image/jpeg",
              fileSize: shot.blob.size,
            }),
          });
          // 2) upload directly to R2
          const put = await fetch(pres.data.uploadUrl, {
            method: pres.data.method || "PUT",
            headers: pres.data.headers || { "Content-Type": "image/jpeg" },
            body: shot.blob,
          });
          if (put.ok) selfieKey = pres.data.storageKey;
        } catch {
          selfieKey = null; // storage not configured / upload failed — continue
        }
      }

      // 3) record the punch
      await essFetch<ApiOne<ClockResp>>("/api/ess/clock", {
        method: "POST",
        body: JSON.stringify({
          punchType: out ? "OUT" : "IN",
          selfieKey,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
        }),
      });

      onClocked(!out);
      setStep("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't record your punch. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return { step, shot, coords, geoLabel, busy, err, camReady, videoRef, capture, retake, confirm };
}
