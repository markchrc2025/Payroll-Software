/**
 * GET /api/attendance/field-checkins?from&to&flagged=1
 * Wave F1 (PAY-216): field workers' punches with their location, the site
 * they were at, and those outside every fence (TIMESHEETS:READ).
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { err, ok, unauthorized } from "@/lib/api-response";
import { withTenant } from "@/lib/with-tenant";
import { forbidUnless } from "@/lib/authz/route-permission";

const day = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : null);

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  const denied = await forbidUnless(auth, ["TIMESHEETS", "READ"]);
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const from = day(sp.get("from")), to = day(sp.get("to"));
  if (!from || !to || to < from || to.getTime() - from.getTime() > 31 * 86_400_000) return err("Give from and to dates, at most a month apart", 422);
  const rows = await withTenant(auth.tenantId, (tx) => tx.attendanceLog.findMany({
    where: {
      tenantId: auth.tenantId,
      punchedAt: { gte: new Date(from.getTime() - 8 * 3_600_000), lt: new Date(to.getTime() + 16 * 3_600_000) },
      OR: [{ employee: { fieldWork: true } }, { employee: { jobType: { fieldWork: true } } }],
      ...(sp.get("flagged") === "1" ? { outsideGeofence: true } : {}),
    },
    select: { id: true, punchType: true, punchedAt: true, latitude: true, longitude: true, outsideGeofence: true, distanceMeters: true, siteName: true,
      employee: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } } },
    orderBy: { punchedAt: "desc" },
    take: 2000,
  }));
  return ok(rows.map((r) => ({ ...r, latitude: r.latitude == null ? null : Number(r.latitude), longitude: r.longitude == null ? null : Number(r.longitude) })));
}
