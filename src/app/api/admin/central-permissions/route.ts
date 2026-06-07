/**
 * GET /api/admin/central-permissions — the Central Portal permission catalog.
 *
 * Returns all module x action permissions (with labels) so the roles editor can
 * render its checkbox grid. Requires ROLES:READ.
 */
import { requireCentralPermission } from "@/lib/central-permission";
import { ok, serverError } from "@/lib/api-response";
import prismaAdmin from "@/lib/prisma-admin";

export async function GET() {
  const ctx = await requireCentralPermission("ROLES", "READ");
  if (ctx instanceof Response) return ctx;

  try {
    const permissions = await prismaAdmin.centralPermission.findMany({
      orderBy: [{ module: "asc" }, { action: "asc" }],
      select: { id: true, module: true, action: true, label: true },
    });
    return ok(permissions);
  } catch (e) {
    return serverError(e);
  }
}
