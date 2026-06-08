import { requireCentralPage } from "@/lib/central-permission";
import TenantsClient from "./TenantsClient";

export const dynamic = "force-dynamic";

export default async function PortalTenantsPage() {
  await requireCentralPage("TENANTS", "READ");
  return <TenantsClient />;
}
