"use client";

import { useState, useCallback, useEffect, useRef } from "react";

export interface GeoPoint {
  id: string;
  groupId: string;
  groupName: string;
  lat: number;
  lng: number;
  thumbnailKey: string;
  filename: string;
  locationCountry?: string;
  locationCity?: string;
}

export function useGeoMedia() {
  const [points, setPoints] = useState<GeoPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/media/geo");

      if (response.status === 401) {
        setError("Unauthorized");
        setPoints([]);
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to fetch geo media");
        return;
      }

      const data = await response.json();
      setPoints(data.points ?? []);
    } catch {
      setError("Failed to fetch geo media");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    refresh();
  }, [refresh]);

  return { points, loading, error, refresh };
}
