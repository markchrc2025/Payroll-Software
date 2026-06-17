"use client";

/**
 * Configure Geofence — modal (Branches).
 *
 * Redesign of the branch geofence editor: a wide, two-pane, non-scrolling
 * dialog — large interactive map on the left, controls stacked on the right,
 * actions pinned in the footer. Wired to the same data source / save endpoint
 * as before (`GET`/`PUT /api/branches/[id]/geofence` via the parent page);
 * only markup, layout, and styling change.
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, Building2, X, Info, Crosshair, Target, Check } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

// Leaflet uses `window` — must be client-side only
const GeofenceMapPicker = dynamic(() => import("@/components/geofence-map-picker"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-[#e9eef0]" />,
});

export type GeoForm = {
  name: string;
  lat: number | null;
  lng: number | null;
  radiusMeters: number;
  isActive: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch: { name: string; city: string | null } | null;
  loading: boolean;
  submitting: boolean;
  form: GeoForm;
  setForm: React.Dispatch<React.SetStateAction<GeoForm>>;
  onSubmit: (e: React.FormEvent) => void;
};

const PRESETS = [50, 100, 150, 200, 300, 500] as const;
const RADIUS_MIN = 20;
const RADIUS_MAX = 500;

/** m² = π·r²; ≥ 1 ha → hectares, else square metres. */
function formatArea(radius: number): string {
  const m2 = Math.PI * radius * radius;
  const ha = m2 / 10000;
  if (ha >= 1) return `${ha.toFixed(1)} ha`;
  return `${Math.round(m2).toLocaleString()} m²`;
}

function clampRadius(r: number): number {
  return Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, r));
}

