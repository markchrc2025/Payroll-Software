/**
 * ESS icon set — single-weight line icons on a 24-grid, stroke 1.8.
 * Ported from the design handoff (ess-ui.jsx `E_ICONS`).
 */

export type EIconName =
  | "home" | "wallet" | "leave" | "clock" | "user" | "bell"
  | "chevR" | "chevL" | "chevDown" | "plus" | "download" | "doc"
  | "check" | "checkCircle" | "x" | "gear" | "logout" | "phone"
  | "mail" | "pin" | "building" | "card" | "shield" | "edit"
  | "cal" | "briefcase" | "coffee" | "arrowUp" | "fingerprint"
  | "moon" | "megaphone" | "camera" | "faceid" | "backspace"
  | "retake" | "lock";

const E_ICONS: Record<EIconName, string> = {
  home: "M3 11l9-8 9 8M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5",
  wallet:
    "M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-3M21 11h-4a2 2 0 0 0 0 4h4v-4z",
  leave: "M7 3v3M17 3v3M3.5 9h17M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM9 14l2 2 4-4",
  clock: "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  chevR: "M9 6l6 6-6 6",
  chevL: "M15 6l-6 6 6 6",
  chevDown: "M6 9l6 6 6-6",
  plus: "M12 5v14M5 12h14",
  download: "M12 3v12M7 10l5 5 5-5M5 21h14",
  doc: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5zM14 3v5h5M8 13h8M8 17h5",
  check: "M5 12l5 5 9-10",
  checkCircle: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l2.5 2.5L16 9",
  x: "M6 6l12 12M18 6L6 18",
  gear:
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13a1.7 1.7 0 0 0 .3 1.9M4.6 13a1.7 1.7 0 0 1-.3 1.9M12 4v2M12 18v2M5.6 7.6l1.4 1.4M17 15l1.4 1.4M4 12h2M18 12h2M5.6 16.4L7 15M17 9l1.4-1.4",
  logout: "M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 8l-4 4 4 4M6 12h10",
  phone: "M5 4h3l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v3a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z",
  mail: "M3 6.5h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11zM3.5 7l8.5 6 8.5-6",
  pin: "M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  building:
    "M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 21V9h4a1 1 0 0 1 1 1v11M3 21h18M7.5 8h.01M7.5 12h.01M11 8h.01M11 12h.01",
  card: "M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM2 10h20M6 15h4",
  shield: "M12 3l7 3v5c0 4.5-3 8.3-7 9.5C8 19.3 5 15.5 5 11V6l7-3zM9 11.5l2 2 4-4.5",
  edit: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  cal: "M7 3v3M17 3v3M3.5 9h17M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z",
  briefcase: "M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M3 7h18v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7zM3 12h18",
  coffee: "M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8zM17 9h2a2 2 0 0 1 0 4h-2M7 3v2M11 3v2",
  arrowUp: "M12 19V5M6 11l6-6 6 6",
  fingerprint: "M12 11v3M8.5 8.5a5 5 0 0 1 7 0M6 11a8 8 0 0 1 12 0M9 14a3 3 0 0 1 6 0v3M9 18v1M15 17v2",
  moon: "M20 14a8 8 0 1 1-9.5-9.7 6 6 0 0 0 9.5 9.7z",
  megaphone: "M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1zM14 8a4 4 0 0 1 0 8M10 6l8-3v18l-8-3",
  camera:
    "M4 8h3l1.4-2.2h7.2L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 16.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z",
  faceid:
    "M4 8V6.5A2.5 2.5 0 0 1 6.5 4H8M16 4h1.5A2.5 2.5 0 0 1 20 6.5V8M20 16v1.5a2.5 2.5 0 0 1-2.5 2.5H16M8 20H6.5A2.5 2.5 0 0 1 4 17.5V16M9 9.5v1.5M15 9.5v1.5M12 9.5v3l-1 1M9 15s1.2 1.5 3 1.5 3-1.5 3-1.5",
  backspace: "M10 5h9a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-9l-7-7 7-7zM18 9.5l-5 5M13 9.5l5 5",
  retake: "M21 12a9 9 0 1 1-2.6-6.3M21 3.5V8h-4.5",
  lock: "M6.5 10V7.5a5.5 5.5 0 0 1 11 0V10M5 10h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM12 14v3",
};

export function EIcon({
  name,
  size = 22,
  sw = 1.8,
  fill = false,
}: {
  name: EIconName;
  size?: number;
  sw?: number;
  fill?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ flex: "none", display: "block" }}
      aria-hidden="true"
    >
      <path
        d={E_ICONS[name]}
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={fill ? "currentColor" : "none"}
      />
    </svg>
  );
}
