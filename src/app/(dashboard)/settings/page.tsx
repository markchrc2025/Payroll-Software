"use client";

/**
 * /settings — Company & Branding
 * Fetch and update tenant identity: name, trade name, industry, address,
 * contact info, logo URL.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Save, RefreshCw, Building2, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { uploadImage, ACCEPT_ATTR } from "@/lib/upload-image";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const INDUSTRY_LIST = [
  "Agriculture",
  "BPO / Outsourcing",
  "Construction",
  "Education",
  "Financial Services",
  "Food & Beverage",
  "Government",
  "Healthcare",
  "Hospitality & Tourism",
  "IT / Software",
  "Legal Services",
  "Logistics / Supply Chain",
  "Manufacturing",
  "Media & Advertising",
  "Non-Profit / NGO",
  "Real Estate",
  "Retail / E-Commerce",
  "Telecommunications",
  "Transport",
  "Other",
];

type TenantInfo = {
  name: string;
  tradeName: string;
  industry: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  city: string;
  province: string;
  zipCode: string;
  logoUrl: string;
  logoKey: string;
};

const EMPTY: TenantInfo = {
  name: "",
  tradeName: "",
  industry: "",
  contactEmail: "",
  contactPhone: "",
  address: "",
  city: "",
  province: "",
  zipCode: "",
  logoUrl: "",
  logoKey: "",
};

export default function CompanyBrandingPage() {
  const [saved, setSaved] = useState<TenantInfo>(EMPTY);
  const [form, setForm] = useState<TenantInfo>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  // Local object-URL preview of a just-picked logo (before it's reloaded from R2).
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  // Cache-buster for the logo serve route, bumped after each successful upload.
  const [logoVersion, setLogoVersion] = useState(() => Date.now());
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/settings/tenant");
    if (res.ok) {
      const json = await res.json();
      const d = json.data;
      const loaded: TenantInfo = {
        name:         d.name ?? "",
        tradeName:    d.tradeName ?? "",
        industry:     d.industry ?? "",
        contactEmail: d.contactEmail ?? "",
        contactPhone: d.contactPhone ?? "",
        address:      d.address ?? "",
        city:         d.city ?? "",
        province:     d.province ?? "",
        zipCode:      d.zipCode ?? "",
        logoUrl:      d.logoUrl ?? "",
        logoKey:      d.logoKey ?? "",
      };
      setSaved(loaded);
      setForm(loaded);
      setLogoPreview(null);
      setLogoVersion(Date.now());
    }
    setLoading(false);
    setDirty(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function set<K extends keyof TenantInfo>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setUploadingLogo(true);
    try {
      const storageKey = await uploadImage(file, "/api/settings/tenant/logo/presign");
      setLogoPreview(URL.createObjectURL(file));
      // Uploaded logo supersedes any legacy external URL.
      setForm((f) => ({ ...f, logoKey: storageKey, logoUrl: "" }));
      setDirty(true);
      toast.success("Logo uploaded — save to apply.");
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Upload failed");
    } finally {
      setUploadingLogo(false);
    }
  }

  // Resolve what to render in the logo preview box.
  const logoSrc = logoPreview
    ? logoPreview
    : form.logoKey
      ? `/api/settings/tenant/logo?v=${logoVersion}`
      : form.logoUrl || null;

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Company name is required"); return; }
    setSaving(true);
    const body: Record<string, string | null> = {
      name:         form.name,
      tradeName:    form.tradeName || null,
      industry:     form.industry  || null,
      contactEmail: form.contactEmail || null,
      contactPhone: form.contactPhone || null,
      address:      form.address  || null,
      city:         form.city     || null,
      province:     form.province || null,
      zipCode:      form.zipCode  || null,
      logoUrl:      form.logoUrl  || null,
      logoKey:      form.logoKey  || null,
    };
    const res = await fetch("/api/settings/tenant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(json.error ?? "Failed to save"); return; }
    toast.success("Company info saved");
    setSaved(form);
    setDirty(false);
    setLogoPreview(null);
    setLogoVersion(Date.now());
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.4px] text-[#111827] leading-tight">
            Company &amp; Branding
          </h1>
          <p className="text-[13px] text-[#6B7A8D] mt-0.5">
            Your company&apos;s legal identity and contact details. Appears on payslips and reports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9 text-[13px]">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {dirty && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="h-9 text-[13px] bg-[#E8693A] hover:bg-[#C2552F] text-white"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm p-5 space-y-4">
              <Skeleton className="h-4 w-40" />
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* ── Logo ── */}
          <Section title="Logo" icon={<Building2 className="h-4 w-4 text-[#E8693A]" />}>
            <div className="flex items-start gap-5">
              <div
                className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-[#E8EBF1] bg-[#F5F6FA] overflow-hidden"
              >
                {logoSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoSrc} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <Building2 className="h-8 w-8 text-[#C5CDD7]" />
                )}
              </div>
              <div className="flex-1 space-y-1.5">
                <Label>Company Logo</Label>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPT_ATTR}
                  className="hidden"
                  onChange={handleLogoFile}
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-[13px]"
                    disabled={uploadingLogo}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploadingLogo ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {uploadingLogo ? "Uploading…" : logoSrc ? "Replace logo" : "Upload logo"}
                  </Button>
                  {logoSrc && !uploadingLogo && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 text-[13px] text-[#9AA5B4]"
                      onClick={() => {
                        setLogoPreview(null);
                        setForm((f) => ({ ...f, logoKey: "", logoUrl: "" }));
                        setDirty(true);
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs text-[#9AA5B4]">
                  Upload a JPG, PNG, or WebP image (max 5 MB). Recommended: 400×400 px. Stored securely in your company&apos;s file storage.
                </p>
              </div>
            </div>
          </Section>

          {/* ── Identity ── */}
          <Section title="Company Identity">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Legal Name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Acme Corporation Inc."
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
                <p className="text-xs text-[#9AA5B4]">Registered name with SEC / DTI</p>
              </div>
              <div className="space-y-1.5">
                <Label>Display / Trade Name</Label>
                <Input
                  placeholder="Acme Corp"
                  value={form.tradeName}
                  onChange={(e) => set("tradeName", e.target.value)}
                />
                <p className="text-xs text-[#9AA5B4]">Shown on payslips if different from legal name</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Industry</Label>
              <Select
                value={form.industry || "__none__"}
                onValueChange={(v) => set("industry", !v || v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select industry…" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="__none__">—</SelectItem>
                  {INDUSTRY_LIST.map((ind) => (
                    <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Section>

          {/* ── Contact ── */}
          <Section title="Contact Information">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Contact Email</Label>
                <Input
                  type="email"
                  placeholder="hr@acme.com"
                  value={form.contactEmail}
                  onChange={(e) => set("contactEmail", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Phone</Label>
                <Input
                  type="tel"
                  placeholder="+63 2 8XXX XXXX"
                  value={form.contactPhone}
                  onChange={(e) => set("contactPhone", e.target.value)}
                />
              </div>
            </div>
          </Section>

          {/* ── Address ── */}
          <Section title="Office Address">
            <div className="space-y-1.5">
              <Label>Street Address</Label>
              <Input
                placeholder="123 Main Street, Brgy. San Lorenzo"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>City</Label>
                <Input
                  placeholder="Makati City"
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>ZIP Code</Label>
                <Input
                  placeholder="1200"
                  maxLength={10}
                  value={form.zipCode}
                  onChange={(e) => set("zipCode", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Province / State</Label>
              <Input
                placeholder="Metro Manila"
                value={form.province}
                onChange={(e) => set("province", e.target.value)}
              />
            </div>
          </Section>
        </div>
      )}

      {/* ── Save bar ── */}
      {dirty && !loading && (
        <div className="sticky bottom-0 flex items-center justify-between rounded-xl border border-[#fdeee6] bg-[#fdeee6] px-5 py-3 shadow-sm">
          <p className="text-[13px] text-[#E8693A] font-medium">You have unsaved changes</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[13px]"
              onClick={() => { setForm(saved); setDirty(false); }}
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="h-8 text-[13px] bg-[#E8693A] hover:bg-[#C2552F] text-white"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#E8EBF1] shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-[14px] font-semibold text-[#111827]">{title}</h2>
      </div>
      {children}
    </div>
  );
}
