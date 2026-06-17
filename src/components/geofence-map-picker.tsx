"use client";

/**
 * GeofenceMapPicker
 * Interactive map (Leaflet + CARTO Voyager tiles) for the Configure Geofence modal.
 *  - Click anywhere on the map to drop / move the pin
 *  - Drag the custom teardrop marker to fine-tune (live updates while dragging)
 *  - The accent circle visualises the enforcement radius in real time
 *  - `recenterToken` re-frames the map around the circle (Center-on-pin / preset fit)
 *  - Fills its (positioned) parent absolutely; the parent controls the size
 *
 * Must be loaded with `dynamic(..., { ssr: false })` because Leaflet
 * depends on `window` / `document`.
 */

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker, Circle, LeafletMouseEvent } from "leaflet";

interface Props {
  /** Current latitude, or null when not yet set */
  lat: number | null;
  /** Current longitude, or null when not yet set */
  lng: number | null;
  /** Enforcement radius in metres */
  radius: number;
  /** Called whenever the pin moves (radius is echoed back unchanged) */
  onChange: (lat: number, lng: number, radius: number) => void;
  /**
   * Increment this to re-frame the map around the current circle
   * (used by the "Center on pin" button and the radius presets).
   */
  recenterToken?: number;
}

// Geographic centre of the Philippines — used as the default view
const PH_CENTER: [number, number] = [12.8797, 121.774];
const ACC = "#E8693A";

export default function GeofenceMapPicker({
  lat,
  lng,
  radius,
  onChange,
  recenterToken = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep mutable refs so Leaflet event handlers always see fresh values
  // without needing to re-register them.
  const radiusRef = useRef(radius);
  const onChangeRef = useRef(onChange);
  const markerRef = useRef<Marker | null>(null);
  const circleRef = useRef<Circle | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => { radiusRef.current = radius; }, [radius]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Update the circle when the radius slider/presets change externally.
  // (Declared before the recenter effect so a preset click resizes the
  // circle *before* the map re-frames to its new bounds.)
  useEffect(() => {
    circleRef.current?.setRadius(radius);
  }, [radius]);

  // Re-frame the map around the circle when recenter / preset requests it.
  useEffect(() => {
    if (!recenterToken) return;
    const map = mapRef.current;
    const circle = circleRef.current;
    if (map && circle) {
      map.fitBounds(circle.getBounds().pad(0.4), { animate: true, maxZoom: 17 });
    }
  }, [recenterToken]);

  // Initialise the Leaflet map exactly once per mount
  useEffect(() => {
    if (initializedRef.current || !containerRef.current) return;
    initializedRef.current = true;

    // Inject Leaflet CSS once per page load
    if (!document.querySelector('link[data-leaflet="1"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.setAttribute("data-leaflet", "1");
      document.head.appendChild(link);
    }

    let resizeObserver: ResizeObserver | null = null;
    let onWinResize: (() => void) | null = null;
    const timers: number[] = [];

    (async () => {
      const L = (await import("leaflet")).default;

      const center: [number, number] =
        lat != null && lng != null ? [lat, lng] : PH_CENTER;

      const map = L.map(containerRef.current!, {
        center,
        zoom: lat != null ? 15 : 6,
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          attribution: "&copy; OpenStreetMap &copy; CARTO",
          subdomains: "abcd",
          maxZoom: 20,
        },
      ).addTo(map);

      // Custom teardrop pin (accent fill, white stroke + centre dot)
      const pinIcon = L.divIcon({
        className: "gf-pin",
        html:
          '<svg width="34" height="42" viewBox="0 0 34 42" fill="none">' +
          '<path d="M17 41C17 41 32 26 32 16A15 15 0 0 0 2 16C2 26 17 41 17 41Z" fill="' +
          ACC +
          '" stroke="#fff" stroke-width="2.5"/>' +
          '<circle cx="17" cy="16" r="5.5" fill="#fff"/></svg>',
        iconSize: [34, 42],
        iconAnchor: [17, 41],
      });

      /** Place or move the pin to the given coordinates */
      function placePinAt(newLat: number, newLng: number) {
        const r = radiusRef.current;

        if (markerRef.current) {
          // Move existing pin & circle
          markerRef.current.setLatLng([newLat, newLng]);
          circleRef.current!.setLatLng([newLat, newLng]);
        } else {
          // First-time: create the draggable marker and circle
          const marker = L.marker([newLat, newLng], {
            draggable: true,
            icon: pinIcon,
            autoPan: true,
          }).addTo(map);
          const circle = L.circle([newLat, newLng], {
            radius: r,
            color: ACC,
            fillColor: ACC,
            fillOpacity: 0.14,
            weight: 2,
          }).addTo(map);

          // Live updates while dragging; pan to keep the pin in view on release.
          marker.on("drag", () => {
            const pos = marker.getLatLng();
            circle.setLatLng(pos);
            onChangeRef.current(pos.lat, pos.lng, radiusRef.current);
          });
          marker.on("dragend", () => {
            map.panTo(marker.getLatLng(), { animate: true });
          });

          markerRef.current = marker;
          circleRef.current = circle;
        }

        onChangeRef.current(newLat, newLng, r);
      }

      // If we already have coordinates, place the pin immediately
      if (lat != null && lng != null) {
        placePinAt(lat, lng);
      }

      // Click-to-place / click-to-move
      map.on("click", (e: LeafletMouseEvent) => {
        placePinAt(e.latlng.lat, e.latlng.lng);
      });

      // Leaflet initialises inside a flex/dialog container — force a resize
      // once the modal has laid out (and again after the open animation).
      timers.push(window.setTimeout(() => map.invalidateSize(), 250));
      timers.push(window.setTimeout(() => map.invalidateSize(), 600));

      onWinResize = () => map.invalidateSize();
      window.addEventListener("resize", onWinResize);

      if (typeof ResizeObserver !== "undefined" && containerRef.current) {
        resizeObserver = new ResizeObserver(() => map.invalidateSize());
        resizeObserver.observe(containerRef.current);
      }
    })();

    return () => {
      timers.forEach((t) => clearTimeout(t));
      if (onWinResize) window.removeEventListener("resize", onWinResize);
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      initializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="absolute inset-0" style={{ zIndex: 0 }} />;
}
