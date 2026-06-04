"use client";

/**
 * EmployeeForm — multi-section form for creating and editing employees.
 *
 * Sections:
 *   1. Personal Information
 *   2. Contact & Address
 *   3. Employment Details
 *   4. Salary & Payroll Settings
 *   5. Bank Details
 *   6. Statutory & Tax Information
 *
 * Used by:
 *   • /employees/new      → mode="create", no initialData
 *   • /employees/[id]/edit → mode="edit",  initialData = existing employee
 */

import { useForm } from "react-hook-form";
import type { Path, Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { createEmployeeSchema, updateEmployeeSchema, type CreateEmployeeInput } from "@/lib/validations/employee";

// ---------------------------------------------------------------------------
// Select options (Philippine-localised)
// ---------------------------------------------------------------------------

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other / Prefer not to say" },
];

const CIVIL_STATUS_OPTIONS = [
  { value: "SINGLE", label: "Single" },
  { value: "MARRIED", label: "Married" },
  { value: "WIDOWED", label: "Widowed" },
  { value: "LEGALLY_SEPARATED", label: "Legally Separated" },
  { value: "ANNULLED", label: "Annulled" },
];

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "FULL_TIME", label: "Full-Time" },
  { value: "PART_TIME", label: "Part-Time" },
  { value: "CASUAL", label: "Casual" },
];

const EMPLOYMENT_STATUS_OPTIONS = [
  { value: "REGULAR", label: "Regular" },
  { value: "PROBATIONARY", label: "Probationary" },
  { value: "CONTRACTUAL", label: "Contractual" },
  { value: "PROJECT_BASED", label: "Project-Based" },
  { value: "RESIGNED", label: "Resigned" },
  { value: "TERMINATED", label: "Terminated" },
  { value: "RETIRED", label: "Retired" },
];

const PAY_FREQUENCY_OPTIONS = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "SEMI_MONTHLY", label: "Semi-Monthly (1st & 15th)" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "DAILY", label: "Daily" },
];

