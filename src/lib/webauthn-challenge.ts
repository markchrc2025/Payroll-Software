/**
 * Stateless signed challenge tokens for WebAuthn flows.
 * HMAC-SHA256 signed with NEXTAUTH_SECRET; expires in 3 minutes.
 */
import { createHmac } from "crypto";

const SECRET = process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-production";

interface ChallengePayload {
  challenge: string;
  employeeId: string;
  tenantId: string;
  exp: number;
}

export function issueChallenge(
  challenge: string,
  employeeId: string,
  tenantId: string,
  ttlSeconds = 180,
): string {
  const payload: ChallengePayload = {
    challenge,
    employeeId,
    tenantId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyChallenge(token: string): ChallengePayload {
  const dot = token.lastIndexOf(".");
  if (dot === -1) throw new Error("Malformed challenge token");
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", SECRET).update(data).digest("base64url");
  if (sig !== expected) throw new Error("Invalid challenge signature");
  const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as ChallengePayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Challenge expired");
  return payload;
}
