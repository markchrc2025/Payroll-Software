import { redirect } from "next/navigation";

/**
 * Root entry (/). The proxy already bounces unauthenticated visitors to
 * /login; an authenticated visitor who lands on "/" is forwarded to the
 * dashboard. The app home lives at /dashboard, not at the bare root.
 */
export default function RootPage() {
  redirect("/dashboard");
}
