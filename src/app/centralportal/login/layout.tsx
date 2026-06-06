import { getSuperAdminContext } from "@/lib/super-admin-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// If an already-authenticated super admin lands on the Central Portal login,
// send them straight to the dashboard instead of showing the login form.
export default async function CentralLoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getSuperAdminContext();
  if (ctx) redirect("/centralportal/dashboard");
  return <>{children}</>;
}