export function ConfigureGeofenceDialog({
  open,
  onOpenChange,
  branch,
  loading,
  submitting,
  form,
  setForm,
  onSubmit,
}: Props) {
  // Bump to ask the map to re-frame around the circle (recenter / preset fit).
  const [recenterToken, setRecenterToken] = useState(0);
  const bumpRecenter = () => setRecenterToken((t) => t + 1);

  const hasPin = form.lat != null && form.lng != null;
  const activePreset = PRESETS.includes(form.radiusMeters as (typeof PRESETS)[number])
    ? form.radiusMeters
    : null;
  const area = formatArea(form.radiusMeters);
  const cityLabel = branch?.city?.trim() || "the selected location";
  const canSave = hasPin && form.name.trim().length > 0 && !submitting;

  function setRadius(r: number) {
    setForm((f) => ({ ...f, radiusMeters: clampRadius(r) }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex w-[min(980px,96vw)] max-w-[min(980px,96vw)] sm:max-w-[min(980px,96vw)] h-[min(740px,97vh)] flex-col gap-0 overflow-hidden rounded-[20px] border-[#ECE6DD] bg-white p-0 shadow-[0_40px_90px_-30px_rgba(33,26,21,0.62)]"
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <header className="flex flex-none items-start gap-[14px] border-b border-[#f1ece4] px-[22px] pt-[18px] pb-[15px]">
          <div className="flex size-[42px] flex-none items-center justify-center rounded-[12px] bg-[#fdeee6] text-[#E8693A]">
            <MapPin className="size-[22px]" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-[10px]">
              <DialogTitle className="m-0 font-sans text-[19px] font-semibold tracking-[-0.02em] text-[#2A2420]">
                Configure Geofence
              </DialogTitle>
              {branch && (
                <span className="inline-flex items-center gap-[6px] rounded-full bg-[#fdeee6] px-[11px] py-[3px] font-sans text-[12px] font-semibold text-[#C2552F]">
                  <Building2 className="size-3" strokeWidth={2.4} />
                  {branch.name}
                </span>
              )}
            </div>
            <DialogDescription className="mt-1 max-w-[600px] font-[family-name:var(--font-hanken-grotesk)] text-[13px] leading-[1.45] text-[#6B6259]">
              Drop a pin to mark the clock-in point, drag to fine-tune, then set the enforcement
              radius. Employees can only clock in inside this boundary.
            </DialogDescription>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
            className="flex size-[36px] flex-none items-center justify-center rounded-[10px] border border-[#ECE6DD] bg-white text-[#6B6259] transition-colors hover:bg-[#f6f1ea] hover:text-[#2A2420]"
          >
            <X className="size-[18px]" strokeWidth={2.2} />
          </button>
        </header>

        {/* ── Body: two panes ──────────────────────────────────────────── */}
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col min-[860px]:flex-row">
          {/* LEFT — map pane */}
          <section className="flex min-h-[300px] flex-col gap-[12px] border-b border-[#f1ece4] p-[18px] min-[860px]:min-h-0 min-[860px]:flex-[1.42_1_0%] min-[860px]:border-r min-[860px]:border-b-0">
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-[13px] border border-[#ECE6DD]">
              {loading ? (
                <div className="absolute inset-0 animate-pulse bg-[#e9eef0]" />
              ) : (
                <>
                  <GeofenceMapPicker
                    lat={form.lat}
                    lng={form.lng}
                    radius={form.radiusMeters}
                    recenterToken={recenterToken}
                    onChange={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))}
                  />
                  {!hasPin && (
                    <div className="pointer-events-none absolute inset-x-0 top-3 z-[400] mx-auto w-fit rounded-full bg-[#2A2420]/85 px-3.5 py-1.5 font-sans text-[12px] font-medium text-white shadow-lg">
                      Click the map to place a pin
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Coordinate read-out bar */}
            <div className="flex flex-none items-center gap-[14px] rounded-[11px] border border-[#ECE6DD] bg-[#F6F2EC] px-[14px] py-[11px]">
              <div className="flex flex-col gap-[2px]">
                <span className="font-sans text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#9b9085]">
                  Latitude
                </span>
                <b className="font-mono text-[13px] font-semibold text-[#2A2420]">
                  {form.lat != null ? form.lat.toFixed(5) : "—"}
                </b>
              </div>
              <div className="h-7 w-px self-stretch bg-[#ECE6DD]" />
              <div className="flex flex-col gap-[2px]">
                <span className="font-sans text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#9b9085]">
                  Longitude
                </span>
                <b className="font-mono text-[13px] font-semibold text-[#2A2420]">
                  {form.lng != null ? form.lng.toFixed(5) : "—"}
                </b>
              </div>
              <div className="h-7 w-px self-stretch bg-[#ECE6DD]" />
              <div className="flex flex-col gap-[2px]">
                <span className="font-sans text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#9b9085]">
                  Coverage
                </span>
                <b className="font-mono text-[13px] font-semibold text-[#2A2420]">{area}</b>
              </div>
              <button
                type="button"
                onClick={bumpRecenter}
                disabled={!hasPin}
                className="ml-auto inline-flex items-center gap-[6px] rounded-[8px] border border-[#ECE6DD] bg-white px-[11px] py-[7px] font-sans text-[12px] font-semibold text-[#C2552F] transition-colors hover:border-[#ddd3c6] hover:bg-[#f6f1ea] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Crosshair className="size-[14px]" strokeWidth={2} />
                Center on pin
              </button>
            </div>
          </section>

          {/* RIGHT — control pane */}
          <section className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto px-[22px] py-[14px]">
            {/* Label */}
            <div className="flex flex-col gap-[7px]">
              <label
                htmlFor="gf-name"
                className="flex items-center gap-1 font-sans text-[12.5px] font-semibold text-[#2A2420]"
              >
                Geofence label <span className="font-bold text-[#E8693A]">*</span>
              </label>
              <Input
                id="gf-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Quezon City Head Office"
                maxLength={150}
                className="h-[42px] rounded-[10px] border-[#ECE6DD] bg-white px-[13px] font-[family-name:var(--font-hanken-grotesk)] text-[14px] text-[#2A2420] placeholder:text-[#9b9085] focus-visible:border-[#E8693A] focus-visible:ring-[3px] focus-visible:ring-[#fdeee6]"
              />
            </div>

            <div className="my-[9px] h-px bg-[#f1ece4]" />

            {/* Radius */}
            <div className="mb-[10px] flex items-baseline justify-between">
              <span className="font-sans text-[13px] font-semibold text-[#2A2420]">
                Enforcement radius
              </span>
              <span className="flex items-baseline gap-1">
                <b className="font-sans text-[26px] font-semibold leading-none tracking-[-0.02em] text-[#2A2420]">
                  {form.radiusMeters}
                </b>
                <span className="font-sans text-[13px] font-semibold text-[#9b9085]">m</span>
              </span>
            </div>
            <input
              type="range"
              className="gf-slider mt-[2px] mb-[11px]"
              min={RADIUS_MIN}
              max={RADIUS_MAX}
              step={5}
              value={Math.min(form.radiusMeters, RADIUS_MAX)}
              onChange={(e) => setRadius(parseInt(e.target.value, 10))}
            />
            <div className="grid grid-cols-3 gap-[8px]">
              {PRESETS.map((r) => {
                const on = activePreset === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setRadius(r);
                      bumpRecenter();
                    }}
                    className={
                      "rounded-[9px] border px-0 py-[8px] font-sans text-[13px] font-semibold transition-all " +
                      (on
                        ? "border-[#E8693A] bg-[#E8693A] text-white shadow-[0_6px_14px_-8px_rgba(232,105,58,0.8)]"
                        : "border-[#ECE6DD] bg-white text-[#6B6259] hover:border-[#ddd3c6] hover:bg-[#f6f1ea] hover:text-[#2A2420]")
                    }
                  >
                    {r} m
                  </button>
                );
              })}
            </div>

            <div className="my-[9px] h-px bg-[#f1ece4]" />

            {/* Guidance */}
            <div className="rounded-[12px] border border-[#ECE6DD] bg-[#F6F2EC] px-[14px] py-[11px]">
              <div className="mb-[9px] flex items-center gap-[7px] font-sans text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#9b9085]">
                <Info className="size-[14px] text-[#E8693A]" strokeWidth={2} />
                Recommended radius
              </div>
              <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-[7px] p-0">
                {[
                  ["50–100 m", "Single-floor office"],
                  ["100–150 m", "Mall / multi-floor"],
                  ["150–300 m", "Outdoor / field site"],
                  ["300–500 m", "Multi-building campus"],
                ].map(([value, caption]) => (
                  <li key={value} className="font-[family-name:var(--font-hanken-grotesk)] text-[12px] leading-[1.35] text-[#6B6259]">
                    <b className="block font-sans font-semibold text-[#2A2420]">{value}</b>
                    {caption}
                  </li>
                ))}
              </ul>
            </div>

            {/* Enforce-on-clock-in toggle (preserved from the original modal) */}
            <div className="mt-[12px] flex items-center justify-between gap-3 rounded-[12px] border border-[#ECE6DD] bg-white px-[14px] py-[11px]">
              <div className="min-w-0">
                <p className="font-sans text-[12.5px] font-semibold text-[#2A2420]">
                  Enforce on clock-in
                </p>
                <p className="font-[family-name:var(--font-hanken-grotesk)] text-[12px] leading-[1.35] text-[#6B6259]">
                  Require employees to be inside this boundary to clock in.
                </p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: Boolean(v) }))}
                aria-label="Enforce geofence on clock-in"
              />
            </div>

            {/* Live summary — pinned to the bottom of the pane */}
            <div className="mt-auto pt-[4px]">
              <div className="flex items-center gap-[13px] rounded-[12px] bg-[#fdeee6] px-[14px] py-[12px]">
                <span className="flex size-[36px] flex-none items-center justify-center rounded-[10px] bg-[#E8693A] text-white">
                  <Target className="size-[18px]" strokeWidth={2.2} />
                </span>
                <div className="leading-[1.3]">
                  <b className="block font-sans text-[13.5px] font-semibold text-[#C2552F]">
                    {hasPin ? `${form.radiusMeters} m boundary set` : "No boundary yet"}
                  </b>
                  <span className="font-[family-name:var(--font-hanken-grotesk)] text-[12px] text-[#C2552F]/85">
                    {hasPin
                      ? `Pin placed in ${cityLabel} · ~${area} covered`
                      : "Click the map to place the clock-in pin"}
                  </span>
                </div>
              </div>
            </div>
          </section>
          </div>

          {/* ── Footer ─────────────────────────────────────────────────── */}
          <footer className="flex flex-none items-center justify-between gap-[16px] border-t border-[#f1ece4] bg-white px-[22px] py-[15px]">
            <div className="flex items-center gap-[9px] font-[family-name:var(--font-hanken-grotesk)] text-[12.5px] text-[#6B6259]">
              <span
                className={
                  "size-2 flex-none rounded-full " +
                  (hasPin
                    ? "bg-[#1f7a4d] shadow-[0_0_0_3px_#e7f4ec]"
                    : "bg-[#9b9085] shadow-[0_0_0_3px_#ece6dd]")
                }
              />
              {hasPin ? "Pin placed — ready to save" : "No pin placed yet"}
            </div>
            <div className="flex gap-[10px]">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-[10px] border border-[#ECE6DD] bg-white px-[18px] py-[11px] font-sans text-[13.5px] font-semibold text-[#2A2420] transition-colors hover:border-[#ddd3c6] hover:bg-[#f6f1ea]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSave}
                className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-[10px] border border-transparent bg-[#E8693A] px-[18px] py-[11px] font-sans text-[13.5px] font-semibold text-white shadow-[0_8px_18px_-10px_rgba(232,105,58,0.75)] transition-colors hover:bg-[#C2552F] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="size-4" strokeWidth={2.4} />
                {submitting ? "Saving…" : "Save geofence"}
              </button>
            </div>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
