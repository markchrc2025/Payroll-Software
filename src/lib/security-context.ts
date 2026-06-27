/**
 * Builds the human-readable "device" + "when" strings shown in password-changed
 * security-notice emails (detailPanel rows), from the request.
 */
import { getClientIp } from "@/lib/audit";

function summarizeUserAgent(ua: string): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad|iPod|iOS/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

/** `{ device, changedAt }` for a security notice — device string + PH timestamp. */
export function securityContext(req: Request): { device: string; changedAt: string } {
  const ua = req.headers.get("user-agent") ?? "";
  const ip = getClientIp(req) || "unknown location";
  const changedAt =
    new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date()) + " (PHT)";
  return { device: `${summarizeUserAgent(ua)} · ${ip}`, changedAt };
}
