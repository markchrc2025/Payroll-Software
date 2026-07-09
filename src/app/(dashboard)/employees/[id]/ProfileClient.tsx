"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Fingerprint, Link2, Link2Off, UserCheck, AlertTriangle, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAvatarColor, getInitials, StatusPill } from "@/components/employees/columns";
import { validateImage, ACCEPT_ATTR } from "@/lib/upload-image";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatutoryId {
  type: string; // SSS | PHILHEALTH | PAGIBIG | TIN
  value: string;
}

interface LeaveBalance {
  leaveTypeName: string;
  balance: number;
  used: number;
}

interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  photoKey?: string | null;
  birthDate?: string;
  gender?: string;
  civilStatus?: string;
  personalEmail?: string;
  workEmail?: string;
  mobileNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  province?: string;
  zipCode?: string;
  hireDate?: string;
  regularizationDate?: string;
  employmentStatus?: string;
  employmentType?: string;
  salaryType?: string;
  taxClassification?: string;
  payFrequency?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  jobTitle?: string;
  level?: { id: string; name: string };
  department?: { id: string; name: string };
  branch?: { id: string; name: string };
  // position.level is a JobLevel relation object (not a string).
  position?: { id: string; title: string; level?: { id: string; name: string } | string | null };
  statutoryIds?: StatutoryId[];
  salaryHistory?: { basicSalaryCents: number; effectiveDate: string }[];
  immediateSupervisorId?: string;
  userId?: string | null;
  user?: { id: string; firstName: string; lastName: string; email: string } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TABS = [
  "Personal & Gov't IDs",
  "Employment",
  "Compensation",
  "Documents",
  "Leave Ledger",
  "Payslips",
] as const;

type Tab = (typeof TABS)[number];

function fmt(val: string | undefined | null, fallback = "—") {
  return val || fallback;
}

/** position.level may be a JobLevel object or a string; fall back to emp.level. */
function levelNameOf(emp: Employee): string | undefined {
  const pl = emp.position?.level;
  const fromPos = typeof pl === "string" ? pl : pl?.name;
  return fromPos ?? emp.level?.name;
}

