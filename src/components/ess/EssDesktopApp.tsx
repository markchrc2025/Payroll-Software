"use client";

/**
 * Sentire Payroll ESS — desktop (browser) shell. A centered top-nav layout
 * (max-width 1240px) rendering one screen at a time, with an in-memory route,
 * a global clocked-in flag, and two overlay modals (selfie clock + leave
 * request). Ported from the desktop design handoff (ess-desktop-shell.jsx);
 * data comes from /api/ess/* and the selfie modal uses the real camera.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { NexusMark } from "@/components/sentire-login/glyphs";
import { EIcon, type EIconName } from "./icons";
import { EAvatar, EBtn, useNow, fmtTime } from "./primitives";
import { useEssData } from "./use-ess-data";
import { type ApiOne, type EssProfile } from "./api";
import { DNav, type DPage, type DModal } from "./desktop-nav";
import { D_PAGES, DLeaveModal } from "./desktop-screens";
import { useSelfieClock } from "./use-selfie-clock";
import "./ess.css";

const D_NAV_ITEMS: { id: DPage; label: string; icon: EIconName }[] = [
  { id: "dashboard", label: "Home", icon: "home" },
  { id: "pay", label: "Pay", icon: "wallet" },
  { id: "leave", label: "Leave", icon: "leave" },
  { id: "time", label: "Time", icon: "clock" },
];

// ─── clock in/out modal (real selfie verification) ────────────────────────────
function DesktopClockModal({ out, onClose, onClocked }: { out: boolean; onClose: () => void; onClocked: (v: boolean) => void }) {
  const now = useNow();
  const t = now ? fmtTime(now) : null;
  const { step, shot, geoLabel, busy, err, camReady, videoRef, capture, retake, confirm } =
    useSelfieClock(out, onClocked);
  const stamp = shot?.at ?? t?.full ?? "";

  return (
    <div
      className="d-modal-ov"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="d-modal" role="dialog" aria-label={out ? "Clock out" : "Clock in"}>
        {step === "done" ? (
          <div className="d-modal-success">
            <span className="e-success-ic">
              <EIcon name="checkCircle" size={46} />
            </span>
            <h3>
              {out ? "Clocked out" : "Clocked in"} · {stamp}
            </h3>
            <p>
              {new Date().toLocaleDateString("en-PH", { weekday: "long", month: "short", day: "numeric" })} ·{" "}
              {shot ? "selfie verified" : "recorded"} at {geoLabel}.
            </p>
            <EBtn kind="primary" full onClick={onClose}>
              Done
            </EBtn>
          </div>
        ) : (
          <>
            <div className="d-modal-head">
              <b>{out ? "Clock out" : "Clock in"} · selfie verification</b>
              <button className="d-modal-x" onClick={onClose} aria-label="Close">
                <EIcon name="x" size={17} />
              </button>
            </div>
            <div className="e-geo">
              <EIcon name="pin" size={15} /> {geoLabel} · <b>{stamp}</b>
            </div>
            <div className="e-viewfinder d-vf" data-captured={step === "review"}>
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
                    <EIcon name="check" size={36} />
                  </span>
                )}
              </div>
              {step === "camera" && <div className="e-vf-scan" />}
              <div className="e-vf-stamp">
                <EIcon name="pin" size={12} /> {geoLabel} · {stamp}
              </div>
            </div>
            <p className="e-vf-hint">
              {step === "camera"
                ? "Center your face in the frame, then capture."
                : `Looks good? Confirm to record your ${out ? "clock-out" : "clock-in"}.`}
            </p>
            {err && <p className="e-vf-hint">{err}</p>}
            {step === "camera" ? (
              <div className="d-modal-actions">
                <EBtn kind="ghost" onClick={onClose}>
                  Cancel
                </EBtn>
                <EBtn kind="primary" icon="camera" onClick={capture}>
                  {camReady ? "Capture" : "Continue"}
                </EBtn>
              </div>
            ) : (
              <div className="d-modal-actions">
                <EBtn kind="ghost" icon="retake" onClick={retake}>
                  Retake
                </EBtn>
                <EBtn kind="primary" onClick={confirm} disabled={busy}>
                  {busy ? "Recording…" : "Confirm"}
                </EBtn>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── shell ────────────────────────────────────────────────────────────────────
export default function EssDesktopApp() {
  const router = useRouter();
  const [route, setRoute] = useState<{ page: DPage; param: string | null }>({
    page: "dashboard",
    param: null,
  });
  const [modal, setModal] = useState<DModal>(null);
  const [clockedIn, setClockedIn] = useState(false);

  const profile = useEssData<ApiOne<EssProfile>>("/api/ess/profile");
  const emp = profile.data?.data;
  const name = emp ? [emp.firstName, emp.lastName].filter(Boolean).join(" ") : "";
  const initials = emp ? (emp.firstName[0] ?? "") + (emp.lastName[0] ?? "") : "··";

  const nav = useMemo(
    () => ({
      go: (page: DPage, param: string | null = null) => {
        setRoute({ page, param });
        setModal(null);
      },
      openModal: (m: Exclude<DModal, null>) => setModal(m),
      closeModal: () => setModal(null),
      logout: () => {
        if (typeof window !== "undefined") localStorage.removeItem("ess_token");
        router.replace("/ess/login");
      },
    }),
    [router],
  );

  // Lock background scroll while a modal is open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = modal ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [modal]);

  const navValue = { ...nav, page: route.page, clockedIn, setClockedIn };
  const Page = D_PAGES[route.page] ?? D_PAGES.dashboard;

  return (
    <DNav.Provider value={navValue}>
      <div className="d-app">
        <header className="d-top">
          <div className="d-top-in">
            <div className="d-brand">
              <NexusMark size={30} lineW={3.4} core="#E8693A" />
              <b>
                Sentire <span>Payroll</span>
              </b>
            </div>
            <nav className="d-nav" aria-label="Main">
              {D_NAV_ITEMS.map((n) => (
                <button
                  key={n.id}
                  className={"d-navlink" + (route.page === n.id ? " is-on" : "")}
                  onClick={() => nav.go(n.id)}
                >
                  <EIcon name={n.icon} size={17} />
                  {n.label}
                </button>
              ))}
            </nav>
            <div className="d-topright">
              <button className="d-bell" aria-label="Notifications">
                <EIcon name="bell" size={19} />
                <em />
              </button>
              <button
                className={"d-me" + (route.page === "profile" ? " is-on" : "")}
                onClick={() => nav.go("profile")}
              >
                <EAvatar initials={initials} size={32} />
                <span className="d-me-meta">
                  <b>{name || "My profile"}</b>
                  <i>{emp?.employeeNumber ?? ""}</i>
                </span>
                <EIcon name="chevDown" size={15} />
              </button>
            </div>
          </div>
        </header>

        <main className="d-main">
          <div className="d-main-in" key={route.page + ":" + (route.param || "")}>
            <Page param={route.param} />
          </div>
        </main>

        {(modal === "clock-in" || modal === "clock-out") && (
          <DesktopClockModal
            out={modal === "clock-out"}
            onClose={() => setModal(null)}
            onClocked={(v) => setClockedIn(v)}
          />
        )}
        {modal === "leave" && <DLeaveModal />}
      </div>
    </DNav.Provider>
  );
}
