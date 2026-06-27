/**
 * /employees/ess — Employee Self-Service (ESS) access admin.
 *
 * Lists employees with their ESS activation status. Employees do NOT get ESS
 * access on creation — HR grants it here, and can schedule a future
 * deactivation (with a reason) or disable access immediately.
 */
import { cookies } from "next/headers";
import { EssPortalClient } from "@/components/employees/EssPortalClient";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

async function authHeaders(): Promise<HeadersInit> {
  const store = await cookies();
  const cookieHeader = store.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
  return { Cookie: cookieHeader };
}

export default async function EssPortalPage() {
  const res = await fetch(`${BASE}/api/employees/ess`, {
    cache: "no-store",
    headers: await authHeaders(),
  });
  const json = res.ok ? await res.json() : { data: [] };
  const initial = json.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Employee Self-Service</h1>
        <p className="text-sm text-muted-foreground">
          Control which employees can sign in to the ESS portal. New employees
          have no access until you activate them.
        </p>
      </div>
      <EssPortalClient initial={initial} />
    </div>
  );
}
