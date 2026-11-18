"use client";

/**
 * Shared selfie clock-in/out engine — real front-camera capture (WebRTC) +
 * geolocation + timestamp, uploaded to object storage via the server-side
 * upload route and attached to the punch (/api/ess/clock). Consumed by both
 * the mobile full-screen ClockScreen and the desktop clock modal so the
 * capture/upload behaviour stays identical.
 */

import { useEffect, useRef, useState } from "react";
import { essFetch, essToken, type ApiOne } from "./api";
import { fmtTime } from "./primitives";

export type SelfieStep = "camera" | "review" | "done";
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
  /** The server needs selfie and location consent before it records a punch. */
  needsConsent: boolean;
  /** Records selfie and location consent, then records the punch. */
  agreeAndConfirm: () => Promise<void>;
}

/** Same version the Profile page records (DPA 10173 consent is versioned). */
const CONSENT_POLICY_VERSION = "v2026-01";

/** base64 of a Blob, for the no-object-storage fallback. */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
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
  const [needsConsent, setNeedsConsent] = useState(false);

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
        setErr("Camera unavailable. A selfie is required: allow camera access, then try again.");
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
      // PAY-183: a selfie is required, so there is nothing to review.
      setErr("Camera unavailable. A selfie is required: allow camera access, then try again.");
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
    if (!shot) {
      setErr("A selfie is required. Take your photo first.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      let selfieKey: string | null = null;
      let selfieData: string | null = null;

      if (shot) {
        // Upload through our own server (same-origin, no bucket CORS) —
        // tolerate "storage not configured" by punching w/o selfie. Raw fetch
        // (not essFetch) because FormData must set its own Content-Type.
        try {
          const form = new FormData();
          form.append("file", new File([shot.blob], "selfie.jpg", { type: "image/jpeg" }));
          const token = essToken();
          const res = await fetch("/api/ess/clock/upload", {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            body: form,
          });
          if (res.ok) {
            const json = (await res.json()) as { data?: { storageKey?: string } };
            selfieKey = json.data?.storageKey ?? null;
          }
        } catch {
          selfieKey = null; // storage not configured / upload failed
        }
        // PAY-183: no object storage (or the upload failed): send the photo
        // with the punch, as the kiosk does, so it is never lost.
        if (!selfieKey) selfieData = await blobToBase64(shot.blob);
      }

      // 3) record the punch
      const token = essToken();
      const res = await fetch("/api/ess/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          punchType: out ? "OUT" : "IN",
          selfieKey,
          selfieData,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | (ApiOne<ClockResp> & { error?: string; details?: { code?: string } })
        | null;
      if (res.status === 401) {
        window.location.replace("/ess/login");
        return;
      }
      if (!res.ok) {
        if (json?.details?.code === "CONSENT_REQUIRED") {
          setNeedsConsent(true);
          setErr("Before your first punch, agree to the use of your selfie and location for attendance.");
          return;
        }
        throw new Error(json?.error || `Request failed (${res.status})`);
      }

      setNeedsConsent(false);
      onClocked(!out);
      setStep("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't record your punch. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function agreeAndConfirm() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      for (const type of ["BIOMETRIC_SELFIE", "GEOLOCATION"] as const) {
        await essFetch("/api/ess/consent", {
          method: "POST",
          body: JSON.stringify({ type, granted: true, policyVersion: CONSENT_POLICY_VERSION }),
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't record your consent. Please try again.");
      setBusy(false);
      return;
    }
    setBusy(false);
    setNeedsConsent(false);
    await confirm();
  }

  return {
    step, shot, coords, geoLabel, busy, err, camReady, videoRef, capture, retake, confirm,
    needsConsent, agreeAndConfirm,
  };
}
