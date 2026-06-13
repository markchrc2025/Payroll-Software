"use client";

/**
 * ESS entry point. Picks the shell that fits the viewport: the desktop top-nav
 * layout (≥1024px) or the mobile full-bleed tab shell. Renders the mobile shell
 * until mounted to keep the server/client markup in sync, then switches.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import EssApp from "./EssApp";

const EssDesktopApp = dynamic(() => import("./EssDesktopApp"), { ssr: false });

const DESKTOP_QUERY = "(min-width: 1024px)";

export default function EssRoot() {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Before mount we don't know the width; render the mobile shell (it also works
  // narrow) to avoid a hydration mismatch, then swap to desktop if appropriate.
  if (isDesktop === true) return <EssDesktopApp />;
  return <EssApp />;
}
