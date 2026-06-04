import { auth } from "@/auth";
import { redirect } from "next/navigation";
import CentralPortalShell from "./components/CentralPortalShell";

export default async function CentralPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user || session.user.systemRole !== "SUPER_ADMIN") {
    redirect("/centralportal/login");
  }

  return (
    <CentralPortalShell user={session.user}>
      {children}
    </CentralPortalShell>
  );
}
