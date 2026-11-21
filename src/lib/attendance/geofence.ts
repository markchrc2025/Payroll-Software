/**
 * src/lib/attendance/geofence.ts
 *
 * Haversine distance helper for geofence checks.
 * Returns distance in metres between two WGS-84 coordinates.
 */

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine distance between two lat/lng points in metres.
 * Inputs are plain JS numbers (not Prisma Decimal).
 */
export function haversineMetres(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export interface GeofenceResult {
  outsideGeofence: boolean;
  distanceMeters: number | null;
}

/**
 * Check whether a punch location (lat, lon) is within the given geofence.
 * Returns { outsideGeofence, distanceMeters }.
 *
 * If `geofence` is null (none configured for the branch), the punch is
 * considered inside (outsideGeofence = false, distanceMeters = null) so that
 * geofence-less branches don't inadvertently flag every punch.
 */
export function checkGeofence(
  lat: number | null,
  lon: number | null,
  geofence: {
    latitude: { toNumber(): number } | number;
    longitude: { toNumber(): number } | number;
    radiusMeters: number;
  } | null,
): GeofenceResult {
  if (!geofence || lat == null || lon == null) {
    return { outsideGeofence: false, distanceMeters: null };
  }

  const fenceLat =
    typeof geofence.latitude === "number"
      ? geofence.latitude
      : geofence.latitude.toNumber();
  const fenceLon =
    typeof geofence.longitude === "number"
      ? geofence.longitude
      : geofence.longitude.toNumber();

  const dist = Math.round(haversineMetres(lat, lon, fenceLat, fenceLon));
  return {
    outsideGeofence: dist > geofence.radiusMeters,
    distanceMeters: dist,
  };
}

/**
 * Wave F1 (PAY-216, decision 10, Mark 21 Nov 2026): a field worker's punch is
 * checked against every fence that applies (their branch's and the company's
 * client or site fences). Inside any: not flagged, and the site is named.
 * Outside all: accepted and flagged, with the distance to the nearest.
 * No fence at all: not flagged.
 */
export function checkFieldFences(
  lat: number | null,
  lon: number | null,
  fences: { name: string; latitude: { toNumber(): number } | number; longitude: { toNumber(): number } | number; radiusMeters: number }[],
): GeofenceResult & { siteName: string | null } {
  if (!fences.length || lat == null || lon == null) return { outsideGeofence: false, distanceMeters: null, siteName: null };
  let best: { d: number; name: string; inside: boolean } | null = null;
  for (const f of fences) {
    const flat = typeof f.latitude === "number" ? f.latitude : f.latitude.toNumber();
    const flon = typeof f.longitude === "number" ? f.longitude : f.longitude.toNumber();
    const d = haversineMetres(lat, lon, flat, flon);
    const inside = d <= f.radiusMeters;
    if (!best || (inside && !best.inside) || (inside === best.inside && d < best.d)) best = { d, name: f.name, inside };
  }
  return { outsideGeofence: !best!.inside, distanceMeters: Math.round(best!.d), siteName: best!.inside ? best!.name : null };
}
