"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/infrastructure/supabase/browser";

export interface LocationOption {
  value: string;
  label: string;
  count: number;
}

export interface CameraOption {
  value: string;
  label: string;
  count: number;
}

export interface LocationData {
  countries: LocationOption[];
  states: LocationOption[];  // populated when a country is selected
  cities: LocationOption[];  // populated when a state is selected
}

export interface FilterOptions {
  locationData: LocationData;
  hasAnyLocation: boolean;
  dateRange: { earliest: string | null; latest: string | null };
  cameraOptions: CameraOption[];
  loading: boolean;
  /** Call when country/state selection changes to refresh sub-levels */
  fetchLocationChildren: (country?: string, state?: string) => void;
}

interface LocationRow {
  location_country: string | null;
  location_state: string | null;
  location_city: string | null;
  latitude: number | null;
}

export function useMediaFilterOptions(
  groupId: string,
  albumId?: string
): FilterOptions {
  const [locationData, setLocationData] = useState<LocationData>({
    countries: [],
    states: [],
    cities: [],
  });
  const [hasAnyLocation, setHasAnyLocation] = useState(false);
  const [dateRange, setDateRange] = useState<{ earliest: string | null; latest: string | null }>({
    earliest: null,
    latest: null,
  });
  const [cameraOptions, setCameraOptions] = useState<CameraOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [allLocationRows, setAllLocationRows] = useState<LocationRow[]>([]);
  const supabase = createClient();

  const fetchOptions = useCallback(async () => {
    setLoading(true);

    try {
      // Determine which media IDs to scope to (for albums)
      let mediaIdFilter: string[] | null = null;
      if (albumId) {
        const { data: albumMedia } = (await supabase
          .from("album_media")
          .select("media_id")
          .eq("album_id", albumId)) as unknown as {
          data: { media_id: string }[] | null;
          error: Error | null;
        };
        mediaIdFilter = albumMedia?.map((am) => am.media_id) ?? [];
        if (mediaIdFilter.length === 0) {
          setLoading(false);
          return;
        }
      }

      // Build base query helper
      const baseQuery = () => {
        let q = supabase.from("media_assets").select("*").eq("group_id", groupId);
        if (mediaIdFilter) {
          q = q.in("id", mediaIdFilter);
        }
        return q;
      };

      // Fetch all relevant assets with the columns we need
      const { data: assets } = (await baseQuery()
        .select("location_country, location_state, location_city, latitude, date_taken, camera_make, camera_model")) as unknown as {
        data: {
          location_country: string | null;
          location_state: string | null;
          location_city: string | null;
          latitude: number | null;
          date_taken: string | null;
          camera_make: string | null;
          camera_model: string | null;
        }[] | null;
        error: Error | null;
      };

      if (!assets || assets.length === 0) {
        setLoading(false);
        return;
      }

      // Store location rows for hierarchical filtering
      const locationRows: LocationRow[] = assets.map((a) => ({
        location_country: a.location_country,
        location_state: a.location_state,
        location_city: a.location_city,
        latitude: a.latitude,
      }));
      setAllLocationRows(locationRows);

      // Compute top-level country options
      const countryMap = new Map<string, number>();
      let locationCount = 0;
      for (const a of assets) {
        if (a.latitude != null) locationCount++;
        if (a.location_country) {
          countryMap.set(a.location_country, (countryMap.get(a.location_country) ?? 0) + 1);
        }
      }
      const countries: LocationOption[] = Array.from(countryMap.entries())
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => b.count - a.count);

      // Compute date range
      let earliest: string | null = null;
      let latest: string | null = null;
      for (const a of assets) {
        if (a.date_taken) {
          if (!earliest || a.date_taken < earliest) earliest = a.date_taken;
          if (!latest || a.date_taken > latest) latest = a.date_taken;
        }
      }

      // Compute camera options
      const cameraMap = new Map<string, { make: string | null; count: number }>();
      for (const a of assets) {
        if (a.camera_model) {
          const existing = cameraMap.get(a.camera_model);
          if (existing) {
            existing.count++;
          } else {
            cameraMap.set(a.camera_model, { make: a.camera_make, count: 1 });
          }
        }
      }
      const cameras: CameraOption[] = Array.from(cameraMap.entries())
        .map(([model, { make, count }]) => ({
          value: model,
          label: make ? `${make} ${model}` : model,
          count,
        }))
        .sort((a, b) => b.count - a.count);

      setLocationData({ countries, states: [], cities: [] });
      setHasAnyLocation(locationCount > 0);
      setCameraOptions(cameras);
      setDateRange({ earliest, latest });
    } catch (err) {
      console.error("Failed to fetch filter options:", err);
    } finally {
      setLoading(false);
    }
  }, [groupId, albumId, supabase]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  // Compute states/cities from cached location rows when selection changes
  const fetchLocationChildren = useCallback(
    (country?: string, state?: string) => {
      if (!country) {
        // No country selected: clear states and cities
        setLocationData((prev) => ({ ...prev, states: [], cities: [] }));
        return;
      }

      // Compute states within the selected country
      const stateMap = new Map<string, number>();
      const cityMap = new Map<string, number>();

      for (const row of allLocationRows) {
        if (row.location_country !== country) continue;

        if (row.location_state) {
          stateMap.set(row.location_state, (stateMap.get(row.location_state) ?? 0) + 1);
        }

        // If a state is selected, also compute cities within that state
        if (state && row.location_state === state && row.location_city) {
          cityMap.set(row.location_city, (cityMap.get(row.location_city) ?? 0) + 1);
        }
      }

      const states: LocationOption[] = Array.from(stateMap.entries())
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => b.count - a.count);

      const cities: LocationOption[] = Array.from(cityMap.entries())
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => b.count - a.count);

      setLocationData((prev) => ({ ...prev, states, cities }));
    },
    [allLocationRows]
  );

  return { locationData, hasAnyLocation, dateRange, cameraOptions, loading, fetchLocationChildren };
}
