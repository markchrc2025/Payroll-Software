"use client";

/**
 * Clock in/out with selfie — camera → review → done (mobile full-screen).
 * Real front-camera capture + geolocation + timestamp via useSelfieClock, which
 * uploads to R2 and records the punch (/api/ess/clock) and flips the shared
 * clocked-in state on Home. Ported from the design handoff ClockScreen.
 */

import { useContext } from "react";
import { EIcon } from "./icons";
import { ESSNav, EBtn, EChip, useNow, fmtTime } from "./primitives";
import { useSelfieClock, type Shot } from "./use-selfie-clock";

export function ClockScreen({ param }: { param?: string | null }) {
  const nav = useContext(ESSNav);
  const out = param === "out";
  const now = useNow();
  const t = now ? fmtTime(now) : null;

  const { step, shot, geoLabel, busy, err, videoRef, capture, retake, confirm } = useSelfieClock(
    out,
    nav.setClockedIn,
  );

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
          <EBtn kind="ghost" icon="retake" onClick={retake}>
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

function selfieVerifiedLabel(shot: Shot | null, geo: string): string {
  return shot ? ` · selfie verified at ${geo}.` : ` · recorded at ${geo}.`;
}
