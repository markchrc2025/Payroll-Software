"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import type { Control, FieldErrors, Path, UseFormSetValue } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, User, ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { uploadImage, ACCEPT_ATTR } from "@/lib/upload-image";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  type CreateEmployeeInput,
} from "@/lib/validations/employee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  EducationSection,
  WorkExperienceSection,
  TrainingSection,
} from "@/components/employees/EmployeeBackground";

// ─── Types ────────────────────────────────────────────────────────────────────

type Dept     = { id: string; name: string };
type Branch   = { id: string; name: string };
type Position = { id: string; title: string; levelId: string | null; departmentId: string | null };
type ShiftSchedule = { id: string; name: string };
type JobTypeRef = { id: string; name: string };
type JobStatusRef = { id: string; name: string };
type LevelRef = { id: string; name: string; rank: number };
type WorkflowRef = { id: string; code: string; description: string | null };
type EmpRef = { id: string; firstName: string; lastName: string; employeeNumber: string };

type Props = {
  departments: Dept[];
  branches:    Branch[];
  positions:   Position[];
  shiftSchedules: ShiftSchedule[];
  jobTypes: JobTypeRef[];
  jobStatuses: JobStatusRef[];
  levels: LevelRef[];
  workflows: WorkflowRef[];
  employees: EmpRef[];
  /** "edit" reuses this wizard to update an existing employee. */
  mode?: "create" | "edit";
  /** Required when mode === "edit". */
  employeeId?: string;
  /** Existing employee number (e.g. EMP-0001), shown read-only when editing. */
  employeeNumber?: string;
  /** Whether the employee already has an ESS PIN (edit mode). */
  hasEssPin?: boolean;
  /** Prefill values when editing (shaped like CreateEmployeeInput). */
  initialData?: Partial<CreateEmployeeInput>;
  /** Whether R2 file storage is configured (enables training-cert uploads). */
  storageReady?: boolean;
};

// ─── Wizard step metadata ─────────────────────────────────────────────────────

const STEPS = [
  { id: "Personal",       sub: "Identity & IDs"                   },
  { id: "Government IDs", sub: "SSS, PhilHealth, Pag-IBIG, TIN"  },
  { id: "Job",            sub: "Placement & terms"                },
  { id: "Salary",         sub: "Pay & payment"                    },
  { id: "Family",         sub: "Spouse & children"                },
  { id: "Contact",        sub: "Web, phone, address"              },
  { id: "Health",         sub: "Physical & senses"                },
  { id: "Directory",      sub: "Access & privacy"                 },
  { id: "Others",         sub: "Remarks"                          },
  { id: "Education",      sub: "Schools & degrees"                },
  { id: "Experience",     sub: "Employment history"               },
  { id: "Training",       sub: "Seminars & certificates"          },
];

// Fields validated on "Continue" per step
const STEP_TRIGGER_FIELDS: Path<CreateEmployeeInput>[][] = [
  ["firstName", "lastName"],
  [],
  ["hireDate", "branchId"],
  ["basicSalary"],
  [],
  [],
  [],
  [],
  [],
  [], // Education — managed independently
  [], // Experience — managed independently
  [], // Training — managed independently
];

// Plain-language labels for the validation toast (falls back to the raw key).
const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  branchId: "Branch",
  hireDate: "Hire date",
  basicSalary: "Basic salary",
};

// ─── Option constants ─────────────────────────────────────────────────────────

// Philippines first, then the rest alphabetically, with a catch-all at the end.
const NATIONS = [
  "Philippines",
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda",
  "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain",
  "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria",
  "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada",
  "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros",
  "Congo (Democratic Republic of the)", "Congo (Republic of the)", "Costa Rica",
  "Côte d'Ivoire", "Croatia", "Cuba", "Cyprus", "Czechia", "Denmark", "Djibouti",
  "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador",
  "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji",
  "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece",
  "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras",
  "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel",
  "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait",
  "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya",
  "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia",
  "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico",
  "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique",
  "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua",
  "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan",
  "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Poland",
  "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis",
  "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino",
  "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles",
  "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia",
  "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan",
  "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania",
  "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia",
  "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates",
  "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu",
  "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe",
  "Other",
];
const ETHNICITIES = ["Tagalog","Cebuano","Ilocano","Bicolano","Waray","Other"];
const RELIGIONS   = ["Roman Catholic","Iglesia ni Cristo","Islam","Protestant","Born Again","Other"];
const SENSE       = ["Normal","Mild","Moderate","Severe"];
const LIMB        = ["Normal","Limited","None"];
const PRIVACY     = ["Not Accessible","Employee","Manager"];
const BLOOD_TYPES = ["A+","A-","B+","B-","O+","O-","AB+","AB-"];
const CURRENCIES  = ["PHP","USD","SGD"];
const PAY_METHODS = ["Cash","Bank transfer","Check","GCash"];
const BANKS       = ["BDO","BPI","UnionBank","Metrobank","GCash","Other"];
const DIR_ROLES   = ["Guest","Employee","Manager","Admin"];

const GENDER_OPT   = [{ value:"FEMALE",label:"Female"},{value:"MALE",label:"Male"},{value:"OTHER",label:"Other"}];
const CIVIL_OPT    = [{ value:"SINGLE",label:"Single"},{value:"MARRIED",label:"Married"},{value:"WIDOWED",label:"Widowed"},{value:"LEGALLY_SEPARATED",label:"Separated"}];
const PAY_FREQ_OPT   = [{ value:"MONTHLY",label:"Monthly"},{value:"SEMI_MONTHLY",label:"Semi-monthly"},{value:"WEEKLY",label:"Weekly"},{value:"DAILY",label:"Daily"}];
const SAL_TYPE_OPT   = [{value:"MONTHLY",label:"Monthly"},{value:"DAILY",label:"Daily Rate"},{value:"WEEKLY",label:"Weekly Rate"}];

// ─── Default values ───────────────────────────────────────────────────────────

