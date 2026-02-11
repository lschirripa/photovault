"use client";

import { useCallback } from "react";

const TTL_MS = 45 * 60 * 1000; // 45 minutes
const MAX_CACHE_SIZE = 500;

interface CacheEntry {
  url: string;
  expiresAt: number;
}

// Global cache shared across all components/pages — survives navigation
const cache = new Map<string, CacheEntry>();

// In-flight request deduplication — prevents duplicate fetches for the same set of IDs
const inflight = new Map<string, Promise<Record<string, string>>>();

/** Build a cache key from assetId + type */
function cacheKey(assetId: string, type: "thumbnail" | "original"): string {
  return `${type}:${assetId}`;
}

function getFromCache(
  assetId: string,
  type: "thumbnail" | "original",
): string | undefined {
  const entry = cache.get(cacheKey(assetId, type));
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey(assetId, type));
    return undefined;
  }
  return entry.url;
}

function setInCache(
  assetId: string,
  type: "thumbnail" | "original",
  url: string,
): void {
  const key = cacheKey(assetId, type);
  // Delete first so re-insertion moves the key to the end (most-recently-used)
  cache.delete(key);
  cache.set(key, { url, expiresAt: Date.now() + TTL_MS });

  // LRU eviction: remove oldest entries (head of Map iterator) when over limit
  if (cache.size > MAX_CACHE_SIZE) {
    const keysIter = cache.keys();
    while (cache.size > MAX_CACHE_SIZE) {
      const oldest = keysIter.next();
      if (oldest.done) break;
      cache.delete(oldest.value);
    }
  }
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
    [],
  );

  /**
   * Batch-fetch URLs, consulting the cache first.
   * Only requests IDs that are not already cached (or expired).
   * Returns all results (cached + freshly fetched) merged together.
   */
  const fetchUrls = useCallback(
    async (
      assetIds: string[],
      type: "thumbnail" | "original",
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

      // Build a stable key from sorted uncached IDs + type for deduplication
      const inflightKey = `${type}:${[...uncached].sort().join(",")}`;

      // Reuse an identical in-flight request if one already exists
      let fetchPromise = inflight.get(inflightKey);

      if (!fetchPromise) {
        fetchPromise = (async (): Promise<Record<string, string>> => {
          const response = await fetch("/api/media/urls", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assetIds: uncached, type }),
          });
          if (response.ok) {
            const data = await response.json();
            return (data.urls as Record<string, string>) || {};
          }
          return {};
        })();

        inflight.set(inflightKey, fetchPromise);
      }

      try {
        const urls = await fetchPromise;
        for (const [id, url] of Object.entries(urls)) {
          setInCache(id, type, url);
          result[id] = url;
        }
      } catch (err) {
        console.warn("[useUrlCache] Failed to fetch URLs:", err);
      } finally {
        inflight.delete(inflightKey);
      }

      return result;
    },
    [],
  );

  /**
   * Fetch a single URL (uses the batch endpoint under the hood, but caches).
   */
  const fetchUrl = useCallback(
    async (
      assetId: string,
      type: "thumbnail" | "original",
    ): Promise<string | null> => {
      const cached = getFromCache(assetId, type);
      if (cached) return cached;

      const result = await fetchUrls([assetId], type);
      return result[assetId] ?? null;
    },
    [fetchUrls],
  );

  return { getCachedUrl, fetchUrls, fetchUrl };
}