function fmtDate(iso: string | undefined | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function maskAccount(acct: string | undefined | null) {
  if (!acct) return "—";
  if (acct.length <= 4) return acct;
  return "••••" + acct.slice(-4);
}

function fmtRate(cents: number | undefined | null, type: string | undefined) {
  if (!cents) return "—";
  const amount = (cents / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (type === "DAILY") return `₱${amount}/day`;
  return `₱${amount}`;
}

function irow(label: string, value: React.ReactNode) {
  return (
    <div
      key={label}
      className="flex flex-col gap-0.5 py-[10px] border-b border-[#E8EBF1] last:border-0"
    >
      <span className="text-[10.5px] uppercase tracking-[0.7px] font-bold text-[#8E9AAC]">
        {label}
      </span>
      <span className="text-[13.5px] font-semibold text-[#0E1B2E]">{value || "—"}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab panels
// ---------------------------------------------------------------------------

function PersonalTab({ emp }: { emp: Employee }) {
  const govIds: Record<string, string> = {};
  for (const s of emp.statutoryIds ?? []) {
    govIds[s.type] = s.value;
  }

  return (
    <div className="p-5 space-y-7">
      {/* Personal details */}
      <section>
        <h3 className="text-[11px] uppercase tracking-[0.8px] font-bold text-[#8E9AAC] mb-3">
          Personal Details
        </h3>
        <div className="grid grid-cols-2 gap-x-5">
          {irow(
            "Full Legal Name",
            [emp.firstName, emp.middleName, emp.lastName, emp.suffix]
              .filter(Boolean)
              .join(" ")
          )}
          {irow("Date of Birth", fmtDate(emp.birthDate))}
          {irow("Civil Status", fmt(emp.civilStatus))}
          {irow("Sex", fmt(emp.gender))}
          {irow("Mobile Number", fmt(emp.mobileNumber))}
          {irow("Personal Email", fmt(emp.personalEmail))}
          {irow("Work Email", fmt(emp.workEmail))}
          {irow(
            "Home Address",
            [emp.addressLine1, emp.addressLine2, emp.city, emp.province, emp.zipCode]
              .filter(Boolean)
              .join(", ") || "—"
          )}
        </div>
      </section>

      {/* Government IDs */}
      <section>
        <h3 className="text-[11px] uppercase tracking-[0.8px] font-bold text-[#8E9AAC] mb-3">
          Government IDs
        </h3>
        <div className="grid grid-cols-2 gap-x-5">
          {irow("SSS Number", fmt(govIds["SSS"]))}
          {irow("PhilHealth Number", fmt(govIds["PHILHEALTH"]))}
          {irow("Pag-IBIG MID", fmt(govIds["PAGIBIG"]))}
          {irow("TIN", fmt(govIds["TIN"]))}
        </div>
      </section>

      {/* Banking */}
      <section>
        <h3 className="text-[11px] uppercase tracking-[0.8px] font-bold text-[#8E9AAC] mb-3">
          Banking
        </h3>
        <div className="grid grid-cols-2 gap-x-5">
          {irow("Bank", fmt(emp.bankName))}
          {irow("Account Number", maskAccount(emp.bankAccountNumber))}
          {irow("Account Name", fmt(emp.bankAccountName))}
        </div>
      </section>
    </div>
  );
}

function EmploymentTab({ emp }: { emp: Employee }) {
  return (
    <div className="p-5">
      <div className="grid grid-cols-2 gap-x-5">
        {irow("Employee Number", fmt(emp.employeeNumber))}
        {irow("Department", fmt(emp.department?.name))}
        {irow("Branch", fmt(emp.branch?.name))}
        {irow("Position", emp.position?.title ?? fmt(emp.jobTitle))}
        {irow("Job Level", fmt(levelNameOf(emp)))}
        {irow("Employment Status", fmt(emp.employmentStatus))}
        {irow("Employment Type", fmt(emp.employmentType))}
        {irow("Pay Frequency", fmt(emp.payFrequency))}
        {irow("Tax Classification", fmt(emp.taxClassification))}
        {irow("Date Hired", fmtDate(emp.hireDate))}
        {irow("Regularization Date", fmtDate(emp.regularizationDate))}
      </div>
    </div>
  );
}

function CompensationTab({ emp }: { emp: Employee }) {
  const latest = emp.salaryHistory?.[0];
  return (
    <div className="p-5">
      <div className="grid grid-cols-2 gap-x-5">
        {irow("Salary Type", fmt(emp.salaryType))}
        {irow(
          "Basic Salary",
          fmtRate(latest?.basicSalaryCents, emp.salaryType)
        )}
        {irow("Effective Date", fmtDate(latest?.effectiveDate))}
      </div>
    </div>
  );
}

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="p-10 flex flex-col items-center justify-center text-[#8E9AAC]">
      <span className="text-[40px] mb-3">📂</span>
      <p className="text-[14px] font-semibold">{label}</p>
      <p className="text-[13px] mt-1">No data yet</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left panel
// ---------------------------------------------------------------------------

/**
 * POST the file to our own server upload endpoint via XHR (same-origin — no
 * storage CORS) so we get real upload progress. Resolves with the storage key
 * the server returns.
 */
function uploadWithProgress(url: string, file: File, onProgress: (fraction: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    // Do NOT set Content-Type — the browser adds the multipart boundary.
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const key = JSON.parse(xhr.responseText)?.data?.storageKey as string | undefined;
          if (key) resolve(key);
          else reject(new Error("Upload succeeded but no storage key was returned"));
        } catch {
          reject(new Error("Unexpected response from the server"));
        }
      } else {
        let msg = `Upload failed (HTTP ${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText)?.error ?? msg; } catch { /* keep default */ }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

function EditableAvatar({ employeeId, photoKey, bg, color, initials }: {
  employeeId: string; photoKey: string | null | undefined; bg: string; color: string; initials: string;
}) {
  const [hasPhoto, setHasPhoto] = useState(!!photoKey);
  const [ver, setVer] = useState(0);
  /** null = idle; 0–100 while uploading. */
  const [progress, setProgress] = useState<number | null>(null);
  const [justDone, setJustDone] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  const uploading = progress !== null;

  useEffect(() => () => {
    // Release the local object URL on unmount.
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  function setLocalPreview(file: File | null) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = file ? URL.createObjectURL(file) : null;
    setPreview(previewUrlRef.current);
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // Clear message for wrong type/size (e.g. HEIC iPhone photos) instead of
      // a generic server "Validation failed". Only JPG/PNG/WebP up to 5 MB.
      validateImage(file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid image");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setLocalPreview(file); // show the chosen photo immediately
    setProgress(2);
    try {
      // Upload through our own server (same-origin — no storage CORS); it stores
      // the file and returns its key. The upload is the bulk of the work: 2→94%.
      const storageKey = await uploadWithProgress(
        "/api/employees/photo/upload",
        file,
        (f) => setProgress(2 + Math.round(f * 92)),
      );

      const patch = await fetch(`/api/employees/${employeeId}/photo`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoKey: storageKey }),
      });
      const jj = await patch.json().catch(() => null);
      if (!patch.ok) throw new Error(jj?.error ?? "Could not save the photo");
      setProgress(100);

      toast.success("Profile photo updated");
      setHasPhoto(true);
      setVer((v) => v + 1); // bust the <img> cache
      setJustDone(true);
      setTimeout(() => setJustDone(false), 1800);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setLocalPreview(null); // drop the failed preview
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // Progress ring geometry — a 80×80 ring around the 72px avatar.
  const R = 37;
  const CIRC = 2 * Math.PI * R;

  return (
    <div className="group relative mb-3 h-[72px] w-[72px]">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="h-[72px] w-[72px] rounded-full object-cover" />
      ) : hasPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/employees/${employeeId}/photo?v=${ver}`} alt="" className="h-[72px] w-[72px] rounded-full object-cover" />
      ) : (
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full text-[22px] font-bold" style={{ background: bg, color }}>
          {initials}
        </div>
      )}

      {/* Encircling progress ring while uploading; turns green when done. */}
      {(uploading || justDone) && (
        <svg viewBox="0 0 80 80" className="pointer-events-none absolute -inset-1 h-[80px] w-[80px] -rotate-90">
          <circle cx="40" cy="40" r={R} fill="none" stroke="#E8EBF1" strokeWidth="4" />
          <circle
            cx="40" cy="40" r={R} fill="none"
            stroke={justDone ? "#0FA36B" : "#E8693A"}
            strokeWidth="4" strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={justDone ? 0 : CIRC * (1 - (progress ?? 0) / 100)}
            style={{ transition: "stroke-dashoffset 200ms ease, stroke 200ms ease" }}
          />
        </svg>
      )}

      {/* Uploading: darken + live percentage. Done: brief green check. */}
      {uploading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
          <span className="text-[13px] font-bold text-white">{progress}%</span>
        </div>
      )}
      {justDone && !uploading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35">
          <Check className="h-6 w-6 text-white" />
        </div>
      )}

      {/* Idle: pencil on hover. */}
      {!uploading && !justDone && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          title="Upload photo"
          className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        >
          <Pencil className="h-[18px] w-[18px]" />
        </button>
      )}
      <input ref={inputRef} type="file" accept={ACCEPT_ATTR} className="hidden" onChange={onPick} disabled={uploading} />
    </div>
  );
}