const DEFAULTS: Partial<CreateEmployeeInput> = {
  gender: "FEMALE",
  nationality: "Philippines",
  employmentStatus: "PROBATIONARY",
  employmentType: "FULL_TIME",
  payFrequency: "SEMI_MONTHLY",
  salaryType: "MONTHLY",
  standardWorkHours: 8,
  standardWorkDays: 22,
  currency: "PHP",
  payMethod: "Cash",
  country: "Philippines",
  needsTimeClock: true,
  geofenceExempt: false,
  attendanceExempt: false,
  allowProfileUpdate: false,
  directoryRole: "Employee",
  pvEmail: "Employee",
  pvBlog: "Employee",
  pvOfficePhone: "Employee",
  pvMobilePhone: "Employee",
  pvHousePhone: "Not Accessible",
  pvAddress: "Not Accessible",
  pvEmergency: "Manager",
  pvBirthday: "Employee",
  pvFamilyBirthday: "Employee",
  pvAnniversary: "Employee",
  numberOfChildren: 0,
  workflowId: null,
  branchId: "",
  jobTypeId: undefined,
  jobStatusId: undefined,
  taxClassification: "REGULAR",
  nontaxableBasicAmount: 0,
  spouseNationality: "Philippines",
  statutoryIds: {
    tinNumber: "",
    sssNumber: "",
    philhealthNumber: "",
    pagibigNumber: "",
    gsisMembershipId: "",
  },
};

// ─── Field error helper ───────────────────────────────────────────────────────

function getErr(errors: FieldErrors<CreateEmployeeInput>, name: string): string | undefined {
  const parts = name.split(".");
  let cur: unknown = errors;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  if (cur && typeof cur === "object" && "message" in cur) {
    return (cur as { message?: string }).message;
  }
  return undefined;
}

// ─── Primitive UI helpers ─────────────────────────────────────────────────────

function Lbl({ text, req }: { text: string; req?: boolean }) {
  return (
    <label className="mb-1.5 block text-[12.5px] font-semibold" style={{ color: "#2A2420" }}>
      {text}{req && <span style={{ color: "#E8693A" }} className="ml-0.5">*</span>}
    </label>
  );
}

function FErr({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-[11.5px]" style={{ color: "#E0463B" }}>{msg}</p>;
}

function FGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-[15px]">{children}</div>;
}

function FSec({ label }: { label: string }) {
  return (
    <div className="col-span-2 mt-2 border-t pt-4 text-[10.5px] font-bold uppercase tracking-[0.1em]"
      style={{ borderColor: "#ECE6DD", color: "#9b9085" }}>
      {label}
    </div>
  );
}

function FNote({ lines }: { lines: string[] }) {
  return (
    <div className="col-span-2 flex gap-3 rounded-[9px] px-4 py-3 text-[12.5px]"
      style={{ background: "#fbf7e9", border: "1px solid #ece2c0", borderLeft: "3px solid #E8693A" }}>
      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ background: "#E8693A" }}>?</span>
      <div className="space-y-0.5">
        {lines.map((l, i) => <p key={i} style={{ color: "#6B6259" }}>{l}</p>)}
      </div>
    </div>
  );
}

// Text / date / number / email / tel field
function TF({
  control, name, label, type = "text", placeholder, req, span2, errors,
}: {
  control: Control<CreateEmployeeInput>;
  name: Path<CreateEmployeeInput>;
  label: string;
  type?: string;
  placeholder?: string;
  req?: boolean;
  span2?: boolean;
  errors: FieldErrors<CreateEmployeeInput>;
}) {
  const msg = getErr(errors, name);
  return (
    <div className={span2 ? "col-span-2" : ""}>
      <Lbl text={label} req={req} />
      <Controller control={control} name={name} render={({ field }) => (
        <Input type={type} placeholder={placeholder}
          {...field} value={(field.value as string) ?? ""}
          className="h-10 text-[13.5px]"
          style={{ borderColor: "#ECE6DD", background: "#fff" }} />
      )} />
      <FErr msg={msg} />
    </div>
  );
}

