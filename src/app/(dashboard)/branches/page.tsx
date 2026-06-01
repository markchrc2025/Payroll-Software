"use client";

import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, GitBranch, MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// Leaflet uses `window` — must be client-side only
const GeofenceMapPicker = dynamic(
  () => import("@/components/geofence-map-picker"),
  { ssr: false, loading: () => <Skeleton className="h-[340px] w-full" /> },
);

type Branch = {
  id: string;
  name: string;
  city: string | null;
  province: string | null;
  isHeadOffice: boolean;
  _count: { employees: number };
};

type Geofence = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  isActive: boolean;
};

const EMPTY_GEOFENCE_FORM = {
  name: "",
  lat: null as number | null,
  lng: null as number | null,
  radiusMeters: 100,
  isActive: true,
};

const EMPTY_FORM = {
  name: "",
  address: "",
  city: "",
  province: "",
  zipCode: "",
  isHeadOffice: false,
};

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Geofence state
  const [geoSheetOpen, setGeoSheetOpen] = useState(false);
  const [geoBranch, setGeoBranch] = useState<Branch | null>(null);
  const [geoForm, setGeoForm] = useState(EMPTY_GEOFENCE_FORM);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoSubmitting, setGeoSubmitting] = useState(false);

  async function load() {
    setIsLoading(true);
    const res = await fetch("/api/branches");
    const json = await res.json();
    setBranches(json.data ?? []);
    setIsLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  function openEdit(branch: Branch) {
    setEditing(branch);
    setForm({
      name: branch.name,
      address: "",
      city: branch.city ?? "",
      province: branch.province ?? "",
      zipCode: "",
      isHeadOffice: branch.isHeadOffice,
    });
    setSheetOpen(true);
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const url = editing ? `/api/branches/${editing.id}` : "/api/branches";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          address: form.address.trim() || null,
          city: form.city.trim() || null,
          province: form.province.trim() || null,
          zipCode: form.zipCode.trim() || null,
          isHeadOffice: form.isHeadOffice,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to save branch");
        return;
      }
      toast.success(editing ? "Branch updated" : "Branch created");
      setSheetOpen(false);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(branch: Branch) {
    if (branch._count.employees > 0) {
      toast.error(`Cannot delete — ${branch._count.employees} employee(s) assigned`);
      return;
    }
    const res = await fetch(`/api/branches/${branch.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Branch deleted");
      load();
    } else {
      const json = await res.json().catch(() => null);
      toast.error(json?.error ?? "Failed to delete branch");
    }
  }

  async function openGeofence(branch: Branch) {
    setGeoBranch(branch);
    setGeoForm(EMPTY_GEOFENCE_FORM);
    setGeoSheetOpen(true);
    setGeoLoading(true);
    try {
      const res = await fetch(`/api/branches/${branch.id}/geofence`);
      if (res.ok) {
        const json = await res.json();
        const g: Geofence = json.data;
        setGeoForm({
          name: g.name,
          lat: g.latitude,
          lng: g.longitude,
          radiusMeters: g.radiusMeters,
          isActive: g.isActive,
        });
      }
      // 404 = no geofence yet, keep blank defaults
    } finally {
      setGeoLoading(false);
    }
  }

  async function handleGeofenceSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!geoBranch || geoSubmitting) return;
    if (geoForm.lat == null || geoForm.lng == null) {
      toast.error("Please click on the map to set the geofence location");
      return;
    }
    if (geoForm.radiusMeters < 10 || geoForm.radiusMeters > 5000) {
      toast.error("Radius must be between 10 and 5000 metres");
      return;
    }
    setGeoSubmitting(true);
    try {
      const res = await fetch(`/api/branches/${geoBranch.id}/geofence`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: geoForm.name.trim(),
          latitude: geoForm.lat,
          longitude: geoForm.lng,
          radiusMeters: geoForm.radiusMeters,
          isActive: geoForm.isActive,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to save geofence");
        return;
      }
      toast.success("Geofence saved");
      setGeoSheetOpen(false);
    } finally {
      setGeoSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Branches</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${branches.length} branch${branches.length !== 1 ? "es" : ""}`}
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Branch
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Province</TableHead>
              <TableHead className="text-center">HQ</TableHead>
              <TableHead className="text-center">Employees</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : branches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  <GitBranch className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  No branches yet. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              branches.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell className="font-medium">{branch.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {branch.city ?? <span className="italic opacity-40">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {branch.province ?? <span className="italic opacity-40">—</span>}
                  </TableCell>
                  <TableCell className="text-center">
                    {branch.isHeadOffice && (
                      <Badge variant="default" className="text-xs">HQ</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{branch._count.employees}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-sky-600 hover:text-sky-700"
                        title="Configure Geofence"
                        onClick={() => openGeofence(branch)}
                      >
                        <MapPin className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openEdit(branch)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(branch)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Branch" : "Add Branch"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="branch-name">Name <span className="text-destructive">*</span></Label>
              <Input
                id="branch-name"
                ref={nameRef}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Makati Head Office"
                required
                maxLength={150}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-address">Address</Label>
              <Input
                id="branch-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Street address"
                maxLength={500}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="branch-city">City</Label>
                <Input
                  id="branch-city"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Makati"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="branch-province">Province</Label>
                <Input
                  id="branch-province"
                  value={form.province}
                  onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
                  placeholder="Metro Manila"
                  maxLength={100}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-zip">ZIP Code</Label>
              <Input
                id="branch-zip"
                value={form.zipCode}
                onChange={(e) => setForm((f) => ({ ...f, zipCode: e.target.value }))}
                placeholder="1200"
                maxLength={10}
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="branch-hq"
                checked={form.isHeadOffice}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isHeadOffice: Boolean(v) }))}
              />
              <Label htmlFor="branch-hq" className="cursor-pointer font-normal">
                This is the Head Office
              </Label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? "Saving…" : editing ? "Save Changes" : "Create Branch"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheetOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Geofence Dialog — wider so the map has room */}
      <Dialog open={geoSheetOpen} onOpenChange={setGeoSheetOpen}>
        <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-sky-600" />
              Configure Geofence — {geoBranch?.name}
            </DialogTitle>
            <DialogDescription>
              Click on the map to drop a pin. Drag the marker to fine-tune. Use the slider to set the enforcement radius.
            </DialogDescription>
          </DialogHeader>

          {geoLoading ? (
            <div className="space-y-4 py-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-[340px] w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <form onSubmit={handleGeofenceSubmit} className="space-y-4">
              {/* Label */}
              <div className="space-y-1.5">
                <Label htmlFor="geo-name">
                  Label <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="geo-name"
                  value={geoForm.name}
                  onChange={(e) => setGeoForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Makati Head Office Geofence"
                  required
                  maxLength={150}
                />
              </div>

              {/* Interactive map */}
              <GeofenceMapPicker
                lat={geoForm.lat}
                lng={geoForm.lng}
                radius={geoForm.radiusMeters}
                onChange={(lat, lng) =>
                  setGeoForm((f) => ({ ...f, lat, lng }))
                }
              />

              {/* Coordinates read-out */}
              {geoForm.lat != null ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Navigation className="h-3 w-3 shrink-0" />
                  {Number(geoForm.lat).toFixed(6)},&nbsp;{Number(geoForm.lng).toFixed(6)}
                  <span className="ml-1 italic">(click the map to move)</span>
                </p>
              ) : (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Click anywhere on the map above to place the geofence pin.
                </p>
              )}

              {/* Radius slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="geo-radius">Radius</Label>
                  <span className="text-sm font-semibold tabular-nums">
                    {geoForm.radiusMeters} m
                  </span>
                </div>
                <input
                  id="geo-radius"
                  type="range"
                  min={10}
                  max={1000}
                  step={10}
                  value={geoForm.radiusMeters}
                  onChange={(e) =>
                    setGeoForm((f) => ({ ...f, radiusMeters: parseInt(e.target.value) }))
                  }
                  className="w-full accent-sky-600"
                />
                {/* Preset quick-select buttons */}
                <div className="flex flex-wrap gap-1.5">
                  {[50, 100, 150, 200, 300, 500].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setGeoForm((f) => ({ ...f, radiusMeters: r }))}
                      className={`rounded border px-2 py-0.5 text-xs transition-colors ${
                        geoForm.radiusMeters === r
                          ? "border-sky-600 bg-sky-600 text-white"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {r} m
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-x-4 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <p>Single-floor office: <strong>50–100 m</strong></p>
                  <p>Mall / multi-floor: <strong>100–150 m</strong></p>
                  <p>Outdoor / field site: <strong>150–300 m</strong></p>
                  <p>Multi-building campus: <strong>200–500 m</strong></p>
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="geo-active"
                  checked={geoForm.isActive}
                  onCheckedChange={(v) =>
                    setGeoForm((f) => ({ ...f, isActive: Boolean(v) }))
                  }
                />
                <Label htmlFor="geo-active" className="cursor-pointer font-normal">
                  Geofence is active (enforce on clock-in)
                </Label>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setGeoSheetOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={geoSubmitting}>
                  {geoSubmitting ? "Saving…" : "Save Geofence"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
