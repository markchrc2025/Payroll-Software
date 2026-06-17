# Handoff: Configure Geofence Modal (Branches)

## Overview
A redesign of the **Configure Geofence** modal in the Branches section of Sentire Payroll. This is the dialog where an admin sets the geofenced clock-in boundary for a branch: a label, a map pin (the clock-in point), and an enforcement radius. Employees may only clock in while physically inside this boundary.

The original modal was a single narrow, vertically-scrolling column (cramped). This redesign makes it a **wider, two-pane, non-scrolling** dialog: a large interactive map on the left, all controls stacked on the right, footer actions pinned at the bottom.

## About the Design Files
The file in this bundle — `Configure Geofence Modal.html` — is a **design reference created in HTML/CSS/vanilla-JS + Leaflet**. It is a working prototype that demonstrates the intended look, layout, and interactions. It is **not production code to ship directly.**

The task is to **recreate this design in the target codebase's existing environment** (the Sentire Payroll admin app — React) using its established component patterns, map library, and styling conventions. If a map abstraction already exists in the app, use it; the prototype uses Leaflet only because that's what the current production modal uses.

The HTML also renders a dimmed Branches page behind the modal purely for context — **ignore the backdrop**; only the modal (`.gf` and its overlay `.ov`) is the deliverable.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, radii, and interactions are all specified below and present in the prototype. Recreate the modal pixel-faithfully using the app's existing primitives (the `pa-*` design system: buttons, inputs, dividers, etc.).

## Screens / Views

### Configure Geofence — Modal
- **Name**: Configure Geofence modal
- **Purpose**: Set/edit a branch's geofence — label, center pin (lat/lng), and enforcement radius (m).
- **Trigger**: Opened from the Branches table (geofence action on a branch row). Title shows the branch name as a chip ("Head Office").

#### Overall modal container (`.gf`)
- Width: `min(980px, 96vw)`. Height: `min(740px, 97vh)`.
- Background `#ffffff`, border `1px solid #ECE6DD`, border-radius `20px`.
- Shadow: `0 40px 90px -30px rgba(33,26,21,.62)`.
- Layout: vertical flex — **header (fixed)** / **body (flex:1)** / **footer (fixed)**. Body never pushes header/footer off; only the right control pane may scroll on very short viewports (< ~650px tall).
- Open animation: `pop .26s cubic-bezier(.3,.85,.36,1)` — translateY(14px)+scale(.98)→none, opacity .5→1.
- Overlay (`.ov`): `position:fixed; inset:0; background:rgba(33,26,21,.46); backdrop-filter:blur(3px);` centers the modal; padding 28px; fade-in `.22s`.

#### Header (`.gf-head`) — fixed, ~84px on wide screens
- Padding `18px 22px 15px`, bottom border `1px solid #f1ece4`.
- **Icon tile** (`.gf-head-ic`): 42×42, radius 12px, background `#fdeee6` (accent-soft), icon color `#E8693A`. Icon = map-pin (lucide `map-pin`), 22px, stroke-width 2.
- **Title row**: `<h2>` "Configure Geofence" — Instrument Sans 600, 19px, letter-spacing -0.02em, color `#2A2420`. Followed by a **branch chip** (`.gf-branchchip`): inline-flex, gap 6px, Instrument Sans 600 12px, color `#C2552F`, background `#fdeee6`, radius 999px, padding `3px 11px`, with a small building icon (12px) + branch name.
- **Subtitle** `<p>`: Hanken Grotesk 13px, color `#6B6259`, line-height 1.45, max-width 600px. Copy: *"Drop a pin to mark the clock-in point, drag to fine-tune, then set the enforcement radius. Employees can only clock in inside this boundary."*
- **Close button** (`.gf-x`): 36×36, radius 10px, border `1px solid #ECE6DD`, color `#6B6259`; hover bg `#f6f1ea`, color `#2A2420`. X icon (lucide `x`) 18px stroke 2.2.

#### Body (`.gf-body`) — two panes
`display:grid; grid-template-columns: 1.42fr 1fr;` On ≤860px wide it stacks to one column (`1fr / 1fr auto`) and the control pane becomes scrollable.

**LEFT — Map pane (`.gf-mappane`)**
- Padding 18px, right border `1px solid #f1ece4`, vertical flex, gap 12px.
- **Map wrap** (`.gf-map-wrap`): flex:1, radius 13px, border `1px solid #ECE6DD`, `overflow:hidden`. Contains `#map` (Leaflet, absolutely filling).
  - Tile layer: CARTO Voyager (`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`). Zoom controls visible; restyled: zoom buttons radius 8px, bar border `1px solid #ECE6DD`, shadow `0 4px 12px -6px rgba(33,26,21,.4)`.
  - **Pin marker**: custom `L.divIcon` (class `gf-pin`), draggable. An SVG teardrop pin (34×42) filled `#E8693A` with white 2.5px stroke and a white center dot; `drop-shadow(0 5px 7px rgba(40,28,18,.4))`; `iconAnchor:[17,41]`.
  - **Radius circle**: `L.circle` — `color #E8693A`, `weight 2`, `fillColor #E8693A`, `fillOpacity 0.14`, radius = current radius in meters. Always centered on the marker.
