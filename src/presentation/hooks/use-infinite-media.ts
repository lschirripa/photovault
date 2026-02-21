"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/infrastructure/supabase/browser";
import type { MediaAsset, MediaMetadata } from "@/domain/entities/media-asset";
import { MediaType, MediaStatus } from "@/domain/enums/media-type";
import type { Tables } from "@/types/supabase";
import type { MediaFilters, MediaSort } from "@/domain/types/media-filters";
import { DEFAULT_SORT } from "@/domain/types/media-filters";

const PAGE_SIZE = 50;

function mapRow(m: Tables<"media_assets">): MediaAsset {
  const metadata: MediaMetadata = {
    dateTaken: m.date_taken ? new Date(m.date_taken) : null,
    latitude: m.latitude,
    longitude: m.longitude,
    altitude: m.altitude,
    cameraMake: m.camera_make,
    cameraModel: m.camera_model,
    lensModel: m.lens_model,
    iso: m.iso,
    fNumber: m.f_number,
    exposureTime: m.exposure_time,
    focalLength: m.focal_length,
    orientation: m.orientation,
    locationCountry: m.location_country,
    locationState: m.location_state,
    locationCity: m.location_city,
  };

  return {
    id: m.id,
    groupId: m.group_id,
    uploadedBy: m.uploaded_by,
    filename: m.filename,
    originalKey: m.original_key,
    thumbnailKey: m.thumbnail_key,
    mediaType: m.media_type as MediaType,
    mimeType: m.mime_type,
    sizeBytes: m.size_bytes,
    width: m.width,
    height: m.height,
    durationSeconds: m.duration_seconds ? Number(m.duration_seconds) : null,
    status: m.status as MediaStatus,
    createdAt: new Date(m.created_at),
    metadata,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, filters: MediaFilters) {
  if (filters.mediaType) {
    query = query.eq("media_type", filters.mediaType);
  }
  if (filters.dateFrom) {
    query = query.gte("date_taken", filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte("date_taken", filters.dateTo + "T23:59:59.999Z");
  }
  if (filters.hasLocation) {
    query = query.not("latitude", "is", null);
  }
  if (filters.locationCountry) {
    query = query.eq("location_country", filters.locationCountry);
  }
  if (filters.locationState) {
    query = query.eq("location_state", filters.locationState);
  }
  if (filters.locationCity) {
    query = query.eq("location_city", filters.locationCity);
  }
  if (filters.minSizeBytes !== undefined) {
    query = query.gte("size_bytes", filters.minSizeBytes);
  }
  if (filters.maxSizeBytes !== undefined) {
    query = query.lte("size_bytes", filters.maxSizeBytes);
  }
  return query;
}

interface UseInfiniteMediaOptions {
  groupId: string;
  /** If provided, only load media in this album */
  albumId?: string;
  filters?: MediaFilters;
  sort?: MediaSort;
}

export function useInfiniteMedia({
  groupId,
  albumId,
  filters = {},
  sort = DEFAULT_SORT,
}: UseInfiniteMediaOptions) {
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const supabase = createClient();

  // Stable serialized versions for dependency tracking
  const filtersKey = JSON.stringify(filters);
  const sortKey = JSON.stringify(sort);

  const fetchPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        let rows: Tables<"media_assets">[];

        const personIds = filters.personIds;
        if (albumId && personIds && personIds.length > 0) {
          // Album + Person filter mode: use RPC to find media in this album containing all selected persons
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: rpcData, error: rpcError } = (await (supabase.rpc as any)(
            "find_album_media_by_persons",
            {
              p_album_id: albumId,
              p_person_ids: personIds,
              p_limit: PAGE_SIZE,
              p_cursor: cursor || undefined,
            }
          )) as unknown as {
            data: { media_asset_id: string; added_at: string }[] | null;
            error: Error | null;
          };

          if (rpcError) throw rpcError;

          if (!rpcData || rpcData.length === 0) {
            setHasMore(false);
            if (!append) setMedia([]);
            return;
          }

          const mediaIds = rpcData.map((r) => r.media_asset_id);

          let mediaQuery = supabase
            .from("media_assets")
            .select("*")
            .in("id", mediaIds);

          // Apply remaining filters (date, type, etc.) but not personIds
          mediaQuery = applyFilters(mediaQuery, { ...filters, personIds: undefined });

          const { data: mediaData, error: mediaError } = (await mediaQuery) as unknown as {
            data: Tables<"media_assets">[] | null;
            error: Error | null;
          };

          if (mediaError) throw mediaError;

          // Maintain added_at DESC order from RPC
          const mediaMap = new Map((mediaData ?? []).map((m) => [m.id, m]));
          rows = mediaIds
            .map((id) => mediaMap.get(id))
            .filter((m): m is Tables<"media_assets"> => m != null);

          // Use added_at from last RPC result as cursor
          const lastItem = rpcData[rpcData.length - 1];
          cursorRef.current = lastItem?.added_at ?? null;
          setHasMore(rpcData.length === PAGE_SIZE);
        } else if (personIds && personIds.length > 0) {
          // Person-filter mode (group-wide): use RPC to find media containing all selected persons
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: rpcData, error: rpcError } = (await (supabase.rpc as any)(
            "find_media_by_persons",
            {
              p_group_id: groupId,
              p_person_ids: personIds,
              p_limit: PAGE_SIZE,
              p_cursor: cursor || undefined,
            }
          )) as unknown as {
            data: { media_asset_id: string; created_at: string }[] | null;
            error: Error | null;
          };

          if (rpcError) throw rpcError;

          if (!rpcData || rpcData.length === 0) {
            setHasMore(false);
            if (!append) setMedia([]);
            return;
          }

          const mediaIds = rpcData.map((r) => r.media_asset_id);

          let mediaQuery = supabase
            .from("media_assets")
            .select("*")
            .in("id", mediaIds);

          // Apply remaining filters (camera, date, etc.) but not personIds
          mediaQuery = applyFilters(mediaQuery, { ...filters, personIds: undefined });

          const { data: mediaData, error: mediaError } = (await mediaQuery) as unknown as {
            data: Tables<"media_assets">[] | null;
            error: Error | null;
          };

          if (mediaError) throw mediaError;

          // Maintain created_at DESC order from RPC
          const mediaMap = new Map((mediaData ?? []).map((m) => [m.id, m]));
          rows = mediaIds
            .map((id) => mediaMap.get(id))
            .filter((m): m is Tables<"media_assets"> => m != null);

          // Use created_at from last RPC result as cursor
          const lastItem = rpcData[rpcData.length - 1];
          cursorRef.current = lastItem?.created_at ?? null;
          setHasMore(rpcData.length === PAGE_SIZE);
        } else if (albumId) {
          // Album mode: get media IDs from album_media, then fetch assets
          let albumQuery = supabase
            .from("album_media")
            .select("media_id, added_at")
            .eq("album_id", albumId)
            .order("added_at", { ascending: false })
            .limit(PAGE_SIZE);

          if (cursor) {
            albumQuery = albumQuery.lt("added_at", cursor);
          }

          const { data: albumMedia, error: albumError } = (await albumQuery) as unknown as {
            data: { media_id: string; added_at: string }[] | null;
            error: Error | null;
          };
          if (albumError) throw albumError;

          if (!albumMedia || albumMedia.length === 0) {
            setHasMore(false);
            if (!append) setMedia([]);
            return;
          }

          const mediaIds = albumMedia.map((am) => am.media_id);

          let mediaQuery = supabase
            .from("media_assets")
            .select("*")
            .in("id", mediaIds);

          // Apply filters to the media query
          mediaQuery = applyFilters(mediaQuery, filters);

          const { data: mediaData, error: mediaError } = (await mediaQuery) as unknown as {
            data: Tables<"media_assets">[] | null;
            error: Error | null;
          };

          if (mediaError) throw mediaError;

          // Maintain album order (by added_at DESC) for default sort
          const mediaMap = new Map((mediaData ?? []).map((m) => [m.id, m]));
          rows = mediaIds
            .map((id) => mediaMap.get(id))
            .filter((m): m is Tables<"media_assets"> => m != null);

          // If non-default sort, re-sort client-side (max PAGE_SIZE items)
          if (sort.field !== "created_at" || sort.direction !== "desc") {
            rows = sortRowsClientSide(rows, sort);
          }

          // Use the last album_media added_at as cursor
          const lastItem = albumMedia[albumMedia.length - 1];
          cursorRef.current = lastItem?.added_at ?? null;
          setHasMore(albumMedia.length === PAGE_SIZE);
        } else {
          // Group mode: direct query on media_assets
          const isDesc = sort.direction === "desc";

          let query = supabase
            .from("media_assets")
            .select("*")
            .eq("group_id", groupId)
            .order(sort.field, { ascending: !isDesc, nullsFirst: false })
            .limit(PAGE_SIZE);

          // When sorting by date_taken, exclude nulls and add secondary sort for stability
          if (sort.field === "date_taken") {
            query = query.not("date_taken", "is", null);
          }

          // Apply cursor
          if (cursor) {
            if (isDesc) {
              query = query.lt(sort.field, cursor);
            } else {
              query = query.gt(sort.field, cursor);
            }
          }

          // Apply filters
          query = applyFilters(query, filters);

          const { data, error: queryError } = (await query) as unknown as {
            data: Tables<"media_assets">[] | null;
            error: Error | null;
          };

          if (queryError) throw queryError;
          rows = data ?? [];

          const lastRow = rows[rows.length - 1];
          if (lastRow) {
            cursorRef.current = String(lastRow[sort.field as keyof typeof lastRow] ?? "");
          } else {
            cursorRef.current = null;
          }
          setHasMore(rows.length === PAGE_SIZE);
        }

        const mapped = rows.map(mapRow);
        if (append) {
          setMedia((prev) => [...prev, ...mapped]);
        } else {
          setMedia(mapped);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load media");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupId, albumId, supabase, filtersKey, sortKey]
  );

  // Reset and reload when filters/sort change
  useEffect(() => {
    cursorRef.current = null;
    setHasMore(true);
    fetchPage(null, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    fetchPage(cursorRef.current, true);
  }, [fetchPage, loading, loadingMore, hasMore]);

  const refresh = useCallback(() => {
    cursorRef.current = null;
    setHasMore(true);
    fetchPage(null, false);
  }, [fetchPage]);

  // Mutator: remove items locally (after delete)
  const removeItems = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setMedia((prev) => prev.filter((m) => !idSet.has(m.id)));
  }, []);

  // Mutator: update items locally (e.g., status change from polling)
  const updateItems = useCallback(
    (updates: { id: string; status?: MediaStatus; thumbnailKey?: string | null }[]) => {
      setMedia((prev) =>
        prev.map((m) => {
          const update = updates.find((u) => u.id === m.id);
          if (!update) return m;
          return {
            ...m,
            ...(update.status !== undefined && { status: update.status }),
            ...(update.thumbnailKey !== undefined && { thumbnailKey: update.thumbnailKey }),
          };
        })
      );
    },
    []
  );

  return {
    media,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
    removeItems,
    updateItems,
  };
}

function sortRowsClientSide(
  rows: Tables<"media_assets">[],
  sort: MediaSort
): Tables<"media_assets">[] {
  return [...rows].sort((a, b) => {
    const aVal = a[sort.field as keyof Tables<"media_assets">];
    const bVal = b[sort.field as keyof Tables<"media_assets">];

    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    let cmp: number;
    if (typeof aVal === "number" && typeof bVal === "number") {
      cmp = aVal - bVal;
    } else {
      cmp = String(aVal).localeCompare(String(bVal));
    }

    return sort.direction === "desc" ? -cmp : cmp;
  });
}
