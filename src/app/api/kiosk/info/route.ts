/**
 * GET /api/kiosk/info
 *
 * Validates a kiosk device token and returns device configuration.
 * Used by the setup page to pair a device without triggering punch logic.
 *
 * Auth: Authorization: Kiosk <deviceToken>
 */
import type { NextRequest } from "next/server";
import prismaAdmin from "@/lib/prisma-admin";
import { err, ok } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Kiosk ")) return err("Missing Kiosk authorization header", 401);
  const deviceToken = authHeader.slice(6).trim();
  if (!deviceToken) return err("Empty device token", 401);

  const kiosk = await prismaAdmin.kiosk.findFirst({
    where: { deviceToken, isActive: true, deletedAt: null },
    select: { id: true, name: true, requiresSelfie: true },
  });

  if (!kiosk) return err("Invalid or inactive device token", 401);

  return ok({ id: kiosk.id, name: kiosk.name, requiresSelfie: kiosk.requiresSelfie });
}
