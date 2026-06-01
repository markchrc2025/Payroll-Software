"use client";

/**
 * GeofenceMapPicker
 * Interactive OpenStreetMap (Leaflet) component.
 *  - Click anywhere on the map to drop/move the pin
 *  - Drag the marker to fine-tune position
 *  - The blue circle visualises the enforcement radius in real time
 *  - No Google Maps API key required
 *
 * Must be loaded with `dynamic(..., { ssr: false })` because Leaflet
 * depends on `window` / `document`.
 */

import { useEffect, useRef } from "react";

interface Props {
  /** Current latitude, or null when not yet set */
  lat: number | null;
  /** Current longitude, or null when not yet set */
  lng: number | null;
  /** Enforcement radius in metres */
  radius: number;
  /** Called whenever the pin or radius changes */
  onChange: (lat: number, lng: number, radius: number) => void;
}

// Geographic centre of the Philippines — used as the default view
const PH_CENTER: [number, number] = [12.8797, 121.774];

export default function GeofenceMapPicker({ lat, lng, radius, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep mutable refs so Leaflet event handlers always see fresh values
  // without needing to re-register them.
  const radiusRef = useRef(radius);
  const onChangeRef = useRef(onChange);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const initializedRef = useRef(false);

  useEffect(() => { radiusRef.current = radius; }, [radius]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Update circle visuals when the radius slider changes externally
  useEffect(() => {
    circleRef.current?.setRadius(radius);
  }, [radius]);

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

    (async () => {
      const L = (await import("leaflet")).default;

      // Fix webpack/Next.js asset-path issue with default Leaflet icons
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const center: [number, number] =
        lat != null && lng != null ? [lat, lng] : PH_CENTER;

      const map = L.map(containerRef.current!, {
        center,
        zoom: lat != null ? 16 : 6,
        zoomControl: true,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      /** Place or move the pin to the given coordinates */
      function placePinAt(newLat: number, newLng: number) {
        const r = radiusRef.current;

        if (markerRef.current) {
          // Move existing pin & circle
          markerRef.current.setLatLng([newLat, newLng]);
          circleRef.current.setLatLng([newLat, newLng]);
        } else {
          // First-time: create the draggable marker and circle
          const marker = L.marker([newLat, newLng], { draggable: true }).addTo(map);
          const circle = L.circle([newLat, newLng], {
            radius: r,
            color: "#0284c7",
            fillColor: "#0284c7",
            fillOpacity: 0.15,
            weight: 2,
          }).addTo(map);

          marker.bindPopup("Drag to fine-tune the location").openPopup();

          marker.on("dragend", () => {
            const pos = marker.getLatLng();
            circle.setLatLng(pos);
            onChangeRef.current(pos.lat, pos.lng, radiusRef.current);
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
      map.on("click", (e: any) => {
        placePinAt(e.latlng.lat, e.latlng.lng);
      });
    })();

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      initializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden border border-border"
      style={{ height: 300, zIndex: 0 }}
    />
  );
}