- **Coordinate bar** (`.gf-coordbar`): below map, flex:none, padding `11px 14px`, background `#F6F2EC`, border `1px solid #ECE6DD`, radius 11px. Three read-out cells (`.gf-coord`) separated by 1px dividers:
  - Each cell: label (Instrument Sans 700, 9.5px, uppercase, letter-spacing .07em, color `#9b9085`) over value (JetBrains Mono 600, 13px, color `#2A2420`).
  - Cells: **Latitude** (5 decimals), **Longitude** (5 decimals), **Coverage** (area — see formula).
  - Right-aligned **"Center on pin"** button (`.gf-recenter`): Instrument Sans 600 12px, color `#C2552F`, bg `#fff`, border `1px solid #ECE6DD`, radius 8px, padding `7px 11px`, crosshair icon. Hover: border `#ddd3c6`, bg `#f6f1ea`.

**RIGHT — Control pane (`.gf-ctrl`)**
- Padding `14px 22px`, vertical flex, `overflow-y:auto` (only scrolls on very short screens; thin 6px `#ddd3c6` thumb).
- **Label field** (`.gf-field`):
  - Label (`.gf-label`): Instrument Sans 600, 12.5px, color `#2A2420`; required asterisk `*` in `#E8693A` (`.gf-req`). Text: "Geofence label *".
  - Input (`.gf-input`): height 42px, radius 10px, border `1px solid #ECE6DD`, padding `0 13px`, Hanken Grotesk 14px. Placeholder color `#9b9085`. **Focus**: border `#E8693A` + ring `0 0 0 3px #fdeee6`. Placeholder/example value: "Quezon City Head Office".
- **Divider** (`.gf-divider`): 1px `#f1ece4`, margin `9px 0`. (Used twice.)
- **Radius section**:
  - Header row (`.gf-radius-top`, margin-bottom 10px): label "Enforcement radius" (Instrument Sans 600 13px) on the left; value (`.gf-radius-val`) on the right = big number (Instrument Sans 600, **26px**, letter-spacing -0.02em, color `#2A2420`) + "m" suffix (Instrument Sans 600 13px, `#9b9085`).
  - **Slider** (`.gf-slider`): native range, min 20 / max 500 / step 5. Track: 6px tall, radius 999px, bg `#ECE6DD`. Thumb: 22px circle, bg `#E8693A`, 3px white border, shadow `0 2px 7px -1px rgba(232,105,58,.7)`, cursor grab. Margin `2px 0 11px`.
  - **Presets** (`.gf-presets`): `grid-template-columns: repeat(3,1fr); gap:8px`. Six buttons: **50, 100, 150, 200, 300, 500 m**. Default each: Instrument Sans 600 13px, color `#6B6259`, bg `#fff`, border `1px solid #ECE6DD`, radius 9px, padding `8px 0`. Hover: border `#ddd3c6`, bg `#f6f1ea`, color `#2A2420`. **Active (`.on`)**: bg `#E8693A`, border `#E8693A`, color `#fff`, shadow `0 6px 14px -8px rgba(232,105,58,.8)`. Exactly one preset is active when the radius equals its value; if radius doesn't match any preset (e.g. dragged to 235), none is highlighted.
- **Divider** again.
- **Guidance card** (`.gf-guide`): bg `#F6F2EC`, border `1px solid #ECE6DD`, radius 12px, padding `11px 14px`.
  - Heading (`.gf-guide-h`): Instrument Sans 700 10.5px uppercase, letter-spacing .06em, color `#9b9085`, with an info-circle icon in `#E8693A`. Text: "Recommended radius".
  - List: 2-col grid, gap `7px 16px`. Each item: bold value (Instrument Sans 600, `#2A2420`, block) over caption (Hanken Grotesk 12px, `#6B6259`):
    - **50–100 m** — Single-floor office
    - **100–150 m** — Mall / multi-floor
    - **150–300 m** — Outdoor / field site
    - **300–500 m** — Multi-building campus
- **Spacer** (`.gf-summary-spacer`, 4px) then the **live summary card** (`.gf-summary`): `margin-top:auto` pins it to the bottom of the pane. Flex row, gap 13px, padding `12px 14px`, bg `#fdeee6`, radius 12px.
  - Icon (`.gf-summary-ic`): 36×36, radius 10px, bg `#E8693A`, white target/scope icon.
  - Text: title (Instrument Sans 600 13.5px, `#C2552F`) e.g. "100 m boundary set"; subtitle (Hanken Grotesk 12px, `#C2552F` @ .85 opacity) e.g. "Pin placed in Quezon City · ~3.1 hectares covered".