const SALARY_TYPE_OPTIONS = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "DAILY", label: "Daily Rate" },
  { value: "HOURLY", label: "Hourly Rate" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Department = { id: string; name: string };
type Branch = { id: string; name: string };

// ---------------------------------------------------------------------------
// Field helpers — defined OUTSIDE EmployeeForm so their type identity is
// stable across renders (prevents React from unmounting/remounting inputs).
// ---------------------------------------------------------------------------

function TextField({
  control,
  name,
  label,
  placeholder,
  type = "text",
}: {
  control: Control<CreateEmployeeInput>;
  name: Path<CreateEmployeeInput>;
  label: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type={type}
              placeholder={placeholder}
              {...field}
              value={(field.value as string) ?? ""}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function SelectField({
  control,
  name,
  label,
  options,
  placeholder,
}: {
  control: Control<CreateEmployeeInput>;
  name: Path<CreateEmployeeInput>;
  label: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select
            value={(field.value as string) ?? ""}
            onValueChange={field.onChange}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={placeholder ?? `Select ${label}`} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

type Props = {
  mode: "create" | "edit";
  employeeId?: string;
  initialData?: Partial<CreateEmployeeInput>;
  departments: Department[];
  branches: Branch[];
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmployeeForm({
  mode,
  employeeId,
  initialData,
  departments,
  branches,
}: Props) {
  const router = useRouter();
  const schema = mode === "create" ? createEmployeeSchema : updateEmployeeSchema;

  const form = useForm<CreateEmployeeInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as any),
    defaultValues: {
      employmentStatus: "PROBATIONARY",
      employmentType: "FULL_TIME",
      payFrequency: "SEMI_MONTHLY",
      salaryType: "MONTHLY",
      standardWorkHours: 8,
      standardWorkDays: 22,
      statutoryIds: {
        tinNumber: "",
        sssNumber: "",
        philhealthNumber: "",
        pagibigNumber: "",
        gsisMembershipId: "",
        taxExempt: false,
        taxExemptReason: "",
      },
      ...initialData,
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: CreateEmployeeInput): Promise<void> {    const url =
      mode === "create" ? "/api/employees" : `/api/employees/${employeeId}`;
    const method = mode === "create" ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const detail =
        json?.details?.fieldErrors
          ? Object.entries(json.details.fieldErrors as Record<string, string[]>)
              .map(([k, v]) => `${k}: ${v.join(", ")}`)
              .join("\n")
          : json?.error ?? "Request failed";
      toast.error(detail);
      return;
    }

    toast.success(
      mode === "create"
        ? "Employee created successfully"
        : "Employee updated successfully"
    );
    router.push("/employees");
    router.refresh();
  }

  const ctrl = form.control;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-3xl">
        {/* ─── Section 1: Personal Information ─────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">Personal Information</h2>
            <Separator className="mt-2" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TextField control={ctrl} name="firstName" label="First Name *" placeholder="Juan" />
            <TextField control={ctrl} name="middleName" label="Middle Name" placeholder="Santos" />
            <TextField control={ctrl} name="lastName" label="Last Name *" placeholder="Dela Cruz" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TextField control={ctrl} name="suffix" label="Suffix" placeholder="Jr., III…" />
            <TextField
              control={ctrl}
              name="birthDate"
              label="Date of Birth"
              type="date"
            />
            <SelectField
              control={ctrl}
              name="gender"
              label="Gender"
              options={GENDER_OPTIONS}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              control={ctrl}
              name="civilStatus"
              label="Civil Status"
              options={CIVIL_STATUS_OPTIONS}
            />
            <TextField control={ctrl} name="nationality" label="Nationality" placeholder="Filipino" />
          </div>
        </section>

        {/* ─── Section 2: Contact & Address ────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">Contact & Address</h2>
            <Separator className="mt-2" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField
              control={ctrl}
              name="mobileNumber"
              label="Mobile Number"
              placeholder="09171234567"
            />
            <TextField
              control={ctrl}
              name="workEmail"
              label="Work Email"
              type="email"
              placeholder="juan@company.com"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField
              control={ctrl}
              name="personalEmail"
              label="Personal Email"
              type="email"
              placeholder="juan@gmail.com"
            />
            <TextField
              control={ctrl}
              name="phoneNumber"
              label="Landline / Alt Phone"
              placeholder="(02) 8000-0000"
            />
          </div>
          <TextField
            control={ctrl}
            name="addressLine1"
            label="Address Line 1"
            placeholder="Unit / House No., Street"
          />
          <TextField
            control={ctrl}
            name="addressLine2"
            label="Address Line 2"
            placeholder="Barangay, Subdivision"
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <TextField control={ctrl} name="city" label="City / Municipality" placeholder="Quezon City" />
            <TextField control={ctrl} name="province" label="Province" placeholder="Metro Manila" />
            <TextField control={ctrl} name="zipCode" label="ZIP Code" placeholder="1100" />
            <TextField control={ctrl} name="region" label="Region" placeholder="NCR" />
          </div>
        </section>

        {/* ─── Section 3: Employment Details ───────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">Employment Details</h2>
            <Separator className="mt-2" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="departmentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <Select
                    value={field.value ?? "none"}
                    onValueChange={(v: string | null) =>
                      field.onChange(v === "none" ? null : v)
                    }
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">— No Department —</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="branchId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Branch</FormLabel>
                  <Select
                    value={field.value ?? "none"}
                    onValueChange={(v: string | null) =>
                      field.onChange(v === "none" ? null : v)
                    }
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select branch" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">— No Branch —</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField control={ctrl} name="jobTitle" label="Job Title" placeholder="Software Engineer" />
            <TextField control={ctrl} name="jobLevel" label="Job Level / Grade" placeholder="L3, Senior…" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              control={ctrl}
              name="employmentType"
              label="Employment Type *"
              options={EMPLOYMENT_TYPE_OPTIONS}
            />
            <SelectField
              control={ctrl}
              name="employmentStatus"
              label="Employment Status *"
              options={EMPLOYMENT_STATUS_OPTIONS}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField control={ctrl} name="hireDate" label="Hire Date *" type="date" />
            <TextField
              control={ctrl}
              name="regularizationDate"
              label="Regularization Date"
              type="date"
            />
          </div>
        </section>

        {/* ─── Section 4: Salary & Payroll Settings ────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">Salary & Payroll Settings</h2>
            <Separator className="mt-2" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SelectField
              control={ctrl}
              name="payFrequency"
              label="Pay Frequency *"
              options={PAY_FREQUENCY_OPTIONS}
            />
            <SelectField
              control={ctrl}
              name="salaryType"
              label="Salary Type *"
              options={SALARY_TYPE_OPTIONS}
            />
            {mode === "create" && (
              <TextField
                control={ctrl}
                name="basicSalary"
                label="Basic Salary (₱) *"
                type="number"
                placeholder="35000"
              />
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField
              control={ctrl}
              name="standardWorkHours"
              label="Standard Work Hours / Day"
              type="number"
              placeholder="8"
            />
            <TextField
              control={ctrl}
              name="standardWorkDays"
              label="Standard Work Days / Month"
              type="number"
              placeholder="22"
            />
          </div>
          {mode === "edit" && (
            <p className="text-xs text-muted-foreground">
              To change the salary, use the Salary History section on the employee profile (effective-dated).
            </p>
          )}
        </section>

        {/* ─── Section 5: Bank Details ──────────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">Bank Details</h2>
            <Separator className="mt-2" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TextField control={ctrl} name="bankName" label="Bank Name" placeholder="BDO, BPI, Metrobank…" />
            <TextField
              control={ctrl}
              name="bankAccountNumber"
              label="Account Number"
              placeholder="1234567890"
            />
            <TextField
              control={ctrl}
              name="bankAccountName"
              label="Account Name"
              placeholder="JUAN S DELA CRUZ"
            />
          </div>
        </section>

        {/* ─── Section 6: Statutory & Tax Information ──────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">Statutory & Tax Information</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Philippine government IDs used for SSS, PhilHealth, Pag-IBIG, and BIR contributions.
            </p>
            <Separator className="mt-2" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField
              control={ctrl}
              name="statutoryIds.tinNumber"
              label="TIN (Tax Identification Number)"
              placeholder="123-456-789-000"
            />
            <TextField
              control={ctrl}
              name="statutoryIds.sssNumber"
              label="SSS Number"
              placeholder="01-2345678-9"
            />
            <TextField
              control={ctrl}
              name="statutoryIds.philhealthNumber"
              label="PhilHealth Number"
              placeholder="12-345678901-2"
            />
            <TextField
              control={ctrl}
              name="statutoryIds.pagibigNumber"
              label="Pag-IBIG MID Number"
              placeholder="1234-5678-9012"
            />
            <TextField
              control={ctrl}
              name="statutoryIds.gsisMembershipId"
              label="GSIS Membership ID (gov't employees)"
              placeholder="Optional"
            />
          </div>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <FormField
            control={form.control}
            name={"statutoryIds.taxExempt" as Path<CreateEmployeeInput>}
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-3 rounded-md border p-3">
                <FormControl>
                  <Checkbox
                    checked={!!field.value}
                    onCheckedChange={(checked: boolean) => field.onChange(checked)}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Tax-exempt employee</FormLabel>
                  <p className="text-xs text-muted-foreground">
                    Minimum wage earners and certain BIR-exempt cases. Withholding tax will be skipped.
                  </p>
                </div>
              </FormItem>
            )}
          />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <FormField
            control={form.control}
            name={"statutoryIds.taxExemptReason" as Path<CreateEmployeeInput>}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tax Exemption Reason</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    placeholder="e.g. Minimum wage earner under RA 9504"
                    {...field}
                    value={(field.value as string) ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        {/* ─── Actions ─────────────────────────────────────────────────────── */}
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? mode === "create"
                ? "Creating…"
                : "Saving…"
              : mode === "create"
              ? "Create Employee"
              : "Save Changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/employees")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
