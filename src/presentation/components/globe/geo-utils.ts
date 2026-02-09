import type { GeoPoint } from "@/presentation/hooks/use-geo-media";

const EARTH_RADIUS_KM = 6371;

/** Haversine distance between two geographic coordinates in kilometers. */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export interface Cluster {
  center: { lat: number; lng: number };
  points: GeoPoint[];
}

/**
 * Groups nearby geo points into clusters using haversine distance.
 * Points within `distanceThresholdKm` of an existing cluster center
 * are added to that cluster. Single points become clusters of size 1.
 */
export function clusterPoints(
  points: GeoPoint[],
  distanceThresholdKm = 50
): Cluster[] {
  const clusters: Cluster[] = [];

  for (const point of points) {
    let added = false;

    for (const cluster of clusters) {
      if (
        haversineDistance(
          cluster.center.lat,
          cluster.center.lng,
          point.lat,
          point.lng
        ) <= distanceThresholdKm
      ) {
        cluster.points.push(point);
        // Incremental center update (O(1) instead of O(n))
        const n = cluster.points.length;
        cluster.center.lat = (cluster.center.lat * (n - 1) + point.lat) / n;
        cluster.center.lng = (cluster.center.lng * (n - 1) + point.lng) / n;
        added = true;
        break;
      }
    }

    if (!added) {
      clusters.push({
        center: { lat: point.lat, lng: point.lng },
        points: [point],
      });
    }
  }

  return clusters;
}
