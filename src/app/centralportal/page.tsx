import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Bare /centralportal entry point: send logged-in super admins to the
// dashboard, everyone else to the Central Portal login.
export default async function CentralPortalRoot() {
  const ctx = await getSuperAdminContext();
  if (ctx) redirect("/centralportal/dashboard");
  redirect("/centralportal/login");
}
