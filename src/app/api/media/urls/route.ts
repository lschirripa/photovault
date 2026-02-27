import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/infrastructure/supabase/server";
import { getStorageService } from "@/infrastructure/cloudflare/r2-storage-service";
import { getStandardLimiter } from "@/infrastructure/redis/rate-limit";
import { checkRateLimit } from "@/infrastructure/redis/with-rate-limit";
import { cacheGet, cacheSet } from "@/infrastructure/redis/cache";
import type { Tables } from "@/types/supabase";

const URL_CACHE_TTL = 2700; // 45 minutes, matches Cache-Control header

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerComponentClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit
    const rateLimited = await checkRateLimit(getStandardLimiter(), user.id);
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const { assetIds, type = "thumbnail" } = body as {
      assetIds: string[];
      type?: "thumbnail" | "original";
    };

    if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
      return NextResponse.json(
        { error: "Missing or empty assetIds array" },
        { status: 400 }
      );
    }

    if (assetIds.length > 200) {
      return NextResponse.json(
        { error: "Maximum 200 asset IDs per request" },
        { status: 400 }
      );
    }

    // Fetch all assets in one query - RLS ensures user can only see assets in their groups
    const { data: assets, error: assetsError } = (await supabase
      .from("media_assets")
      .select("id, original_key, thumbnail_key, mime_type")
      .in("id", assetIds)) as unknown as {
      data: Pick<Tables<"media_assets">, "id" | "original_key" | "thumbnail_key" | "mime_type">[] | null;
      error: Error | null;
    };

    if (assetsError) {
      console.error("Batch URL fetch error:", assetsError);
      return NextResponse.json(
        { error: "Failed to fetch assets" },
        { status: 500 }
      );
    }

    if (!assets || assets.length === 0) {
      return NextResponse.json({ urls: {} });
    }

    const storageService = getStorageService();

    // Resolve storage keys for each asset (HEIC/HEIF rewriting + type selection)
    const assetKeys = assets.map((asset) => {
      let storageKey: string;
      if (type === "original") {
        const isHeic =
          asset.mime_type === "image/heic" ||
          asset.mime_type === "image/heif";
        if (isHeic) {
          storageKey = asset.original_key.replace(
            /\/([^/]+)\.[^.]+$/,
            "/web_$1.jpg"
          );
        } else {
          storageKey = asset.original_key;
        }
      } else {
        storageKey = asset.thumbnail_key || asset.original_key;
      }
      return { id: asset.id, storageKey };
    });

    // Check Redis cache for existing presigned URLs
    let cachedUrls: Record<string, string> = {};
    try {
      const cacheResults = await Promise.all(
        assetKeys.map(async ({ id, storageKey }) => {
          const cacheKey = `url:${type}:${storageKey}`;
          const cached = await cacheGet<string>(cacheKey);
          return { id, storageKey, cached };
        })
      );

      for (const { id, cached } of cacheResults) {
        if (cached) {
          cachedUrls[id] = cached;
        }
      }
    } catch {
      // Redis unavailable — proceed without cache
      cachedUrls = {};
    }

    // Generate presigned URLs only for cache misses
    const missedAssets = assetKeys.filter(({ id }) => !cachedUrls[id]);

    const freshEntries = await Promise.all(
      missedAssets.map(async ({ id, storageKey }) => {
        const url = await storageService.generateDownloadUrl(storageKey);
        return { id, storageKey, url };
      })
    );

    // Store freshly generated URLs in Redis (fire-and-forget, wrapped in try/catch)
    try {
      await Promise.all(
        freshEntries.map(({ storageKey, url }) =>
          cacheSet(`url:${type}:${storageKey}`, url, URL_CACHE_TTL)
        )
      );
    } catch {
      // Redis unavailable — continue without caching
    }

    // Merge cached + fresh URLs
    const urls: Record<string, string> = { ...cachedUrls };
    for (const { id, url } of freshEntries) {
      urls[id] = url;
    }

    return NextResponse.json(
      { urls },
      {
        headers: {
          "Cache-Control": "private, max-age=2700", // 45 minutes
        },
      }
    );
  } catch (error) {
    console.error("Batch URL error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
