"use client";

/**
 * Clock in/out with selfie — camera → review → done.
 * Real front-camera capture + geolocation + timestamp, uploaded to R2 via the
 * presign flow and attached to the punch (/api/ess/clock). Reflects clocked-in
 * state on Home via the nav context. Ported from the design handoff ClockScreen.
 */

import { useContext, useEffect, useRef, useState } from "react";
import { EIcon } from "./icons";
import { ESSNav, EBtn, EChip, useNow, fmtTime } from "./primitives";
import { essFetch, type ApiOne } from "./api";

type Step = "camera" | "review" | "done";

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

export function ClockScreen({ param }: { param?: string | null }) {
  const nav = useContext(ESSNav);
  const out = param === "out";
  const now = useNow();
  const t = now ? fmtTime(now) : null;

  const [step, setStep] = useState<Step>("camera");
  const [shot, setShot] = useState<{ url: string; blob: Blob; at: string } | null>(null);
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
        setGeoLabel(
          `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
        );
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

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      let selfieKey: string | null = null;

      if (shot) {
        // 1) presign — tolerate "storage not configured" (503) by punching w/o selfie
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
          // storage not configured / upload failed — continue without selfie
          selfieKey = null;
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

      nav.setClockedIn(!out);
      setStep("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't record your punch. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const stampFull = shot?.at ?? t?.full ?? "";

  if (step === "done") {
    return (
      <div className="e-stack">
        <div className="e-success">
          <span className="e-success-ic">
            <EIcon name="checkCircle" size={48} />
          </span>
          <h3>
            {out ? "Clocked out" : "Clocked in"} · {stampFull}
          </h3>
          <p>
            {new Date().toLocaleDateString("en-PH", { weekday: "long", month: "short", day: "numeric" })}
            {selfieVerifiedLabel(shot, geoLabel)}
          </p>
          <div className="e-selfiethumb">
            <div className="e-selfiethumb-img">
              {shot ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                <img src={shot.url} alt="Selfie" />
              ) : (
                <EIcon name="user" size={26} />
              )}
            </div>
            <div className="e-selfiethumb-meta">
              <b>{shot ? "Selfie captured" : "Punch recorded"}</b>
              <i>
                <EIcon name="pin" size={12} /> {geoLabel}
              </i>
              <i>
                <EIcon name="clock" size={12} /> {stampFull}
              </i>
            </div>
            <EChip tone={out ? "slate" : "green"}>{out ? "Shift ended" : "On time"}</EChip>
          </div>
          <EBtn kind="primary" full onClick={() => nav.tab("home")}>
            Done
          </EBtn>
        </div>
      </div>
    );
  }

  return (
    <div className="e-stack e-clockflow">
      <div className="e-geo">
        <EIcon name="pin" size={15} /> {geoLabel} · <b>{stampFull}</b>
      </div>

      <div className="e-viewfinder" data-captured={step === "review"}>
        {step === "camera" && (
          <video ref={videoRef} playsInline muted aria-label="Selfie camera preview" />
        )}
        {step === "review" && shot && (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview
          <img src={shot.url} alt="Captured selfie" />
        )}
        <span className="e-vf-corner e-vf-tl" />
        <span className="e-vf-corner e-vf-tr" />
        <span className="e-vf-corner e-vf-bl" />
        <span className="e-vf-corner e-vf-br" />
        <div className="e-vf-guide">
          {step === "review" && (
            <span className="e-vf-check">
              <EIcon name="check" size={40} />
            </span>
          )}
        </div>
        {step === "camera" && <div className="e-vf-scan" />}
        <div className="e-vf-stamp">
          <EIcon name="pin" size={12} /> {geoLabel} · {stampFull}
        </div>
      </div>

      <p className="e-vf-hint">
        {step === "camera"
          ? "Center your face in the frame and tap to capture."
          : `Looks good? Confirm to record your ${out ? "clock-out" : "clock-in"}.`}
      </p>

      {err && <div className="e-clockflow-note">{err}</div>}

      {step === "camera" ? (
        <>
          <button className="e-shutter" onClick={capture} aria-label="Capture selfie">
            <span />
          </button>
          <div className="e-clockflow-note">
            <EIcon name="shield" size={16} />
            <span>
              Your selfie confirms it&apos;s really you and is attached to this{" "}
              {out ? "clock-out" : "clock-in"}.
            </span>
          </div>
        </>
      ) : (
        <div className="e-review-actions">
          <EBtn kind="ghost" icon="retake" onClick={() => setStep("camera")}>
            Retake
          </EBtn>
          <EBtn kind="primary" onClick={confirm} disabled={busy}>
            {busy ? "Recording…" : "Confirm"}
          </EBtn>
        </div>
      )}
    </div>
  );
}

function selfieVerifiedLabel(shot: unknown, geo: string): string {
  return shot ? ` · selfie verified at ${geo}.` : ` · recorded at ${geo}.`;
}
