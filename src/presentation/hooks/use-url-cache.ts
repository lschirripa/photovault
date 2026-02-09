"use client";

import { useCallback } from "react";

const TTL_MS = 45 * 60 * 1000; // 45 minutes

interface CacheEntry {
  url: string;
  expiresAt: number;
}

// Global cache shared across all components/pages — survives navigation
const cache = new Map<string, CacheEntry>();

/** Build a cache key from assetId + type */
function cacheKey(assetId: string, type: "thumbnail" | "original"): string {
  return `${type}:${assetId}`;
}

function getFromCache(assetId: string, type: "thumbnail" | "original"): string | undefined {
  const entry = cache.get(cacheKey(assetId, type));
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey(assetId, type));
    return undefined;
  }
  return entry.url;
}

function setInCache(assetId: string, type: "thumbnail" | "original", url: string): void {
  cache.set(cacheKey(assetId, type), { url, expiresAt: Date.now() + TTL_MS });
}

/**
 * Hook that provides batch URL fetching with an in-memory TTL cache.
 * The cache is global (module-level) so it persists across page navigations.
 */
export function useUrlCache() {
  /**
   * Look up a single cached URL. Returns undefined if not cached or expired.
   */
  const getCachedUrl = useCallback(
    (assetId: string, type: "thumbnail" | "original"): string | undefined => {
      return getFromCache(assetId, type);
    },
    []
  );

  /**
   * Batch-fetch URLs, consulting the cache first.
   * Only requests IDs that are not already cached (or expired).
   * Returns all results (cached + freshly fetched) merged together.
   */
  const fetchUrls = useCallback(
    async (
      assetIds: string[],
      type: "thumbnail" | "original"
    ): Promise<Record<string, string>> => {
      const result: Record<string, string> = {};
      const uncached: string[] = [];

      for (const id of assetIds) {
        const cached = getFromCache(id, type);
        if (cached) {
          result[id] = cached;
        } else {
          uncached.push(id);
        }
      }

      if (uncached.length === 0) return result;

      // Fetch only the uncached IDs from the server
      try {
        const response = await fetch("/api/media/urls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetIds: uncached, type }),
        });
        if (response.ok) {
          const data = await response.json();
          const urls: Record<string, string> = data.urls || {};
          for (const [id, url] of Object.entries(urls)) {
            setInCache(id, type, url);
            result[id] = url;
          }
        }
      } catch {
        // Silently fail — callers handle missing URLs gracefully
      }

      return result;
    },
    []
  );

  /**
   * Fetch a single URL (uses the batch endpoint under the hood, but caches).
   */
  const fetchUrl = useCallback(
    async (
      assetId: string,
      type: "thumbnail" | "original"
    ): Promise<string | null> => {
      const cached = getFromCache(assetId, type);
      if (cached) return cached;

      const result = await fetchUrls([assetId], type);
      return result[assetId] ?? null;
    },
    [fetchUrls]
  );

  return { getCachedUrl, fetchUrls, fetchUrl };
}
