"use client";

/**
 * PunchMap — renders an OpenStreetMap tile map centred on a punch location.
 * Uses Leaflet + react-leaflet (no API key required).
 * Must be imported with next/dynamic { ssr: false } to avoid SSR mismatch.
 */

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet's default marker icon paths broken by bundlers
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

// Sub-component that re-centres the map when lat/lng change
function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 16);
  }, [lat, lng, map]);
  return null;
}

interface PunchMapProps {
  latitude: number;
  longitude: number;
  outsideGeofence: boolean;
  distanceMeters: number | null;
  employeeName: string;
  punchType: "IN" | "OUT";
  punchedAt: string;
}

export default function PunchMap({
  latitude,
  longitude,
  outsideGeofence,
  distanceMeters,
  employeeName,
  punchType,
  punchedAt,
}: PunchMapProps) {
  const label = `${employeeName} — Clock ${punchType === "IN" ? "In" : "Out"}`;
  const time = new Date(punchedAt).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  });

  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={16}
      scrollWheelZoom={false}
      style={{ height: "220px", width: "100%", borderRadius: "0.5rem", zIndex: 0 }}
      className="z-0"
    >
      <Recenter lat={latitude} lng={longitude} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* 100-metre accuracy circle */}
      <Circle
        center={[latitude, longitude]}
        radius={100}
        pathOptions={{
          color: outsideGeofence ? "#f59e0b" : "#10b981",
          fillColor: outsideGeofence ? "#fef3c7" : "#d1fae5",
          fillOpacity: 0.4,
          weight: 2,
        }}
      />

      <Marker position={[latitude, longitude]}>
        <Popup>
          <div className="text-xs space-y-0.5">
            <p className="font-semibold">{label}</p>
            <p>{time}</p>
            <p className="font-mono">
              {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </p>
            {outsideGeofence && distanceMeters != null && (
              <p className="text-amber-600 font-medium">
                ⚠ Outside geofence ({distanceMeters.toLocaleString()}m)
              </p>
            )}
            {!outsideGeofence && (
              <p className="text-emerald-600 font-medium">✓ Inside geofence</p>
            )}
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  );
}
