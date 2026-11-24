"use client";

/** PAY-197: the personal information forms leaving employees filed in the Offboarding portal (forwarding address, contact, bank for the final pay). */
import { Header, useOffboardingForms } from "@/components/offboarding/useForms";

type Row = { caseId: string; employeeNumber: string; name: string; submittedAt: string; forwardingAddress: string | null; personalEmail: string | null;
  mobileNumber: string | null; bankName: string | null; bankAccountName: string | null; bankAccount: string | null };

export default function PersonalInformationPage() {
  const { data, loading } = useOffboardingForms<{ rows: Row[] }>("personal-info");
  return (
    <div className="space-y-5">
      <Header title="Personal Information Forms" text="Where to reach leaving employees and where to pay their final pay, as they filed it in the Offboarding portal. The bank account shows its last four digits only; the full number stays encrypted." />
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[12px] text-[#6B6B6B]"><th className="p-2">Employee</th><th>Filed</th><th>Forwarding address</th><th>Personal email</th><th>Mobile</th><th>Bank</th><th>Account name</th><th>Account</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="p-3 text-[#6B6B6B]">Loading…</td></tr>}
            {!loading && !data?.rows.length && <tr><td colSpan={8} className="p-3 text-[#6B6B6B]">No form filed yet.</td></tr>}
            {data?.rows.map((r) => (
              <tr key={r.caseId} className="border-t align-top">
                <td className="p-2 whitespace-nowrap">{r.name}<div className="text-[#6B6B6B]">{r.employeeNumber}</div></td>
                <td className="py-2 whitespace-nowrap">{r.submittedAt}</td>
                <td className="py-2 max-w-[260px] whitespace-pre-wrap">{r.forwardingAddress}</td>
                <td className="py-2">{r.personalEmail}</td><td className="py-2 whitespace-nowrap">{r.mobileNumber}</td>
                <td className="py-2">{r.bankName}</td><td className="py-2">{r.bankAccountName}</td><td className="py-2 whitespace-nowrap">{r.bankAccount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