// Select field (string[] or {value,label}[] options)
function SF({
  control, name, label, options, placeholder, req, span2, errors,
}: {
  control: Control<CreateEmployeeInput>;
  name: Path<CreateEmployeeInput>;
  label: string;
  options: string[] | { value: string; label: string }[];
  placeholder?: string;
  req?: boolean;
  span2?: boolean;
  errors: FieldErrors<CreateEmployeeInput>;
}) {
  const msg = getErr(errors, name);
  const normalised = (options as (string | { value: string; label: string })[]).map((o) =>
    typeof o === "string" ? { value: o, label: o } : o
  );
  return (
    <div className={span2 ? "col-span-2" : ""}>
      <Lbl text={label} req={req} />
      <Controller control={control} name={name} render={({ field }) => (
        <Select value={(field.value as string) ?? ""} onValueChange={field.onChange}>
          <SelectTrigger className="h-10 text-[13.5px]" style={{ borderColor: "#ECE6DD" }}>
            <SelectValue placeholder={placeholder ?? `Select ${label}`} />
          </SelectTrigger>
          <SelectContent>
            {normalised.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )} />
      <FErr msg={msg} />
    </div>
  );
}

// Money field with ₱ prefix
function MF({
  control, name, label, placeholder, req, span2, errors,
}: {
  control: Control<CreateEmployeeInput>;
  name: Path<CreateEmployeeInput>;
  label: string;
  placeholder?: string;
  req?: boolean;
  span2?: boolean;
  errors: FieldErrors<CreateEmployeeInput>;
}) {
  const msg = getErr(errors, name);
  return (
    <div className={span2 ? "col-span-2" : ""}>
      <Lbl text={label} req={req} />
      <Controller control={control} name={name} render={({ field }) => (
        <div className="flex h-10 items-center overflow-hidden rounded-md border text-[13.5px]"
          style={{ borderColor: "#ECE6DD" }}>
          <span className="flex h-full items-center border-r px-3 text-[13px] font-medium"
            style={{ background: "#F6F2EC", color: "#6B6259", borderColor: "#ECE6DD" }}>₱</span>
          <input type="text" inputMode="numeric" placeholder={placeholder ?? "0.00"}
            className="flex-1 border-none bg-white px-3 text-[13.5px] outline-none"
            {...field}
            value={(field.value as string | number) ?? ""}
            onChange={(e) => field.onChange(e.target.value)} />
        </div>
      )} />
      <FErr msg={msg} />
    </div>
  );
}

// Toggle / Switch row.
// `exclusiveWith` makes this toggle mutually exclusive with another boolean
// field: turning this one ON forces the partner OFF (and vice-versa, when the
// partner is wired symmetrically), so both can never be enabled at once.
function ToggleF({
  control, name, label, span2, exclusiveWith, setValue,
}: {
  control: Control<CreateEmployeeInput>;
  name: Path<CreateEmployeeInput>;
  label: string;
  span2?: boolean;
  exclusiveWith?: Path<CreateEmployeeInput>;
  setValue?: UseFormSetValue<CreateEmployeeInput>;
}) {
  return (
    <div className={`flex items-center justify-between rounded-[9px] px-4 py-3 ${span2 ? "col-span-2" : ""}`}
      style={{ background: "#F6F2EC", border: "1px solid #ECE6DD" }}>
      <span className="text-[13.5px]" style={{ color: "#2A2420" }}>{label}</span>
      <Controller control={control} name={name} render={({ field }) => (
        <Switch
          checked={!!field.value}
          onCheckedChange={(checked) => {
            field.onChange(checked);
            if (checked && exclusiveWith && setValue) {
              setValue(exclusiveWith, false as never, { shouldDirty: true, shouldValidate: true });
            }
          }}
        />
      )} />
    </div>
  );
}

// Textarea field
function TAF({
  control, name, label, placeholder, rows = 3, span2,
}: {
  control: Control<CreateEmployeeInput>;
  name: Path<CreateEmployeeInput>;
  label: string;
  placeholder?: string;
  rows?: number;
  span2?: boolean;
}) {
  return (
    <div className={span2 ? "col-span-2" : ""}>
      <Lbl text={label} />
      <Controller control={control} name={name} render={({ field }) => (
        <Textarea rows={rows} placeholder={placeholder}
          {...field} value={(field.value as string) ?? ""}
          className="text-[13.5px] resize-none"
          style={{ borderColor: "#ECE6DD" }} />
      )} />
    </div>
  );
}

// ─── Vertical Stepper ─────────────────────────────────────────────────────────

function VerticalStepper({
  currentStep, doneSteps, onGoTo,
}: {
  currentStep: number;
  doneSteps: Set<number>;
  onGoTo: (i: number) => void;
}) {
  return (
    <div className="xl:sticky xl:top-6 flex xl:flex-col flex-row flex-wrap gap-1">
      {STEPS.map((s, i) => {
        const isDone = doneSteps.has(i);
        const isCur  = i === currentStep;
        return (
          // Any section is freely reachable — the admin isn't forced through
          // steps 1→9 in order; they can jump straight to the fields they need.
          <button key={i} type="button"
            onClick={() => onGoTo(i)}
            className={[
              "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors cursor-pointer hover:bg-[#faf6f0]",
            ].join(" ")}
            style={isCur ? { background: "#fdeee6" } : undefined}
          >
            <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[12px] font-bold"
              style={isDone || isCur
                ? { background: "#E8693A", color: "#fff" }
                : { background: "#ECE6DD", color: "#9b9085" }}>
              {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <div className="hidden xl:block leading-none min-w-0">
              <div className="text-[13px] font-semibold truncate"
                style={{ color: isCur ? "#E8693A" : isDone ? "#2A2420" : "#9b9085" }}>
                {s.id}
              </div>
              <div className="mt-0.5 text-[11px] truncate" style={{ color: "#9b9085" }}>{s.sub}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Success state ────────────────────────────────────────────────────────────

function SuccessState({
  firstName, lastName, position, department, hireDate, onAddAnother,
}: {
  firstName: string; lastName: string; position: string;
  department: string; hireDate: string; onAddAnother: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center max-w-md mx-auto">
      <div className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: "#E5F6EE" }}>
        <Check className="h-8 w-8" style={{ color: "#0FA36B" }} />
      </div>
      <div>
        <h2 className="text-2xl font-bold" style={{ color: "#2A2420" }}>
          {firstName} {lastName} created!
        </h2>
        <p className="mt-1 text-[14px]" style={{ color: "#6B6259" }}>
          {position || "Employee"} · {department || "—"} · joined {hireDate || "—"}
        </p>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={onAddAnother}>Add another</Button>
        <Link href="/employees">
          <Button style={{ background: "#E8693A", color: "#fff" }}>
            Back to Employees <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

// Shown for the Education/Experience/Training steps while creating a new
// employee — these records attach to the employee, so they're added once the
// employee exists (save first, then edit to add history + certificates).
function BackgroundCreateNotice({ what }: { what: string }) {
  return (
    <div className="rounded-[12px] border border-dashed px-5 py-8 text-center" style={{ borderColor: "#ECE6DD" }}>
      <p className="text-[13.5px] font-medium" style={{ color: "#2A2420" }}>
        Save the employee first to add {what}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-[12.5px]" style={{ color: "#9b9085" }}>
        Click <strong>Save employee</strong> below, then reopen them in Edit — this
        section becomes editable once the record exists.
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AddEmployeeWizard({ departments, branches, positions, shiftSchedules, jobTypes, jobStatuses, levels, workflows, employees, mode = "create", employeeId, employeeNumber, hasEssPin = false, initialData, storageReady = false }: Props) {
  const isEdit = mode === "edit";
  const router = useRouter();

  // ESS PIN (Section 9). Not part of the RHF form/schema — it's set via the
  // dedicated /ess-pin endpoint after the employee is created/updated.
  const [essPin, setEssPin] = useState("");
  const [essPinConfirm, setEssPinConfirm] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [clearPin, setClearPin] = useState(false);
  const [step, setStep] = useState(0);
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState(false);
  const [savedInfo, setSavedInfo] = useState({ first:"", last:"", pos:"", dept:"", hireDate:"" });

  const form = useForm<CreateEmployeeInput>({
    // Edit uses updateEmployeeSchema (partial; salary is omitted because it
    // changes only via Movements). Create uses the full required schema.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver((isEdit ? updateEmployeeSchema : createEmployeeSchema) as any),
    defaultValues: (isEdit
      ? { ...DEFAULTS, ...initialData }
      : DEFAULTS) as CreateEmployeeInput,
  });

  const { control, formState: { errors, isSubmitting }, trigger, handleSubmit, reset, setValue } = form;


  // Profile photo upload (R2, tenant-namespaced) — wired to the "Change photo" control.
  const photoRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const watchedDeptId          = form.watch("departmentId");
  const watchedLevelId         = form.watch("levelId");

  useEffect(() => {
    const currentPosId = form.getValues("positionId");
    if (!currentPosId) return;
    const pos = positions.find((p) => p.id === currentPosId);
    if (!pos) return;
    const levelMismatch = watchedLevelId && watchedLevelId !== "none" && pos.levelId !== watchedLevelId;
    const deptMismatch  = pos.departmentId && watchedDeptId && watchedDeptId !== "none" && pos.departmentId !== watchedDeptId;
    if (levelMismatch || deptMismatch) form.setValue("positionId", null);
  }, [watchedDeptId, watchedLevelId, form, positions]);

  async function handlePhotoFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const storageKey = await uploadImage(file, "/api/employees/photo/upload");
      setPhotoPreview(URL.createObjectURL(file));
      setValue("photoKey", storageKey, { shouldDirty: true });
      toast.success("Photo uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleContinue() {
    // In edit mode basicSalary isn't collected (salary is changed via
    // Movements), so don't gate the Salary step on it.
    const fields = STEP_TRIGGER_FIELDS[step].filter(
      (f) => !(isEdit && f === "basicSalary"),
    );
    if (fields.length > 0) {
      const ok = await trigger(fields);
      if (!ok) return;
    }
    setDoneSteps((prev) => new Set([...prev, step]));
    setStep((s) => s + 1);
  }

  // Surfaces validation failures instead of letting handleSubmit silently no-op
  // (RHF won't call onSubmit if any field is invalid). Jumps to the earliest
  // step that owns an invalid field and names — in plain language — what's
  // missing, so the admin can Save from any step and be told what to fix.
  function onInvalid(formErrors: FieldErrors<CreateEmployeeInput>) {
    const names = Object.keys(formErrors);
    const stepIdx = STEP_TRIGGER_FIELDS.findIndex((fs) =>
      fs.some((f) => names.includes(f as string)),
    );
    if (stepIdx >= 0) setStep(stepIdx);
    const labels = names.slice(0, 6).map((k) => {
      const friendly = FIELD_LABELS[k] ?? k;
      const msg = getErr(formErrors, k);
      // Skip the field name when the message already restates it (e.g.
      // "Branch is required"); otherwise prefix with the friendly label.
      return msg && !msg.toLowerCase().includes(friendly.toLowerCase())
        ? `${friendly}: ${msg}`
        : (msg ?? `${friendly} is required`);
    });
    toast.error(
      `Can't save yet — please complete: ${labels.join("; ")}` +
        (names.length > 6 ? ` (+${names.length - 6} more)` : ""),
    );
  }

  async function onSubmit(data: CreateEmployeeInput) {
    // Validate the optional ESS PIN BEFORE creating/updating the employee, so we
    // never persist the employee and then fail on the PIN.
    if (!clearPin && essPin) {
      if (!/^\d{4,8}$/.test(essPin)) {
        setStep(8);
        toast.error("ESS PIN must be 4–8 digits.");
        return;
      }
      if (essPin !== essPinConfirm) {
        setStep(8);
        toast.error("ESS PINs do not match.");
        return;
      }
    }

    const res = await fetch(
      isEdit ? `/api/employees/${employeeId}` : "/api/employees",
      {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = json?.details?.fieldErrors
        ? Object.entries(json.details.fieldErrors as Record<string, string[]>)
            .map(([k, v]) => `${k}: ${v.join(", ")}`)
            .join("\n")
        : json?.error ?? "Request failed";
      toast.error(detail);
      return;
    }

    // ESS PIN is set/cleared via the dedicated endpoint once we have an id.
    const targetId = isEdit ? employeeId : (json?.data?.id as string | undefined);
    if (targetId && (clearPin || essPin)) {
      try {
        const pinRes = await fetch(`/api/employees/${targetId}/ess-pin`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: clearPin ? null : essPin }),
        });
        if (!pinRes.ok) {
          const pj = await pinRes.json().catch(() => null);
          toast.error(`Employee saved, but the ESS PIN update failed: ${pj?.message ?? "please set it from the employee page."}`);
        }
      } catch {
        toast.error("Employee saved, but the ESS PIN update failed — please set it from the employee page.");
      }
    }

    if (isEdit) {
      toast.success("Employee updated");
      router.push(`/employees/${employeeId}`);
      router.refresh();
      return;
    }
    setSavedInfo({
      first: data.firstName,
      last: data.lastName,
      pos: positions.find((p) => p.id === data.positionId)?.title ?? data.jobTitle ?? "",
      dept: departments.find((d) => d.id === data.departmentId)?.name ?? "",
      hireDate: data.hireDate ? String(data.hireDate).slice(0, 10) : "",
    });
    setSaved(true);
    toast.success("Employee created successfully");
    router.refresh();
  }

  function handleAddAnother() {
    reset(DEFAULTS as CreateEmployeeInput);
    setStep(0);
    setDoneSteps(new Set());
    setSaved(false);
    setPhotoPreview(null);
    setEssPin("");
    setEssPinConfirm("");
    setClearPin(false);
  }

  // ─── Step field rendering ────────────────────────────────────────────────

  const c = control;
  const e = errors;

  function renderStep() {
    switch (step) {

      case 0: // Personal
        return (
          <FGrid>
            <div className="col-span-2 flex items-center gap-4 py-1">
              <div
                className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full"
                style={{ background: "#fdeee6", border: "2px dashed #E8693A" }}
              >
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                  <img src={photoPreview} alt="Profile photo" className="h-full w-full object-cover" />
                ) : uploadingPhoto ? (
                  <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#E8693A" }} />
                ) : (
                  <User className="h-7 w-7" style={{ color: "#E8693A" }} />
                )}
              </div>
              <input
                ref={photoRef}
                type="file"
                accept={ACCEPT_ATTR}
                className="hidden"
                onChange={handlePhotoFile}
              />
              <button
                type="button"
                className="text-[13px] font-semibold disabled:opacity-60"
                style={{ color: "#E8693A" }}
                disabled={uploadingPhoto}
                onClick={() => photoRef.current?.click()}
              >
                {uploadingPhoto ? "Uploading…" : photoPreview ? "Change photo" : "Upload photo"}
              </button>
            </div>
            {/* Employee ID — read-only preview; actual value assigned atomically on save */}
            <div className="col-span-2">
              <label className="mb-1.5 block text-[12.5px] font-semibold" style={{ color: "#2A2420" }}>
                Employee ID
              </label>
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-10 items-center rounded-md border px-3 font-mono text-[13.5px] font-semibold min-w-[140px]"
                  style={{ borderColor: "#ECE6DD", background: "#F6F2EC", color: "#E8693A" }}
                >
                  {isEdit ? (employeeNumber ?? "—") : "—"}
                </div>
                <span className="text-[11.5px]" style={{ color: "#9b9085" }}>
                  {isEdit ? "Assigned — cannot be changed" : "Auto-assigned on save"}
                </span>
              </div>
            </div>
            <TF control={c} name="firstName"     label="First Name"   placeholder="Juan"       req   errors={e} />
            <TF control={c} name="middleName"    label="Middle Name"  placeholder="Ponce"            errors={e} />
            <TF control={c} name="lastName"      label="Last Name"    placeholder="dela Cruz"  req   span2 errors={e} />
            <SF control={c} name="gender"        label="Gender"       options={GENDER_OPT}     span2 errors={e} />
            <TF control={c} name="birthDate"     label="Birth Date"   type="date"              span2 errors={e} />
            <SF control={c} name="nationality"   label="Nationality"  options={NATIONS}              span2 errors={e} />
            <TF control={c} name="nationalId"    label="National ID"  placeholder="0000-0000-0000"   errors={e} />
            <TF control={c} name="passportNumber" label="Passport"    placeholder="P0000000A"        errors={e} />
            <SF control={c} name="ethnicity"     label="Ethnicity"    options={ETHNICITIES}          errors={e} />
            <SF control={c} name="religion"      label="Religion"     options={RELIGIONS}            errors={e} />
            <ToggleF control={c} name="allowProfileUpdate" label="Allow employee to update profile" span2 />
          </FGrid>
        );

      case 1: // Government IDs
        return (
          <FGrid>
            <TF control={c} name="statutoryIds.sssNumber"        label="SSS"        placeholder="00-0000000-0"    span2 errors={e} />
            <TF control={c} name="statutoryIds.philhealthNumber"  label="PhilHealth" placeholder="00-000000000-0"  span2 errors={e} />
            <TF control={c} name="statutoryIds.pagibigNumber"     label="Pag-IBIG"   placeholder="0000-0000-0000"  span2 errors={e} />
            <TF control={c} name="statutoryIds.tinNumber"         label="TIN"        placeholder="000-000-000-000" span2 errors={e} />
          </FGrid>
        );

      case 2: // Job
        return (
          <FGrid>
            <TF control={c} name="hireDate"              label="Date Joined"         type="date" req      errors={e} />
            <TF control={c} name="regularizationDate"     label="Regularization Date" type="date"              errors={e} />
            <ToggleF control={c} name="needsTimeClock"    label="Time Clock Needed"                span2 exclusiveWith="attendanceExempt" setValue={setValue} />
            <ToggleF control={c} name="geofenceExempt"    label="Geofence Exempt"                  span2 />
            <ToggleF control={c} name="attendanceExempt"  label="Attendance Exempt (HR Admin only — executives / C-level receive full pay without time-clock records)" span2 exclusiveWith="needsTimeClock" setValue={setValue} />
            <FSec label="Placement" />
            <TF control={c} name="placementEffectiveDate" label="Effective Date" type="date" span2 errors={e} />
            <div className="col-span-2">
              <Lbl text="Level" />
              <Controller control={c} name="levelId" render={({ field }) => (
                <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                  <SelectTrigger className="h-10 text-[13.5px]" style={{ borderColor: "#ECE6DD" }}>
                    <SelectValue placeholder="Select level…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {levels.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="col-span-2">
              <Lbl text="Department" />
              <Controller control={c} name="departmentId" render={({ field }) => (
                <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                  <SelectTrigger className="h-10 text-[13.5px]" style={{ borderColor: "#ECE6DD" }}>
                    <SelectValue placeholder="Select department…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="col-span-2">
              <Lbl text="Job Position" />
              <Controller control={c} name="positionId" render={({ field }) => {
                const hasLevel = watchedLevelId && watchedLevelId !== "none";
                const hasDept  = watchedDeptId  && watchedDeptId  !== "none";
                const filtered = positions.filter((p) => {
                  const levelOk = !hasLevel || p.levelId === watchedLevelId;
                  const deptOk  = !hasDept  || p.departmentId === watchedDeptId;
                  return levelOk && deptOk;
                });
                return (
                  <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                    <SelectTrigger className="h-10 text-[13.5px]" style={{ borderColor: "#ECE6DD" }}>
                      <SelectValue placeholder="Select position…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {filtered.length > 0
                        ? filtered.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)
                        : <SelectItem value="__hint__" disabled>
                            {hasLevel || hasDept ? "No positions match the selected filters" : "Select a level or department first"}
                          </SelectItem>
                      }
                    </SelectContent>
                  </Select>
                );
              }} />
            </div>
            {branches.length === 0 ? (
              <div className="col-span-2">
                <Lbl text="Branch" req />
                <div
                  className="flex gap-3 rounded-[9px] px-4 py-3 text-[12.5px]"
                  style={{ background: "#FDF3EE", border: "1px solid #f3cdb9", borderLeft: "3px solid #E8693A" }}
                >
                  <span
                    className="flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: "#E8693A" }}
                  >!</span>
                  <div className="space-y-1" style={{ color: "#6B6259" }}>
                    <p>No branches exist yet. A branch is required — it determines which holidays apply to this employee at payroll-run time.</p>
                    <Link
                      href="/branches"
                      className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                      style={{ color: "#E8693A" }}
                    >
                      Create a branch first <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <SF
                  control={c}
                  name="branchId"
                  label="Branch"
                  options={branches.map((b) => ({ value: b.id, label: b.name }))}
                  placeholder="Select branch…"
                  req
                  span2
                  errors={e}
                />
                <FNote lines={["Determines which holidays apply to this employee. Holiday pay is resolved per branch at payroll-run time — company-wide holidays apply to everyone; location-specific holidays apply only to the listed branches."]} />
              </>
            )}
            <div className="col-span-2">
              <Lbl text="Approval Workflow" />
              <Controller control={c} name="workflowId" render={({ field }) => (
                <Select value={field.value ? field.value : "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                  <SelectTrigger className="h-10 text-[13.5px]" style={{ borderColor: "#ECE6DD" }}>
                    <SelectValue placeholder="Use level / tenant default…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="italic text-muted-foreground">— Use level / tenant default —</span>
                    </SelectItem>
                    {workflows.map((wf) => (
                      <SelectItem key={wf.id} value={wf.id}>
                        <span className="font-mono">{wf.code}</span>
                        {wf.description && <span className="ml-2 text-muted-foreground text-xs">{wf.description}</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
              <p className="mt-1 text-[11.5px]" style={{ color: "#9b9085" }}>
                Routes this employee&apos;s leave, DTR, and expense approvals. Leave blank to inherit from their level or the tenant default.
              </p>
            </div>
            <FSec label="Reporting Chain" />
            <FNote lines={[
              "Reports To: the person this employee reports to for DTR and leave approvals (Immediate Supervisor).",
              "Line Manager: the manager responsible for this employee's performance and leave approvals.",
              "These fields wire up the approval chain automatically — no separate setup needed.",
            ]} />
            <div className="col-span-2">
              <Lbl text="Reports To (Immediate Supervisor)" />
              <Controller control={c} name="immediateSupervisorId" render={({ field }) => (
                <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                  <SelectTrigger className="h-10 text-[13.5px]" style={{ borderColor: "#ECE6DD" }}>
                    <SelectValue placeholder="Select supervisor…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {[emp.firstName, emp.lastName].filter(Boolean).join(" ")} ({emp.employeeNumber})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="col-span-2">
              <Lbl text="Line Manager" />
              <Controller control={c} name="managerId" render={({ field }) => (
                <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                  <SelectTrigger className="h-10 text-[13.5px]" style={{ borderColor: "#ECE6DD" }}>
                    <SelectValue placeholder="Select manager…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {[emp.firstName, emp.lastName].filter(Boolean).join(" ")} ({emp.employeeNumber})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <FSec label="Employment Terms" />
            <TF control={c} name="termEffectiveDate" label="Effective Date" type="date" span2 errors={e} />
            <SF control={c} name="jobTypeId"         label="Job Type"     options={jobTypes.map((jt) => ({ value: jt.id, label: jt.name }))}  placeholder="Select job type…"  errors={e} />
            <SF control={c} name="jobStatusId"       label="Job Status"   options={jobStatuses.map((js) => ({ value: js.id, label: js.name }))}  placeholder="Select job status…"  errors={e} />
            <div className="col-span-2">
              <Lbl text="Shift Schedule" />
              <Controller control={c} name="shiftScheduleId" render={({ field }) => (
                <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                  <SelectTrigger className="h-10 text-[13.5px]" style={{ borderColor: "#ECE6DD" }}>
                    <SelectValue placeholder="Select shift schedule…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {shiftSchedules.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <TF control={c} name="contractEndDate"   label="Next Review"  type="date" span2                             errors={e} />
          </FGrid>
        );

      case 3: // Salary
        return (
          <FGrid>
            <FSec label="Salary" />
            {isEdit ? (
              // Salary is effective-dated on EmploymentTerm and changes only via
              // Movements (so the payroll engine never desyncs) — read-only here.
              <FNote lines={["Basic salary and salary type are managed through Movements to keep payroll in sync — they can't be edited on this screen."]} />
            ) : (
              <>
                <TF control={c} name="salaryEffectiveDate"  label="Effective Date"    type="date" span2 errors={e} />
                <MF control={c} name="basicSalary"          label="Basic Salary"                  req        errors={e} />
                <SF control={c} name="salaryType"           label="Salary Type"       options={SAL_TYPE_OPT} placeholder="Monthly"    errors={e} />
                <FNote lines={["For hourly rate, you may use Earning."]} />
              </>
            )}
            <SF control={c} name="currency"             label="Currency"          options={CURRENCIES}   placeholder="PHP"        errors={e} />
            <FSec label="Payment" />
            <SF control={c} name="bankName"             label="Bank"              options={BANKS}       placeholder="Select…"       errors={e} />
            <TF control={c} name="bankAccountNumber"    label="Bank Account"                            placeholder="0000 0000 0000" errors={e} />
            <TF control={c} name="bankAccountName"      label="Account Name"                            placeholder="JUAN DELA CRUZ" errors={e} />
            <SF control={c} name="payFrequency"         label="Pay Cycle"         options={PAY_FREQ_OPT} placeholder="Monthly"       errors={e} />
            <SF control={c} name="payMethod"            label="Method"            options={PAY_METHODS}  placeholder="Cash"           errors={e} />
          </FGrid>
        );

      case 4: // Family
        return (
          <FGrid>
            <FSec label="Spouse" />
            <SF control={c} name="civilStatus"     label="Marital Status" options={CIVIL_OPT}   placeholder="Single"      span2 errors={e} />
            <ToggleF control={c} name="spouseWorking" label="Spouse Working" span2 />
            <TF control={c} name="spouseFirstName"  label="First Name"     placeholder="First name"         errors={e} />
            <TF control={c} name="spouseMiddleName" label="Middle Name"    placeholder="Middle name"        errors={e} />
            <TF control={c} name="spouseLastName"   label="Last Name"      placeholder="Last name"   span2  errors={e} />
            <TF control={c} name="spouseBirthDate"  label="Birth Date"     type="date"               span2  errors={e} />
            <SF control={c} name="spouseNationality" label="Nationality"   options={NATIONS}         span2  errors={e} />
            <TF control={c} name="spouseNationalId" label="National ID"    placeholder="0000-0000-0000"     errors={e} />
            <TF control={c} name="spousePassport"   label="Passport"       placeholder="P0000000A"          errors={e} />
            <SF control={c} name="spouseEthnicity"  label="Ethnicity"      options={ETHNICITIES}            errors={e} />
            <SF control={c} name="spouseReligion"   label="Religion"       options={RELIGIONS}              errors={e} />
            <FSec label="Children" />
            <TF control={c} name="numberOfChildren" label="Number of Children" type="number" placeholder="0" span2 errors={e} />
          </FGrid>
        );

      case 5: // Contact
        return (
          <FGrid>
            <FSec label="Web" />
            <TF control={c} name="workEmail"     label="Email (Employee Web Account)" type="email" placeholder="name@email.com" span2 errors={e} />
            <TF control={c} name="personalEmail" label="Personal Email"               type="email" placeholder="name@gmail.com"  span2 errors={e} />
            <TF control={c} name="blogUrl"       label="Blog / Homepage"              placeholder="https://"                     span2 errors={e} />
            <FSec label="Phone" />
            <TF control={c} name="officePhone"   label="Office Phone"   type="tel" placeholder="+63 2 0000 0000"   span2 errors={e} />
            <TF control={c} name="mobileNumber"  label="Mobile Phone"   type="tel" placeholder="+63 9XX XXX XXXX"  span2 errors={e} />
            <TF control={c} name="housePhone"    label="House Phone"    type="tel" placeholder="+63 2 0000 0000"   span2 errors={e} />
            <TF control={c} name="phoneNumber"   label="Alt / Landline" type="tel" placeholder="+63 2 0000 0000"   span2 errors={e} />
            <FSec label="Address" />
            <TF control={c} name="addressLine1"  label="Address 1"      placeholder="House no., street"   span2 errors={e} />
            <TF control={c} name="addressLine2"  label="Address 2"      placeholder="Barangay, district"  span2 errors={e} />
            <TF control={c} name="city"          label="City"           placeholder="City"                      errors={e} />
            <TF control={c} name="postcode"      label="Postcode"       placeholder="0000"                      errors={e} />
            <TF control={c} name="province"      label="State/Province" placeholder="Province"                  errors={e} />
            <TF control={c} name="region"        label="Region"         placeholder="NCR"                       errors={e} />
            <SF control={c} name="country"       label="Country/Region" options={NATIONS} placeholder="Philippines" span2 errors={e} />
          </FGrid>
        );

      case 6: // Health
        return (
          <FGrid>
            <FSec label="Physical" />
            <TF control={c} name="heightCm"  label="Height (cm)"  type="number" placeholder="170" errors={e} />
            <TF control={c} name="weightKg"  label="Weight (kg)"  type="number" placeholder="65"  errors={e} />
            <SF control={c} name="bloodType" label="Blood Type"   options={BLOOD_TYPES} placeholder="Select…" span2 errors={e} />
            <FSec label="Vision" />
            <SF control={c} name="visionL"   label="Left"  options={SENSE} placeholder="Select…" errors={e} />
            <SF control={c} name="visionR"   label="Right" options={SENSE} placeholder="Select…" errors={e} />
            <FSec label="Hearing" />
            <SF control={c} name="hearingL"  label="Left"  options={SENSE} placeholder="Select…" errors={e} />
            <SF control={c} name="hearingR"  label="Right" options={SENSE} placeholder="Select…" errors={e} />
            <FSec label="Hand" />
            <SF control={c} name="handL"     label="Left"  options={LIMB}  placeholder="Select…" errors={e} />
            <SF control={c} name="handR"     label="Right" options={LIMB}  placeholder="Select…" errors={e} />
            <FSec label="Leg" />
            <SF control={c} name="legL"      label="Left"  options={LIMB}  placeholder="Select…" errors={e} />
            <SF control={c} name="legR"      label="Right" options={LIMB}  placeholder="Select…" errors={e} />
          </FGrid>
        );

      case 7: // Directory
        return (
          <FGrid>
            <FSec label="Access Right" />
            <SF control={c} name="directoryRole" label="Employee Role" options={DIR_ROLES} placeholder="Employee" span2 errors={e} />
            <FNote lines={[
              "Guest: No access to the Employee Directory.",
              "Employee: Access to Privacy Level marked as Employee.",
              "Manager: Access to Privacy Level marked as either Employee or Manager.",
            ]} />
            <FSec label="Privacy Level" />
            <SF control={c} name="pvEmail"         label="Email"                options={PRIVACY} placeholder="Employee"       errors={e} />
            <SF control={c} name="pvBlog"          label="Blog / Homepage"      options={PRIVACY} placeholder="Employee"       errors={e} />
            <SF control={c} name="pvOfficePhone"   label="Office Phone"         options={PRIVACY} placeholder="Employee"       errors={e} />
            <SF control={c} name="pvMobilePhone"   label="Mobile Phone"         options={PRIVACY} placeholder="Employee"       errors={e} />
            <SF control={c} name="pvHousePhone"    label="House Phone"          options={PRIVACY} placeholder="Not Accessible" errors={e} />
            <SF control={c} name="pvAddress"       label="Address"              options={PRIVACY} placeholder="Not Accessible" errors={e} />
            <SF control={c} name="pvEmergency"     label="In Case of Emergency" options={PRIVACY} placeholder="Manager"        errors={e} />
            <SF control={c} name="pvBirthday"      label="Birthday"             options={PRIVACY} placeholder="Employee"       errors={e} />
            <SF control={c} name="pvFamilyBirthday" label="Family Birthday"     options={PRIVACY} placeholder="Employee"       errors={e} />
            <SF control={c} name="pvAnniversary"   label="Anniversary"          options={PRIVACY} placeholder="Employee"       errors={e} />
          </FGrid>
        );

      case 8: // Others
        return (
          <FGrid>
            <FSec label="Remark" />
            <TAF control={c} name="remark" label="Remark" placeholder="Remark (2000 characters max)" rows={6} span2 />

            <FSec label="Employee Self-Service (ESS) PIN" />
            <div className="col-span-2 space-y-3">
              <p className="text-[12px]" style={{ color: "#9b9085" }}>
                {isEdit && hasEssPin
                  ? "A PIN is already set. Enter a new PIN to replace it, or leave blank to keep the current one."
                  : "Optional — lets the employee log in to Employee Self-Service with a PIN instead of their date of birth."}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Lbl text={isEdit && hasEssPin ? "New PIN" : "Set PIN"} />
                  <div className="relative">
                    <Input
                      type={showPin ? "text" : "password"}
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="4–8 digits"
                      value={essPin}
                      disabled={clearPin}
                      onChange={(e) => setEssPin(e.target.value.replace(/\D/g, ""))}
                      className="h-10 text-[13.5px] pr-9"
                      style={{ borderColor: "#ECE6DD", background: "#fff" }}
                    />
                    <button type="button" tabIndex={-1} onClick={() => setShowPin((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "#9b9085" }}>
                      {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Lbl text="Confirm PIN" />
                  <Input
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="Re-enter PIN"
                    value={essPinConfirm}
                    disabled={clearPin}
                    onChange={(e) => setEssPinConfirm(e.target.value.replace(/\D/g, ""))}
                    className="h-10 text-[13.5px]"
                    style={{ borderColor: "#ECE6DD", background: "#fff" }}
                  />
                </div>
              </div>
              {isEdit && hasEssPin && (
                <label className="flex items-center gap-2 text-[12.5px]" style={{ color: "#2A2420" }}>
                  <input type="checkbox" checked={clearPin} onChange={(ev) => setClearPin(ev.target.checked)} />
                  Clear PIN (employee will log in with their date of birth)
                </label>
              )}
            </div>
          </FGrid>
        );

      case 9: // Education
        return isEdit && employeeId
          ? <EducationSection employeeId={employeeId} />
          : <BackgroundCreateNotice what="education" />;

      case 10: // Experience
        return isEdit && employeeId
          ? <WorkExperienceSection employeeId={employeeId} />
          : <BackgroundCreateNotice what="work experience" />;

      case 11: // Training
        return isEdit && employeeId
          ? <TrainingSection employeeId={employeeId} storageReady={storageReady} />
          : <BackgroundCreateNotice what="training" />;

      default:
        return null;
    }
  }

  // ─── Success view ─────────────────────────────────────────────────────────

  if (saved) {
    return (
      <SuccessState
        firstName={savedInfo.first}
        lastName={savedInfo.last}
        position={savedInfo.pos}
        department={savedInfo.dept}
        hireDate={savedInfo.hireDate}
        onAddAnother={handleAddAnother}
      />
    );
  }

  // ─── Wizard layout ────────────────────────────────────────────────────────

  const isLast = step === STEPS.length - 1;

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)}>
      <div className="grid grid-cols-1 xl:grid-cols-[232px_1fr] gap-7 max-w-[968px]">

        {/* Left: vertical stepper */}
        <VerticalStepper currentStep={step} doneSteps={doneSteps} onGoTo={setStep} />

        {/* Right: step card + footer */}
        <div className="flex flex-col gap-3">

          {/* Step content card */}
          <div className="rounded-[14px] p-6" style={{ background: "#fff", border: "1px solid #ECE6DD" }}>
            <div className="mb-5">
              <h2 className="text-[19px] font-semibold" style={{ color: "#2A2420" }}>
                {STEPS[step].id}
              </h2>
              <p className="text-[13px]" style={{ color: "#9b9085" }}>
                {STEPS[step].sub}
              </p>
            </div>
            {renderStep()}
          </div>

          {/* Footer bar */}
          <div className="flex items-center justify-between rounded-[10px] px-4 py-3"
            style={{ background: "#fff", border: "1px solid #ECE6DD" }}>
            <span className="text-[13px]" style={{ color: "#9b9085" }}>
              Step {step + 1} of {STEPS.length}
            </span>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button type="button" variant="ghost" size="sm"
                  onClick={() => setStep((s) => s - 1)}>
                  Back
                </Button>
              )}
              <Link href="/employees">
                <Button type="button" variant="ghost" size="sm">Cancel</Button>
              </Link>
              {/* Continue is just optional step-by-step navigation; the HR admin
                  can Save from ANY step once the required fields are filled. */}
              {!isLast && (
                <Button type="button" variant="outline" size="sm" onClick={handleContinue}>
                  Continue
                </Button>
              )}
              <Button type="submit" size="sm" disabled={isSubmitting}
                style={{ background: "#E8693A", color: "#fff" }}>
                {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Save employee"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
