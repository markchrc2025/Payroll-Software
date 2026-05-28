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