function LeftPanel({
  emp,
  leaveBalances,
}: {
  emp: Employee;
  leaveBalances: LeaveBalance[];
}) {
  const { bg, color } = getAvatarColor(emp.firstName + " " + emp.lastName);
  const initials = getInitials(emp.firstName, emp.lastName);
  const posLine = [emp.position?.title ?? emp.jobTitle, levelNameOf(emp)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="bg-white rounded-[14px] border border-[#E8EBF1] shadow-[0_1px_3px_rgba(14,27,46,0.06),0_4px_12px_rgba(14,27,46,0.04)] p-5 flex flex-col gap-0">
      {/* Avatar */}
      <div className="flex flex-col items-center text-center py-5 border-b border-[#E8EBF1]">
        <EditableAvatar employeeId={emp.id} photoKey={emp.photoKey} bg={bg} color={color} initials={initials} />
        <p className="text-[16px] font-bold text-[#0E1B2E]">
          {emp.firstName} {emp.lastName}
        </p>
        {posLine && (
          <p className="text-[12.5px] text-[#4A586B] mt-1">{posLine}</p>
        )}
        {emp.employmentStatus && (
          <div className="mt-2">
            <StatusPill status={emp.employmentStatus} />
          </div>
        )}
      </div>

      {/* Info rows */}
      <div className="pt-2">
        {irow("Department", fmt(emp.department?.name))}
        {irow("Branch", fmt(emp.branch?.name))}
        {irow("Date Hired", fmtDate(emp.hireDate))}
        {irow("Regularization", fmtDate(emp.regularizationDate))}
        {irow("Work Email", fmt(emp.workEmail))}
        {irow("Mobile", fmt(emp.mobileNumber))}
      </div>

      {/* Leave balances */}
      {leaveBalances.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[#E8EBF1]">
          <p className="text-[10.5px] uppercase tracking-[0.7px] font-bold text-[#8E9AAC] mb-2">
            Leave Balance
          </p>
          <div className="flex flex-wrap gap-2">
            {leaveBalances.map((lb) => (
              <span
                key={lb.leaveTypeName}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#fdeee6] text-[#E8693A] text-[12px] font-semibold"
              >
                {lb.leaveTypeName}
                <span className="bg-[#E8693A] text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none">
                  {lb.balance}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function EmployeeProfileClient({
  employee,
  leaveBalances,
  isSelf,
}: {
  employee: Employee;
  leaveBalances: LeaveBalance[];
  isSelf: boolean;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("Personal & Gov't IDs");
  const [kioskPinOpen, setKioskPinOpen] = useState(false);
  const [kioskPin, setKioskPin] = useState("");
  const [kioskPinConfirm, setKioskPinConfirm] = useState("");
  const [savingKioskPin, setSavingKioskPin] = useState(false);

  // Linked User Account state
  const [linkedUser, setLinkedUser] = useState<{ id: string; firstName: string; lastName: string; email: string } | null>(employee.user ?? null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [users, setUsers] = useState<{ id: string; firstName: string; lastName: string; email: string }[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [linking, setLinking] = useState(false);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/users");
      const json = await res.json();
      setUsers(json.data ?? []);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (linkDialogOpen) {
      void fetchUsers();
      setSelectedUserId("");
    }
  }, [linkDialogOpen, fetchUsers]);

  async function handleSaveKioskPin(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(kioskPin)) { toast.error("PIN must be exactly 6 digits"); return; }
    if (kioskPin !== kioskPinConfirm) { toast.error("PINs do not match"); return; }
    setSavingKioskPin(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}/kiosk-pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: kioskPin }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.error ?? "Failed to set PIN"); return; }
      toast.success("Kiosk PIN set for " + employee.firstName);
      setKioskPinOpen(false);
      setKioskPin(""); setKioskPinConfirm("");
    } catch { toast.error("Network error"); }
    finally { setSavingKioskPin(false); }
  }

  async function handleLink() {
    if (!selectedUserId) return;
    setLinking(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}/link-user`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.error ?? "Failed to link account"); return; }
      setLinkedUser(users.find((u) => u.id === selectedUserId) ?? null);
      toast.success("User account linked successfully");
      setLinkDialogOpen(false);
    } catch { toast.error("Network error"); }
    finally { setLinking(false); }
  }

  async function handleUnlink() {
    setLinking(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}/link-user`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: null }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.error ?? "Failed to unlink account"); return; }
      setLinkedUser(null);
      toast.success("User account unlinked");
    } catch { toast.error("Network error"); }
    finally { setLinking(false); }
  }

  return (
    <>
    <div
      className="grid gap-[18px]"
      style={{ gridTemplateColumns: "1fr 2fr" }}
    >
      {/* Left */}
      <LeftPanel emp={employee} leaveBalances={leaveBalances} />

      {/* Right */}
      <div className="bg-white rounded-[14px] border border-[#E8EBF1] shadow-[0_1px_3px_rgba(14,27,46,0.06),0_4px_12px_rgba(14,27,46,0.04)] flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center border-b border-[#E8EBF1] px-5 overflow-x-auto gap-2">
          <div className="flex flex-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                flex-shrink-0 px-[15px] py-[14px] text-[13px] font-semibold border-b-2 transition-colors
                ${
                  activeTab === tab
                    ? "text-[#E8693A] border-[#E8693A]"
                    : "text-[#8E9AAC] border-transparent hover:text-[#4A586B]"
                }
              `}
            >
              {tab}
            </button>
          ))}
          </div>
          <button
            onClick={() => setKioskPinOpen(true)}
            className="flex-shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#E8EBF1] text-[12px] font-semibold text-[#4A586B] hover:bg-[#F8F9FC] transition-colors"
          >
            <Fingerprint className="h-3.5 w-3.5" />
            Set Kiosk PIN
          </button>
        </div>

        {/* Self-edit notice */}
        {isSelf && (
          <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-[10px] bg-amber-50 border border-amber-200 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[13px] text-amber-800 leading-snug">
              This is your own employee record. Editing and movement submissions are restricted — ask another administrator to make changes.
            </p>
          </div>
        )}

        {/* Tab content */}
        {activeTab === "Personal & Gov't IDs" && <PersonalTab emp={employee} />}
        {activeTab === "Employment" && <EmploymentTab emp={employee} />}
        {activeTab === "Compensation" && <CompensationTab emp={employee} />}
        {activeTab === "Documents" && <PlaceholderTab label="Documents" />}
        {activeTab === "Leave Ledger" && <PlaceholderTab label="Leave Ledger" />}
        {activeTab === "Payslips" && <PlaceholderTab label="Payslips" />}

        {/* Linked User Account card — Employment tab only */}
        {activeTab === "Employment" && (
          <div className="mx-5 mb-5 rounded-[12px] border border-[#E8EBF1] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-[#F8F9FC] border-b border-[#E8EBF1]">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-[#4A586B]" />
                <span className="text-[11px] uppercase tracking-[0.7px] font-bold text-[#8E9AAC]">
                  Linked User Account
                </span>
              </div>
              {linkedUser && !isSelf && (
                <button
                  onClick={handleUnlink}
                  disabled={linking}
                  className="flex items-center gap-1 h-7 px-2.5 rounded-md border border-[#FACECA] text-[11.5px] font-semibold text-[#E0463B] hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Link2Off className="h-3 w-3" />
                  Unlink
                </button>
              )}
            </div>
            {linkedUser ? (
              <div className="px-4 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0"
                    style={(() => {
                      const { bg, color } = getAvatarColor(linkedUser.firstName + " " + linkedUser.lastName);
                      return { background: bg, color };
                    })()}
                  >
                    {getInitials(linkedUser.firstName, linkedUser.lastName)}
                  </div>
                  <div>
                    <p className="text-[13.5px] font-semibold text-[#0E1B2E]">
                      {linkedUser.firstName} {linkedUser.lastName}
                    </p>
                    <p className="text-[12px] text-[#8E9AAC]">{linkedUser.email}</p>
                  </div>
                </div>
                {!isSelf && (
                  <button
                    onClick={() => setLinkDialogOpen(true)}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#E8EBF1] text-[12px] font-semibold text-[#4A586B] hover:bg-[#F8F9FC] transition-colors"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Change
                  </button>
                )}
              </div>
            ) : (
              <div className="px-4 py-4 flex items-center justify-between">
                <p className="text-[13px] text-[#8E9AAC]">No user account linked yet.</p>
                {!isSelf && (
                  <button
                    onClick={() => setLinkDialogOpen(true)}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#E8EBF1] text-[12px] font-semibold text-[#4A586B] hover:bg-[#F8F9FC] transition-colors"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Link User Account
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>

      {/* Link User Account dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Link User Account</DialogTitle>
            <DialogDescription>
              Connect a system user to <strong>{employee.firstName} {employee.lastName}</strong>. This lets them log in and view their own payslips, leave, and DTR.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Select User Account</Label>
              <Select value={selectedUserId} onValueChange={(v) => setSelectedUserId(v ?? "")} disabled={usersLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={usersLoading ? "Loading users…" : "Choose a user…"} />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} — {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setLinkDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleLink}
                disabled={!selectedUserId || linking}
                className="bg-[#E8693A] hover:bg-[#C2552F] text-white"
              >
                {linking ? "Linking…" : "Link Account"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Kiosk PIN dialog */}
      <Dialog open={kioskPinOpen} onOpenChange={setKioskPinOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Kiosk PIN — {employee.firstName} {employee.lastName}</DialogTitle>
            <DialogDescription>
              Assign a 4–8 digit PIN for this employee to use at the kiosk time &amp; attendance terminal.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveKioskPin} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>New PIN (6 digits)</Label>
              <Input
                type="password"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="Enter PIN"
                value={kioskPin}
                onChange={(e) => setKioskPin(e.target.value.replace(/\D/g, ""))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="Confirm PIN"
                value={kioskPinConfirm}
                onChange={(e) => setKioskPinConfirm(e.target.value.replace(/\D/g, ""))}
                required
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setKioskPinOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingKioskPin} className="bg-[#E8693A] hover:bg-[#C2552F] text-white">
                {savingKioskPin ? "Saving…" : "Save PIN"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
