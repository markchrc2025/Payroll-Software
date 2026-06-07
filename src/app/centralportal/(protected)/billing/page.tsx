import { requireCentralPage } from "@/lib/central-permission";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  await requireCentralPage("BILLING", "READ");
  return <BillingClient />;
}
