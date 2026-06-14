/**
 * Small pure helpers for rendering initials-avatars (e.g. the employee picker).
 */

/** First letters of up to two words, uppercased. "Maria Santos" → "MA"? no → "MS". */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic background tone hashed from a seed string (matches the design handoff palette). */
const AVATAR_TONES = ["#E8693A", "#4F9373", "#3e63a0", "#A0627D", "#C7913D", "#5E7FB1"];

export function avatarTone(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}