#### Footer (`.gf-foot`) — fixed
- Space-between, padding `15px 22px`, top border `1px solid #f1ece4`, bg `#fff`.
- **Left status** (`.gf-foot-status`): 8px green dot (`#1f7a4d`, with `0 0 0 3px #e7f4ec` ring) + text (Hanken Grotesk 12.5px, `#6B6259`): "Pin placed — ready to save".
- **Right buttons** (`.gf-btn`, radius 10px, Instrument Sans 600 13.5px, padding `11px 18px`):
  - **Cancel** (`.gf-btn-ghost`): bg `#fff`, color `#2A2420`, border `1px solid #ECE6DD`; hover bg `#f6f1ea`, border `#ddd3c6`. Closes the modal.
  - **Save geofence** (`.gf-btn-primary`): bg `#E8693A`, color `#fff`, shadow `0 8px 18px -10px rgba(232,105,58,.75)`, check icon; hover bg `#C2552F`. Persists the geofence.

## Interactions & Behavior
- **Click on map** → moves the pin to the clicked lat/lng; circle re-centers; coordinate read-outs and summary update.
- **Drag pin** → live-updates coordinates, circle position, and summary on `drag`; on `dragend` the map pans to keep the pin in view.
- **Slider input** → sets radius (clamped 20–500), updates the big value, circle radius, area, summary, and re-syncs which preset is highlighted.
- **Preset click** → sets that radius AND fits the map bounds to the circle (`fitBounds(circle.getBounds().pad(0.35), {maxZoom:17})`) so the new boundary is framed nicely.
- **"Center on pin"** → `fitBounds(circle.getBounds().pad(0.4), {maxZoom:17})`.
- **Save** → in the prototype, shows a toast ("Geofence "{label}" saved · {radius} m") for 2.6s. In production: validate (label required, pin placed) then persist and close.
- **Area read-out / summary formula**: `m² = π·r²`; if `m²/10000 ≥ 1` show `{ha.toFixed(1)} ha`, else show `{round(m²)} m²`.
- Map must call `invalidateSize()` after the modal lays out (the prototype does so ~200ms after mount and on window resize) — important because Leaflet inits inside a flex container.
- **Non-scroll guarantee**: header & footer are always visible; the body fits without page scroll from ~650px viewport height upward. Below that, only `.gf-ctrl` scrolls internally — the modal frame itself never scrolls.

## State Management
- `label: string` (required for save)
- `center: { lat, lng }` — pin position; default `14.6575, 121.0324` (Quezon City). In production, default to the branch's stored coords or geocode its city.
- `radius: number` (meters, 20–500), default `100`.
- Derived: `area` (from radius), `activePreset` (radius matched against [50,100,150,200,300,500]).
- `hasPin: boolean` — drives footer status & save validation. (Prototype pre-places a pin so the empty nag state is avoided; production may start empty — if so, show a "click the map to place a pin" hint over the map and disable Save until placed.)

## Design Tokens
```
Accent           #E8693A   (acc)
Accent pressed   #C2552F   (acc-press)
Accent soft      #fdeee6   (acc-soft)
Ink (text)       #2A2420
Muted            #6B6259
Muted-2          #9b9085
Page bg          #F6F2EC
Paper            #ffffff
Line             #ECE6DD
Line-2           #f1ece4
Green            #1f7a4d   (status dot)
Green soft       #e7f4ec
Sidebar grad     #2E241C → #1f1813 (backdrop only)

Radii: modal 20px · cards/guide/summary 12px · map-wrap 13px · inputs 10px · buttons 10px · presets/recenter 8–9px · chips 999px
Shadows:
  modal     0 40px 90px -30px rgba(33,26,21,.62)
  primary   0 8px 18px -10px rgba(232,105,58,.75)
  preset on 0 6px 14px -8px  rgba(232,105,58,.8)

Typography:
  Display/UI : "Instrument Sans" 400/500/600/700
  Body       : "Hanken Grotesk" 400/500/600/700
  Mono       : "JetBrains Mono" 500/600  (coordinates)
```

## Assets
- **Icons**: all inline SVG, Lucide-style (map-pin, building, x, info, crosshair, target, check). Use the codebase's existing icon set (the app uses a `PIcon` component) — no raster assets needed.
- **Map tiles**: CARTO Voyager basemap (free, attribution required). Swap for whatever map provider/library the app already uses.
- **Fonts**: Google Fonts — Instrument Sans, Hanken Grotesk, JetBrains Mono. These match the existing Sentire Payroll admin app; use the app's already-loaded fonts.

## Files
- `Configure Geofence Modal.html` — the full prototype (modal + dimmed Branches backdrop for context; implement only the modal). All CSS is in the `<style>` block under the `.gf-*` / `.ov` / `.leaflet-*` selectors; all behavior is in the single `<script>` at the bottom.

## Notes for implementation
- This modal already exists in production as a narrow scrolling column — this is a **redesign of that existing component**, so wire it to the same data/save endpoint; only the markup, layout, and styling change.
- Reuse the app's existing `pa-*` primitives where they map cleanly (input, ghost/primary buttons, dividers) rather than re-deriving styles — the token values above are provided so you can confirm parity.
