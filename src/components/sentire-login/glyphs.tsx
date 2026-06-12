/**
 * Brand marks + icons for the Sentire login screens.
 * Ported from the design handoff (nexus-refined.jsx, sentire-logos.jsx,
 * sentire-login.jsx) — recreated as typed React components.
 */

const INK = "#2A2420";
const INK_ON_DARK = "#F7F3EF";

/** Mix a hex colour toward white (matches nxLighten in the handoff). */
function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const f = (c: number) => Math.round(c + (255 - c) * amt);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// Node layout for the "mesh" variant: [angleDeg, radius, sizeFactor]
const MESH_LAYOUT: ReadonlyArray<readonly [number, number, number]> = [
  [-90, 12.5, 1.05],
  [0, 14.5, 1.18],
  [110, 13, 1.1],
  [200, 14, 0.98],
];

/** The Sentire "Nexus" mark — hub + four product nodes, mesh variant. */
export function NexusMark({
  size = 48,
  lineW = 3.4,
  onDark = false,
  core = "#E8693A",
}: {
  size?: number;
  lineW?: number;
  onDark?: boolean;
  core?: string;
}) {
  const ink = onDark ? INK_ON_DARK : INK;
  const coreCol = onDark ? lighten(core, 0.28) : core;
  const pts = MESH_LAYOUT.map(([a, r, f]) => {
    const t = (a * Math.PI) / 180;
    return { x: 24 + r * Math.cos(t), y: 24 + r * Math.sin(t), f };
  });

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      {/* spokes */}
      {pts.map((p, i) => (
        <line
          key={`l${i}`}
          x1={24}
          y1={24}
          x2={p.x}
          y2={p.y}
          stroke={ink}
          strokeWidth={lineW}
          opacity={0.5}
          strokeLinecap="round"
        />
      ))}
      {/* mesh connectors */}
      {pts.map((p, i) => {
        const q = pts[(i + 1) % pts.length];
        return (
          <line
            key={`m${i}`}
            x1={p.x}
            y1={p.y}
            x2={q.x}
            y2={q.y}
            stroke={ink}
            strokeWidth={lineW * 0.75}
            opacity={0.18}
            strokeLinecap="round"
          />
        );
      })}
      {/* nodes */}
      {pts.map((p, i) => (
        <circle key={`n${i}`} cx={p.x} cy={p.y} r={3.5 * p.f} fill={ink} />
      ))}
      {/* core */}
      <circle cx={24} cy={24} r={5} fill={coreCol} />
    </svg>
  );
}

/** Payroll product glyph (recurring-pay-cycle icon). */
export function PayrollGlyph({
  size = 20,
  color = INK_ON_DARK,
  accent = "#7FC4A6",
}: {
  size?: number;
  color?: string;
  accent?: string;
}) {
  const common = {
    fill: "none",
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.8 13.2 A8 8 0 1 1 17.7 6.6" {...common} />
      <path d="M18.4 3.6 L17.9 7 L14.6 6.2" {...common} />
      <circle cx={12} cy={12} r={3.1} fill="none" stroke={accent} strokeWidth={1.8} />
    </svg>
  );
}

// ---- small inline icons ----------------------------------------------------

export const GoogleIcon = () => (
  <svg viewBox="0 0 18 18" width={17} height={17} aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
  </svg>
);

export const MicrosoftIcon = () => (
  <svg viewBox="0 0 18 18" width={15} height={15} aria-hidden="true">
    <path fill="#F25022" d="M0 0h8.5v8.5H0z" />
    <path fill="#7FBA00" d="M9.5 0H18v8.5H9.5z" />
    <path fill="#00A4EF" d="M0 9.5h8.5V18H0z" />
    <path fill="#FFB900" d="M9.5 9.5H18V18H9.5z" />
  </svg>
);

export const KeyIcon = () => (
  <svg viewBox="0 0 20 20" width={16} height={16} aria-hidden="true">
    <circle cx="7.5" cy="10" r="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path d="M11.5 10h6.5M15 10v3M17.5 10v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none" />
  </svg>
);

export const Spinner = () => (
  <svg className="sn-spin" viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.6" fill="none" opacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" />
  </svg>
);

export const MailIcon = () => (
  <svg className="sn-input-ic" viewBox="0 0 20 20" width={17} height={17} aria-hidden="true">
    <rect x="2.5" y="4.5" width="15" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M3 6l7 5 7-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const LockIcon = () => (
  <svg className="sn-input-ic" viewBox="0 0 20 20" width={17} height={17} aria-hidden="true">
    <rect x="4" y="9" width="12" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6.5 9V7a3.5 3.5 0 1 1 7 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const EyeIcon = ({ off = false }: { off?: boolean }) => (
  <svg viewBox="0 0 20 20" width={18} height={18} aria-hidden="true">
    <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="10" cy="10" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    {off && <path d="M4 16L16 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
  </svg>
);

export const AlertIcon = () => (
  <svg viewBox="0 0 20 20" width={17} height={17} aria-hidden="true">
    <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M10 5.5v5.2M10 13.6v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const ShieldIcon = () => (
  <svg viewBox="0 0 20 20" width={13} height={13} aria-hidden="true">
    <path
      d="M10 2l6 2.5v4.2c0 3.7-2.5 7-6 8.3-3.5-1.3-6-4.6-6-8.3V4.5L10 2z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    />
  </svg>
);

export const CheckMark = () => (
  <svg viewBox="0 0 14 14" width={11} height={11}>
    <path d="M2.5 7.5l3 3 6-6.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
